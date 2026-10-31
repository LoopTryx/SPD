# Contributing to SPD

Thank you for helping make spatial pointing more useful. Read the
[vision](VISION.md) and [roadmap](ROADMAP.md) before proposing a change.

## Find or propose work

Search [issues](https://github.com/LoopTryx/SPD/issues) before opening a new
one. Use an issue to describe a reproducible bug or a focused feature. For a
large change, privacy-sensitive feature or new platform, discuss the approach in
an issue before investing in an implementation. Ask on the issue before taking
work that may overlap someone else's. Labels such as `good first issue` identify
approachable tasks when maintainers apply them.

## Set up on Windows

The supported development target is Windows 10/11 x64 with Node.js 20 or newer,
npm, Git LFS and a webcam for live tests. A suitable .NET SDK is provisioned by
the native build script if needed. Check out the repository with Git LFS if you
want the installer; source builds use the tracked model assets.

```powershell
git clone https://github.com/LoopTryx/SPD.git
cd SPD
npm ci
npm run build:native
npm run dev
```

Normal use starts paused. Use Ctrl+Alt+Space to resume/pause and
Ctrl+Alt+Escape for an emergency pause and input release. Settings are available
from the tray. Avoid testing real input against important documents or controls.

## Validate and submit

1. Fork the repository if you do not have write access; create a descriptive
   branch from the current `main`. Keep changes focused on one issue.
2. Run the appropriate checks. For changes affecting runtime behavior, start
   with the commands below and include any relevant manual or replay checks:

   ```powershell
   npm run typecheck
   npm run test:run
   npm run test:packaging
   npm run build
   ```

3. Open a pull request against `main`, link the issue, explain the behavior and
   test evidence, and disclose any limitations. Maintainers review and merge;
   a passing automated suite alone does not prove a real webcam interaction.

For changes to cursor movement, gestures, attention or native input, test
interruption and button release, include negative examples and avoid claiming
accuracy without labelled real-world evaluation. Do not commit recordings,
camera frames, biometric landmarks, tokens or personal information. Share
diagnostic data only with informed consent and after reviewing its contents.

The project-authored code is offered under the [MIT license](LICENSE). When
adding dependencies, models or data, document their provenance, license and
redistribution terms; see [third-party notices](docs/third-party-notices.md).
Please report potential security issues privately to the maintainer rather than
posting exploit details publicly; if no private channel is available, open an
issue without sensitive details and ask for a private contact method.
