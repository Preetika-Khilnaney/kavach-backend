"""Map predicted network state to MITRE ATT&CK stages.

TODO (build order step 6): classifier head mapping embeddings to
{Reconnaissance, Initial Access, Lateral Movement, Command & Control,
Exfiltration}, trained on dataset attack-timeline labels.
"""


def map_attack_stage(embedding):
    raise NotImplementedError("Classify embedding into a MITRE ATT&CK stage.")
