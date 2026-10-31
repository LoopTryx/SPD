import { expect, test } from "vitest";
import { nativeHelper } from "./native-process-utils";

test("published helper reports actual marshalled INPUT ABI without loading input APIs", async () => {
  const helper = await nativeHelper();
  try { expect(helper.ready).toMatchObject({ dryRun: true, inputSize: 40 }); }
  finally { await helper.close(); }
});
