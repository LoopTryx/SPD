# Cursor assistance — 2026-10-28

## Current correction — 2026-10-30

Latest tuning supersedes border-based acquisition below: lock only near the
center, within 35 percent of the smaller dimension clamped to 8–18 DIP, after
90 ms. Unlock when the raw pointer leaves that radius plus 18 DIP. Near edges of
wide buttons do not attract the cursor. The native smoke approaches the center.

Balanced pinch dwell is 140 ms, responsive 110 ms, deliberate 300 ms. Existing
candidates bridge at most 70 ms of near-contact noise, with a fresh close sample
required before pressing. This changes timing tolerance, not contact thresholds.

Live desktop correction: a missing saved Windows display ID now falls back to
the current primary display, matching overlay positioning. This was reproduced
with saved ID 385960744 and current ID 3824456130. An actual ChatGPT Copy message
button acquired at its center through TargetService with that stale ID.
`electron scripts/verify-desktop-target.cjs x y width height [saved-display-id]`
checks an existing visible control without injecting input.

With no saved attention calibration, control is explicitly manual: resume plus
neutral-hand dwell is required, but unreliable default eye guesses cannot block
pinches. A configured gaze profile retains strict attention gating. Neutral thumb
separation is .45 palm lengths; compact thumb fists no longer require .65.

Latest follow-up: center snapping now applies to every supported control,
including wide buttons. Acquire within 36 DIP after 90 ms, retain until the raw
pointer leaves a 60 DIP margin around the rectangle, and expire bounds after
450 ms. Queries cover 64 DIP; empty replies never extend the last valid bounds.
The real Windows fixture now starts 24 pixels outside a button edge and checks
that the emitted pointer equals the button center. Motion/buttons are simulated.

Thumb-fist gestures accept unique contact without extending unrelated fingers.
Overlapping hidden joints in otherwise non-degenerate curled chains are allowed.
Attention, neutral startup, actual contact dwell and safe release still apply.

This supersedes midpoint behavior described in the original implementation below.
All ordinary pointing uses thumb tip 4; pinch approach never blends towards
another fingertip. Existing deliberate-palm dragging remains.

Target selection excludes SPD and transparent windows, but now includes
non-activating windows. Physical query coordinates are rounded to integers.
Acquisition remains 26 DIP / 90 ms, release 40 DIP, expiry 450 ms.

After building the app and running `native/build-targets.ps1 -Test`, run
`node_modules/electron/dist/electron.exe scripts/target-lock-smoke.cjs`.
It briefly opens a real non-activating button fixture and transparent overlay,
queries the production UIA helper, then verifies ControlSession's locked output.
The fixture closes automatically; mouse movement and clicks are simulated.
The 2026-10-30 run acquired one target and locked successfully. This verifies
the Windows pipeline, not arbitrary custom canvases or real webcam ergonomics.

## Original implementation history

Approved request: Windows button targeting, smooth pinch midpoint pointing and
casual takeover prevention, followed by a standalone SPD restart.

## Contracts

- Left pinch morphs index pointing toward the thumb/index midpoint; right pinch
  morphs toward the thumb/pinky midpoint. Apply the camera workspace transform
  once, after computing the point. Never distort the gesture skeleton.
- Button assistance primarily uses read-only Windows UI Automation bounds. Acquire only
  nearby controls after a brief dwell, retain with hysteresis, and expire stale
  bounds. Display a small blue pseudo-cursor only while SPD controls the pointer.
  Unsupported/custom controls fall back to ordinary pointing.
- Query accessibility in a separate, time-bounded helper process. It must never
  block leases, gesture detection, button release or camera inference. Do not
  retrieve text, invoke UIA control actions, or retain other application content.
  A subsequently requested Minecraft-menu fallback processes only a local image
  region in memory, with no image saving or uploading (details below).
- Disable magnetism for holds/drags and scrolling. Clicks use the displayed
  assisted position, with move-before-button ordering and cancellation guards.
- Suppress hand-to-face overlap and non-pointing casual poses. Re-entry requires
  fresh attention and a neutral hand; never replay an interrupted hold. The face
  exclusion is a conservative camera-space overlap heuristic, not an intent model.

## Implementation order

1. Source checkpoint; pure midpoint, magnetic targeting and takeover regressions.
2. Integrate midpoint into GestureEngine and face-region signals into the worker.
3. Add bounded UIA helper + main-process coordinate adapter and validated IPC.
4. Integrate cached magnetic targets, pseudo-cursor and move-before-click ordering.
5. Verify tests/build/helper and record the new checkpoint; restart only SPD.

## Validation limits

Implemented and verified: 276 application tests, 19 packaging checks, typecheck,
production build and actual helper/model/WASM validation. A read-only UIA probe
returned two real visible button bounds. Checkpoint: `cursor-assist-20261028`.

The current implementation acquires within 18 logical pixels after 90 ms, keeps
locks within a 30-pixel release margin, and expires bounds after 450 ms. Large
fields target a nearby interior point rather than a distant center. The separate
UIA process times out after 650 ms and backs off for two seconds; tracking and
input release do not wait for it. The blue ring is updated imperatively, without
rerendering the React application at pointer frequency.

## Firm-contact revision

The 2026-10-28 firm-contact revision supersedes the margins/timeouts above:
acquisition is 26 DIP, release is 40 DIP, and bounds expire 450 ms after receipt.
Provider timeout is 1500 ms on cold startup and 900 ms thereafter. Queries skip
SPD's process and transparent/no-activate windows before selecting the underlying
application, rather than asking UIA to hit-test the transparent SPD overlay.

Left/right pinches require both projected camera distance and estimated world
distance below .18/.20 palm lengths. Release thresholds are .30/.33. Cursor morph
begins below .45 palm lengths. Actual palm movement, not closure-induced tip
movement, starts a drag after .16 palm lengths and at least 120 ms held.

The experimental visual path is limited to GLFW/LWJGL windows with a visible OS
cursor and no UIA target. It captures a bounded ROI around the pointer, checks
neutral rectangular menu-button borders/aspect ratio, and requires two consistent
observations. It does not recognize arbitrary game controls, inventory squares,
colored/modded menus or gameplay targets. Pixels are immediately discarded.

Run `powershell -NoProfile -ExecutionPolicy Bypass -File native/build-targets.ps1 -Test`
for four native in-memory positive/negative fixtures. No desktop pixels are used
by those fixtures. Field menu accuracy remains unverified.

## Foreground-hand correction

The follow-up correction removes image overlap as proof of face-touching. A
deliberate pointing/pinching pose remains usable in front of the face projection;
curled/gripping hands still cancel, and idle secondary hands do not cancel the
primary pointer. Compact pinches require at least one other extended finger.

Contact uses aspect-correct camera gap normalized by the larger of palm width
and length. Estimated depth rejects only gross separation above half a palm,
rather than forcing an unreliable monocular depth estimate to equal image contact.
The camera close/release thresholds and deliberate-drag guard are unchanged.

Only an already engaged hand can bridge <=400 ms of unknown eye tracking when
it overlaps the last verified face region and retains a deliberate pose. The
timer starts at the last actual attentive sample, never a guessed one. Startup,
explicit look-away/blink, multiple faces and prolonged eye loss cannot bypass
attention. Complete sustained occlusion still requires lowering the hand briefly.

Automated tests cover geometry, hysteresis, expiry, interruption and transport.
Real button-provider coverage, webcam overlap behavior and mixed-DPI feel still
require field trials. No claim of universal snapping or zero accidental movement.
