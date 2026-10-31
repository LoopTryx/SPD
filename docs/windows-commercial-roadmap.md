# SPD Windows commercial development

Approved direction: 2026-10-27. Windows first; macOS and Linux deferred.

## Product contract

Normal use shows a blue edge glow and the subsequently requested blue pseudo-cursor. Setup and recovery remain available
through the tray and keyboard. Camera frames stay local. Recording is opt-in.
Tracking quality is a heuristic, not a calibrated probability of correctness.
No attention or gesture model is claimed trained until labelled evaluation exists.

## Milestones

- [x] M1: Establish source checkpoint, replay evaluation and documented baseline.
- [x] M2: Reject unreliable geometry, isolate gesture ownership and verify recovery in automated regressions.
- [x] M3: Glow-only normal operation with visible state feedback (code/build verified; visual field trial pending).
- [ ] M4: Collect consented real gestures and ordinary-activity negative examples.
- [ ] M5: Compare fingertip/contact refinement and temporal intent classifiers.
- [ ] M6: Validate eye-based attention on held-out participants and sessions.
- [ ] M7: Profile native runtime alternatives against the existing application.
- [ ] M8: Windows hardware matrix, signed beta, field validation and release review.

Each implementation milestone records changed behavior, tests, source hashes and
remaining limitations in CHANGELOG.md and docs/version-control.md. No publication
or installer release is authorized by implementation approval alone.

## Proposed acceptance targets (not measured results)

Pointer motion capture-to-input p95 <=100 ms on a specified reference tier;
stationary jitter p95 <=3 logical pixels under defined conditions; deliberate
click success >=98%; accidental actions <0.1 per user-hour; sustained invalid
control releases held buttons within 250 ms. Measure click confirmation latency
separately. Validate by participant, device and environment, with confidence
intervals for rare errors. Synthetic tests do not establish these targets.

## First implementation batch

1. Preserve existing staging and checkpoint source without generated assets or
   local agent state. Record content hashes and baseline test evidence.
2. Add a deterministic, input-disabled replay runner using GestureCoordinator.
   Require explicit expected actions; never infer success from emitted input.
3. Assess camera-space hand geometry before it reaches identity tracking. Reject
   malformed, clipped and collapsed hands, and expose heuristic quality rather
   than hardcoded perfect confidence. Keep handedness certainty separate.
4. Prevent gesture candidates surviving missing observations or switching finger
   ownership during a held action. Preserve button release and neutral rearming.
5. Remove the skeleton from normal rendering and communicate state through glow.
6. Run focused regressions, full unit suite, typecheck and production build.

## Research dependencies

Real contact and attention training requires commercially usable, consented data
with participant/session-disjoint evaluation. A single RGB camera cannot establish
invisible physical contact. Personalization must be bounded; no silent online
retraining or pseudo-labels based solely on the app's own predictions.
