import { expect, test } from "vitest";
import { nativeHelper } from "./native-process-utils";

test("independent native watchdog releases held input even with stdin left open", async () => {
  const h = await nativeHelper();
  try {
    const capturedAt = Date.now() - 100;
    expect((await h.lease(capturedAt)).ok).toBe(true);
    expect((await h.send("button", { button: "left", pressed: true })).ok).toBe(true);
    const released = await h.waitFor((m) => m.type === "released" && m.reason === "expired");
    expect(released.at - capturedAt).toBeLessThanOrEqual(250);
    expect(h.messages.some((m) => m.type === "input" && m.button === "left" && m.pressed === false)).toBe(true);
    expect((await h.send("button", { button: "right", pressed: true })).ok).toBe(false);
  } finally { await h.close(); }
});
test.each(["eof", "stop", "malformed", "session", "sequence", "expired-command"])("%s releases held buttons", async (fault) => {
  const h = await nativeHelper();
  try {
    await h.lease(); await h.send("button", { button: "left", pressed: true });
    if (fault === "eof") h.child.stdin.end();
    if (fault === "stop") expect((await h.send("stop")).ok).toBe(true);
    if (fault === "malformed") h.child.stdin.write("garbage\n");
    if (fault === "session") expect((await h.send("scroll", { delta: 1, session: "wrong" })).ok).toBe(false);
    if (fault === "sequence") expect((await h.send("scroll", { delta: 1, seq: 2 })).ok).toBe(false);
    if (fault === "expired-command") expect((await h.send("scroll", { delta: 1, expiresAt: Date.now() - 1 })).ok).toBe(false);
    await h.waitFor((m) => m.type === "input" && m.button === "left" && m.pressed === false);
    expect(h.messages.filter((m) => m.type === "input" && m.kind === "scroll")).toHaveLength(0);
  } finally { await h.close(); }
});
test.each(["future", "stale", "receipt-extension"])("rejects %s leases without injecting", async (invalid) => {
  const h = await nativeHelper();
  try {
    const now = Date.now();
    const capturedAt = invalid === "future" ? now + 10000 : now - 500;
    const expiresAt = invalid === "receipt-extension" ? now + 250 : capturedAt + 250;
    expect((await h.send("lease", { capturedAt, expiresAt })).ok).toBe(false);
    expect(h.messages.filter((m) => m.type === "input")).toHaveLength(0);
  } finally { await h.close(); }
});
test("ordinary commands cannot extend a valid lease", async () => {
  const h = await nativeHelper();
  try {
    await h.lease(); await h.send("button", { button: "left", pressed: true });
    expect((await h.send("scroll", { delta: 1, expiresAt: Date.now() + 10000 })).ok).toBe(false);
    await h.waitFor((m) => m.type === "input" && m.button === "left" && m.pressed === false);
  } finally { await h.close(); }
});

test.each([0, -1])("rejects repeated or older capture (%s ms) and releases held input", async (offset) => {
  const h = await nativeHelper();
  try {
    const capturedAt = Date.now() - 20;
    expect((await h.lease(capturedAt)).ok).toBe(true);
    expect((await h.send("button", { button: "left", pressed: true })).ok).toBe(true);
    expect((await h.lease(capturedAt + offset)).ok).toBe(false);
    await h.waitFor(m => m.type === "input" && m.button === "left" && m.pressed === false);
  } finally { await h.close(); }
});

test("fresh renewal expires at its capture deadline while the parent sends nothing", async () => {
  const h = await nativeHelper();
  try {
    const capturedAt = Date.now() - 140;
    expect((await h.lease(capturedAt)).ok).toBe(true);
    expect((await h.send("button", { button: "right", pressed: true })).ok).toBe(true);
    const freshCapture = capturedAt + 20;
    expect((await h.lease(freshCapture)).ok).toBe(true);
    const released = await h.waitFor(m => m.type === "released" && m.reason === "expired");
    expect(released.at).toBeLessThanOrEqual(freshCapture + 250);
    expect(h.messages.some(m => m.type === "input" && m.button === "right" && m.pressed === false)).toBe(true);
  } finally { await h.close(); }
});
test("oversized unterminated input faults without waiting for EOF", async () => {
  const h = await nativeHelper();
  try {
    await h.lease(); await h.send("button", { button: "left", pressed: true });
    h.child.stdin.write("x".repeat(8192));
    expect(await h.exited).toBe(1);
    expect(h.messages.some((m) => m.type === "input" && m.button === "left" && m.pressed === false)).toBe(true);
  } finally { await h.close(); }
});
