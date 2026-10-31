# Gesture evaluation

Run `node scripts/evaluate-replay.mjs recording.json`. The runner compiles the
same GestureCoordinator used by the application, in memory, and emits JSON.
It cannot send mouse input. Exit 0 means all supplied action labels matched;
exit 1 means missed/unexpected actions; exit 2 means invalid input or startup.

Input schema:

```json
{
  "viewport": { "width": 1920, "height": 1080 },
  "frames": [{ "timestamp": 0, "primary": null, "secondary": null }],
  "expected": []
}
```

Each present hand is `{trackId, timestamp, confidence, landmarks, poseLandmarks?}`.
Landmarks have 21 `[x,y,z]` entries. The optional pose landmarks are unprojected
world geometry, while landmarks remain camera coordinates. Confidence carries
the legacy geometric-quality score, not handedness certainty. Frame times must
strictly increase; both hands use the frame timestamp. A missing hand is null,
not a repeated stale pose. Never interpolate missing observations in benchmarks.

An expected click label looks like
`{"type":"button-down","button":"left","earliestMs":420,"latestMs":500}`.
Label releases as well. System actions use `direction`, and scroll actions use
the expected numeric `delta`. Empty expected actions mean a negative example;
an emitted click is a failure, not automatically a successful training label.

This evaluator measures gesture decisions after tracking. It does not validate
camera perception, attention, physical contact, motion latency or field accuracy.
Existing diagnostics traces omit identity, world pose and expected labels; they
must not be presented as fully labelled replay input without review/annotation.
No camera recording is enabled by this tool.

## Required research sessions

Record deliberate left/right clicks, rapid repeated clicks, drag/release,
scrolling and desktop switching alongside ordinary typing, drinking, scratching
and reaching. Include occlusion, crossing hands, lighting and distance variation.
Record participant/session IDs outside the distributed runtime, consent and usage
rights, device/environment, label provenance and a fixed held-out partition.
Never split neighbouring frames from one session across training and test sets.
Keep raw eye/hand images off by default and separate from support diagnostics.
