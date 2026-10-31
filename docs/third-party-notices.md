# Third-party components and model provenance

SPD bundles Electron and Chromium notices (`LICENSE.electron.txt` and
`LICENSES.chromium.html` in the packaged distribution), the native helper's
self-contained .NET runtime, and npm runtime dependencies. Keep upstream license
and notice files when packaging. The complete dependency graph and integrity
records are in `package-lock.json`; this document is not a completed legal review.

MediaPipe's npm package `@mediapipe/tasks-vision` 1.0.1 declares Apache-2.0 in its
package manifest. Its WASM and JavaScript runtime are copied locally at build time.
The [MediaPipe repository license](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE)
and the [official hand](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker)
and [face model guides](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker)
are the source references. Do not infer model redistribution terms from a
documentation page's footer license. Review the linked model cards and applicable
asset terms before public distribution; that review remains an open release gate.

`model-assets.json` records versioned Google model URLs and SHA-256 checksums.
The face model hash was independently checked against the parent's download hash.
The hand model was already in the source tree; its provenance still needs an
upstream byte comparison. The build rejects either model when its bytes differ
from this manifest. Updating a model requires deliberate manifest and validation
changes, not a runtime download.

The .NET runtime is licensed under the [dotnet runtime license](https://github.com/dotnet/runtime/blob/main/LICENSE.TXT)
with [third-party notices](https://github.com/dotnet/runtime/blob/main/THIRD-PARTY-NOTICES.TXT).
Archive the exact SDK/runtime version and relevant notices with each release.
Confirm these notices, transitive npm licenses and any attribution requirements
before passing the release/license gate.
