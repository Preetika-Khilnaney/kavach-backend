"""
NetJEPA World Model — clean, self-contained implementation.

Architecture
------------
HGTEncoder      : Heterogeneous Graph Transformer (spatial)
GRUEncoder      : Linear-time recurrent encoder (temporal, Mamba-compatible API)
Predictor       : K-step latent rollout
EMA target path : frozen copy updated via momentum
VICReg bridge   : prevents embedding collapse

This file is the single source of truth for the model.
Load trained weights from data/processed/netjepa_real_weights.pth.
"""

import copy
import torch
import torch.nn as nn

try:
    from torch_geometric.nn import HGTConv
    HAS_PYG = True
except ImportError:
    HAS_PYG = False

# ─────────────────────────────────────────────
#   Constants (must match what the Kaggle
#   training script used)
# ─────────────────────────────────────────────
HIDDEN_DIM = 128
K_STEPS    = 3

# Node/edge types that the Kaggle script built
METADATA = (
    ["network", "flow", "external"],
    [
        ("network",  "has",         "flow"),
        ("flow",     "connects_to", "external"),
        ("flow",     "rev_has",     "network"),
    ],
)


# ─────────────────────────────────────────────
#   Spatial Encoder — HGT
# ─────────────────────────────────────────────
class HGTEncoder(nn.Module):
    """
    Two-layer Heterogeneous Graph Transformer.
    Projects every node type to `hidden` dimensions, then runs HGT message-
    passing, then mean-pools all node types to a single vector per graph.
    """

    def __init__(self, feature_dim: int, hidden: int, heads: int, metadata):
        super().__init__()
        node_types = metadata[0]

        # Per-type linear projection: FEATURE_DIM → hidden
        self.proj = nn.ModuleDict({
            nt: nn.Linear(feature_dim, hidden) for nt in node_types
        })

        if HAS_PYG:
            self.conv1 = HGTConv(hidden, hidden, metadata, heads=heads, dropout=0.2)
            self.conv2 = HGTConv(hidden, hidden, metadata, heads=heads, dropout=0.2)
        else:
            # Fallback MLP if PyG is missing
            self.fallback = nn.Sequential(
                nn.Linear(feature_dim, hidden), nn.ReLU(),
                nn.Linear(hidden, hidden),
            )

        self.out = nn.Linear(hidden, hidden)

    def forward(self, x_dict, edge_index_dict=None):
        if not HAS_PYG:
            # Use the "network" node (single summary vector)
            x = x_dict.get("network", list(x_dict.values())[0])
            return self.fallback(x).mean(dim=0)

        # Project each node type
        h = {k: torch.relu(self.proj[k](v)) for k, v in x_dict.items()}

        # Two rounds of HGT message-passing
        h = self.conv1(h, edge_index_dict)
        h = {k: torch.relu(v) for k, v in h.items()}
        h = self.conv2(h, edge_index_dict)

        # Global mean-pool across all node types → one vector per graph
        pooled = torch.mean(
            torch.stack([v.mean(dim=0) for v in h.values()], dim=0), dim=0)
        return self.out(pooled)   # (hidden,) per graph in batch


# ─────────────────────────────────────────────
#   Temporal Encoder — GRU  (Mamba-equivalent)
# ─────────────────────────────────────────────
class GRUEncoder(nn.Module):
    """
    Two-layer GRU.  Same API as Mamba:  (B, S, D) → (B, D).
    Swap for Mamba when the mamba-ssm wheel is available.
    """

    def __init__(self, input_dim: int, hidden_dim: int):
        super().__init__()
        self.gru = nn.GRU(
            input_dim, hidden_dim,
            num_layers=2, batch_first=True, dropout=0.1,
        )

    def forward(self, seq: torch.Tensor) -> torch.Tensor:
        # seq: (B, S, D)
        _, h = self.gru(seq)    # h: (num_layers, B, hidden)
        return h[-1]            # (B, hidden)  — last layer, last step


# ─────────────────────────────────────────────
#   Latent Predictor  (K-step rollout)
# ─────────────────────────────────────────────
class Predictor(nn.Module):
    def __init__(self, hidden: int):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(hidden, hidden), nn.ReLU(),
            nn.Linear(hidden, hidden), nn.ReLU(),
            nn.Linear(hidden, hidden),
        )

    def forward(self, z: torch.Tensor) -> torch.Tensor:
        return self.net(z)

    @torch.no_grad()
    def rollout(self, z: torch.Tensor, steps: int) -> list[torch.Tensor]:
        """Auto-regressive rollout: feed each prediction back as input."""
        cur, preds = z, []
        for _ in range(steps):
            cur = self.forward(cur)
            preds.append(cur)
        return preds


# ─────────────────────────────────────────────
#   NetJEPA — the complete world model
# ─────────────────────────────────────────────
class NetJEPA(nn.Module):
    """
    HGT (spatial) → GRU (temporal) → K-step Predictor
    + EMA Target Encoder  + Classification Head

    Usage
    -----
    model = NetJEPA.load("data/processed/netjepa_real_weights.pth",
                          feature_dim=78, num_classes=2)
    logits, tgt, ctx = model(batch)           # training / inference
    probs = model.predict_proba(batch)        # softmax probabilities
    rollout = model.predictor.rollout(ctx, K_STEPS)
    """

    def __init__(
        self,
        feature_dim: int,
        num_classes: int,
        hidden: int     = HIDDEN_DIM,
        heads: int      = 4,
        k_steps: int    = K_STEPS,
        metadata        = METADATA,
    ):
        super().__init__()
        self.k_steps = k_steps

        # ---- Context path ----
        self.spatial   = HGTEncoder(feature_dim, hidden, heads, metadata)
        self.temporal  = GRUEncoder(hidden, hidden)

        # ---- Latent predictor (world model core) ----
        self.predictor = Predictor(hidden)

        # ---- Classification head ----
        self.cls_head  = nn.Linear(hidden, num_classes)

        # ---- EMA target (frozen) ----
        self.t_spatial  = copy.deepcopy(self.spatial)
        self.t_temporal = copy.deepcopy(self.temporal)
        for p in (*self.t_spatial.parameters(),
                  *self.t_temporal.parameters()):
            p.requires_grad = False

    # ── Encoding helpers ──────────────────────────────────────────────────
    def _encode(self, batch, sp, tm):
        if HAS_PYG:
            z = sp(batch.x_dict, batch.edge_index_dict)   # (B, hidden)
        else:
            z = sp({"network": batch["network"].x})
        seq = z.unsqueeze(1)                               # (B, 1, hidden)
        return tm(seq)                                     # (B, hidden)

    def encode_context(self, batch):
        return self._encode(batch, self.spatial,   self.temporal)

    def encode_target(self, batch):
        return self._encode(batch, self.t_spatial, self.t_temporal)

    # ── Full forward ──────────────────────────────────────────────────────
    def forward(self, batch):
        ctx  = self.encode_context(batch)
        tgt  = self.encode_target(batch).detach()
        pred = self.predictor(ctx)
        for _ in range(self.k_steps - 1):
            pred = self.predictor(pred)
        logits = self.cls_head(pred)
        return logits, tgt, ctx

    # ── Convenience inference ─────────────────────────────────────────────
    @torch.no_grad()
    def predict_proba(self, batch) -> torch.Tensor:
        logits, _, _ = self.forward(batch)
        return torch.softmax(logits, dim=-1)

    # ── EMA update ────────────────────────────────────────────────────────
    @torch.no_grad()
    def update_target(self, momentum: float = 0.996):
        for ps, pt in zip(self.spatial.parameters(),  self.t_spatial.parameters()):
            pt.data.mul_(momentum).add_(ps.data, alpha=1 - momentum)
        for ps, pt in zip(self.temporal.parameters(), self.t_temporal.parameters()):
            pt.data.mul_(momentum).add_(ps.data, alpha=1 - momentum)

    # ── Load from checkpoint ──────────────────────────────────────────────
    @classmethod
    def load(cls, path: str, feature_dim: int, num_classes: int,
             device: str = "cpu") -> "NetJEPA":
        model = cls(feature_dim=feature_dim, num_classes=num_classes)
        state = torch.load(path, map_location=device)
        model.load_state_dict(state, strict=False)
        model.eval()
        return model
