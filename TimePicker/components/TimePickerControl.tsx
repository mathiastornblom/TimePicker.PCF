import * as React from "react";
import {
    Button,
    Input,
    Popover,
    PopoverSurface,
    PopoverTrigger,
    makeStyles,
    tokens
} from "@fluentui/react-components";
import WheelColumn, { ITEM_HEIGHT, VIEWPORT_HEIGHT } from "./WheelColumn";
import {
    buildHour12Options,
    buildMeridiemOptions,
    composeHour,
    formatHour,
    formatMeridiem,
    formatMinute,
    formatTime,
    fromParts,
    nearestOption,
    parseTime,
    toHour12,
    toParts
} from "../lib/time";
import type { FormatOptions } from "../lib/time";

export type FieldAppearance = "outline" | "underline" | "filled-darker" | "filled-lighter";
export type MeridiemPosition = "before" | "after" | "inline";

export interface TimePickerControlProps {
    /** Current time as seconds of day, or null when the record holds no value. */
    value: number | null;
    /** Selectable hours, 0-23, in 24 hour terms whatever the display mode. */
    hours: readonly number[];
    minutes: readonly number[];
    seconds: readonly number[];
    showSeconds: boolean;
    meridiemPosition: MeridiemPosition;
    format: FormatOptions;
    /** Text beside the centred row of each wheel. Empty strings omit them. */
    hourUnit: string;
    minuteUnit: string;
    secondUnit: string;
    /** Current wall-clock time as seconds of day, in the user's time zone. */
    nowSeconds: number;
    disabled: boolean;
    /** Field level security hides the value from this user. */
    masked: boolean;
    /** Allow the user to type a time rather than only pick one. */
    allowFreeform: boolean;
    clearable: boolean;
    appearance: FieldAppearance;
    /** Selection band overrides. Null colour follows the app theme. */
    bandColor: string | null;
    bandOpacity: number;
    placeholder?: string;
    onChange: (value: number | null) => void;
}

const useStyles = makeStyles({
    root: {
        display: "block",
        width: "100%",
        minWidth: "0"
    },
    field: {
        width: "100%",
        minWidth: "0"
    },
    surface: {
        padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`
    },
    wheels: {
        position: "relative",
        display: "flex",
        columnGap: tokens.spacingHorizontalXS,
        height: `${VIEWPORT_HEIGHT}px`,
        // Fade the rows away from the middle, the way a physical wheel curves out
        // of view. Applied across the whole group so every column fades together.
        maskImage: "linear-gradient(to bottom, transparent, #000 30%, #000 70%, transparent)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent, #000 30%, #000 70%, transparent)"
    },
    // One stationary band behind the centred row of every column, as on iOS.
    band: {
        position: "absolute",
        left: "0",
        right: "0",
        top: `${(VIEWPORT_HEIGHT - ITEM_HEIGHT) / 2}px`,
        height: `${ITEM_HEIGHT}px`,
        borderRadius: tokens.borderRadiusXLarge,
        backgroundColor: tokens.colorNeutralBackground3,
        pointerEvents: "none"
    },
    iconButton: {
        minWidth: "20px",
        width: "20px",
        height: "20px",
        padding: "0"
    }
});

const MASKED_TEXT = "•••••••";
/** Roughly how wide one wheel needs to be, before its unit label. */
const COLUMN_WIDTH = 84;

const ChevronIcon: React.FC = () => (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
        <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const DismissIcon: React.FC = () => (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
        <path d="M3 3l6 6M9 3l-6 6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
);

export const TimePickerControl: React.FC<TimePickerControlProps> = (props) => {
    const {
        value,
        hours,
        minutes,
        seconds,
        showSeconds,
        meridiemPosition,
        format,
        hourUnit,
        minuteUnit,
        secondUnit,
        nowSeconds,
        disabled,
        masked,
        allowFreeform,
        clearable,
        appearance,
        bandColor,
        bandOpacity,
        placeholder,
        onChange
    } = props;

    const styles = useStyles();
    const [open, setOpen] = React.useState(false);
    const [draft, setDraft] = React.useState<string | null>(null);

    // AM/PM gets its own wheel only in 12 hour display, and only when the maker
    // has not asked for it inline with the hour.
    const splitMeridiem = format.use12Hours && meridiemPosition !== "inline";

    // Where the wheels rest when the record holds no value: the current time,
    // snapped onto whatever the maker allows.
    const now = toParts(nowSeconds);
    const fallbackHour = nearestOption(hours, now.hours) ?? 0;
    const fallbackMinute = nearestOption(minutes, now.minutes) ?? 0;
    const fallbackSecond = nearestOption(seconds, now.seconds) ?? 0;

    const parts =
        value === null
            ? { hours: fallbackHour, minutes: fallbackMinute, seconds: fallbackSecond }
            : toParts(value);

    const committedText = value === null ? "" : formatTime(value, format);
    const displayText = draft ?? committedText;

    // Choosing on any wheel writes the whole time, so an hour can never be stored
    // without its minute.
    const commit = React.useCallback(
        (hour: number, minute: number, second: number) => onChange(fromParts(hour, minute, second)),
        [onChange]
    );

    const hour12Options = React.useMemo(() => buildHour12Options(hours), [hours]);
    const meridiemOptions = React.useMemo(() => buildMeridiemOptions(hours), [hours]);
    const current12 = toHour12(parts.hours);
    const fallback12 = toHour12(fallbackHour);

    const commitDraft = React.useCallback(() => {
        if (draft === null) {
            return;
        }
        const trimmed = draft.trim();
        setDraft(null);
        if (trimmed === "") {
            if (value !== null) {
                onChange(null);
            }
            return;
        }
        const parsed = parseTime(trimmed, format);
        if (parsed !== null && parsed !== value) {
            onChange(parsed);
        }
        // An unparseable draft is discarded and the field falls back to the stored
        // value, so the record never ends up holding junk.
    }, [draft, format, onChange, value]);

    if (masked) {
        return (
            <div className={styles.root}>
                <Input
                    className={styles.field}
                    appearance={appearance}
                    value={MASKED_TEXT}
                    disabled
                    aria-label="Value hidden by field level security"
                />
            </div>
        );
    }

    const hourWheel = splitMeridiem ? (
        <WheelColumn
            key="hour"
            values={hour12Options}
            selected={value === null ? null : current12.hour12}
            fallback={fallback12.hour12}
            format={(hour12) => String(hour12)}
            unit={hourUnit}
            label="Hour"
            onSelect={(hour12) => commit(composeHour(hour12, current12.meridiem, hours), parts.minutes, parts.seconds)}
        />
    ) : (
        <WheelColumn
            key="hour"
            values={hours}
            selected={value === null ? null : parts.hours}
            fallback={fallbackHour}
            format={(hour) => formatHour(hour, format)}
            unit={hourUnit}
            label="Hour"
            onSelect={(hour) => commit(hour, parts.minutes, parts.seconds)}
        />
    );

    const minuteWheel = (
        <WheelColumn
            key="minute"
            values={minutes}
            selected={value === null ? null : parts.minutes}
            fallback={fallbackMinute}
            format={formatMinute}
            unit={minuteUnit}
            label="Minute"
            onSelect={(minute) => commit(parts.hours, minute, parts.seconds)}
        />
    );

    const secondWheel = showSeconds ? (
        <WheelColumn
            key="second"
            values={seconds}
            selected={value === null ? null : parts.seconds}
            fallback={fallbackSecond}
            format={formatMinute}
            unit={secondUnit}
            label="Second"
            onSelect={(second) => commit(parts.hours, parts.minutes, second)}
        />
    ) : null;

    const meridiemWheel = splitMeridiem ? (
        <WheelColumn
            key="meridiem"
            values={meridiemOptions}
            selected={value === null ? null : current12.meridiem}
            fallback={fallback12.meridiem}
            format={(meridiem) => formatMeridiem(meridiem, format)}
            unit=""
            label="AM or PM"
            onSelect={(meridiem) => commit(composeHour(current12.hour12, meridiem, hours), parts.minutes, parts.seconds)}
        />
    ) : null;

    const columns = [
        meridiemPosition === "before" ? meridiemWheel : null,
        hourWheel,
        minuteWheel,
        secondWheel,
        meridiemPosition === "after" ? meridiemWheel : null
    ].filter(Boolean);

    const contentAfter = (
        <>
            {clearable && value !== null && !disabled ? (
                <Button
                    className={styles.iconButton}
                    appearance="transparent"
                    size="small"
                    icon={<DismissIcon />}
                    aria-label="Clear"
                    onClick={(event) => {
                        event.stopPropagation();
                        setDraft(null);
                        onChange(null);
                    }}
                />
            ) : null}
            <Button
                className={styles.iconButton}
                appearance="transparent"
                size="small"
                icon={<ChevronIcon />}
                aria-label="Open time picker"
                aria-expanded={open}
                disabled={disabled}
                onClick={() => setOpen((wasOpen) => !wasOpen)}
            />
        </>
    );

    return (
        <div className={styles.root}>
            <Popover
                open={open}
                onOpenChange={(_event, data) => setOpen(data.open)}
                positioning={{ position: "below", align: "start" }}
                trapFocus={false}
                unstable_disableAutoFocus
            >
                <PopoverTrigger disableButtonEnhancement>
                    <Input
                        className={styles.field}
                        appearance={appearance}
                        disabled={disabled}
                        readOnly={!allowFreeform}
                        placeholder={placeholder}
                        value={displayText}
                        contentAfter={contentAfter}
                        onClick={() => {
                            if (!disabled) {
                                setOpen(true);
                            }
                        }}
                        onChange={allowFreeform ? (_event, data) => setDraft(data.value) : undefined}
                        onBlur={allowFreeform ? commitDraft : undefined}
                    />
                </PopoverTrigger>

                <PopoverSurface className={styles.surface}>
                    <div className={styles.wheels} style={{ width: `${columns.length * COLUMN_WIDTH}px` }}>
                        <div
                            className={styles.band}
                            style={{
                                backgroundColor: bandColor ?? undefined,
                                opacity: bandOpacity === 1 ? undefined : bandOpacity
                            }}
                            aria-hidden="true"
                        />
                        {columns}
                    </div>
                </PopoverSurface>
            </Popover>
        </div>
    );
};

export default TimePickerControl;
