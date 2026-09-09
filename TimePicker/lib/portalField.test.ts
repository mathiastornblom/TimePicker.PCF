import test from "node:test";
import assert from "node:assert/strict";
import { buildFieldSelector } from "./portalField.ts";

test("the selector matches how hosts name their inputs", () => {
    const selector = buildFieldSelector("new_showtimeminute");
    assert.ok(selector);
    // Power Pages names inputs ctl00$...$new_showtimeminute.
    assert.match(selector, /input\[name\$="\$new_showtimeminute"\]/);
    // And the same shape with underscores for ids, plus the bare forms.
    assert.match(selector, /input\[id\$="_new_showtimeminute"\]/);
    assert.match(selector, /input\[name="new_showtimeminute"\]/);
    assert.match(selector, /input\[id="new_showtimeminute"\]/);
});

test("anything that is not a plain column name is refused", () => {
    // The logical name reaches a CSS selector, so nothing else may pass.
    assert.equal(buildFieldSelector(""), null);
    assert.equal(buildFieldSelector('a"], input[name^="'), null);
    assert.equal(buildFieldSelector("new-showtime minute"), null);
    assert.equal(buildFieldSelector("new_showtime.minute"), null);
    assert.equal(buildFieldSelector(undefined as unknown as string), null);
});

test("ordinary column names are accepted", () => {
    assert.ok(buildFieldSelector("new_showtimeminute"));
    assert.ok(buildFieldSelector("cr123_minute2"));
    assert.ok(buildFieldSelector("MINUTE"));
});
