/**
 * Pure time helpers for the TimePicker control.
 *
 * A time is represented internally as "minutes of day": an integer in [0, 1440).
 * Nothing in this module touches React, the DOM or the PCF context, so it can be
 * unit tested directly with `node --test`.
 */

export const MINUTES_PER_DAY = 1440;

/** How the time is persisted in Dataverse. */
export type StorageMode = "hoursandminutes" | "minutesfrommidnight";

export interface TimeParts {
    hours: number;
    minutes: number;
}

/** Wrap any integer into [0, 1440). Handles negatives and values past midnight. */
export function wrapMinutes(total: number): number {
    if (!Number.isFinite(total)) {
        return 0;
    }
    const truncated = Math.trunc(total);
    return ((truncated % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

export function toParts(minutesOfDay: number): TimeParts {
    const wrapped = wrapMinutes(minutesOfDay);
    return { hours: Math.floor(wrapped / 60), minutes: wrapped % 60 };
}

export function fromParts(hours: number, minutes: number): number {
    return wrapMinutes(hours * 60 + minutes);
}

/**
 * Read the stored column value(s) into minutes of day.
 *
 * In "hoursandminutes" mode a half-populated record (hour set, minute empty, or
 * the reverse) is read as if the missing half were zero. The record is NOT
 * repaired on load; the completed pair is only persisted once the user actually
 * changes the value. See `valueToColumns`.
 *
 * Returns null when the record holds no value at all.
 */
export function columnsToValue(
    mode: StorageMode,
    hour: number | null | undefined,
    minute: number | null | undefined
): number | null {
    const h = hour ?? null;
    const m = minute ?? null;

    if (mode === "minutesfrommidnight") {
        return h === null ? null : wrapMinutes(h);
    }
    if (h === null && m === null) {
        return null;
    }
    return fromParts(h ?? 0, m ?? 0);
}

export interface ColumnValues {
    hourvalue: number | undefined;
    minutevalue: number | undefined;
}

/**
 * Split a time back out into the bound columns.
 *
 * In "hoursandminutes" mode both columns are always written, so selecting an
 * hour can never leave the minute column empty.
 */
export function valueToColumns(minutesOfDay: number | null, mode: StorageMode): ColumnValues {
    if (minutesOfDay === null) {
        return { hourvalue: undefined, minutevalue: undefined };
    }
    if (mode === "minutesfrommidnight") {
        return { hourvalue: wrapMinutes(minutesOfDay), minutevalue: undefined };
    }
    const parts = toParts(minutesOfDay);
    return { hourvalue: parts.hours, minutevalue: parts.minutes };
}

function clampInt(value: number | null | undefined, min: number, max: number, fallback: number): number {
    if (value === null || value === undefined || !Number.isFinite(value)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, Math.trunc(value)));
}

export interface OptionRange {
    hourStep?: number | null;
    minuteStep?: number | null;
    minHour?: number | null;
    maxHour?: number | null;
}

/**
 * Build the selectable list of times, as minutes of day, in ascending order.
 *
 * Every input is treated as a hint rather than a promise. Hosts hand back 0 for
 * a whole number input the maker never filled in, so a zero or negative
 * "latest hour" is read as "not configured" rather than as a window containing
 * only midnight.
 */
export function buildOptions(range: OptionRange): number[] {
    const hourStep = clampInt(range.hourStep, 1, 24, 1);
    const minuteStep = clampInt(range.minuteStep, 1, 60, 1);
    const first = clampInt(range.minHour, 0, 23, 0);
    const maxHourRaw = range.maxHour;
    const last =
        maxHourRaw === null || maxHourRaw === undefined || !Number.isFinite(maxHourRaw) || maxHourRaw <= 0
            ? 23
            : clampInt(maxHourRaw, 0, 23, 23);
    const lo = Math.min(first, last);
    const hi = Math.max(first, last);

    const options: number[] = [];
    for (let h = lo; h <= hi; h += hourStep) {
        for (let m = 0; m < 60; m += minuteStep) {
            options.push(h * 60 + m);
        }
    }
    return options;
}

/** The option closest to `target`, or null when there are no options. */
export function nearestOption(options: readonly number[], target: number): number | null {
    if (options.length === 0) {
        return null;
    }
    let best = options[0];
    let bestDistance = Math.abs(best - target);
    for (const option of options) {
        const distance = Math.abs(option - target);
        if (distance < bestDistance) {
            best = option;
            bestDistance = distance;
        }
    }
    return best;
}

export interface FormatOptions {
    use12Hours: boolean;
    separator?: string;
    amDesignator?: string;
    pmDesignator?: string;
}

export function formatTime(minutesOfDay: number, options: FormatOptions): string {
    const { hours, minutes } = toParts(minutesOfDay);
    const separator = options.separator || ":";
    const mm = String(minutes).padStart(2, "0");

    if (!options.use12Hours) {
        return `${String(hours).padStart(2, "0")}${separator}${mm}`;
    }
    const designator = hours < 12 ? (options.amDesignator || "AM") : (options.pmDesignator || "PM");
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    return `${hour12}${separator}${mm} ${designator}`.trimEnd();
}

/**
 * Parse free text into minutes of day, or null when it cannot be understood.
 *
 * Accepts "18:30", "18.30", "18 30", "1830", "830", "18", "6:30 pm", "6pm"
 * and ignores any seconds component.
 */
export function parseTime(input: string, options: FormatOptions): number | null {
    if (typeof input !== "string") {
        return null;
    }
    let text = input.trim().toLowerCase();
    if (text === "") {
        return null;
    }

    const am = (options.amDesignator || "AM").toLowerCase();
    const pm = (options.pmDesignator || "PM").toLowerCase();

    let meridiem: "am" | "pm" | null = null;
    for (const [marker, value] of [[pm, "pm"], [am, "am"], ["pm", "pm"], ["am", "am"], ["p", "pm"], ["a", "am"]] as const) {
        if (marker !== "" && text.endsWith(marker)) {
            meridiem = value;
            text = text.slice(0, text.length - marker.length).trim();
            break;
        }
    }

    // Strip a trailing punctuation-only separator, e.g. "6:" typed mid-edit.
    text = text.replace(/[.:\s]+$/, "");
    const groups = text.split(/[^0-9]+/).filter((part) => part !== "");
    if (groups.length === 0 || groups.some((part) => part.length > 2 && groups.length > 1)) {
        return null;
    }

    let hours: number;
    let minutes: number;

    if (groups.length === 1) {
        const digits = groups[0];
        if (digits.length <= 2) {
            hours = Number(digits);
            minutes = 0;
        } else if (digits.length === 3) {
            hours = Number(digits.slice(0, 1));
            minutes = Number(digits.slice(1));
        } else if (digits.length === 4) {
            hours = Number(digits.slice(0, 2));
            minutes = Number(digits.slice(2));
        } else {
            return null;
        }
    } else {
        hours = Number(groups[0]);
        minutes = Number(groups[1]);
    }

    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes > 59) {
        return null;
    }
    if (meridiem !== null) {
        if (hours < 1 || hours > 12) {
            return null;
        }
        hours = hours % 12;
        if (meridiem === "pm") {
            hours += 12;
        }
    } else if (hours > 23) {
        return null;
    }
    return fromParts(hours, minutes);
}

/**
 * Current wall-clock time as minutes of day.
 *
 * `offsetMinutesFromUtc` comes from the Dataverse user's time zone setting when
 * the host exposes it. Without it the browser's own clock is used.
 */
export function nowMinutesOfDay(offsetMinutesFromUtc?: number | null, now: Date = new Date()): number {
    if (offsetMinutesFromUtc === null || offsetMinutesFromUtc === undefined || !Number.isFinite(offsetMinutesFromUtc)) {
        return fromParts(now.getHours(), now.getMinutes());
    }
    return wrapMinutes(now.getUTCHours() * 60 + now.getUTCMinutes() + offsetMinutesFromUtc);
}

/** Decide 12 vs 24 hour display from the user's own short time pattern. */
export function use12HourFromPattern(shortTimePattern: string | undefined): boolean | null {
    if (!shortTimePattern) {
        return null;
    }
    return /t/i.test(shortTimePattern.replace(/'[^']*'/g, ""));
}
