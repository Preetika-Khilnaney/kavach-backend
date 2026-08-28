"""Train NetJEPA + the infiltration/attack-stage heads together.

Self-supervised objective (VICReg): predict the next window's context
embedding from a short history of preceding windows. Supervised
objectives (piggy-backed on the same forward pass, same optimizer step):
infiltration probability (binary) and MITRE attack stage (6-class),
labelled from the target window's own flow labels (see labels.py).

Run: python -m src.training.train [--epochs N] [--batch-size N] [--lr N]

Needs data/processed/windows/*.pkl to exist first — run
`python -m src.training.build_windows_cache` if they don't.

Known limitation: each example's graph(s) are encoded one at a time in a
Python loop (see run_batch below), not batched into a single
torch_geometric Batch/HeteroDataBatch call. That's why CPU beats MPS here
(see pick_device) -- real graph batching would let MPS/CUDA actually help,
and would speed this up substantially regardless of device. Didn't build
that for this run; worth doing before training on more data than this.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import time
from pathlib import Path

import torch
import torch.nn.functional as F

from src.config import load_config
from src.graph.state_builder import CANONICAL_FEATURE_NAMES, build_graph_state
from src.models.netjepa import NetJEPA, graph_batch_from_state
from src.models.losses import vicreg_loss
from src.scoring.attack_stage import ATTACKStageClassifier, STAGE_NAMES
from src.scoring.infiltration import InfiltrationHead
from src.training.dataset import build_examples, load_all_windows
from src.training.labels import infiltration_label, stage_label

CHECKPOINT_PATH = Path("data/processed/netjepa_weights.pt")
METRICS_PATH = Path("data/processed/training_metrics.jsonl")
FEATURE_DIM = len(CANONICAL_FEATURE_NAMES)


def pick_device() -> str:
    """Defaults to CPU, not MPS/CUDA -- deliberately, based on measurement.
    This training loop processes one small graph (1-3 nodes) at a time
    rather than batching graphs into one GPU call (see the module
    docstring's TODO on real batching), so each step is dominated by many
    tiny ops. Benchmarked on this project's data: MPS was ~8x SLOWER than
    CPU here (kernel-launch overhead per tiny op outweighs any compute
    benefit) -- 2.08s/batch on MPS vs 0.27s/batch on CPU, batch_size=32.
    Override with --device if you add real graph batching later."""
    return "cpu"


def infiltration_pos_weight(examples) -> float:
    """Per-sample weight for the positive (attack) class in the
    infiltration BCE loss = n_negative / n_positive on this training set.

    Without this, an unweighted BCE loss on an imbalanced dataset (attack
    windows are a small minority here) lets the model minimize loss by
    just always predicting "benign" -- which is exactly what happened in
    practice on the first real training run: the infiltration head scored
    0.0 recall/precision/F1 on the benchmark (src/benchmark/evaluate.py)
    despite a reasonable-looking BCE loss during training. This weight
    makes getting a true positive wrong cost proportionally more."""
    labels = [infiltration_label(tgt) for _, tgt in examples]
    n_pos = sum(labels)
    n_neg = len(labels) - n_pos
    return (n_neg / n_pos) if n_pos > 0 else 1.0


def run_batch(model, infil_head, stage_clf, batch, device, vicreg_coeffs, infil_pos_weight: float = 1.0):
    # NetJEPA.forward batch-normalizes across the examples in this call
    # (see its docstring) -- that's why we build the whole batch's graph
    # inputs first and make ONE model() call, instead of one call per
    # example. Calling it per-example would defeat the anti-collapse fix.
    context_batches = [[graph_batch_from_state(build_graph_state(w), device) for w in ctx] for ctx, _ in batch]
    target_batches = [[graph_batch_from_state(build_graph_state(tgt), device)] for _, tgt in batch]
    Z_pred, Z_target, Z_context = model(context_batches, target_batches)

    infil_targets = [infiltration_label(tgt) for _, tgt in batch]
    stage_targets, stage_row_idx = [], []
    for row_idx, (_, tgt) in enumerate(batch):
        stg = stage_label(tgt)
        if stg is not None:
            stage_targets.append(stg)
            stage_row_idx.append(row_idx)

    vicreg = vicreg_loss(Z_pred, Z_target, **vicreg_coeffs)

    infil_probs = infil_head(Z_context).squeeze(-1)
    infil_t = torch.tensor(infil_targets, dtype=torch.float32, device=device)
    # per-sample weights: attack (positive) rows count infil_pos_weight×
    # as much as benign rows -- see infiltration_pos_weight's docstring.
    sample_weights = torch.where(infil_t == 1, infil_pos_weight, 1.0)
    infil_loss = F.binary_cross_entropy(infil_probs, infil_t, weight=sample_weights)

    if stage_row_idx:
        stage_logits = stage_clf(Z_context[stage_row_idx])
        stage_t = torch.tensor(stage_targets, dtype=torch.long, device=device)
        stage_loss = F.cross_entropy(stage_logits, stage_t)
    else:
        stage_loss = torch.tensor(0.0, device=device)

    total = vicreg["loss"] + infil_loss + stage_loss
    return total, {
        "vicreg": vicreg["loss"].item(),
        "vicreg_invariance": vicreg["invariance"].item(),
        "vicreg_variance": vicreg["variance"].item(),
        "vicreg_covariance": vicreg["covariance"].item(),
        "infil_loss": infil_loss.item(),
        "stage_loss": stage_loss.item() if stage_row_idx else None,
        "embed_std": Z_context.std(dim=0).mean().item(),
    }


def evaluate(model, infil_head, stage_clf, val_examples, device, vicreg_coeffs, max_batches=20, batch_size=32, infil_pos_weight: float = 1.0):
    model.eval()
    infil_head.eval()
    stage_clf.eval()
    totals = []
    with torch.no_grad():
        for i in range(0, min(len(val_examples), max_batches * batch_size), batch_size):
            batch = val_examples[i : i + batch_size]
            if not batch:
                continue
            _, metrics = run_batch(model, infil_head, stage_clf, batch, device, vicreg_coeffs, infil_pos_weight=infil_pos_weight)
            totals.append(metrics)
    model.train()
    infil_head.train()
    stage_clf.train()
    if not totals:
        return {}
    return {k: sum(t[k] for t in totals if t[k] is not None) / max(1, sum(1 for t in totals if t[k] is not None)) for k in totals[0]}


def main():
    # Redirecting stdout to a file (nohup, `>`, etc.) makes Python
    # block-buffer instead of line-buffer, so a running job's progress
    # prints don't actually reach the file until a large buffer fills or
    # the process exits -- found this out watching a real ~50min run
    # where the log file stayed empty until the end. Line-buffer instead
    # so `tail -f` on the redirected log actually shows live progress.
    sys.stdout.reconfigure(line_buffering=True)

    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=15)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--context-len", type=int, default=3)
    parser.add_argument("--val-fraction", type=float, default=0.2)
    parser.add_argument("--device", type=str, default=None, help="override the CPU default (see pick_device)")
    parser.add_argument("--max-train-examples", type=int, default=None, help="debug: cap train set size for a quick smoke run")
    args = parser.parse_args()

    cfg = load_config().get("model", {})
    embedding_dim = cfg.get("embedding_dim", 128)
    predictor_hidden_dim = cfg.get("predictor_hidden_dim", 256)
    ema_momentum = cfg.get("ema_momentum", 0.996)
    vicreg_coeffs = {
        "sim_coeff": cfg.get("vicreg", {}).get("sim_coeff", 25.0),
        "std_coeff": cfg.get("vicreg", {}).get("std_coeff", 25.0),
        "cov_coeff": cfg.get("vicreg", {}).get("cov_coeff", 1.0),
    }

    device = args.device or pick_device()
    print(f"device: {device}")

    windows_by_file = load_all_windows()
    total_windows = sum(len(w) for w in windows_by_file.values())
    print(f"loaded {total_windows} windows across {len(windows_by_file)} files")

    train_examples, val_examples = build_examples(windows_by_file, context_len=args.context_len, val_fraction=args.val_fraction)
    if args.max_train_examples:
        # Shuffle BEFORE truncating, not after: build_examples returns
        # examples grouped per-file in glob order (Friday's 3 files first,
        # alphabetically), so slicing the front of the unshuffled list
        # would silently drop Monday/Tuesday/Wednesday/Thursday entirely
        # instead of giving a representative subsample across all 8 days.
        random.Random(0).shuffle(train_examples)
        train_examples = train_examples[: args.max_train_examples]
    print(f"train examples: {len(train_examples)}, val examples: {len(val_examples)}")

    infil_pos_weight = infiltration_pos_weight(train_examples)
    print(f"infiltration class balance: pos_weight={infil_pos_weight:.2f} (n_negative/n_positive on the training set)")

    model = NetJEPA(feature_dim=FEATURE_DIM, embedding_dim=embedding_dim, predictor_hidden_dim=predictor_hidden_dim).to(device)
    infil_head = InfiltrationHead(embedding_dim=embedding_dim).to(device)
    stage_clf = ATTACKStageClassifier(embedding_dim=embedding_dim).to(device)

    optimizer = torch.optim.Adam(
        list(model.context_encoder.parameters()) + list(model.predictor.parameters())
        + list(infil_head.parameters()) + list(stage_clf.parameters()),
        lr=args.lr,
    )

    METRICS_PATH.parent.mkdir(parents=True, exist_ok=True)
    metrics_file = METRICS_PATH.open("w")

    rng = random.Random(0)
    t_start = time.time()
    step = 0
    for epoch in range(args.epochs):
        rng.shuffle(train_examples)
        epoch_losses = []
        for i in range(0, len(train_examples), args.batch_size):
            batch = train_examples[i : i + args.batch_size]
            if len(batch) < 2:  # VICReg's batch statistics need >=2 examples
                continue
            optimizer.zero_grad()
            total_loss, metrics = run_batch(model, infil_head, stage_clf, batch, device, vicreg_coeffs, infil_pos_weight=infil_pos_weight)
            total_loss.backward()
            optimizer.step()
            model.update_target_encoder(momentum=ema_momentum)

            step += 1
            metrics["epoch"] = epoch
            metrics["step"] = step
            metrics["elapsed_s"] = round(time.time() - t_start, 1)
            metrics_file.write(json.dumps(metrics) + "\n")
            metrics_file.flush()
            epoch_losses.append(metrics["vicreg"])

            if step % 50 == 0:
                print(f"epoch {epoch} step {step}: vicreg={metrics['vicreg']:.3f} "
                      f"(inv={metrics['vicreg_invariance']:.3f} var={metrics['vicreg_variance']:.3f} cov={metrics['vicreg_covariance']:.3f}) "
                      f"infil={metrics['infil_loss']:.3f} stage={metrics['stage_loss']} "
                      f"embed_std={metrics['embed_std']:.3f} [{metrics['elapsed_s']}s]")

        val_metrics = evaluate(model, infil_head, stage_clf, val_examples, device, vicreg_coeffs, batch_size=args.batch_size, infil_pos_weight=infil_pos_weight)
        print(f"=== epoch {epoch} done: train_vicreg={sum(epoch_losses)/max(1,len(epoch_losses)):.3f} "
              f"val_vicreg={val_metrics.get('vicreg', float('nan')):.3f} val_embed_std={val_metrics.get('embed_std', float('nan')):.3f} "
              f"[{time.time()-t_start:.0f}s elapsed] ===")

        torch.save({
            "model": model.state_dict(),
            "infil_head": infil_head.state_dict(),
            "stage_clf": stage_clf.state_dict(),
            "feature_dim": FEATURE_DIM,
            "embedding_dim": embedding_dim,
            "predictor_hidden_dim": predictor_hidden_dim,
            "epoch": epoch,
        }, CHECKPOINT_PATH)

    metrics_file.close()
    print(f"done. checkpoint saved to {CHECKPOINT_PATH}")


if __name__ == "__main__":
    main()
