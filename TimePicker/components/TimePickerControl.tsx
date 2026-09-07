import * as React from "react";
import {
    Combobox,
    Input,
    Option,
    makeStyles,
    useId
} from "@fluentui/react-components";
import type { ComboboxProps } from "@fluentui/react-components";
import { formatTime, nearestOption, parseTime, type FormatOptions } from "../lib/time";

export type FieldAppearance = "outline" | "underline" | "filled-darker" | "filled-lighter";

export interface TimePickerControlProps {
    /** Current time as minutes of day, or null when the record holds no value. */
    value: number | null;
    /** Selectable times, as minutes of day, ascending. */
    options: readonly number[];
    format: FormatOptions;
    /** Current wall-clock time as minutes of day, in the user's time zone. */
    nowMinutes: number;
    disabled: boolean;
    /** Field-level security hides the value from this user. */
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
    }
});

const MASKED_TEXT = "•••••••";

export const TimePickerControl: React.FC<TimePickerControlProps> = (props) => {
    const {
        value,
        options,
        format,
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
    const comboId = useId("timepicker-");
    const listboxRef = React.useRef<HTMLDivElement>(null);

    const [open, setOpen] = React.useState(false);
    const [draft, setDraft] = React.useState<string | null>(null);

    const committedText = value === null ? "" : formatTime(value, format);

    // The input shows the user's in-progress text while typing, and the committed
    // value the rest of the time. Reformatting on every prop change keeps the
    // display honest when the host writes a value back.
    const displayText = draft ?? committedText;

    // Bring the relevant time into view when the list opens. With no value that
    // is the current time, so "now" is what the user sees first.
    React.useEffect(() => {
        if (!open) {
            return undefined;
        }
        const target = value ?? nearestOption(options, nowMinutes);
        if (target === null) {
            return undefined;
        }
        const frame = requestAnimationFrame(() => {
            const listbox = listboxRef.current;
            const optionElement = listbox?.querySelector<HTMLElement>(`[data-minutes="${target}"]`);
            optionElement?.scrollIntoView({ block: "center" });
        });
        return () => cancelAnimationFrame(frame);
    }, [open, value, nowMinutes, options]);

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
        // An unparseable draft is discarded and the field falls back to the
        // committed value, so the record is never left holding junk.
    }, [draft, format, onChange, value]);

    const handleOptionSelect = React.useCallback<NonNullable<ComboboxProps["onOptionSelect"]>>(
        (_event, data) => {
            setDraft(null);
            if (data.optionValue === undefined) {
                if (value !== null) {
                    onChange(null);
                }
                return;
            }
            const selected = Number(data.optionValue);
            if (Number.isFinite(selected) && selected !== value) {
                onChange(selected);
            }
        },
        [onChange, value]
    );

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

    return (
        <div className={styles.root}>
            <Combobox
                id={comboId}
                className={styles.field}
                appearance={appearance}
                disabled={disabled}
                freeform={allowFreeform}
                clearable={clearable && !disabled}
                placeholder={placeholder}
                open={open}
                onOpenChange={(_event, data) => setOpen(data.open)}
                value={displayText}
                selectedOptions={value === null ? [] : [String(value)]}
                onOptionSelect={handleOptionSelect}
                onChange={allowFreeform ? (event) => setDraft(event.target.value) : undefined}
                onBlur={allowFreeform ? commitDraft : undefined}
                listbox={{ ref: listboxRef }}
            >
                {options.map((minutes) => (
                    <Option key={minutes} value={String(minutes)} text={formatTime(minutes, format)} data-minutes={minutes}>
                        {formatTime(minutes, format)}
                    </Option>
                ))}
            </Combobox>
        </div>
    );
};

export default TimePickerControl;
