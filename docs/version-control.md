# Local version history and GitHub migration

The standalone SPD repository is on `spd-product-readiness`, with no existing
commits as inspected on 2026-10-27. Earlier staged and unstaged changes are kept
intact. A local source checkpoint is not a Git commit and does not publish data.

Run `node scripts/source-checkpoint.cjs <unique-lowercase-name>` to save source,
model assets and SHA-256 hashes under ignored `.source-checkpoints/`. Dependencies,
build outputs, native binaries, environment files and local agent state are not
included. The checkpoint also preserves small legacy JavaScript source files so
their presence can be audited before migration. Never execute a checkpoint as a
second application instance.

## History

| Checkpoint | Meaning | Verification |
| --- | --- | --- |
| windows-baseline-20261027 | Existing runtime before production behavior changes; includes new failing regressions and planning documents | Previous run: 240 tests passed; 3 newly added gesture regressions reproduce failures |
| windows-foundation-20261028 | Geometry quality, gesture ownership, eye robustness, replay evaluation and glow-only operation | 264 tests, 18 packaging checks, typecheck and production build passed |
| cursor-assist-baseline-20261028 | Foundation before cursor-assistance production changes | Source preserved with new initial regression contracts |
| cursor-assist-20261028 | Midpoint morph, magnetic targeting, blue ring and face/posture exclusion | 276 tests, 19 packaging checks, typecheck/build, real read-only button probe |
| firm-contact-baseline-20261028 | Cursor assistance before firmer contact and target recovery | Existing source plus failing contact regressions |
| firm-contact-20261028 | Camera/depth contact agreement, deliberate dragging, underlying-window targets and limited game-menu vision | 285 tests, 19 packaging checks, 4 native fixtures, typecheck/build |
| foreground-baseline-20261028 | Firm-contact revision before foreground-overlap correction | Source plus failing foreground/occlusion regressions |
| foreground-hand-20261028 | Intent-aware face overlap, compact pinches, bounded eye occlusion and depth tolerance | 291 tests, 19 packaging checks, typecheck/build |
| thumb-pointer-baseline-20261029 | Foreground-hand revision before switching pointer source | Source and failing thumb-pointer contracts |
| thumb-pointer-20261029 | Thumb source throughout tracking/projection/morph and thumb-only posture | 295 tests, 19 packaging checks, typecheck/build |
| no-midpoint-baseline-20261030 | Before removing equidistance | Source plus failing stationary-thumb regression |
| direct-thumb-lock-20261030 | Direct thumb, floating-window targets and integer physical coordinates | 293 tests, 19 packaging checks, 4 native fixtures, typecheck/build, real Windows lock smoke with simulated input |
| thumb-ergonomics-baseline-20261030 | Before curled-finger gesture and center-lock corrections | Preserved source |
| thumb-fist-center-lock-20261030 | Fist quality tolerance, unique compact pinches and centered sticky locks | 301 tests, 19 packaging checks, 4 native fixtures, typecheck/build and real button center-lock smoke with simulated input |
| live-chatgpt-gating-20261030 | Stale display recovery, explicit manual mode without gaze calibration and relaxed thumb-fist arming | 304 tests, typecheck/build and actual ChatGPT Copy-message center acquisition without input injection; webcam click acceptance pending |
| center-proximity-pinch-continuity-20261030 | Center-only magnetism, shorter click dwell and bounded candidate jitter tolerance | 306 tests, typecheck/build and native center-lock smoke with simulated input |

Checkpoints are local source copies with per-file SHA-256 manifests.
These historical checkpoints predate the publication repository. The publication copy has its own local Git history; the original checkout staging is preserved.

## Migration procedure

1. Review `git diff`, `git diff --cached` and `git status` together. Existing index
   entries may differ from current files; do not assume staging is current.
2. Exclude local checkpoints, `.freebuff`, credentials, recordings, dependencies
   and generated outputs. Check model/data redistribution rights.
3. Stage reviewed source and documentation deliberately, then create the initial
   commit. Record its hash here and attach current verification evidence.
4. Add the chosen GitHub remote only when its destination is known. Uploading,
   signing and releasing remain separate steps.

CHANGELOG.md records implemented behavior. The commercial roadmap separates
automated evidence from webcam/hardware/user validation and model research.
