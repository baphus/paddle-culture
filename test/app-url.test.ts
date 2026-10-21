import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_APP_URL, normalizeAppUrl } from "../src/lib/app-url.ts";

test("normalizeAppUrl: keeps a full https URL", () => {
  assert.equal(normalizeAppUrl("https://ckgrounds.vercel.app"), "https://ckgrounds.vercel.app");
});

test("normalizeAppUrl: adds the scheme when it is missing", () => {
  // Regression: a scheme-less base made the QR payload plain text, which phone
  // scanners send to Google instead of opening the tracking page.
  assert.equal(normalizeAppUrl("ckgrounds.vercel.app"), "https://ckgrounds.vercel.app");
});

test("normalizeAppUrl: strips quotes, whitespace and trailing slashes", () => {
  assert.equal(normalizeAppUrl('  "https://ckgrounds.vercel.app/"  '), "https://ckgrounds.vercel.app");
  assert.equal(normalizeAppUrl("http://localhost:3000//"), "http://localhost:3000");
});

test("normalizeAppUrl: falls back to the production domain", () => {
  assert.equal(normalizeAppUrl(undefined), DEFAULT_APP_URL);
  assert.equal(normalizeAppUrl(""), DEFAULT_APP_URL);
  assert.equal(normalizeAppUrl("not a url"), DEFAULT_APP_URL);
});

test("normalizeAppUrl: keeps a sub-path deploy", () => {
  assert.equal(normalizeAppUrl("example.com/app/"), "https://example.com/app");
});
