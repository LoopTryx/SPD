import { describe, expect, it } from 'vitest';
import { AttentionGate } from '../spd/attention-gate';

describe('attention input gate', () => {
  it('requires sustained attention and a neutral hand, then blocks a look-away', () => {
    const gate = new AttentionGate();
    expect(gate.update('attentive', 0, true)).toBe(false);
    for (let t = 100; t < 500; t += 100) gate.update('attentive', t, false);
    expect(gate.update('attentive', 500, false)).toBe(false);
    expect(gate.update('attentive', 510, true)).toBe(true);
    expect(gate.update('away', 520, true)).toBe(false);
    expect(gate.update('attentive', 530, false)).toBe(false);
    for (let t = 630; t < 1100; t += 100) gate.update('attentive', t, false);
    expect(gate.update('attentive', 1100, false)).toBe(false);
  });

  it('does not interpret a large gap as continuous attention', () => {
    const gate = new AttentionGate();
    gate.update('attentive', 0, true);
    expect(gate.update('attentive', 1000, true)).toBe(false);
  });

  it('requires rearming after reset and never trusts a reversed timestamp', () => {
    const gate = new AttentionGate();
    for (let t = 0; t <= 500; t += 100) gate.update('attentive', t, true);
    expect(gate.update('attentive', 510, true)).toBe(true);
    expect(gate.update('attentive', 490, true)).toBe(false);
    gate.reset();
    expect(gate.update('attentive', 600, true)).toBe(false);
  });

  it('preserves an armed state across a brief blink but resets after prolonged closure', () => {
    const gate = new AttentionGate();
    for (let t = 0; t <= 500; t += 100) gate.update('attentive', t, true);
    expect(gate.update('blink', 560, false)).toBe(false);
    expect(gate.inBlinkGrace).toBe(true);
    expect(gate.update('attentive', 620, false)).toBe(true);
    expect(gate.update('blink', 680, false)).toBe(false);
    expect(gate.update('blink', 850, false)).toBe(false);
    expect(gate.inBlinkGrace).toBe(false);
    expect(gate.update('attentive', 900, false)).toBe(false);
  });
  it('suspends briefly on uncertain gaze and releases after prolonged uncertainty', () => {
    const gate = new AttentionGate();
    for (let t = 0; t <= 500; t += 100) gate.update('attentive', t, true);
    expect(gate.update('unknown', 560, false)).toBe(false);
    expect(gate.inAttentionGrace).toBe(true);
    expect(gate.update('attentive', 620, false)).toBe(true);
    expect(gate.update('unknown', 680, false)).toBe(false);
    expect(gate.update('unknown', 850, false)).toBe(false);
    expect(gate.inAttentionGrace).toBe(false);
    expect(gate.update('attentive', 900, false)).toBe(false);
  });
});
