import { expect, test } from "vitest";
import { nativeHelper } from "./native-process-utils";

test.each(["next", "previous"])("native workspace %s emits balanced Ctrl+Win+arrow", async (direction) => {
  const h = await nativeHelper();
  try {
    expect((await h.lease()).ok).toBe(true);
    expect((await h.send("workspace", { direction })).ok).toBe(true);
    const arrow = direction === "next" ? 39 : 37;
    expect(h.messages.filter((m) => m.type === "input").map((m) => [m.key, m.pressed])).toEqual([
      [17, true], [91, true], [arrow, true], [arrow, false], [91, false], [17, false],
    ]);
  } finally { await h.close(); }
});
test("partial workspace failure releases attempted keys and returns failure", async () => {
  const h = await nativeHelper(["--fail-after=2"]);
  try {
    await h.lease(); expect((await h.send("workspace", { direction: "next" })).ok).toBe(false);
    expect(h.messages.filter((m) => m.type === "input" && m.pressed === false).map((m) => m.key)).toEqual(expect.arrayContaining([17, 91, 39]));
    expect(await h.exited).toBe(1);
  } finally { await h.close(); }
});
