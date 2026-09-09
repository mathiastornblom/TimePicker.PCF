/**
 * Writing a second bound column on a Power Pages form.
 *
 * Power Pages renders one input per field on the form, but only populates the
 * field the code component is attached to. Any other bound column therefore has
 * nowhere to be posted, and its value is lost on save. This is the documented
 * limitation that components bound to multiple fields are not supported there.
 *
 * When the maker puts the other column on the form as well and opts in, the
 * control writes into that input directly so the value is submitted with the
 * rest of the form. Nothing here runs unless it is switched on, and none of it
 * applies to model-driven or canvas apps, which write every bound column.
 */

/**
 * Selector for the input a host renders for a given column.
 *
 * Power Pages names inputs with the ASP.NET control hierarchy and the column's
 * logical name last, as `ctl00$...$new_showtimeminute`. Ids follow the same
 * shape with underscores. Both are matched, plus the bare name, so this is not
 * tied to one host's naming.
 */
export function buildFieldSelector(logicalName: string): string | null {
    if (typeof logicalName !== "string" || !/^[a-z0-9_]+$/i.test(logicalName)) {
        return null;
    }
    return [
        `input[name$="$${logicalName}"]`,
        `input[name="${logicalName}"]`,
        `input[id$="_${logicalName}"]`,
        `input[id="${logicalName}"]`
    ].join(", ");
}

export function findFieldInput(logicalName: string): HTMLInputElement | null {
    const selector = buildFieldSelector(logicalName);
    if (!selector || typeof document === "undefined") {
        return null;
    }
    return document.querySelector<HTMLInputElement>(selector);
}

/**
 * Set the input the way a person typing would, so the host's own change
 * tracking and validation notice. Assigning `value` alone is not enough for
 * frameworks that listen for the events.
 */
export function writeFieldInput(input: HTMLInputElement, value: string): boolean {
    if (input.value === value) {
        return false;
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) {
        setter.call(input, value);
    } else {
        input.value = value;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
}
