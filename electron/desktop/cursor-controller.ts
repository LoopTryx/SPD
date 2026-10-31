import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { app, screen } from "electron";

export type CursorButton = "left" | "right";
export type WorkspaceDirection = "next" | "previous";
export const INPUT_LEASE_MS = 250;
const MAX_QUEUE = 32;
type Command = { type: string; expiresAt: number; [key: string]: unknown };
type Pending = { command: Command; resolve: (ok: boolean) => void; timer?: ReturnType<typeof setTimeout>; seq?: number };
type Session = {
  child: ChildProcessWithoutNullStreams; id: string; seq: number; ready: boolean;
  buffer: string; queue: Pending[]; active?: Pending; startup?: ReturnType<typeof setTimeout>;
};

/** Main owns the explicit-resume gate. Only a new validated capture may call renewLease. */
export class CursorController {
  private session: Session | null = null;
  private expiresAt = 0;
  private lastCapturedAt = -Infinity;
  private displayId: number | null = null;
  private leaseTimer?: ReturnType<typeof setTimeout>;

  renewLease(capturedAtEpoch: number): Promise<boolean> {
    const now = Date.now();
    if (process.platform !== "win32" || !Number.isSafeInteger(capturedAtEpoch) ||
        capturedAtEpoch > now || capturedAtEpoch + INPUT_LEASE_MS <= now ||
        capturedAtEpoch <= this.lastCapturedAt) {
      void this.releaseAll();
      return Promise.resolve(false);
    }
    this.lastCapturedAt = capturedAtEpoch;
    const session = this.session ?? this.startHelper();
    if (!session) return Promise.resolve(false);
    return this.enqueue(session, { type: "lease", capturedAt: capturedAtEpoch, expiresAt: capturedAtEpoch + INPUT_LEASE_MS });
  }

  setDisplayId(id: number | null): Promise<boolean> {
    if (id !== null && (!Number.isSafeInteger(id) || !screen.getAllDisplays().some((display) => display.id === id))) {
      return Promise.resolve(false);
    }
    this.displayId = id;
    return Promise.resolve(true);
  }

  moveNormalized(x: number, y: number): Promise<boolean> {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return Promise.resolve(false);
    if (!this.isLeased()) return Promise.resolve(false);
    try {
      const display = this.displayId === null ? screen.getPrimaryDisplay() :
        screen.getAllDisplays().find((candidate) => candidate.id === this.displayId);
      if (!display) { void this.releaseAll(); return Promise.resolve(false); }
      const area = display.workArea;
      const physical = screen.dipToScreenPoint({
        x: Math.round(area.x + x * (area.width - 1)),
        y: Math.round(area.y + y * (area.height - 1)),
      });
      return this.input({ type: "move", x: physical.x, y: physical.y });
    } catch { void this.releaseAll(); return Promise.resolve(false); }
  }

  setButton(button: CursorButton, pressed: boolean): Promise<boolean> {
    if ((button !== "left" && button !== "right") || typeof pressed !== "boolean") return Promise.resolve(false);
    return this.input({ type: "button", button, pressed });
  }

  scroll(delta: number): Promise<boolean> {
    if (!Number.isFinite(delta)) return Promise.resolve(false);
    const bounded = Math.max(-1200, Math.min(1200, Math.round(delta)));
    return bounded === 0 ? Promise.resolve(false) : this.input({ type: "scroll", delta: bounded });
  }

  switchWorkspace(direction: WorkspaceDirection): Promise<boolean> {
    return direction === "next" || direction === "previous" ?
      this.input({ type: "workspace", direction }) : Promise.resolve(false);
  }

  releaseAll(): Promise<boolean> {
    this.revokeLease();
    const session = this.session;
    if (!session) return Promise.resolve(true);
    this.cancelPending(session);
    return this.enqueue(session, { type: "release", expiresAt: Date.now() + INPUT_LEASE_MS });
  }

  stop(): Promise<boolean> {
    this.revokeLease();
    const session = this.session;
    if (!session) return Promise.resolve(true);
    this.cancelPending(session);
    const result = this.enqueue(session, { type: "stop", expiresAt: Date.now() + INPUT_LEASE_MS });
    // Detach immediately: late exit/data from this generation cannot affect its successor.
    this.session = null;
    try { session.child.stdin.end(); } catch { this.failSession(session); }
    this.reap(session);
    return result;
  }

  private isLeased(): boolean { return this.session !== null && Date.now() < this.expiresAt; }
  private input(command: Omit<Command, "expiresAt">): Promise<boolean> {
    if (!this.isLeased()) return Promise.resolve(false);
    return this.enqueue(this.session!, { ...command, type: String(command.type), expiresAt: this.expiresAt });
  }

  private enqueue(session: Session, command: Command): Promise<boolean> {
    return new Promise((resolve) => {
      const pending: Pending = { command, resolve };
      const tail = session.queue[session.queue.length - 1];
      if ((command.type === "move" || command.type === "lease") && tail?.command.type === command.type) {
        session.queue.pop(); this.settle(tail, false);
      }
      if (session.queue.length >= MAX_QUEUE) { resolve(false); this.failSession(session); return; }
      session.queue.push(pending);
      pending.timer = setTimeout(() => {
        // A cold helper may take longer than one capture lifetime to start.
        // Drop the unsent capture; a later fresh capture can use the ready process.
        if (!session.ready && pending !== session.active) {
          session.queue = session.queue.filter((item) => item !== pending); this.settle(pending, false);
        } else this.failSession(session);
      }, Math.max(1, command.expiresAt - Date.now()));
      this.pump(session);
    });
  }

  private pump(session: Session): void {
    if (!session.ready || session.active) return;
    const pending = session.queue.shift();
    if (!pending) return;
    if (pending.command.expiresAt <= Date.now()) { this.settle(pending, false); this.failSession(session); return; }
    session.active = pending;
    pending.seq = ++session.seq;
    try {
      if (!session.child.stdin.writable) throw new Error("Input pipe closed");
      // Only one command is in flight, so stream backpressure cannot grow an unbounded queue.
      session.child.stdin.write(JSON.stringify({ ...pending.command, session: session.id, seq: pending.seq }) + "\n");
    } catch { this.failSession(session); }
  }

  private startHelper(): Session | null {
    try {
      const executable = app.isPackaged ? path.join(process.resourcesPath, "native", "Spd.InputHelper.exe") :
        path.join(app.getAppPath(), "native", "bin", process.arch === "arm64" ? "win-arm64" : "win-x64", "Spd.InputHelper.exe");
      const child = spawn(executable, [], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
      const session: Session = { child, id: randomUUID(), seq: 0, ready: false, buffer: "", queue: [] };
      this.session = session;
      session.startup = setTimeout(() => this.failSession(session), 5000);
      child.stdout.on("data", (data: Buffer) => this.readOutput(session, data));
      child.stderr.on("data", () => { /* Drain diagnostics without exposing arbitrary helper output. */ });
      child.on("error", () => this.failSession(session));
      child.stdin.on("error", () => this.failSession(session));
      child.stdout.on("error", () => this.failSession(session));
      child.once("exit", () => this.failSession(session));
      return session;
    } catch { this.session = null; this.revokeLease(); return null; }
  }

  private readOutput(session: Session, data: Buffer): void {
    session.buffer += data.toString("utf8");
    if (session.buffer.length > 16384) { this.failSession(session); return; }
    let newline: number;
    while ((newline = session.buffer.indexOf("\n")) !== -1) {
      const line = session.buffer.slice(0, newline); session.buffer = session.buffer.slice(newline + 1);
      try {
        const message = JSON.parse(line);
        if (message.type === "ready" && message.protocol === 1 && !session.ready) {
          session.ready = true; clearTimeout(session.startup); this.pump(session);
        } else if (message.type === "released") {
          if (this.session === session) this.revokeLease();
        } else if (message.type === "ack") {
          const pending = session.active;
          if (message.session !== session.id || !Number.isSafeInteger(message.seq) || typeof message.ok !== "boolean") {
            this.failSession(session); return;
          }
          // A priority release/stop cancels previous promises but still consumes their late replies.
          if (!pending || message.seq < pending.seq!) continue;
          if (message.seq !== pending.seq) { this.failSession(session); return; }
          session.active = undefined;
          const ok = message.ok && Date.now() < pending.command.expiresAt;
          if (ok && pending.command.type === "lease" && this.session === session) {
            this.expiresAt = pending.command.expiresAt;
            clearTimeout(this.leaseTimer);
            this.leaseTimer = setTimeout(() => this.failSession(session), Math.max(1, this.expiresAt - Date.now()));
          }
          this.settle(pending, ok);
          if (!ok) { this.failSession(session); return; }
          this.pump(session);
        } else { this.failSession(session); return; }
      } catch { this.failSession(session); return; }
    }
  }

  private settle(pending: Pending, ok: boolean): void { clearTimeout(pending.timer); pending.resolve(ok); }
  private cancelPending(session: Session): void {
    if (session.active) this.settle(session.active, false);
    session.active = undefined;
    for (const pending of session.queue) this.settle(pending, false);
    session.queue = [];
  }
  private revokeLease(): void { this.expiresAt = 0; clearTimeout(this.leaseTimer); }
  private failSession(session: Session): void {
    clearTimeout(session.startup); this.cancelPending(session);
    if (this.session === session) { this.session = null; this.revokeLease(); }
    try { session.child.stdin.end(); } catch { /* The independent native watchdog still releases. */ }
    this.reap(session);
  }
  private reap(session: Session): void {
    // EOF normally releases immediately. Allow the independent watchdog to run before forced termination.
    const timer = setTimeout(() => { if (session.child.exitCode === null && !session.child.killed) session.child.kill(); }, 300);
    timer.unref();
  }
}

let cursorController: CursorController | null = null;
export function getCursorController(): CursorController {
  return cursorController ??= new CursorController();
}
