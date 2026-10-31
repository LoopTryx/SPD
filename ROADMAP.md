# SPD roadmap

This is the project's direction, not a delivery schedule or a guarantee. Issues
describe individual work and acceptance criteria. Maintainers may adjust
priorities as evidence and contributor capacity change.

## Current focus: reliable Windows beta

- Measure and improve intentional left/right clicks, repeated clicks, drag
  holds and releases across hand sizes, angles, lighting and webcam hardware.
- Improve cursor stability and latency with repeatable measurements; avoid
  optimizing one at the expense of unacceptable lag or false actions.
- Validate target snapping against Windows and browser controls, including
  small targets, display scaling and unsupported custom controls.
- Exercise setup, startup preferences, gesture remapping and recovery on clean
  Windows 10/11 x64 installations. Keep the unsigned beta clearly labelled.
- Review third-party model provenance, redistribution terms and notices before
  broader distribution; establish signing and update infrastructure separately.

## Next: personalization and wider testing

- Make calibration and feedback understandable; expand configurable gesture
  mappings only with conflict handling and safe input release.
- Establish a consent-based test protocol for participants, devices, lighting,
  ordinary activities and false activations. Report missed and unintended
  actions, latency, jitter and test conditions; keep raw biometric data private.
- Investigate attention and contact estimation with held-out users and sessions.
  Compare improvements with the existing baseline before making accuracy claims.
- Improve accessibility, onboarding, troubleshooting and performance profiling.

## Later: additional platforms

- Explore macOS, Linux and additional Windows architectures after the Windows
  experience is dependable. Native input, packaging and accessibility targeting
  need platform-specific work and verification.

## How we decide a change is ready

Describe the user problem and tradeoffs in an issue before major work. Include
tests relevant to the change and distinguish replay/automated results from live
webcam and fresh-machine validation. Input changes must cover release on pause,
tracking loss and interruption; use action-disabled tests when possible.
Proposed performance targets in [the Windows roadmap](docs/windows-commercial-roadmap.md)
are goals, not measured results. See [open issues](https://github.com/LoopTryx/SPD/issues)
for current work and [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow.

## Starter work items

Until these are tracked as individual issues, contributors can propose one of
the following by opening an issue and agreeing on its scope with a maintainer:

1. **Pinch reliability:** measure missed and accidental left/right clicks,
   repeated clicks and drag release, then evaluate a focused improvement.
2. **Pointer performance:** establish a reproducible jitter and latency
   baseline across specified Windows devices and lighting conditions.
3. **Button snapping:** test center acquisition, release, scaling and fallback
   across accessible Windows controls and browser applications.
4. **Fresh installation:** verify setup, camera permission, startup, remapping,
   emergency pause and uninstall on clean Windows 10/11 x64 systems.
5. **Distribution review:** verify model provenance and review model,
   dependency and runtime redistribution terms and bundled notices.
