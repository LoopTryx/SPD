# SPD vision

Spatial Pointer Device (SPD) aims to make a laptop webcam a practical way to
control a computer through hand motion. The intended experience is precise,
responsive and understandable enough for everyday use, with a subtle blue
overlay and accessible controls for setup, pause and recovery.

## What matters most

1. **Trustworthy control.** Reduce missed gestures and accidental actions;
   release held input promptly when tracking is interrupted.
2. **Usability.** Support clear feedback, adjustable gestures and a reliable
   physical mouse or keyboard fallback. Never assume one hand pose fits everyone.
3. **Responsiveness.** Measure motion latency, stability and resource use on
   specified hardware. Optimize based on evidence, including tradeoffs.
4. **Privacy.** Process camera data locally during normal use. Recording is
   opt-in; do not upload frames, landmarks or diagnostics without consent.
5. **Transparency.** Distinguish shipped features from experiments, automated
   tests from real-world evidence, and proposals from measured outcomes.

Windows 10/11 x64 is the current target. macOS, Linux and other Windows
architectures are future work, not supported platforms today. The long-term
goal is a polished product that can be useful on a range of laptops; the beta
does not yet establish that level of reliability or compatibility.

The current build uses MediaPipe models for landmarks and rule-based gesture
recognition. Eye-based attention is optional and requires calibration; it is
not a proven intent detector. Improvements to model accuracy need consented
data, participant-separated evaluation and a clear privacy design. Do not
silently train on user activity or equate a detected action with satisfaction.

See [ROADMAP.md](ROADMAP.md) for priorities and [CONTRIBUTING.md](CONTRIBUTING.md)
for how to participate.
