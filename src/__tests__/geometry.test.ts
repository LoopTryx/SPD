import { expect, test } from "vitest";
import { mapCameraPointToScreen } from "../spd/geometry";

test("maps the centered camera workspace to the complete screen", () => {
  expect(mapCameraPointToScreen({ x: 0.2, y: 0.2 })).toEqual({ x: 0, y: 0 });
  expect(mapCameraPointToScreen({ x: 0.8, y: 0.8 })).toEqual({ x: 1, y: 1 });
  expect(mapCameraPointToScreen({ x: 0.95, y: 0.05 })).toEqual({ x: 1, y: 0 });
});
