import { EventEmitter } from "node:events";
import { vi } from "vitest";

export function fakeHelper() {
  const sent: Record<string, any>[] = [];
  const child = Object.assign(new EventEmitter(), {
    killed: false,
    stdin: Object.assign(new EventEmitter(), {
      writable: true,
      write: vi.fn((line: string) => { sent.push(JSON.parse(line)); return true; }),
      end: vi.fn((line?: string) => { if (line) sent.push(JSON.parse(line)); }),
    }),
    stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn(), sent,
    ack(index = sent.length - 1, ok = true) {
      const command = sent[index];
      child.stdout.emit("data", Buffer.from(JSON.stringify({ type: "ack", session: command.session, seq: command.seq, ok }) + "\n"));
    },
  });
  const on = child.stdout.on.bind(child.stdout);
  child.stdout.on = ((event: string, listener: (...args: any[]) => void) => {
    on(event, listener);
    if (event === "data") listener(Buffer.from('{"type":"ready","protocol":1}\n'));
    return child.stdout;
  }) as typeof child.stdout.on;
  return child;
}
