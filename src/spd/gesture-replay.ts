import { GestureCoordinator, type GestureViewport } from './gesture-coordinator';
import type { GestureFrame, GestureEvent } from './gesture-engine';

type Action = Exclude<GestureEvent, { type: 'move' }>;
export type ExpectedAction = Action & { earliestMs: number; latestMs: number };
export type ObservedAction = Action & { timestamp: number };
export interface GestureReplay {
  viewport: GestureViewport;
  frames: Array<{ timestamp?: number; primary: GestureFrame | null; secondary: GestureFrame | null }>;
  expected: ExpectedAction[];
}

/** Pure replay of the same gesture coordinator used by live control.
 * No camera, Electron, input transport or global desktop API is imported.
 * This measures gesture decisions only, not gaze or capture-to-input latency.
 */
export function evaluateGestureReplay(replay: GestureReplay): {
  matched: number; unexpected: ObservedAction[]; missed: ExpectedAction[]; actions: ObservedAction[];
} {
  if (!Number.isFinite(replay.viewport.width) || !Number.isFinite(replay.viewport.height) ||
      replay.viewport.width <= 0 || replay.viewport.height <= 0) throw new Error('Invalid replay viewport.');
  for (const label of replay.expected) {
    if (!Number.isFinite(label.earliestMs) || !Number.isFinite(label.latestMs) || label.earliestMs > label.latestMs)
      throw new Error('Expected action windows must be finite and ordered.');
  }
  const coordinator = new GestureCoordinator();
  const actions: ObservedAction[] = [];
  let previous = -Infinity;
  for (const frame of replay.frames) {
    const timestamp = frame.timestamp ?? frame.primary?.timestamp;
    if (timestamp === undefined || !Number.isFinite(timestamp) || timestamp <= previous ||
        (frame.primary && frame.primary.timestamp !== timestamp) ||
        (frame.secondary && frame.secondary.timestamp !== timestamp))
      throw new Error('Replay frames must be in strict timestamp order with synchronized hands.');
    previous = timestamp;
    for (const event of coordinator.update(frame.primary, frame.secondary, replay.viewport))
      if (event.type !== 'move') actions.push({ ...event, timestamp });
  }
  const consumed = new Set<number>();
  const matchedLabels = new Set<number>();
  const sameAction = (a: Action, b: Action) => a.type === b.type &&
    (!('button' in a) || ('button' in b && a.button === b.button)) &&
    (!('direction' in a) || ('direction' in b && a.direction === b.direction)) &&
    (!('delta' in a) || ('delta' in b && a.delta === b.delta));
  // Earliest deadline first prevents a broad window stealing a narrow label's
  // only matching event. Labels and emitted events are each consumed once.
  for (const { label, labelIndex } of replay.expected.map((label,labelIndex) => ({ label, labelIndex }))
    .sort((a,b) => a.label.latestMs - b.label.latestMs)) {
    const index = actions.findIndex((action,i) => !consumed.has(i) && sameAction(action,label) &&
      action.timestamp >= label.earliestMs && action.timestamp <= label.latestMs);
    if (index !== -1) { consumed.add(index); matchedLabels.add(labelIndex); }
  }
  return { matched: consumed.size, actions, unexpected: actions.filter((_,i) => !consumed.has(i)),
    missed: replay.expected.filter((_,i) => !matchedLabels.has(i)) };
}
