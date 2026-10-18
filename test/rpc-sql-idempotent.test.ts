import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// supabase/rpc-functions.sql is applied by pasting the whole file into the
// Supabase SQL editor, over and over, as it grows. Anything in it that is not
// idempotent fails on the second run — which is exactly what happened with
// "42710: constraint pricing_rules_amount_positive ... already exists".
//
// The categories below are the statements in that file that need guarding, and
// the spelling that makes each one re-runnable on Postgres.

const SQL = readFileSync(
  join(import.meta.dirname, "..", "supabase", "rpc-functions.sql"),
  "utf8",
);

/** Strip `--` comments so documentation is not mistaken for code. */
const CODE = SQL.split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

test("no bare ADD CONSTRAINT (Postgres has no IF NOT EXISTS for it)", () => {
  // Must be wrapped in a DO block guarded by pg_constraint, or it raises 42710
  // on every re-run. "Bare" = at statement position (column 0, as the file
  // writes top-level SQL), not indented inside a DO block.
  const bare = [
    ...CODE.matchAll(
      /^ALTER\s+TABLE\s+\w+\s*\r?\n?\s*ADD\s+CONSTRAINT\s+\w+/gim,
    ),
  ].map((m) => m[0].trim().replace(/\s+/g, " "));
  assert.deepEqual(
    bare,
    [],
    "Wrap ADD CONSTRAINT in a DO $$ ... pg_constraint ... $$ guard instead.",
  );
});

test("every ADD CONSTRAINT sits inside a pg_constraint guard", () => {
  // Only real statements: `ALTER TABLE ... ADD CONSTRAINT <name>`, not the
  // words appearing in prose. Tolerates the newline the file uses after
  // ALTER TABLE.
  const adds = [
    ...CODE.matchAll(
      /ALTER\s+TABLE\s+\w+\s+ADD\s+CONSTRAINT\s+(\w+)/gi,
    ),
  ].map((m) => m[1] as string);
  assert.ok(adds.length > 0, "expected at least one guarded constraint");
  for (const name of adds) {
    assert.match(
      CODE,
      new RegExp(`conname\\s*=\\s*'${name}'`),
      `constraint ${name} is added without a pg_constraint existence check`,
    );
  }
});

test("indexes and columns are created with IF NOT EXISTS", () => {
  // A second run must not raise 42P07 (duplicate index) / 42701 (duplicate column).
  const badIndex = [
    ...CODE.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS)(\w+)/gi),
  ].map((m) => m[1]);
  assert.deepEqual(badIndex, [], "CREATE INDEX without IF NOT EXISTS");

  const badColumn = [
    ...CODE.matchAll(/ALTER\s+TABLE\s+\w+\s+ADD\s+COLUMN\s+(?!IF\s+NOT\s+EXISTS)(\w+)/gi),
  ].map((m) => m[1]);
  assert.deepEqual(badColumn, [], "ADD COLUMN without IF NOT EXISTS");
});

test("the pricing_rules guard is present and still enforces amount > 0", () => {
  // The idempotency guard must not be confused with dropping the rule.
  assert.match(CODE, /CHECK\s*\(\s*amount\s*>\s*0\s*\)/);
  assert.match(CODE, /conname\s*=\s*'pricing_rules_amount_positive'/);
});
