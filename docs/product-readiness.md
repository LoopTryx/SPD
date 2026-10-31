# SPD Windows product readiness checklist

This is the condensed, checkable implementation/release plan approved for the
`spd-product-readiness` branch. Existing staged work must be preserved; do not
commit as part of this implementation. Checkboxes record evidence, not intent.

## Packaging work

- [ ] Write and observe failing Node tests for release configuration validation,
  channel separation, missing build resources, and corrupted release artifacts.
- [ ] Configure electron-builder for a Windows x64, per-user NSIS offline installer
  with standard rights, `.electron-build` and `dist` application files, and the
  self-contained `native/SPD.Input.exe` resource.
- [ ] Pin packaging/updater dependencies and record the npm lockfile. Wait for the
  parent worker to confirm source dependencies are ready before npm installation.
- [ ] Build the helper from `native/` through a reproducible build script; never
  execute it in build/verification tests. Coordinate its project/output with the
  native worker. Bundle local model and WASM assets through the renderer build.
- [ ] Implement signed public-release preflight: reject absent credentials,
  publisher or HTTPS update feed; keep beta and stable metadata/output separate.
  Do not invent an identity or feed. Do not sign or publish in this work session.
- [ ] Verify actual unpacked resources, x64 PE headers, ASAR content, updater
  metadata and installer checksums without launching the app or installer.
- [ ] Document build commands, limitations, recovery and pending release gates.

## Application and native integration (other workers)

- [ ] Self-contained helper with validated IPC, bounded input handling and
  unconditional held-button release on tracking loss, stop and shutdown.
- [ ] Safe lifecycle, startup/stop/pause controls, first-run guidance, camera
  selection/error handling and recovery without unintended input.
- [ ] Settings persistence and validation; supportable diagnostics without camera
  imagery or secrets; explicit privacy behavior and camera permission guidance.
- [ ] Bundled model/WASM, offline tracking, protected Electron IPC/navigation and
  updater opt-in/channel behavior with signature verification and recovery.
- [ ] Accessibility, readable UI, display/DPI handling and regression tests.

## Release gates — pending, no field validation claimed

- [ ] Establish actual publisher, signing certificate, HTTPS beta/stable feed,
  version ownership and release owner; obtain explicit signing/publishing authority.
- [ ] Build signed candidate from locked dependencies and recorded source state;
  archive SHA-256, artifact validation, dependency/license review and test output.
- [ ] Test offline install/start/uninstall as a standard user on clean supported
  Windows 10/11 x64 PCs with no Node.js, .NET SDK, PowerShell build scripts or
  developer tools installed. Record exact Windows editions/builds and OS lifecycle
  eligibility before claiming support; ARM64, x86, macOS and Linux are not targets.
- [ ] Complete a six-PC matrix: Windows builds, integrated/external cameras,
  different CPUs/GPUs, lighting, multi-display arrangements and mixed DPI.
  Record startup, idle/tracking load, latency, long sessions, recovery and failures.
- [ ] Complete a 20-user beta with documented consent, tasks, observations,
  accessibility feedback and issue severity; define acceptance thresholds with
  the product owner before marking the beta gate passed.
- [ ] Test emergency stop and button release, camera disconnect/reconnect,
  permission denial, sleep/resume, crash/restart and helper failure. These are
  authorized manual acceptance runs, not unattended input-injection tests.
- [ ] Test signed update success, invalid signature, wrong publisher/channel,
  offline feed, interrupted download, rollback/recovery and settings retention.
- [ ] Verify installer standard rights, no surprise startup, uninstall behavior,
  stored-data handling, release notes and user-facing support instructions.
- [ ] Release owner reviews all evidence and approves publication. Automated
  unit/build checks alone do not establish product readiness or OS support.

## Evidence

Implementation and verification evidence will be recorded below after execution.
No installer, signing, six-PC or 20-user outcome is asserted by this checklist.
