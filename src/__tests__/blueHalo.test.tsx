import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import BlueHalo from "../BlueHalo";
import CameraFeed from "../CameraFeed";
import App from "../App";

afterEach(() => vi.unstubAllGlobals());

test("uses four stationary edge gradients", () => {
  const html = renderToStaticMarkup(<BlueHalo />);
  expect(html.match(/linear-gradient/g)).toHaveLength(4);
  expect(html).not.toContain("radial-gradient");
  expect(html).not.toContain("transform");
});

test("keeps the camera source invisible", () => {
  const html = renderToStaticMarkup(<CameraFeed />);
  expect(html).toContain("data-spd-video");
  expect(html).toContain("opacity:0");
});

test("renders the application without a notch or swipe translation", () => {
  vi.stubGlobal("innerWidth", 1920);
  vi.stubGlobal("innerHeight", 1080);
  // The renderer only reads window.spd to build the control session.
  vi.stubGlobal("window", { spd: {} });
  const html = renderToStaticMarkup(<App />);
  expect(html).toContain("data-spd-blue-halo");
  expect(html).not.toContain("data-spd-notch");
  expect(html).not.toContain("translateX");
});
