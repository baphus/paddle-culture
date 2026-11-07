import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const submit = await readFile(new URL("../src/app/api/submit/route.ts", import.meta.url), "utf8");
const reclaim = await readFile(new URL("../src/lib/booking/hold-owner.ts", import.meta.url), "utf8");

test("SLOT_TAKEN diagnostics cover each branch without logging raw payloads", () => {
  for (const source of ["submit_preflight", "submit_rpc"]) {
    assert.ok(submit.includes(`source: "${source}"`));
  }
  for (const source of ["reclaim_precheck", "reclaim_rpc"]) {
    assert.ok(reclaim.includes(`source: "${source}"`));
  }
  assert.equal((submit.match(/console\.warn\("SLOT_TAKEN"/g) ?? []).length, 2);
  assert.equal((reclaim.match(/console\.warn\("SLOT_TAKEN"/g) ?? []).length, 2);
  for (const source of [submit, reclaim]) {
    for (const line of source.split("\n").filter((entry) => entry.includes("console.warn(\"SLOT_TAKEN\""))) {
      assert.doesNotMatch(line, /error|body|token|email|proof|owner|customer/i);
    }
  }
});
