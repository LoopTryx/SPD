import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
test('control center explains emergency pause and offers controls while initial state loads', async () => {
  const module = await import('../../src/ControlCenter').catch(() => ({ default: () => null }));
  const html = renderToStaticMarkup(createElement(module.default));
  expect(html).toContain('SPD Settings');
  expect(html).toContain('Ctrl + Alt + Escape');
  expect(html).toContain('Loading');
});
