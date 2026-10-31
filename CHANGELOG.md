# Change history

## 0.8.0 beta — 2026-10-31

- Initial Windows x64 beta, with webcam-driven pointer and gestures, optional
  snapping, first-run settings and an opt-in startup preference.
- Includes configurable index/pinky click swapping, pause and emergency release.
- This beta is unsigned, has no automatic update feed and has not been verified
  across Windows devices or fresh installations. Model and third-party
  redistribution review remains open; see `docs/third-party-notices.md`.

## Unreleased — Windows setup and preferences — 2026-10-31

- Added first-run settings, an opt-in Windows startup preference for installed
  builds, click gesture swapping, and toggles for snapping and system gestures.
- Corrected the packaging command to explicitly load the builder configuration.
- The unsigned x64 beta installer was built and inspected; it is not a signed
  public update. Webcam acceptance, fresh-machine installation, model terms and
  third-party notice review remain open before general release.

## Unreleased — Center proximity and pinch continuity — 2026-10-30

- Lock acquisition now measures distance to the control center, not its border.
  Its radius is 35 percent of the smaller control dimension, clamped to 8–18
  DIP, after a 90 ms dwell. Release uses that center radius plus 18 DIP.
- Balanced click confirmation is 140 ms; responsive is 110 ms and deliberate
  remains 300 ms. Contact thresholds and deliberate-palm dragging remain.
- An existing pinch candidate tolerates up to 70 ms of near-contact jitter.
  It cannot start or confirm a press on separated fingertips; sustained gaps
  cancel it. Ambiguous competing gestures still do not receive this grace.

Verification: 306 tests, typecheck/build and a real Windows helper center-lock
smoke with simulated input passed. Webcam click reliability remains user-tested.
Checkpoint: `center-proximity-pinch-continuity-20261030`.

## Unreleased — Live ChatGPT targeting and gesture gating — 2026-10-30

- Reproduced a saved/current Windows display-ID mismatch on the user's running
  installation. Target queries silently returned no controls while the overlay
  fell back to the primary display. TargetService now uses the same fallback.
- Verified the actual visible ChatGPT Copy message button through TargetService
  and MagneticPointer, passing the stale saved ID. It acquired at the center;
  no mouse input was injected. Added a reusable read-only desktop target check.
- An input-disabled live-frame check found uncalibrated eye guesses preventing
  control from arming. No-calibration operation now explicitly reports manual
  mode. Manual resume, neutral dwell, posture/contact checks and safe release
  remain. Calibrated gaze rejection and interruption tests still pass.
- Relaxed neutral separation to .45 palm lengths (above pinch release margins)
  and thumb posture to allow a visibly extended thumb near curled fingers.

Verification: 304 application tests, typecheck/build and actual ChatGPT center
acquisition passed. This does not establish successful real-user webcam clicks.
Checkpoint: `live-chatgpt-gating-20261030`.

## Unreleased — Curled-finger gestures and centered locks — 2026-10-30

- Curled finger joints may overlap when occluded without discarding a usable
  palm/thumb. Degenerate chains and oversized bone jumps remain rejected.
- Thumb extension can point sideways away from the palm; unique fingertip
  contact remains a control posture with the other fingers curled.
- Left/right clicks no longer require an unrelated finger to be extended.
  Neutral arming, unique-contact selection, contact dwell, release and drag
  guards remain. Landmarks alone do not prove intent or distinguish every grip.
- Targets now snap to their exact centers after 90 ms within 36 DIP. Locks
  release beyond 60 DIP from the control rectangle. Provider searches cover
  64 DIP and tolerate one empty poll only until the original bounds expire.
- The desktop smoke test acquires a real button from 24 pixels outside its
  edge and verifies center snapping, with all mouse input simulated.

Verification: 301 application tests, 19 packaging checks, 4 native detector
fixtures, typecheck/build and real Windows center-lock smoke passed. Full-session
tests cover thumb-fist pointing and left/right press/release. Real webcam pose
recognition and arbitrary application controls still need user acceptance.
Checkpoint: `thumb-fist-center-lock-20261030`.

## Unreleased — Direct thumb and target repair — 2026-10-30

- Removed pinch equidistance/midpoint blending and its unused module. Closing
  another finger onto a stationary thumb cannot shift the pointer source.
- Windows targeting now accepts non-activating tool windows with buttons while
  still skipping SPD itself and transparent click-through windows.
- Rounded physical coordinates before sending them to the integer-only target
  helper, including fractional display scaling.
- Added a desktop smoke test using a real non-activating Windows button,
  transparent overlay, TargetService and ControlSession. It acquired a lock;
  all cursor/button injection was simulated. Custom inaccessible controls still
  fall back to ordinary pointing.

Verification: 293 application tests, 19 packaging checks, 4 native detector
fixtures, typecheck and production build passed. Real webcam acceptance remains
user-tested. Checkpoint: `direct-thumb-lock-20261030`.

## Unreleased — Thumb pointer — 2026-10-29

- Normal cursor motion, live pointer data, two-hand pointer-only mode and the
  optional diagnostic marker use thumb tip landmark 4 through one shared constant.
- Pinch midpoint morph now starts from the thumb instead of the index. Gesture
  finger mappings, contact thresholds, attention and palm-driven drag rules remain.
- Added a deliberately extended-thumb posture that permits a curled index while
  rejecting a thumb held close to curled fingers as a new takeover signal.
- Replayed pointing and assisted-click fixtures now move the thumb; dedicated
  regressions verify index movement cannot replace the ordinary pointer source.

Verification: 295 application tests, 19 packaging checks, typecheck and production
build passed. Webcam smoothness remains a user/hardware observation.
Checkpoint: `thumb-pointer-20261029`; existing Git staging is preserved.

## Unreleased — Foreground hand continuity — 2026-10-28

- Removed face-image overlap as an unconditional takeover rejection. Deliberate
  pointing/pinch poses remain eligible across the face projection; curled/gripping
  poses still cancel. An idle secondary hand is filtered instead of cancelling
  the primary pointer.
- Compact pinches may use one other extended finger rather than requiring two.
  Firm camera-gap thresholds, dwell, release hysteresis and drag intent remain.
- Camera contact normalization uses palm length or width, whichever is larger.
  Monocular depth no longer vetoes a clearly closed camera pinch for small depth
  errors; gross depth separation above half a palm length still rejects contact.
- An already engaged deliberate hand overlapping the last verified face region
  can bridge at most 400 ms of unknown eye tracking. This never arms a session,
  overrides explicit look-away/blink/multiple faces, or extends itself. Prolonged
  eye loss still releases input. Runtime marks this state `occluded`.
- Runtime reasons now identify posture, neutral rearming and attention blockers
  instead of reporting ready while the controller silently cancels.

Verification: 291 application tests, 19 packaging checks, typecheck and production
build passed. Regression scenarios are synthetic; live webcam feel remains a
user/hardware validation task. Checkpoint: `foreground-hand-20261028`.

## Unreleased — Firm contact and target recovery — 2026-10-28

- Tightened left/right contact from .32/.38 to .18/.20 palm lengths, with release
  at .30/.33. Camera-image gap and estimated 3D gap must both satisfy contact;
  camera aspect ratio is carried into the decision. These remain contact estimates.
- Midpoint morphing starts only below .45 palm lengths, rather than a full palm
  length. Tightened ring/overlay activation and joined-finger scroll geometry.
- Finger-only movement cannot drag a new hold. Require >=120 ms held and .16 palm
  lengths of actual palm travel, then begin movement without a position jump.
- Windows targeting skips SPD's PID and transparent/no-activate windows, reads the
  underlying window and queries nearby controls in one cached subtree operation.
  Acquire/release margins are now 26/40 DIP; received bounds get a fresh 450 ms
  lifetime rather than expiring while the provider is still answering.
- Added a conservative visual fallback for GLFW/LWJGL Minecraft-style gray menu
  buttons when UIA returns no targets and the game cursor is visible. A local ROI
  is processed in memory, never saved/uploaded; matching rectangles must recur in
  two queries. Hidden-cursor gameplay, square slots and colored surfaces are excluded.
- Existing face/posture takeover guard is unchanged.

Verification: 285 application tests, 19 packaging checks, typecheck and production
build passed. Four native in-memory detector fixtures passed. Live inspection
confirmed the current full-screen Java game exposes no UIA buttons. Actual visual
menu accuracy and browser/app field behavior remain user/hardware validation tasks.

Checkpoint: `firm-contact-20261028`; existing Git staging remains intact.

## Unreleased — Cursor assistance — 2026-10-28

- Added a small blue pseudo-cursor. Nearby exposed Windows controls acquire a
  larger target ring after 90 ms; 18-DIP acquisition and 30-DIP release margins
  resist jitter, and cached target bounds expire after 450 ms.
- Added a separate read-only Windows UIA helper, bounded group descent, query
  throttling, a 650 ms provider timeout and restart backoff. It reads only control
  type/enabled state, process ID and bounds; never text or InvokePattern actions.
- Pinch pointing now eases toward thumb/index (left) or thumb/pinky (right)
  midpoints before workspace projection. Replaced the old frozen pinch anchor.
- Assisted clicks move to a freshly evaluated ring position before button-down.
  Dragging disables attraction and preserves the initial click offset; stale
  asynchronous target replies cannot replace a later control session.
- Hand-to-face overlap and non-control posture cancel input, release holds and
  require neutral rearming. Face overlap is an image-space heuristic; deliberate
  pointing in front of the face can also be excluded.
- Added helper build/package/preflight/signature coverage. The UIA helper uses
  Windows' installed CLR 4.x/UIAutomation assemblies; input remains handled by
  the separate self-contained input watchdog.

Verification: 276 application tests and 19 packaging checks passed; typecheck,
production build and actual resource validation passed. A read-only live probe
found two visible application button rectangles. This does not establish target
coverage in every app or measured webcam accuracy/performance gains.

Checkpoint: `cursor-assist-20261028` (source + SHA-256 manifest, ignored locally).
Original Git staging is preserved; no remote publication or installer was made.

## Unreleased — Windows commercial foundation

Development started 2026-10-27 from the existing 1.0.0-beta.1 runtime. Acceptance
targets in docs/windows-commercial-roadmap.md are goals, not achieved results.

### Baseline

- Existing local runtime: 240 automated tests passed on 2026-10-27.
- New regressions reproduce stale pinch dwell and gesture ownership transfer.
- Source checkpoints and migration notes preserve the existing Git index.

### Implemented — 2026-10-28

- Replaced constant perfect tracking confidence with a camera-pixel geometric
  quality heuristic. Clipped, collapsed, malformed and undersized observations
  are rejected before identity tracking; handedness certainty stays separate.
- Observation gaps above 350 ms cancel candidates and require neutral rearming.
- Changing pinching fingers during an engagement cancels instead of switching
  into another click, overlay toggle, scroll or workspace action.
- Normal rendering shows only a blue glow, with waiting/active/paused/error
  intensity. Removed the hand canvas render loop from the live application.
- Added Ctrl+Alt+Space and a tray action to resume/pause without opening settings.
- Eye measurements use each eye's local axes to resist image-plane head roll.
  Incomplete eye feature vectors and invalid calibration values return unknown.
- Added labelled, action-disabled gesture replay with one-to-one label matching.
- Removed generated `geometry.js` and `diagnostics-recorder.js` duplicates; the
  baseline checkpoint preserves both. Runtime uses their TypeScript sources.

### Verification

264 tests passed across 43 files; 18 packaging tests passed; TypeScript and
production build passed. Replay CLI passed the empty-input smoke fixture.
New gesture, attention, glow, worker-quality and host-shortcut regressions pass.
Legacy sparse keyframe tests now supply continuous camera cadence explicitly;
missing-observation regressions use the raw engine without interpolation.

### Remaining

No custom model has been trained. Real webcam accuracy, false-action frequency,
target jitter/latency, multi-PC performance and field reliability remain unmeasured.
The current replay tool evaluates gesture logic, not attention or image perception.
