import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const manifestPath = join(dirname(fileURLToPath(import.meta.url)), "..", "ControlManifest.Input.xml");
const manifest = readFileSync(manifestPath, "utf8");

/**
 * Dataverse validates display-name-key and description-key against the XSD type
 * `noAposStringType`, which rejects apostrophes. The local pcf-scripts build does
 * not check this, so the failure only appears when the solution is imported. This
 * test moves that failure back to the desk.
 */
test("no apostrophes in the manifest label attributes", () => {
    const offenders = [...manifest.matchAll(/(display-name-key|description-key)="([^"]*)"/g)]
        .filter(([, , value]) => /['‘’]/.test(value))
        .map(([, attribute, value]) => `${attribute}="${value}"`);

    assert.deepEqual(
        offenders,
        [],
        `Dataverse rejects apostrophes in these attributes on import:\n  ${offenders.join("\n  ")}`
    );
});

test("the control keeps the identity that existing forms bind to", () => {
    // Changing any of these turns an in-place upgrade into a separate component,
    // and every form already using it would have to be reconfigured by hand.
    assert.match(manifest, /namespace="DR"/);
    assert.match(manifest, /constructor="TimePicker"/);
    assert.match(manifest, /control-type="standard"/);
});

test("every property carries both label attributes", () => {
    const properties = [...manifest.matchAll(/<property\s[^>]*>/g)].map(([tag]) => tag);
    assert.ok(properties.length > 0, "expected the manifest to declare properties");
    for (const tag of properties) {
        const name = /name="([^"]+)"/.exec(tag)?.[1] ?? tag;
        assert.match(tag, /display-name-key="/, `${name} is missing display-name-key`);
        assert.match(tag, /description-key="/, `${name} is missing description-key`);
    }
});
