"""Infiltration probability scoring from NetJEPA rollout output.

TODO (build order step 6): given the predictor's K-step latent rollout,
produce a rolling infiltration-probability time series. Likely a small
classifier head on top of each rolled-out embedding.
"""


def score_infiltration(rollout_embeddings):
    raise NotImplementedError("Score each rolled-out embedding for infiltration likelihood.")
