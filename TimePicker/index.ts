import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import type { Theme } from "@fluentui/react-components";
import TimePickerControl from "./components/TimePickerControl";
import type { FieldAppearance, MeridiemPosition } from "./components/TimePickerControl";
import {
    buildHours,
    buildMinutes,
    buildSeconds,
    columnsToValue,
    formatTime,
    is12HourPattern,
    nowSecondsOfDay,
    toParts,
    valueToColumns
} from "./lib/time";
import type { ColumnValues, FormatOptions, StorageMode } from "./lib/time";
import { parseCssColor, parseOpacityPercent } from "./lib/appearance";

const APPEARANCES: readonly FieldAppearance[] = ["outline", "underline", "filled-darker", "filled-lighter"];
const MERIDIEM_POSITIONS: readonly MeridiemPosition[] = ["after", "before", "inline"];

/** Enum inputs arrive as null when the maker never configured them. */
function readEnum<T extends string>(raw: string | null | undefined, allowed: readonly T[], fallback: T): T {
    return allowed.includes(raw as T) ? (raw as T) : fallback;
}

function readBoolEnum(raw: string | null | undefined, fallback: boolean): boolean {
    if (raw === "true") {
        return true;
    }
    if (raw === "false") {
        return false;
    }
    return fallback;
}

export class TimePicker implements ComponentFramework.StandardControl<IInputs, IOutputs> {
    private root: Root | undefined;
    private notifyOutputChanged: () => void = () => undefined;

    private value: number | null = null;
    private storageMode: StorageMode = "hoursandminutes";
    private outputs: ColumnValues = { hourvalue: undefined, minutevalue: undefined, secondvalue: undefined };
    private showSeconds = false;

    private cachedHours: readonly number[] = [];
    private cachedMinutes: readonly number[] = [];
    private cachedSeconds: readonly number[] = [];
    private cachedRangeKey = "";

    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        state: ComponentFramework.Dictionary,
        container: HTMLDivElement
    ): void {
        this.notifyOutputChanged = notifyOutputChanged;
        container.style.width = "100%";
        this.root = createRoot(container);
    }

    public updateView(context: ComponentFramework.Context<IInputs>): void {
        const parameters = context.parameters;

        // Field level security. A column the user may not read is masked; one they
        // may not edit is read only, as is a disabled or inactive form.
        let disabled = context.mode.isControlDisabled;
        let masked = false;
        const security = parameters.hourvalue?.security;
        if (security) {
            disabled = disabled || !security.editable;
            masked = !security.readable;
        }

        this.storageMode = readEnum<StorageMode>(
            parameters.storagemode?.raw,
            ["hoursandminutes", "minutesfrommidnight"],
            "hoursandminutes"
        );

        // A half-populated record reads as a real time rather than being thrown
        // away. Nothing is written back here, so simply opening a form never
        // modifies the record.
        this.showSeconds = readBoolEnum(parameters.showseconds?.raw, false);
        this.value = columnsToValue(
            this.storageMode,
            parameters.hourvalue?.raw,
            parameters.minutevalue?.raw,
            this.showSeconds ? parameters.secondvalue?.raw : null
        );
        this.outputs = valueToColumns(this.value, this.storageMode, this.showSeconds);

        const format = this.readFormat(context);
        const nowSeconds = this.readNow(context);
        const { hours, minutes, seconds } = this.readRanges(context, this.value);

        // Unit labels beside the centred row. In 12 hour display the hour wheel
        // already reads "6 PM", so its unit defaults to nothing rather than to
        // "6 PM hours"; an explicit label still wins.
        const showUnits = readBoolEnum(parameters.showunits?.raw, true);
        const meridiemPosition = readEnum(parameters.meridiemposition?.raw, MERIDIEM_POSITIONS, "after");
        // With AM/PM on its own wheel the hour column is just a number again, so it
        // gets its unit back even in 12 hour display.
        const hourUnitDefault = format.use12Hours && meridiemPosition === "inline" ? "" : "hours";
        const hourUnit = showUnits ? (parameters.hourunittext?.raw || hourUnitDefault) : "";
        const minuteUnit = showUnits ? (parameters.minuteunittext?.raw || "min") : "";
        const secondUnit = showUnits ? (parameters.secondunittext?.raw || "sec") : "";

        const placeholder =
            parameters.placeholdertext?.raw ||
            (readEnum(parameters.defaulttime?.raw, ["empty", "now"], "empty") === "now"
                ? formatTime(nowSeconds, format)
                : undefined);

        const element = React.createElement(
            FluentProvider,
            { theme: this.readTheme(context), style: { width: "100%" } },
            React.createElement(TimePickerControl, {
                value: this.value,
                hours,
                minutes,
                seconds,
                showSeconds: this.showSeconds,
                meridiemPosition,
                format,
                hourUnit,
                minuteUnit,
                secondUnit,
                nowSeconds,
                disabled,
                masked,
                allowFreeform: readBoolEnum(parameters.editenabled?.raw, false),
                clearable: readBoolEnum(parameters.showclear?.raw, true),
                appearance: readEnum(parameters.fieldappearance?.raw, APPEARANCES, "outline"),
                bandColor: parseCssColor(parameters.bandcolor?.raw),
                bandOpacity: parseOpacityPercent(parameters.bandopacity?.raw),
                placeholder: placeholder ?? undefined,
                onChange: this.handleChange
            })
        );

        this.root?.render(element);
    }

    public getOutputs(): IOutputs {
        return {
            hourvalue: this.outputs.hourvalue,
            minutevalue: this.outputs.minutevalue,
            secondvalue: this.outputs.secondvalue
        };
    }

    public destroy(): void {
        this.root?.unmount();
        this.root = undefined;
    }

    /**
     * Both columns are written on every change, so picking an hour can never
     * leave the minute column empty.
     */
    private handleChange = (value: number | null): void => {
        this.value = value;
        this.outputs = valueToColumns(value, this.storageMode, this.showSeconds);
        this.notifyOutputChanged();
    };

    /** Fluent v9 theme from the host, falling back to the light web theme in Power Pages. */
    private readTheme(context: ComponentFramework.Context<IInputs>): Theme {
        return context.fluentDesignLanguage?.tokenTheme ?? webLightTheme;
    }

    private readFormat(context: ComponentFramework.Context<IInputs>): FormatOptions {
        const formatting = context.userSettings?.dateFormattingInfo;
        const displayType = context.parameters.displaytype?.raw;

        let use12Hours: boolean;
        if (displayType === "auto") {
            use12Hours = is12HourPattern(formatting?.shortTimePattern) ?? false;
        } else {
            use12Hours = displayType === "12 hrs";
        }

        return {
            use12Hours,
            separator: formatting?.timeSeparator || ":",
            amDesignator: formatting?.amDesignator || undefined,
            pmDesignator: formatting?.pmDesignator || undefined,
            showSeconds: readBoolEnum(context.parameters.showseconds?.raw, false)
        };
    }

    /**
     * Current wall-clock time. The Dataverse user's own time zone wins over the
     * browser clock when the host exposes it, so a traveller still sees the time
     * their records are recorded against.
     */
    private readNow(context: ComponentFramework.Context<IInputs>): number {
        let offset: number | undefined;
        try {
            offset = context.userSettings?.getTimeZoneOffsetMinutes?.(new Date());
        } catch {
            offset = undefined;
        }
        return nowSecondsOfDay(offset);
    }

    /**
     * The hour and minute wheels. Rebuilding them on every render is wasteful, so
     * they are cached against the inputs that shape them. A stored value that falls
     * outside the configured window, or off the step, is folded in so the user can
     * still see what is selected.
     */
    private readRanges(
        context: ComponentFramework.Context<IInputs>,
        value: number | null
    ): { hours: readonly number[]; minutes: readonly number[]; seconds: readonly number[] } {
        const parameters = context.parameters;
        const parts = value === null ? null : toParts(value);
        const shape = {
            hourStep: parameters.hourstep?.raw,
            minuteStep: parameters.minutestep?.raw,
            secondStep: parameters.secondstep?.raw,
            minHour: parameters.minhour?.raw,
            maxHour: parameters.maxhour?.raw,
            includeHour: parts?.hours ?? null,
            includeMinute: parts?.minutes ?? null,
            includeSecond: parts?.seconds ?? null
        };
        const key = JSON.stringify(shape);
        if (key !== this.cachedRangeKey) {
            this.cachedHours = buildHours({
                hourStep: shape.hourStep,
                minHour: shape.minHour,
                maxHour: shape.maxHour,
                include: shape.includeHour
            });
            this.cachedMinutes = buildMinutes({ step: shape.minuteStep, include: shape.includeMinute });
            this.cachedSeconds = buildSeconds({ step: shape.secondStep, include: shape.includeSecond });
            this.cachedRangeKey = key;
        }
        return { hours: this.cachedHours, minutes: this.cachedMinutes, seconds: this.cachedSeconds };
    }
}
