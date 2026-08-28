"""Feature-level explainability for a given prediction.

TODO (build order step 7): use SHAP (on input features) or Captum (for
attribution on the predictor/encoder) to identify which flags, ports, or
flow statistics drove a given infiltration prediction.
"""


def explain_prediction(model, input_features):
    raise NotImplementedError("Compute SHAP values or Captum attributions for this prediction.")
