"""Map predicted network state (NetJEPA rollout embeddings) to MITRE
ATT&CK stages.

Rewritten from a teammate's branch (pulled in from an unrelated git
history) — like infiltration.py, this module only consumes fixed-size
embedding vectors, so no real rewrite was needed against our
feature-window shape, just config integration and a docstring pass.

No trained weights exist yet — this classifier's output means nothing
until it's trained on dataset attack-timeline labels (PortScan ->
Reconnaissance, FTP/SSH-Patator -> Initial Access, Infiltration -> Lateral
Movement, Bot -> Command and Control, DDoS -> Exfiltration, per the labels
actually present in data/raw/CSV/MachineLearningCVE — see the README's
Datasets section).
"""

from __future__ import annotations

import torch
import torch.nn as nn

from src.config import load_config

# Six-class stage mapping: Benign + the five kill-chain stages from the
# architecture doc's Prediction & Stage Mapping section.
STAGE_META = [
    {"stage": "Benign", "tactic": "None", "technique": "None"},
    {"stage": "Reconnaissance", "tactic": "TA0043", "technique": "T1046"},
    {"stage": "Initial Access", "tactic": "TA0001", "technique": "T1190"},
    {"stage": "Lateral Movement", "tactic": "TA0008", "technique": "T1021"},
    {"stage": "Command and Control", "tactic": "TA0011", "technique": "T1071"},
    {"stage": "Exfiltration", "tactic": "TA0010", "technique": "T1041"},
]
STAGE_NAMES = [m["stage"] for m in STAGE_META]


class ATTACKStageClassifier(nn.Module):
    """Maps each predicted latent state z_hat_{t+k} to a probability
    distribution over the 6 MITRE ATT&CK stages (including Benign)."""

    STAGES = STAGE_NAMES

    def __init__(self, embedding_dim: int | None = None):
        super().__init__()
        embedding_dim = embedding_dim or load_config().get("model", {}).get("embedding_dim", 128)
        self.net = nn.Sequential(
            nn.Linear(embedding_dim, 128),
            nn.ReLU(),
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Linear(64, len(self.STAGES)),
        )

    def forward(self, z: torch.Tensor) -> torch.Tensor:
        """z: (batch, embedding_dim) or (embedding_dim,). Returns logits
        (batch, num_stages) — apply softmax externally for probabilities."""
        if z.dim() == 1:
            z = z.unsqueeze(0)
        return self.net(z)

    def predict(self, z: torch.Tensor) -> dict:
        """Returns the most likely stage and its full metadata:
        {stage_idx, stage, tactic, technique, confidence, distribution}."""
        self.eval()
        with torch.no_grad():
            logits = self.forward(z)
            probs = torch.softmax(logits, dim=-1).squeeze()
            idx = int(probs.argmax().item())
            meta = STAGE_META[idx]
            return {
                "stage_idx": idx,
                "stage": meta["stage"],
                "tactic": meta["tactic"],
                "technique": meta["technique"],
                "confidence": float(probs[idx].item()),
                "distribution": probs.cpu().tolist(),
            }


def map_attack_stage(
    embedding: torch.Tensor,
    classifier: ATTACKStageClassifier | None = None,
) -> dict:
    """Convenience wrapper: classify one embedding into a MITRE ATT&CK
    stage dict."""
    classifier = classifier or ATTACKStageClassifier(embedding_dim=embedding.shape[-1])
    return classifier.predict(embedding)
