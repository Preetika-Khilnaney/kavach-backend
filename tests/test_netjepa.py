"""NetJEPA model tests: verify the architecture runs end-to-end with
random initialization (correct shapes, no crashes, and -- critically --
that BatchNorm actually keeps the embedding spread out) against real
state_builder output. No trained weights exist in this project -- these
tests check the model is wired correctly, not that its predictions mean
anything yet.

NetJEPA.forward takes a BATCH of examples (>=2, so BatchNorm has
something to normalize against) -- see its docstring. That's why every
test here builds a small batch instead of calling it on one example."""

import torch

from src.graph.state_builder import CANONICAL_FEATURE_NAMES, build_graph_state
from src.models.losses import vicreg_loss
from src.models.netjepa import NetJEPA

FEATURE_DIM = len(CANONICAL_FEATURE_NAMES)
EMBEDDING_DIM = 16  # small for fast tests


def _graph_batch(window: dict):
    state = build_graph_state(window)
    return state["graph"] if "graph" in state else {"network": torch.tensor([state["feature_vector"]], dtype=torch.float32)}


def _context_batch(n: int, context_len: int = 1):
    """n examples, each a context sequence of context_len network-only windows."""
    return [[_graph_batch({"flow_count": i + j}) for j in range(context_len)] for i in range(n)]


def test_forward_batch_network_only_shapes():
    model = NetJEPA(feature_dim=FEATURE_DIM, embedding_dim=EMBEDDING_DIM, predictor_hidden_dim=32)
    context_batches = _context_batch(4)

    z_pred, z_target, z_context = model(context_batches)

    assert z_pred.shape == (4, EMBEDDING_DIM)
    assert z_context.shape == (4, EMBEDDING_DIM)
    assert z_target is None


def test_forward_batch_with_hosts():
    model = NetJEPA(feature_dim=FEATURE_DIM, embedding_dim=EMBEDDING_DIM, predictor_hidden_dim=32)
    context_batches = [
        [_graph_batch({"flow_count": i, "packet_edges": [("10.0.0.1", "10.0.0.2")]})] for i in range(4)
    ]

    z_pred, _, z_context = model(context_batches)

    assert z_pred.shape == (4, EMBEDDING_DIM)
    assert z_context.shape == (4, EMBEDDING_DIM)


def test_forward_with_context_and_target_batches():
    model = NetJEPA(feature_dim=FEATURE_DIM, embedding_dim=EMBEDDING_DIM, predictor_hidden_dim=32)
    context_batches = _context_batch(4, context_len=3)
    target_batches = [[_graph_batch({"flow_count": i + 3})] for i in range(4)]

    z_pred, z_target, z_context = model(context_batches, target_batches)

    assert z_target is not None
    assert z_target.shape == (4, EMBEDDING_DIM)
    assert not z_target.requires_grad  # target path is frozen (EMA-only)


def test_batchnorm_keeps_embeddings_spread_out_not_collapsed():
    """The regression test for the actual bug found during training: a
    plain (no-BatchNorm) version of this architecture collapsed z_context
    to a near-constant vector within ~20 real training steps. This checks
    the structural property that should prevent that: with random,
    genuinely different inputs, BatchNorm should never let the batch's
    embeddings come back looking like a single repeated row."""
    model = NetJEPA(feature_dim=FEATURE_DIM, embedding_dim=EMBEDDING_DIM, predictor_hidden_dim=32)
    context_batches = [[_graph_batch({"flow_count": i, "flow_bytes_sum": float(i * 1000)})] for i in range(8)]

    _, _, z_context = model(context_batches)

    assert z_context.std(dim=0).mean().item() > 0.1  # BatchNorm(affine=False) => per-dim std ~1 by construction


def test_rollout_produces_k_steps_of_the_right_shape():
    model = NetJEPA(feature_dim=FEATURE_DIM, embedding_dim=EMBEDDING_DIM, predictor_hidden_dim=32)
    context_batches = _context_batch(4)
    _, _, z_context = model(context_batches)

    future = model.predictor.rollout(z_context[0], steps=5)

    assert len(future) == 5
    assert all(z.shape == (EMBEDDING_DIM,) for z in future)


def test_update_target_encoder_moves_target_params_toward_context():
    model = NetJEPA(feature_dim=FEATURE_DIM, embedding_dim=EMBEDDING_DIM, predictor_hidden_dim=32)
    ctx_param = next(model.context_encoder.parameters())
    tgt_param = next(model.target_encoder.parameters())
    tgt_before = tgt_param.clone()

    with torch.no_grad():
        ctx_param.add_(1.0)  # force a real difference to move toward
    model.update_target_encoder(momentum=0.5)

    assert not torch.allclose(tgt_param, tgt_before)
    for p in model.target_encoder.parameters():
        assert not p.requires_grad  # stays frozen after the update


def test_vicreg_loss_runs_on_model_output():
    model = NetJEPA(feature_dim=FEATURE_DIM, embedding_dim=EMBEDDING_DIM, predictor_hidden_dim=32)
    context_batches = _context_batch(4)
    target_batches = [[_graph_batch({"flow_count": i + 1})] for i in range(4)]

    z_pred, z_target, _ = model(context_batches, target_batches)

    result = vicreg_loss(z_pred, z_target)
    assert result["loss"].dim() == 0
    assert torch.isfinite(result["loss"])


def test_eval_mode_supports_single_example_inference():
    """After training (or here, just switching to eval()), BatchNorm uses
    running stats instead of batch stats, so a single-example call --
    the real inference shape -- works even though training needs a batch."""
    model = NetJEPA(feature_dim=FEATURE_DIM, embedding_dim=EMBEDDING_DIM, predictor_hidden_dim=32)
    model.eval()
    context_batches = [[_graph_batch({"flow_count": 3})]]  # batch of 1

    z_pred, _, z_context = model(context_batches)

    assert z_pred.shape == (1, EMBEDDING_DIM)
