import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestEmailDomain } from "../src/lib/booking/email.ts";

// ------------------------------------------------------------ suggestEmailDomain

test("suggestEmailDomain: catches a bad TLD", () => {
  assert.equal(suggestEmailDomain("juan@gmail.con")?.correctedEmail, "juan@gmail.com");
  assert.equal(suggestEmailDomain("juan@gmail.comm")?.correctedEmail, "juan@gmail.com");
  assert.equal(suggestEmailDomain("juan@yahoo.con")?.correctedEmail, "juan@yahoo.com");
});

test("suggestEmailDomain: catches a transposed provider name", () => {
  assert.equal(suggestEmailDomain("juan@gmial.com")?.correctedEmail, "juan@gmail.com");
});

test("suggestEmailDomain: strips a doubled suffix", () => {
  assert.equal(suggestEmailDomain("juan@gmail.com.con")?.correctedEmail, "juan@gmail.com");
});

test("suggestEmailDomain: works for uppercase input and keeps the local part", () => {
  assert.equal(suggestEmailDomain("Juan.DC@Gmail.CON")?.correctedEmail, "Juan.DC@gmail.com");
});

test("suggestEmailDomain: leaves valid addresses alone", () => {
  assert.equal(suggestEmailDomain("juan@gmail.com"), null);
  assert.equal(suggestEmailDomain("juan@mail.ru"), null);
  assert.equal(suggestEmailDomain("juan@yahoo.co.jp"), null);
  assert.equal(suggestEmailDomain("juan@gmail.co"), null);
});

test("suggestEmailDomain: ignores distance-2 typos and junk input", () => {
  assert.equal(suggestEmailDomain("juan@gmiall.com"), null);
  assert.equal(suggestEmailDomain("juan@exmaple.com"), null);
  assert.equal(suggestEmailDomain("juan"), null);
  assert.equal(suggestEmailDomain(""), null);
});
