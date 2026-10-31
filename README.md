# Spatial Pointer Device

Spatial Pointer Device (SPD) is a Windows desktop experiment that uses a webcam
to move the pointer and recognize hand gestures. The desktop overlay displays a
blue edge glow and pointer ring. Tracking runs locally using MediaPipe.

**Status: beta.** Gesture reliability, gaze calibration and tracking vary with
camera, lighting and hand position. Windows 10 and 11 x64 are targets; the app
has not been validated on every device. macOS and Linux are future work.

Interested in helping? Start with the [project vision](VISION.md),
[roadmap](ROADMAP.md), [contribution guide](CONTRIBUTING.md), and
[open issues](https://github.com/LoopTryx/SPD/issues).

## Install

Run the Windows x64 setup executable in `installers/` (Git LFS is required to
download it). On first run,
SPD opens setup so you can choose the camera, display, gesture options and
whether SPD starts with Windows. Use the system tray to reopen settings.
Unsigned beta installers can trigger a Windows reputation warning. The project
does not yet provide signed automatic updates.

The setup screen lets you swap index and pinky click assignments and toggle
button snapping, scrolling, virtual-desktop switching and the overlay gesture.
SPD starts paused; press **Ctrl+Alt+Space** to resume. **Ctrl+Alt+Escape** is
the emergency pause and releases held virtual buttons.

## Develop

Requirements: Windows 10/11, Node.js 20 or newer, and a webcam.

```powershell
npm install
npm run build:native
npm run dev
```

Normal startup opens only the transparent pointer overlay. Open **SPD Settings** from the system tray, or run `node_modules\electron\dist\electron.exe . --settings` from this directory. The settings window is created on demand; it is not required for tracking. Allow camera access when Windows asks. Press `Ctrl+Alt+Esc` for an emergency pause that releases held virtual mouse buttons and opens settings. Stop the app with `Ctrl+C` in its terminal or choose **Quit SPD** from the tray menu.

## Diagnostics and attention

Normal operation shows the blue edge glow and a small blue pointer ring. A larger
ring means a nearby Windows control is locked. Custom/inaccessible controls fall
back to ordinary pointing. **Ctrl+Alt+Space** resumes
or pauses input without opening a window (wait for camera warmup first). The
tray provides the same action. Faint blue means waiting; brighter blue means
control is engaged. **Ctrl+Alt+Esc** remains the emergency pause.

Development milestones and source checkpoints are documented in
`CHANGELOG.md`, `docs/windows-commercial-roadmap.md` and `docs/version-control.md`.
Run input-disabled labelled gesture evaluation with
`node scripts/evaluate-replay.mjs recording.json`; see `docs/replay-evaluation.md`.

Build both Windows helpers with `npm run build:native` when starting from source.
The read-only target helper uses Windows' CLR 4.x and UI Automation assemblies.
The cursor follows the thumb tip throughout pinching; midpoint blending is removed.
See `docs/cursor-assistance.md` for snapping and attention behavior.

Clicks now require a firm estimated pinch. Hold contact and move the palm
deliberately to drag; moving only the closing fingers will not drag the pointer.
An experimental fallback recognizes some gray Minecraft-style menu buttons when
the game's mouse cursor is visible. It processes a small local screen region in
memory, never saves/uploads it, and stays off during hidden-cursor gameplay.
Arbitrary game controls and modded/colored menus are not guaranteed targets.

**Save diagnostics** in SPD Settings exports local capture cadence, inference time, input acknowledgement latency, stationary jitter, dropped frames, and interrupted holds. It omits camera images, camera IDs, paths, and calibration values. **Record landmarks** is off by default; turning it on keeps at most 900 hand-landmark frames in memory for inclusion in a saved diagnostic report. Stop recording when you have the sample you need.

Without attention setup, SPD uses manual control: resume input and hold an open neutral pose briefly. Uncalibrated eye guesses do not block gestures. Gaze protection is enabled only with a saved attention calibration. Setup uses targets across the display and an eyes-only look-away step. Keep your head facing the display during that step. Setup rejects profiles that fail held-out screen samples, but webcam iris geometry remains an approximation. Use the emergency pause whenever control is uncertain.

## Gestures

- Move: point with your thumb. The index can remain relaxed.
- Left click or drag: pinch index finger and thumb; release to let go.
- Right click or drag: pinch pinky and thumb; release to let go.
- Scroll: hold index and middle fingertips together, then move vertically.
- Switch virtual desktops: pinch ring finger and thumb, then swipe left or right.
- Hide or reveal the overlay: hold thumb and middle fingertip together briefly.

## License and third-party components

Project-authored code is available under the [MIT License](LICENSE). MediaPipe,
Electron, Chromium, .NET and model assets have their own terms; see
[third-party notices](docs/third-party-notices.md). Model redistribution and
transitive-license review remain release checks.
