import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import BlueHalo from '../BlueHalo';

test('active control has a stronger blue glow than waiting without adding interactive UI', () => {
  const waiting = renderToStaticMarkup(<BlueHalo mode="waiting" />);
  const active = renderToStaticMarkup(<BlueHalo mode="active" />);
  expect(active).toContain('data-spd-state="active"');
  expect(waiting).toContain('opacity:0.35');
  expect(active).toContain('opacity:0.85');
  expect(active).not.toMatch(/<canvas|<button|<input|<svg/);
  expect(active).toContain('pointer-events:none');
});

test('paused control stays visibly distinguishable without a continuous animation loop', () => {
  const paused = renderToStaticMarkup(<BlueHalo mode="paused" />);
  expect(paused).toContain('data-spd-state="paused"');
  expect(paused).toContain('opacity:0.2');
  expect(paused).not.toContain('animation:');
});
