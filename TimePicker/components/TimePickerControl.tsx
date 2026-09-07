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
    formatHour,
    formatMinute,
    formatTime,
    fromParts,
    nearestOption,
    parseTime,
    toParts
} from "../lib/time";
import type { FormatOptions } from "../lib/time";

export type FieldAppearance = "outline" | "underline" | "filled-darker" | "filled-lighter";

export interface TimePickerControlProps {
    /** Current time as minutes of day, or null when the record holds no value. */
    value: number | null;
    hours: readonly number[];
    minutes: readonly number[];
    format: FormatOptions;
    /** Text beside the centred row of each wheel. Empty strings omit them. */
    hourUnit: string;
    minuteUnit: string;
    /** Current wall-clock time as minutes of day, in the user's time zone. */
    nowMinutes: number;
    disabled: boolean;
    /** Field level security hides the value from this user. */
    masked: boolean;
    /** Allow the user to type a time rather than only pick one. */
    allowFreeform: boolean;
    clearable: boolean;
    appearance: FieldAppearance;
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
        minWidth: "180px",
        height: `${VIEWPORT_HEIGHT}px`,
        // Fade the rows away from the middle, the way a physical wheel curves out
        // of view. Applied across the whole group so both columns fade together.
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
        format,
        hourUnit,
        minuteUnit,
        nowMinutes,
        disabled,
        masked,
        allowFreeform,
        clearable,
        appearance,
        placeholder,
        onChange
    } = props;

    const styles = useStyles();
    const [open, setOpen] = React.useState(false);
    const [draft, setDraft] = React.useState<string | null>(null);

    // Where the wheels rest when the record holds no value: the current time,
    // snapped onto whatever hours and minutes the maker allows.
    const nowParts = toParts(nowMinutes);
    const fallbackHour = nearestOption(hours, nowParts.hours) ?? 0;
    const fallbackMinute = nearestOption(minutes, nowParts.minutes) ?? 0;

    const parts = value === null ? { hours: fallbackHour, minutes: fallbackMinute } : toParts(value);
    const selectedHour = value === null ? null : parts.hours;
    const selectedMinute = value === null ? null : parts.minutes;

    const committedText = value === null ? "" : formatTime(value, format);
    const displayText = draft ?? committedText;

    // Choosing on either wheel writes the whole time, so an hour can never be
    // stored without its minute.
    const handleHour = React.useCallback(
        (hour: number) => onChange(fromParts(hour, parts.minutes)),
        [onChange, parts.minutes]
    );
    const handleMinute = React.useCallback(
        (minute: number) => onChange(fromParts(parts.hours, minute)),
        [onChange, parts.hours]
    );

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
                    <div className={styles.wheels}>
                        <div className={styles.band} aria-hidden="true" />
                        <WheelColumn
                            values={hours}
                            selected={selectedHour}
                            fallback={fallbackHour}
                            format={(hour) => formatHour(hour, format)}
                            unit={hourUnit}
                            label="Hour"
                            onSelect={handleHour}
                        />
                        <WheelColumn
                            values={minutes}
                            selected={selectedMinute}
                            fallback={fallbackMinute}
                            format={formatMinute}
                            unit={minuteUnit}
                            label="Minute"
                            onSelect={handleMinute}
                        />
                    </div>
                </PopoverSurface>
            </Popover>
        </div>
    );
};

export default TimePickerControl;
