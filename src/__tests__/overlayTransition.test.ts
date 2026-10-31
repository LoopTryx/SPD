import { expect, test } from "vitest";
import { getOverlayVisualState } from "../spd/overlay-transition";

test.each([0, 0.25, 0.5, 0.99, 1])(
  "overlay remains binary at swipe progress %s",
  (progress) => {
    for (const direction of ["left", "right"] as const) {
      expect(getOverlayVisualState(true, { progress, direction })).toEqual({
        mounted: true,
        opacity: 1,
        translateX: 0,
        revealEdge: false,
      });
      expect(getOverlayVisualState(false, { progress, direction })).toEqual({
        mounted: false,
        opacity: 0,
        translateX: 0,
        revealEdge: false,
      });
    }
  },
);
