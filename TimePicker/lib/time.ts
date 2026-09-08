/**
 * Pure time helpers for the TimePicker control.
 *
 * A time is represented internally as "seconds of day": an integer in [0, 86400).
 * Nothing in this module touches React, the DOM or the PCF context, so it can be
 * unit tested directly with `node --test`.
 */

export const SECONDS_PER_MINUTE = 60;
export const MINUTES_PER_DAY = 1440;
export const SECONDS_PER_DAY = 86400;

/** How the time is persisted in Dataverse. */
export type StorageMode = "hoursandminutes" | "minutesfrommidnight";

export interface TimeParts {
    hours: number;
    minutes: number;
    seconds: number;
}

/** Wrap any integer into [0, 86400). Handles negatives and values past midnight. */
export function wrapSeconds(total: number): number {
    if (!Number.isFinite(total)) {
        return 0;
    }
    const truncated = Math.trunc(total);
    return ((truncated % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY;
}

export function toParts(secondsOfDay: number): TimeParts {
    const wrapped = wrapSeconds(secondsOfDay);
    return {
        hours: Math.floor(wrapped / 3600),
        minutes: Math.floor(wrapped / 60) % 60,
        seconds: wrapped % 60
    };
}

export function fromParts(hours: number, minutes: number, seconds = 0): number {
    return wrapSeconds(hours * 3600 + minutes * 60 + seconds);
}

/**
 * Read the stored column values into seconds of day.
 *
 * In "hoursandminutes" mode a half-populated record (hour set, minute empty, or
 * the reverse) is read as if the missing part were zero. The record is NOT
 * repaired on load; the completed set is only persisted once the user actually
 * changes the value. See `valueToColumns`.
 *
 * Returns null when the record holds no value at all.
 */
export function columnsToValue(
    mode: StorageMode,
    hour: number | null | undefined,
    minute: number | null | undefined,
    second?: number | null | undefined
): number | null {
    const h = hour ?? null;
    const m = minute ?? null;
    const s = second ?? null;

    if (mode === "minutesfrommidnight") {
        return h === null ? null : wrapSeconds(h * SECONDS_PER_MINUTE);
    }
    if (h === null && m === null && s === null) {
        return null;
    }
    return fromParts(h ?? 0, m ?? 0, s ?? 0);
}

export interface ColumnValues {
    hourvalue: number | undefined;
    minutevalue: number | undefined;
    secondvalue: number | undefined;
}

/**
 * Split a time back out into the bound columns.
 *
 * In "hoursandminutes" mode the hour and minute columns are always written
 * together, so choosing an hour can never leave the minute column empty. The
 * second column is only written when the seconds wheel is in use, so records
 * that do not track seconds are left alone.
 */
export function valueToColumns(
    secondsOfDay: number | null,
    mode: StorageMode,
    withSeconds = false
): ColumnValues {
    if (secondsOfDay === null) {
        return {
            hourvalue: undefined,
            minutevalue: undefined,
            secondvalue: withSeconds ? undefined : undefined
        };
    }
    if (mode === "minutesfrommidnight") {
        return {
            hourvalue: Math.floor(wrapSeconds(secondsOfDay) / SECONDS_PER_MINUTE),
            minutevalue: undefined,
            secondvalue: undefined
        };
    }
    const parts = toParts(secondsOfDay);
    return {
        hourvalue: parts.hours,
        minutevalue: parts.minutes,
        secondvalue: withSeconds ? parts.seconds : undefined
    };
}

function clampInt(value: number | null | undefined, min: number, max: number, fallback: number): number {
    if (value === null || value === undefined || !Number.isFinite(value)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, Math.trunc(value)));
}

export interface HourRange {
    hourStep?: number | null;
    minHour?: number | null;
    maxHour?: number | null;
    /** Always include this hour, so a stored value outside the window stays visible. */
    include?: number | null;
}

export interface SubdivisionRange {
    step?: number | null;
    /** Always include this value, so a stored value off the step stays visible. */
    include?: number | null;
}

function withIncluded(values: number[], include: number | null | undefined, min: number, max: number): number[] {
    if (include === null || include === undefined || !Number.isFinite(include)) {
        return values;
    }
    const extra = Math.trunc(include);
    if (extra < min || extra > max || values.includes(extra)) {
        return values;
    }
    return [...values, extra].sort((a, b) => a - b);
}

/**
 * Selectable hours, 0-23.
 *
 * Every input is treated as a hint rather than a promise. Hosts hand back 0 for a
 * whole number input the maker never filled in, so a zero or negative "latest hour"
 * is read as "not configured" rather than as a window containing only midnight.
 */
export function buildHours(range: HourRange): number[] {
    const hourStep = clampInt(range.hourStep, 1, 24, 1);
    const first = clampInt(range.minHour, 0, 23, 0);
    const maxHourRaw = range.maxHour;
    const last =
        maxHourRaw === null || maxHourRaw === undefined || !Number.isFinite(maxHourRaw) || maxHourRaw <= 0
            ? 23
            : clampInt(maxHourRaw, 0, 23, 23);
    const lo = Math.min(first, last);
    const hi = Math.max(first, last);

    const hours: number[] = [];
    for (let h = lo; h <= hi; h += hourStep) {
        hours.push(h);
    }
    return withIncluded(hours, range.include, 0, 23);
}

function buildSubdivision(range: SubdivisionRange): number[] {
    const step = clampInt(range.step, 1, 60, 1);
    const values: number[] = [];
    for (let v = 0; v < 60; v += step) {
        values.push(v);
    }
    return withIncluded(values, range.include, 0, 59);
}

/** Selectable minutes, 0-59. */
export function buildMinutes(range: SubdivisionRange): number[] {
    return buildSubdivision(range);
}

/** Selectable seconds, 0-59. */
export function buildSeconds(range: SubdivisionRange): number[] {
    return buildSubdivision(range);
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

/* ------------------------------------------------------------------ *
 * 12 hour helpers
 * ------------------------------------------------------------------ */

export const AM = 0;
export const PM = 1;

export function toHour12(hour24: number): { hour12: number; meridiem: number } {
    const h = ((Math.trunc(hour24) % 24) + 24) % 24;
    return { hour12: h % 12 === 0 ? 12 : h % 12, meridiem: h < 12 ? AM : PM };
}

export function fromHour12(hour12: number, meridiem: number): number {
    const base = ((Math.trunc(hour12) % 12) + 12) % 12;
    return base + (meridiem === PM ? 12 : 0);
}

/** The 12 hour numbers reachable from the allowed 24 hour set, ordered 12, 1, 2 … 11. */
export function buildHour12Options(allowedHours: readonly number[]): number[] {
    const present = new Set(allowedHours.map((h) => toHour12(h).hour12));
    return [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter((h) => present.has(h));
}

/** Which of AM and PM are reachable from the allowed 24 hour set. */
export function buildMeridiemOptions(allowedHours: readonly number[]): number[] {
    const present = new Set(allowedHours.map((h) => toHour12(h).meridiem));
    return [AM, PM].filter((m) => present.has(m));
}

/**
 * Combine a 12 hour number with AM or PM, then snap onto the allowed hours.
 * Without the snap, a window like 09 to 17 would let the user land on 21.
 */
export function composeHour(hour12: number, meridiem: number, allowedHours: readonly number[]): number {
    const candidate = fromHour12(hour12, meridiem);
    if (allowedHours.length === 0 || allowedHours.includes(candidate)) {
        return candidate;
    }
    return nearestOption(allowedHours, candidate) ?? candidate;
}

/* ------------------------------------------------------------------ *
 * Formatting and parsing
 * ------------------------------------------------------------------ */

export interface FormatOptions {
    use12Hours: boolean;
    separator?: string;
    amDesignator?: string;
    pmDesignator?: string;
    showSeconds?: boolean;
}

export function formatMeridiem(meridiem: number, options: FormatOptions): string {
    return meridiem === PM ? (options.pmDesignator || "PM") : (options.amDesignator || "AM");
}

export function formatTime(secondsOfDay: number, options: FormatOptions): string {
    const { hours, minutes, seconds } = toParts(secondsOfDay);
    const separator = options.separator || ":";
    const mm = String(minutes).padStart(2, "0");
    const ss = options.showSeconds ? `${separator}${String(seconds).padStart(2, "0")}` : "";

    if (!options.use12Hours) {
        return `${String(hours).padStart(2, "0")}${separator}${mm}${ss}`;
    }
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    return `${hour12}${separator}${mm}${ss} ${formatMeridiem(hours < 12 ? AM : PM, options)}`.trimEnd();
}

/** Label for the hour column: "18" in 24 hour mode, "6 PM" when the designator is inline. */
export function formatHour(hours: number, options: FormatOptions): string {
    const h = ((Math.trunc(hours) % 24) + 24) % 24;
    if (!options.use12Hours) {
        return String(h).padStart(2, "0");
    }
    const { hour12, meridiem } = toHour12(h);
    return `${hour12} ${formatMeridiem(meridiem, options)}`.trimEnd();
}

/** Label for the minute and second columns, always two digits. */
export function formatMinute(minutes: number): string {
    const m = ((Math.trunc(minutes) % 60) + 60) % 60;
    return String(m).padStart(2, "0");
}

/**
 * Parse free text into seconds of day, or null when it cannot be understood.
 *
 * Accepts "18:30", "18.30", "18 30", "1830", "830", "18", "6:30 pm", "6pm" and
 * "18:30:45".
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
    let seconds = 0;

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
        if (groups.length > 2) {
            seconds = Number(groups[2]);
        }
    }

    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
        return null;
    }
    if (minutes > 59 || seconds > 59) {
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
    return fromParts(hours, minutes, seconds);
}

/**
 * Current wall-clock time as seconds of day.
 *
 * `offsetMinutesFromUtc` comes from the Dataverse user's time zone setting when
 * the host exposes it. Without it the browser's own clock is used.
 */
export function nowSecondsOfDay(offsetMinutesFromUtc?: number | null, now: Date = new Date()): number {
    if (offsetMinutesFromUtc === null || offsetMinutesFromUtc === undefined || !Number.isFinite(offsetMinutesFromUtc)) {
        return fromParts(now.getHours(), now.getMinutes(), now.getSeconds());
    }
    return wrapSeconds(
        (now.getUTCHours() * 60 + now.getUTCMinutes() + offsetMinutesFromUtc) * SECONDS_PER_MINUTE + now.getUTCSeconds()
    );
}

/**
 * Decide 12 vs 24 hour display from the user's own short time pattern.
 * Quoted literals are stripped first, so a pattern like "HH't'mm" is not mistaken
 * for one carrying an AM/PM designator.
 */
export function is12HourPattern(shortTimePattern: string | undefined): boolean | null {
    if (!shortTimePattern) {
        return null;
    }
    return /t/i.test(shortTimePattern.replace(/'[^']*'/g, ""));
}

/** The raw bound column values as the host last reported them. */
export interface RawColumns {
    hour: number | null;
    minute: number | null;
    second: number | null;
}

/**
 * Whether the host's own data has actually moved since the last render.
 *
 * Power Pages calls updateView again after notifyOutputChanged, but with the
 * values it held *before* the change. Adopting those blindly discards what the
 * user just chose, and the stale value is then what gets saved. Model-driven apps
 * echo the new value back instead, so both hosts are served by only adopting the
 * host's value when it differs from what it last reported.
 */
export function hostValueChanged(previous: RawColumns | null, incoming: RawColumns): boolean {
    if (previous === null) {
        return true;
    }
    return (
        previous.hour !== incoming.hour ||
        previous.minute !== incoming.minute ||
        previous.second !== incoming.second
    );
}
