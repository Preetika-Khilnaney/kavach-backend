"""
MITRE ATT&CK stage classification from NetJEPA rollout embeddings.

Six-class softmax head mapping latent state vectors to attack stages:
    0 = Benign (Normal)
    1 = Reconnaissance
    2 = Initial Access
    3 = Lateral Movement
    4 = Command and Control
    5 = Exfiltration
"""

import torch
import torch.nn as nn

# Canonical MITRE ATT&CK stage mapping (index → name + tactic + technique)
STAGE_META = [
    {"stage": "Benign",                 "tactic": "None",   "technique": "None"},
    {"stage": "Reconnaissance",         "tactic": "TA0043", "technique": "T1046"},
    {"stage": "Initial Access",         "tactic": "TA0001", "technique": "T1190"},
    {"stage": "Lateral Movement",       "tactic": "TA0008", "technique": "T1021"},
    {"stage": "Command and Control",    "tactic": "TA0011", "technique": "T1071"},
    {"stage": "Exfiltration",           "tactic": "TA0010", "technique": "T1041"},
]

STAGE_NAMES = [m["stage"] for m in STAGE_META]


class ATTACKStageClassifier(nn.Module):
    """
    Maps each predicted latent state z_hat_{t+k} to a probability
    distribution over the 6 MITRE ATT&CK stages (including Benign).

    Trained with categorical cross-entropy against dataset stage labels
    (Brute Force → Initial Access, Botnet → Command and Control, etc.)
    """
    STAGES = STAGE_NAMES

    def __init__(self, embedding_dim: int = 128):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(embedding_dim, 128),
            nn.ReLU(),
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Linear(64, len(self.STAGES)),
        )

    def forward(self, z: torch.Tensor) -> torch.Tensor:
        """
        Parameters
        ----------
        z : (batch, embedding_dim)

        Returns
        -------
        logits : (batch, num_stages)  — use softmax externally for probabilities
        """
        if z.dim() == 1:
            z = z.unsqueeze(0)
        return self.net(z)

    def predict(self, z: torch.Tensor) -> dict:
        """
        Returns the most likely stage and its full metadata.

        Returns
        -------
        {
            "stage_idx":   int,
            "stage":       str,
            "tactic":      str,
            "technique":   str,
            "confidence":  float,
            "distribution": list[float],   # full softmax distribution
        }
        """
        self.eval()
        with torch.no_grad():
            logits = self.forward(z)
            probs  = torch.softmax(logits, dim=-1).squeeze()
            idx    = int(probs.argmax().item())
            meta   = STAGE_META[idx]
            return {
                "stage_idx":    idx,
                "stage":        meta["stage"],
                "tactic":       meta["tactic"],
                "technique":    meta["technique"],
                "confidence":   float(probs[idx].item()),
                "distribution": probs.cpu().tolist(),
            }


def map_attack_stage(
    embedding: torch.Tensor,
    classifier: ATTACKStageClassifier | None = None,
) -> dict:
    """
    Convenience function. Returns the predicted MITRE ATT&CK stage dict.

    Parameters
    ----------
    embedding  : tensor of shape (embedding_dim,) or (batch, embedding_dim)
    classifier : optional pre-loaded ATTACKStageClassifier

    Returns
    -------
    dict with keys: stage_idx, stage, tactic, technique, confidence, distribution
    """
    dim = embedding.shape[-1]
    if classifier is None:
        classifier = ATTACKStageClassifier(embedding_dim=dim)
    return classifier.predict(embedding)
