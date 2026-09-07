import test from "node:test";
import assert from "node:assert/strict";
import {
    buildOptions,
    columnsToValue,
    formatTime,
    fromParts,
    nearestOption,
    nowMinutesOfDay,
    parseTime,
    toParts,
    use12HourFromPattern,
    valueToColumns,
    wrapMinutes
} from "./time.ts";

test("wrapMinutes keeps values inside a single day", () => {
    assert.equal(wrapMinutes(0), 0);
    assert.equal(wrapMinutes(1439), 1439);
    assert.equal(wrapMinutes(1440), 0);
    assert.equal(wrapMinutes(1500), 60);
    assert.equal(wrapMinutes(-60), 1380);
    assert.equal(wrapMinutes(Number.NaN), 0);
});

test("parts round-trip", () => {
    assert.deepEqual(toParts(0), { hours: 0, minutes: 0 });
    assert.deepEqual(toParts(1110), { hours: 18, minutes: 30 });
    assert.equal(fromParts(18, 30), 1110);
    assert.equal(fromParts(24, 0), 0);
});

test("a half-populated record is read as a real time instead of being discarded", () => {
    // This is the regression that cleared both columns on load in v1.
    assert.equal(columnsToValue("hoursandminutes", 18, null), 18 * 60);
    assert.equal(columnsToValue("hoursandminutes", null, 30), 30);
    assert.equal(columnsToValue("hoursandminutes", 18, 30), 1110);
    assert.equal(columnsToValue("hoursandminutes", 0, 0), 0);
});

test("an entirely empty record stays empty", () => {
    assert.equal(columnsToValue("hoursandminutes", null, null), null);
    assert.equal(columnsToValue("hoursandminutes", undefined, undefined), null);
    assert.equal(columnsToValue("minutesfrommidnight", null, null), null);
});

test("single-column mode reads minutes from midnight", () => {
    assert.equal(columnsToValue("minutesfrommidnight", 1110, null), 1110);
    assert.equal(columnsToValue("minutesfrommidnight", 0, null), 0);
    assert.equal(columnsToValue("minutesfrommidnight", 1500, null), 60);
});

test("both columns are always written together", () => {
    assert.deepEqual(valueToColumns(18 * 60, "hoursandminutes"), { hourvalue: 18, minutevalue: 0 });
    assert.deepEqual(valueToColumns(30, "hoursandminutes"), { hourvalue: 0, minutevalue: 30 });
    assert.deepEqual(valueToColumns(1110, "hoursandminutes"), { hourvalue: 18, minutevalue: 30 });
});

test("clearing empties both columns", () => {
    assert.deepEqual(valueToColumns(null, "hoursandminutes"), { hourvalue: undefined, minutevalue: undefined });
});

test("single-column mode never writes to the minute column", () => {
    assert.deepEqual(valueToColumns(1110, "minutesfrommidnight"), { hourvalue: 1110, minutevalue: undefined });
});

test("options honour both the hour step and the minute step", () => {
    assert.equal(buildOptions({}).length, 24 * 60);
    assert.deepEqual(buildOptions({ hourStep: 1, minuteStep: 30, minHour: 9, maxHour: 10 }), [540, 570, 600, 630]);
    assert.deepEqual(buildOptions({ hourStep: 2, minuteStep: 60, minHour: 0, maxHour: 5 }), [0, 120, 240]);
});

test("options survive a reversed or out-of-range hour window", () => {
    assert.deepEqual(buildOptions({ minuteStep: 60, minHour: 10, maxHour: 8 }), [480, 540, 600]);
    assert.deepEqual(buildOptions({ minuteStep: 60, minHour: -5, maxHour: 99 }).length, 24);
});

test("nearestOption picks the closest slot", () => {
    const options = [540, 570, 600];
    assert.equal(nearestOption(options, 555), 540);
    assert.equal(nearestOption(options, 560), 570);
    assert.equal(nearestOption(options, 0), 540);
    assert.equal(nearestOption([], 100), null);
});

test("formatting in 24 hour mode pads the hour", () => {
    assert.equal(formatTime(1110, { use12Hours: false }), "18:30");
    assert.equal(formatTime(0, { use12Hours: false }), "00:00");
    assert.equal(formatTime(65, { use12Hours: false, separator: "." }), "01.05");
});

test("formatting in 12 hour mode uses the locale designators", () => {
    assert.equal(formatTime(1110, { use12Hours: true }), "6:30 PM");
    assert.equal(formatTime(0, { use12Hours: true }), "12:00 AM");
    assert.equal(formatTime(720, { use12Hours: true }), "12:00 PM");
    assert.equal(formatTime(540, { use12Hours: true, amDesignator: "f.m." }), "9:00 f.m.");
});

test("parsing accepts the shapes people actually type", () => {
    const h24 = { use12Hours: false };
    assert.equal(parseTime("18:30", h24), 1110);
    assert.equal(parseTime("18.30", h24), 1110);
    assert.equal(parseTime("18 30", h24), 1110);
    assert.equal(parseTime("1830", h24), 1110);
    assert.equal(parseTime("830", h24), 510);
    assert.equal(parseTime("18", h24), 1080);
    assert.equal(parseTime("18:30:45", h24), 1110);
    assert.equal(parseTime("  09:05  ", h24), 545);
});

test("parsing handles meridiem markers", () => {
    const h12 = { use12Hours: true };
    assert.equal(parseTime("6:30 pm", h12), 1110);
    assert.equal(parseTime("6:30pm", h12), 1110);
    assert.equal(parseTime("6p", h12), 1080);
    assert.equal(parseTime("12:00 am", h12), 0);
    assert.equal(parseTime("12:00 pm", h12), 720);
    assert.equal(parseTime("9:00 f.m.", { use12Hours: true, amDesignator: "f.m." }), 540);
});

test("parsing rejects nonsense rather than guessing", () => {
    const h24 = { use12Hours: false };
    assert.equal(parseTime("", h24), null);
    assert.equal(parseTime("abc", h24), null);
    assert.equal(parseTime("25:00", h24), null);
    assert.equal(parseTime("18:75", h24), null);
    assert.equal(parseTime("13:00 pm", h24), null);
    assert.equal(parseTime("123456", h24), null);
});

test("current time follows the Dataverse user time zone when one is supplied", () => {
    const at = new Date(Date.UTC(2026, 0, 15, 22, 30));
    assert.equal(nowMinutesOfDay(60, at), 23 * 60 + 30);   // UTC+1
    assert.equal(nowMinutesOfDay(120, at), 30);            // UTC+2, past midnight
    assert.equal(nowMinutesOfDay(-300, at), 17 * 60 + 30); // UTC-5
});

test("current time falls back to the browser clock", () => {
    const at = new Date(2026, 0, 15, 7, 45);
    assert.equal(nowMinutesOfDay(undefined, at), 7 * 60 + 45);
    assert.equal(nowMinutesOfDay(null, at), 7 * 60 + 45);
});

test("the user's short time pattern decides 12 versus 24 hour display", () => {
    assert.equal(use12HourFromPattern("h:mm tt"), true);
    assert.equal(use12HourFromPattern("HH:mm"), false);
    assert.equal(use12HourFromPattern("H.mm"), false);
    assert.equal(use12HourFromPattern(undefined), null);
});

test("an unset latest hour is not read as a midnight-only window", () => {
    // Hosts hand back 0 for a whole number input the maker never filled in.
    assert.equal(buildOptions({ maxHour: 0, minuteStep: 60 }).length, 24);
    assert.equal(buildOptions({ maxHour: null, minuteStep: 60 }).length, 24);
    assert.equal(buildOptions({ maxHour: -1, minuteStep: 60 }).length, 24);
    assert.equal(buildOptions({ maxHour: 5, minuteStep: 60 }).length, 6);
});
