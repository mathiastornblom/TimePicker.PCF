/**
 * Small helpers for maker-supplied appearance values.
 *
 * Anything a maker types is treated as untrusted: a colour is only accepted when
 * it matches a shape CSS actually understands, so a stray value cannot leak into
 * the rendered style.
 */

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTIONAL = /^(?:rgb|rgba|hsl|hsla)\(\s*[0-9a-z.,%\s/-]+\)$/i;
const KEYWORD = /^[a-z]+$/i;

/**
 * Return the colour when it is one CSS can use, otherwise null so the caller can
 * fall back to the theme.
 */
export function parseCssColor(input: string | null | undefined): string | null {
    if (typeof input !== "string") {
        return null;
    }
    const value = input.trim();
    if (value === "") {
        return null;
    }
    if (HEX.test(value) || FUNCTIONAL.test(value) || KEYWORD.test(value)) {
        return value;
    }
    return null;
}

/**
 * Opacity as a 0-1 multiplier from a maker-supplied percentage.
 *
 * Hosts hand back 0 for a whole number input the maker never filled in, so a zero
 * or negative percentage is read as "not configured" and the band stays fully
 * opaque. To hide the band, set its colour to `transparent`.
 */
export function parseOpacityPercent(input: number | null | undefined): number {
    if (input === null || input === undefined || !Number.isFinite(input) || input <= 0) {
        return 1;
    }
    return Math.min(100, Math.trunc(input)) / 100;
}
