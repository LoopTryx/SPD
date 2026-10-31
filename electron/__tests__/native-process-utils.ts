import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { expect } from "vitest";

export async function nativeHelper(extraArgs: string[] = []) {
  const executable = path.resolve("native/bin/win-x64/Spd.InputHelper.exe");
  expect(existsSync(executable), "Build native helper with native/build.ps1 before running native tests").toBe(true);
  // This is the only launch path used by native tests. No OS injection is possible.
  const child = spawn(executable, ["--dry-run", ...extraArgs], { windowsHide: true, stdio: "pipe" });
  const messages: Record<string, any>[] = [];
  const waiters = new Set<() => void>();
  let buffer = "";
  child.stdout.on("data", (data) => {
    buffer += data.toString();
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      messages.push(JSON.parse(buffer.slice(0, newline)));
      buffer = buffer.slice(newline + 1);
    }
    for (const notify of waiters) notify();
  });
  const exited = new Promise<number | null>((resolve, reject) => { child.once("exit", resolve); child.once("error", reject); });
  function waitFor(predicate: (message: Record<string, any>) => boolean, timeout = 3000, from = 0) {
    return new Promise<Record<string, any>>((resolve, reject) => {
      const check = () => {
        const match = messages.slice(from).find(predicate);
        if (match) { clearTimeout(timer); waiters.delete(check); resolve(match); }
      };
      const timer = setTimeout(() => { waiters.delete(check); reject(new Error("Native response timed out: " + JSON.stringify(messages))); }, timeout);
      waiters.add(check); check();
    });
  }
  let seq = 0;
  const session = "native-test-session";
  let expiresAt = 0;
  async function send(type: string, fields: Record<string, unknown> = {}) {
    const command = { type, session, seq: ++seq, expiresAt, ...fields };
    const from = messages.length;
    child.stdin.write(JSON.stringify(command) + "\n");
    return waitFor((m) => m.type === "ack" && m.seq === command.seq, 3000, from);
  }
  async function lease(capturedAt = Date.now()) {
    expiresAt = capturedAt + 250;
    return send("lease", { capturedAt, expiresAt });
  }
  const ready = await waitFor((m) => m.type === "ready");
  return { child, messages, waitFor, send, lease, ready, exited, async close() { child.stdin.end(); await exited; } };
}
