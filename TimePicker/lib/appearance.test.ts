import test from "node:test";
import assert from "node:assert/strict";
import { parseCssColor, parseOpacityPercent } from "./appearance.ts";

test("colours CSS understands are accepted", () => {
    assert.equal(parseCssColor("#0078d4"), "#0078d4");
    assert.equal(parseCssColor("#fff"), "#fff");
    assert.equal(parseCssColor("#0078d480"), "#0078d480");
    assert.equal(parseCssColor("rgba(0, 120, 212, 0.15)"), "rgba(0, 120, 212, 0.15)");
    assert.equal(parseCssColor("hsl(206 100% 42%)"), "hsl(206 100% 42%)");
    assert.equal(parseCssColor("transparent"), "transparent");
    assert.equal(parseCssColor("  #0078d4  "), "#0078d4");
});

test("anything else falls back to the theme", () => {
    assert.equal(parseCssColor(""), null);
    assert.equal(parseCssColor("   "), null);
    assert.equal(parseCssColor(null), null);
    assert.equal(parseCssColor(undefined), null);
    assert.equal(parseCssColor("#12345"), null);
    assert.equal(parseCssColor("url(https://example.com/x.png)"), null);
    assert.equal(parseCssColor("red; background-image: url(x)"), null);
    assert.equal(parseCssColor("expression(alert(1))"), null);
});

test("opacity is read as a percentage", () => {
    assert.equal(parseOpacityPercent(100), 1);
    assert.equal(parseOpacityPercent(50), 0.5);
    assert.equal(parseOpacityPercent(15), 0.15);
    assert.equal(parseOpacityPercent(150), 1);
});

test("an unset opacity leaves the band fully opaque", () => {
    // Hosts hand back 0 for a whole number input the maker never filled in.
    assert.equal(parseOpacityPercent(0), 1);
    assert.equal(parseOpacityPercent(-10), 1);
    assert.equal(parseOpacityPercent(null), 1);
    assert.equal(parseOpacityPercent(undefined), 1);
});
