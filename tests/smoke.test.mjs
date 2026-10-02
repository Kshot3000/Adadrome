/* Adadrome smoke + math tests — run: node --test tests/smoke.test.mjs
   Guards the stable-swap quote fix (2026-10-02): the stable mid price is the
   tokens' price ratio, not the reserve ratio — the old formula made every
   ADA stable swap read ~15%+ impact and trip doSwap's >15% guard. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const html = read("index.html");
const appJs = read("js/app.js");

const ctx = { console, Date, Math, JSON };
vm.createContext(ctx);
vm.runInContext(read("js/data.js"), ctx);
const A = vm.runInContext("ADADROME", ctx);

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} !~= ${b} (tol ${tol})`);

test("stable ADA->DJED: rate is the price ratio, small-trade impact is tiny", () => {
  const q = A.quote("ADA", "DJED", 100);
  near(q.rate, 0.85, 1e-9, "rate");
  near(q.out, 84.9575, 0.01, "out");
  assert.ok(q.impact < 1, `impact ${q.impact}% must be < 1% (was ~15% pre-fix)`);
});

test("stable DJED->ADA: reverse direction also quotes sanely", () => {
  const q = A.quote("DJED", "ADA", 100);
  near(q.rate, 1 / 0.85, 1e-9, "rate");
  near(q.out, 117.588, 0.01, "out");
  assert.ok(q.impact < 1, `impact ${q.impact}%`);
});

test("stable DJED->IUSD (equal prices): ~1:1 out, negligible impact", () => {
  const q = A.quote("DJED", "IUSD", 100);
  near(q.rate, 1, 1e-9, "rate");
  near(q.out, 99.98, 0.01, "out");
  assert.ok(q.impact < 0.1, `impact ${q.impact}%`);
});

test("stable impact grows with trade size", () => {
  const small = A.quote("ADA", "DJED", 100);
  const huge = A.quote("ADA", "DJED", 2_000_000);
  assert.ok(huge.impact > small.impact, `${huge.impact} should exceed ${small.impact}`);
});

test("volatile ADA->MIN follows x*y=k after the fee", () => {
  const p = A.poolFor("ADA", "MIN");
  const amtInFee = 100 * (1 - p.fee);
  const expected = (amtInFee * p.r1) / (p.r0 + amtInFee);
  const q = A.quote("ADA", "MIN", 100);
  near(q.out, expected, 1e-6, "volatile out");
  near(q.rate, p.r1 / p.r0, 1e-9, "volatile rate is the reserve ratio");
});

test("quote rejects empty/invalid input; poolFor is symmetric", () => {
  assert.equal(A.quote("ADA", "DJED", 0), null);
  assert.equal(A.quote("ADA", "DJED", -5), null);
  assert.equal(A.quote("ADA", "DROME", 100), null); // no direct pool
  assert.equal(A.poolFor("DJED", "ADA"), A.poolFor("ADA", "DJED"));
});

test("CL math: liq/amounts round-trip and tick price consistency", () => {
  const { CLM } = A;
  const sqrtA = Math.sqrt(0.7), sqrtB = Math.sqrt(1.1), sqrtP = Math.sqrt(0.85);
  const L = CLM.liqForA0(sqrtA, sqrtB, 100);
  const [a0] = CLM.amountsForLiq(sqrtP, sqrtA, sqrtB, L);
  // a0 recovered at current price is the in-range portion, <= the full-range 100
  assert.ok(a0 > 0 && a0 <= 100.0001, `a0 ${a0}`);
  const p = A.CLPOOLS[0];
  near(A.tickPrice(A.clTick(p)), p.price, p.price * 0.01, "tickPrice(clTick) ~ price");
});

test("app.js delegates quoting to ADADROME (single source of truth)", () => {
  assert.match(appJs, /function quote\(from, to, amtIn\) \{ return ADADROME\.quote\(from, to, amtIn\); \}/);
  assert.match(appJs, /e\.key !== "Escape"/, "Escape closes modals");
});

test("index.html: versioned assets, honest copy, attribution", () => {
  for (const ref of ["css/style.css?v=1", "js/data.js?v=1", "js/app.js?v=1"])
    assert.ok(html.includes(ref), `missing cache-busted ref ${ref}`);
  assert.ok(!html.includes("coming in v2"), "CL v2 already shipped — no 'coming in v2'");
  assert.ok(!html.includes("Live gauge APRs"), "demo figures must not be labeled Live");
  assert.ok(html.includes("FLYWHEEL") && !html.includes("FLYWHEL<"), "flywheel spelling");
  assert.ok(html.includes('href="https://x.com/kshot9000"'), "footer X link");
  assert.ok(html.includes("3GnR7TWBXAB3pPztBWpNF4LMNEX5yX8vZK"), "BTC donation address");
  assert.equal((html.match(/role="dialog"/g) || []).length, 5, "all 5 modals are dialogs");
  assert.equal((html.match(/aria-label="Close"/g) || []).length, 5, "all modal close buttons labeled");
  assert.ok(html.includes('property="og:url" content="https://kshot3000.github.io/Adadrome/"'), "og:url");
});
