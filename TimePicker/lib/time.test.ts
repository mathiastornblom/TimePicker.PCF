import test from "node:test";
import assert from "node:assert/strict";
import {
    AM,
    PM,
    buildHour12Options,
    buildHours,
    buildMeridiemOptions,
    buildMinutes,
    buildSeconds,
    columnsToValue,
    composeHour,
    formatHour,
    formatMinute,
    formatTime,
    fromHour12,
    fromParts,
    hostValueChanged,
    is12HourPattern,
    isSingleColumn,
    nearestOption,
    nowSecondsOfDay,
    parseTime,
    toHour12,
    toParts,
    valueToColumns,
    wrapSeconds
} from "./time.ts";

/** 18:30:00 and friends, spelled out so the tests stay readable. */
const at = (h: number, m = 0, s = 0) => h * 3600 + m * 60 + s;

test("wrapSeconds keeps values inside a single day", () => {
    assert.equal(wrapSeconds(0), 0);
    assert.equal(wrapSeconds(86399), 86399);
    assert.equal(wrapSeconds(86400), 0);
    assert.equal(wrapSeconds(86460), 60);
    assert.equal(wrapSeconds(-3600), 82800);
    assert.equal(wrapSeconds(Number.NaN), 0);
});

test("parts round-trip", () => {
    assert.deepEqual(toParts(0), { hours: 0, minutes: 0, seconds: 0 });
    assert.deepEqual(toParts(at(18, 30, 45)), { hours: 18, minutes: 30, seconds: 45 });
    assert.equal(fromParts(18, 30, 45), at(18, 30, 45));
    assert.equal(fromParts(18, 30), at(18, 30));
    assert.equal(fromParts(24, 0), 0);
});

test("a half-populated record is read as a real time instead of being discarded", () => {
    // This is the regression that cleared both columns on load in v1.
    assert.equal(columnsToValue("hoursandminutes", 18, null), at(18));
    assert.equal(columnsToValue("hoursandminutes", null, 30), at(0, 30));
    assert.equal(columnsToValue("hoursandminutes", 18, 30), at(18, 30));
    assert.equal(columnsToValue("hoursandminutes", 0, 0), 0);
});

test("an entirely empty record stays empty", () => {
    assert.equal(columnsToValue("hoursandminutes", null, null), null);
    assert.equal(columnsToValue("hoursandminutes", undefined, undefined, undefined), null);
    assert.equal(columnsToValue("minutesfrommidnight", null, null), null);
});

test("the second column is read when present", () => {
    assert.equal(columnsToValue("hoursandminutes", 18, 30, 45), at(18, 30, 45));
    assert.equal(columnsToValue("hoursandminutes", 18, 30, null), at(18, 30));
    assert.equal(columnsToValue("hoursandminutes", null, null, 45), at(0, 0, 45));
});

test("single-column mode reads minutes from midnight", () => {
    assert.equal(columnsToValue("minutesfrommidnight", 1110, null), at(18, 30));
    assert.equal(columnsToValue("minutesfrommidnight", 0, null), 0);
    assert.equal(columnsToValue("minutesfrommidnight", 1500, null), at(1, 0));
});

test("hour and minute columns are always written together", () => {
    assert.deepEqual(valueToColumns(at(18), "hoursandminutes"), {
        hourvalue: 18, minutevalue: 0, secondvalue: undefined
    });
    assert.deepEqual(valueToColumns(at(0, 30), "hoursandminutes"), {
        hourvalue: 0, minutevalue: 30, secondvalue: undefined
    });
});

test("the second column is only written when the seconds wheel is in use", () => {
    assert.deepEqual(valueToColumns(at(18, 30, 45), "hoursandminutes", false), {
        hourvalue: 18, minutevalue: 30, secondvalue: undefined
    });
    assert.deepEqual(valueToColumns(at(18, 30, 45), "hoursandminutes", true), {
        hourvalue: 18, minutevalue: 30, secondvalue: 45
    });
});

test("clearing empties every column", () => {
    assert.deepEqual(valueToColumns(null, "hoursandminutes", true), {
        hourvalue: undefined, minutevalue: undefined, secondvalue: undefined
    });
});

test("single-column mode writes minutes and touches nothing else", () => {
    assert.deepEqual(valueToColumns(at(18, 30), "minutesfrommidnight"), {
        hourvalue: 1110, minutevalue: undefined, secondvalue: undefined
    });
    assert.deepEqual(valueToColumns(at(18, 30, 45), "minutesfrommidnight", true), {
        hourvalue: 1110, minutevalue: undefined, secondvalue: undefined
    });
});

test("the hour wheel honours the step and the window", () => {
    assert.equal(buildHours({}).length, 24);
    assert.deepEqual(buildHours({ minHour: 9, maxHour: 12 }), [9, 10, 11, 12]);
    assert.deepEqual(buildHours({ hourStep: 2, minHour: 0, maxHour: 5 }), [0, 2, 4]);
});

test("the minute and second wheels honour their step", () => {
    assert.equal(buildMinutes({}).length, 60);
    assert.deepEqual(buildMinutes({ step: 15 }), [0, 15, 30, 45]);
    assert.deepEqual(buildSeconds({ step: 30 }), [0, 30]);
    assert.deepEqual(buildSeconds({ step: 60 }), [0]);
});

test("wheels survive a reversed or out-of-range hour window", () => {
    assert.deepEqual(buildHours({ minHour: 10, maxHour: 8 }), [8, 9, 10]);
    assert.equal(buildHours({ minHour: -5, maxHour: 99 }).length, 24);
});

test("an unset latest hour is not read as a midnight-only window", () => {
    // Hosts hand back 0 for a whole number input the maker never filled in.
    assert.equal(buildHours({ maxHour: 0 }).length, 24);
    assert.equal(buildHours({ maxHour: null }).length, 24);
    assert.equal(buildHours({ maxHour: -1 }).length, 24);
    assert.equal(buildHours({ maxHour: 5 }).length, 6);
});

test("a stored value off the step stays visible on the wheel", () => {
    // Otherwise the user sees a picker with nothing selected.
    assert.deepEqual(buildMinutes({ step: 15, include: 37 }), [0, 15, 30, 37, 45]);
    assert.deepEqual(buildHours({ minHour: 9, maxHour: 11, include: 3 }), [3, 9, 10, 11]);
    assert.deepEqual(buildMinutes({ step: 15, include: 30 }), [0, 15, 30, 45]);
    assert.deepEqual(buildMinutes({ step: 15, include: null }), [0, 15, 30, 45]);
});

test("nearestOption picks the closest slot", () => {
    const options = [9, 10, 11];
    assert.equal(nearestOption(options, 9), 9);
    assert.equal(nearestOption(options, 0), 9);
    assert.equal(nearestOption(options, 23), 11);
    assert.equal(nearestOption([], 5), null);
});

test("12 hour numbers convert both ways", () => {
    assert.deepEqual(toHour12(0), { hour12: 12, meridiem: AM });
    assert.deepEqual(toHour12(11), { hour12: 11, meridiem: AM });
    assert.deepEqual(toHour12(12), { hour12: 12, meridiem: PM });
    assert.deepEqual(toHour12(18), { hour12: 6, meridiem: PM });
    assert.equal(fromHour12(12, AM), 0);
    assert.equal(fromHour12(12, PM), 12);
    assert.equal(fromHour12(6, PM), 18);
    assert.equal(fromHour12(11, AM), 11);
});

test("the 12 hour wheels only offer what the hour window allows", () => {
    assert.deepEqual(buildHour12Options([0, 1, 2]), [12, 1, 2]);
    assert.deepEqual(buildMeridiemOptions([0, 1, 2]), [AM]);
    assert.deepEqual(buildMeridiemOptions([9, 13]), [AM, PM]);
    assert.deepEqual(buildHour12Options(buildHours({})).length, 12);
});

test("an impossible 12 hour combination snaps back into the window", () => {
    // A 09-17 window has no 9 PM, so choosing 9 with PM must not land on 21.
    const allowed = buildHours({ minHour: 9, maxHour: 17 });
    assert.equal(composeHour(9, AM, allowed), 9);
    assert.equal(composeHour(5, PM, allowed), 17);
    assert.equal(composeHour(9, PM, allowed), 17);
    assert.equal(composeHour(6, PM, buildHours({})), 18);
});

test("formatting in 24 hour mode pads the hour", () => {
    assert.equal(formatTime(at(18, 30), { use12Hours: false }), "18:30");
    assert.equal(formatTime(0, { use12Hours: false }), "00:00");
    assert.equal(formatTime(at(1, 5), { use12Hours: false, separator: "." }), "01.05");
});

test("formatting in 12 hour mode uses the locale designators", () => {
    assert.equal(formatTime(at(18, 30), { use12Hours: true }), "6:30 PM");
    assert.equal(formatTime(0, { use12Hours: true }), "12:00 AM");
    assert.equal(formatTime(at(12), { use12Hours: true }), "12:00 PM");
    assert.equal(formatTime(at(9), { use12Hours: true, amDesignator: "f.m." }), "9:00 f.m.");
});

test("seconds only appear in the text when they are switched on", () => {
    assert.equal(formatTime(at(18, 30, 45), { use12Hours: false }), "18:30");
    assert.equal(formatTime(at(18, 30, 45), { use12Hours: false, showSeconds: true }), "18:30:45");
    assert.equal(formatTime(at(18, 30, 5), { use12Hours: false, showSeconds: true }), "18:30:05");
    assert.equal(formatTime(at(18, 30, 45), { use12Hours: true, showSeconds: true }), "6:30:45 PM");
});

test("wheel labels read the way each column should", () => {
    assert.equal(formatHour(18, { use12Hours: false }), "18");
    assert.equal(formatHour(9, { use12Hours: false }), "09");
    assert.equal(formatHour(18, { use12Hours: true }), "6 PM");
    assert.equal(formatHour(0, { use12Hours: true }), "12 AM");
    assert.equal(formatMinute(5), "05");
    assert.equal(formatMinute(30), "30");
});

test("parsing accepts the shapes people actually type", () => {
    const h24 = { use12Hours: false };
    assert.equal(parseTime("18:30", h24), at(18, 30));
    assert.equal(parseTime("18.30", h24), at(18, 30));
    assert.equal(parseTime("18 30", h24), at(18, 30));
    assert.equal(parseTime("1830", h24), at(18, 30));
    assert.equal(parseTime("830", h24), at(8, 30));
    assert.equal(parseTime("18", h24), at(18));
    assert.equal(parseTime("  09:05  ", h24), at(9, 5));
});

test("parsing reads seconds when they are typed", () => {
    const h24 = { use12Hours: false, showSeconds: true };
    assert.equal(parseTime("18:30:45", h24), at(18, 30, 45));
    assert.equal(parseTime("18:30:05", h24), at(18, 30, 5));
    assert.equal(parseTime("6:30:45 pm", { use12Hours: true, showSeconds: true }), at(18, 30, 45));
});

test("parsing handles meridiem markers", () => {
    const h12 = { use12Hours: true };
    assert.equal(parseTime("6:30 pm", h12), at(18, 30));
    assert.equal(parseTime("6:30pm", h12), at(18, 30));
    assert.equal(parseTime("6p", h12), at(18));
    assert.equal(parseTime("12:00 am", h12), 0);
    assert.equal(parseTime("12:00 pm", h12), at(12));
    assert.equal(parseTime("9:00 f.m.", { use12Hours: true, amDesignator: "f.m." }), at(9));
});

test("parsing rejects nonsense rather than guessing", () => {
    const h24 = { use12Hours: false };
    assert.equal(parseTime("", h24), null);
    assert.equal(parseTime("abc", h24), null);
    assert.equal(parseTime("25:00", h24), null);
    assert.equal(parseTime("18:75", h24), null);
    assert.equal(parseTime("18:30:75", h24), null);
    assert.equal(parseTime("13:00 pm", h24), null);
    assert.equal(parseTime("123456", h24), null);
});

test("current time follows the Dataverse user time zone when one is supplied", () => {
    const when = new Date(Date.UTC(2026, 0, 15, 22, 30, 15));
    assert.equal(nowSecondsOfDay(60, when), at(23, 30, 15));   // UTC+1
    assert.equal(nowSecondsOfDay(120, when), at(0, 30, 15));   // UTC+2, past midnight
    assert.equal(nowSecondsOfDay(-300, when), at(17, 30, 15)); // UTC-5
});

test("current time falls back to the browser clock", () => {
    const when = new Date(2026, 0, 15, 7, 45, 20);
    assert.equal(nowSecondsOfDay(undefined, when), at(7, 45, 20));
    assert.equal(nowSecondsOfDay(null, when), at(7, 45, 20));
});

test("the user's short time pattern decides 12 versus 24 hour display", () => {
    assert.equal(is12HourPattern("h:mm tt"), true);
    assert.equal(is12HourPattern("HH:mm"), false);
    assert.equal(is12HourPattern("H.mm"), false);
    assert.equal(is12HourPattern(undefined), null);
});

test("the host's value is adopted on the first render", () => {
    assert.equal(hostValueChanged(null, { hour: 2, minute: 0, second: null }), true);
});

test("a stale echo from the host does not overwrite the user's choice", () => {
    // Power Pages calls updateView after notifyOutputChanged with the values it
    // held before the change. Adopting those saved a blank time.
    const reported = { hour: null, minute: null, second: null };
    assert.equal(hostValueChanged(reported, { hour: null, minute: null, second: null }), false);

    const existing = { hour: 9, minute: 30, second: null };
    assert.equal(hostValueChanged(existing, { hour: 9, minute: 30, second: null }), false);
});

test("a genuine change from the host is adopted", () => {
    const previous = { hour: 9, minute: 30, second: null };
    assert.equal(hostValueChanged(previous, { hour: 2, minute: 0, second: null }), true);
    assert.equal(hostValueChanged(previous, { hour: 9, minute: 45, second: null }), true);
    assert.equal(hostValueChanged(previous, { hour: 9, minute: 30, second: 15 }), true);
    assert.equal(hostValueChanged(previous, { hour: null, minute: null, second: null }), true);
});

test("one column can hold the whole time to the second", () => {
    // 16:15:45 as seconds from midnight.
    assert.equal(columnsToValue("secondsfrommidnight", 58545, null, null), at(16, 15, 45));
    assert.equal(columnsToValue("secondsfrommidnight", 0, null, null), 0);
    assert.equal(columnsToValue("secondsfrommidnight", null, null, null), null);
    assert.equal(columnsToValue("secondsfrommidnight", 86400 + 60, null, null), at(0, 1, 0));
});

test("one column mode writes only that column", () => {
    assert.deepEqual(valueToColumns(at(16, 15, 45), "secondsfrommidnight", true), {
        hourvalue: 58545, minutevalue: undefined, secondvalue: undefined
    });
    assert.deepEqual(valueToColumns(null, "secondsfrommidnight", true), {
        hourvalue: undefined, minutevalue: undefined, secondvalue: undefined
    });
});

test("minutes from midnight still rounds seconds away, seconds from midnight keeps them", () => {
    assert.deepEqual(valueToColumns(at(16, 15, 45), "minutesfrommidnight"), {
        hourvalue: 975, minutevalue: undefined, secondvalue: undefined
    });
    assert.equal(valueToColumns(at(16, 15, 45), "secondsfrommidnight").hourvalue, 58545);
});

test("single column modes are recognised as such", () => {
    assert.equal(isSingleColumn("hoursandminutes"), false);
    assert.equal(isSingleColumn("minutesfrommidnight"), true);
    assert.equal(isSingleColumn("secondsfrommidnight"), true);
});
