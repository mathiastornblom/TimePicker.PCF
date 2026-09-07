import * as React from "react";
import { makeStyles, mergeClasses, tokens, useId } from "@fluentui/react-components";

/** Height of a single row, in pixels. Also the scroll snap interval. */
export const ITEM_HEIGHT = 36;
/** Rows visible at once. Odd, so exactly one row sits in the middle. */
export const VISIBLE_ITEMS = 7;

export const VIEWPORT_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const EDGE_PADDING = (VIEWPORT_HEIGHT - ITEM_HEIGHT) / 2;
/** How far either side of the middle we bother restyling rows. */
const STYLE_RADIUS = 4;

export interface WheelColumnProps {
    values: readonly number[];
    selected: number | null;
    /** Where to park the wheel when nothing is selected yet. */
    fallback: number;
    format: (value: number) => string;
    /** Suffix shown beside the centred row only, as "18 hours". Empty to omit. */
    unit?: string;
    label: string;
    onSelect: (value: number) => void;
}

const useStyles = makeStyles({
    column: {
        position: "relative",
        height: `${VIEWPORT_HEIGHT}px`,
        flexGrow: 1,
        flexBasis: "0",
        minWidth: "0"
    },
    scroller: {
        height: "100%",
        // The runway padding below must sit inside the visible box, otherwise it
        // adds to the wheel's height and the rows spill out of the popover.
        boxSizing: "border-box",
        overflowY: "auto",
        overscrollBehavior: "contain",
        scrollSnapType: "y mandatory",
        paddingTop: `${EDGE_PADDING}px`,
        paddingBottom: `${EDGE_PADDING}px`,
        outlineStyle: "none",
        scrollbarWidth: "none",
        "::-webkit-scrollbar": {
            display: "none"
        },
        ":focus-visible": {
            borderRadius: tokens.borderRadiusMedium,
            outlineWidth: "2px",
            outlineStyle: "solid",
            outlineColor: tokens.colorStrokeFocus2
        }
    },
    item: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: `${ITEM_HEIGHT}px`,
        scrollSnapAlign: "center",
        scrollSnapStop: "always",
        cursor: "pointer",
        userSelect: "none",
        willChange: "transform, opacity",
        color: tokens.colorNeutralForeground1,
        "@media (prefers-reduced-motion: reduce)": {
            // Without the shrinking-into-the-distance effect, lean on colour alone.
            transform: "none !important"
        }
    },
    number: {
        fontSize: tokens.fontSizeBase400,
        fontWeight: tokens.fontWeightSemibold,
        fontVariantNumeric: "tabular-nums",
        textAlign: "right",
        whiteSpace: "nowrap"
    },
    unit: {
        fontSize: tokens.fontSizeBase200,
        fontWeight: tokens.fontWeightRegular,
        color: tokens.colorNeutralForeground3,
        textAlign: "left",
        whiteSpace: "nowrap",
        paddingLeft: tokens.spacingHorizontalXXS,
        opacity: "0",
        transitionProperty: "opacity",
        transitionDuration: tokens.durationFaster
    },
    unitVisible: {
        opacity: "1"
    }
});

/**
 * A single scrolling wheel of values, styled after the iOS picker: rows snap to a
 * band in the middle, and shrink and fade as they recede from it.
 *
 * Scrolling is the primary interaction, but the whole thing is a real listbox, so
 * clicking a row and driving it from the keyboard both work.
 */
export const WheelColumn: React.FC<WheelColumnProps> = (props) => {
    const { values, selected, fallback, format, unit, label, onSelect } = props;
    const styles = useStyles();
    const baseId = useId("wheel-");
    const scrollerRef = React.useRef<HTMLDivElement>(null);
    const settleTimer = React.useRef<number | undefined>(undefined);
    const frame = React.useRef<number | undefined>(undefined);
    const styledRange = React.useRef<[number, number] | null>(null);
    // Suppresses the settle handler while we are the ones doing the scrolling.
    const programmatic = React.useRef(false);

    const active = selected ?? fallback;
    const activeIndex = Math.max(0, values.indexOf(active));
    const optionId = (value: number) => `${baseId}-${value}`;
    // Reserve the unit's width on every row, so the numbers stay on one axis
    // whether or not their unit is showing.
    const unitWidth = unit ? `${unit.length + 0.5}ch` : "0";

    /**
     * Give each row near the middle its distance-based size and opacity, so the
     * wheel reads as curving away rather than as a flat list. Done imperatively on
     * the few rows in view, rather than by re-rendering the whole column.
     */
    const paint = React.useCallback(() => {
        const scroller = scrollerRef.current;
        if (!scroller) {
            return;
        }
        const centre = scroller.scrollTop / ITEM_HEIGHT;
        const from = Math.max(0, Math.floor(centre) - STYLE_RADIUS);
        const to = Math.min(values.length - 1, Math.ceil(centre) + STYLE_RADIUS);

        const previous = styledRange.current;
        if (previous) {
            for (let i = previous[0]; i <= previous[1]; i++) {
                if (i < from || i > to) {
                    const row = scroller.children[i] as HTMLElement | undefined;
                    if (row) {
                        row.style.opacity = "";
                        row.style.transform = "";
                        row.dataset.centred = "false";
                    }
                }
            }
        }

        for (let i = from; i <= to; i++) {
            const row = scroller.children[i] as HTMLElement | undefined;
            if (!row) {
                continue;
            }
            const distance = Math.abs(i - centre);
            row.style.opacity = String(Math.max(0, 1 - distance * 0.3));
            row.style.transform = `scale(${Math.max(0.6, 1 - distance * 0.09)}, ${Math.max(0.5, 1 - distance * 0.15)})`;
            row.dataset.centred = distance < 0.5 ? "true" : "false";
        }
        styledRange.current = [from, to];
    }, [values.length]);

    const scrollToIndex = React.useCallback(
        (index: number, smooth: boolean) => {
            const scroller = scrollerRef.current;
            if (!scroller) {
                return;
            }
            const top = index * ITEM_HEIGHT;
            const reduced =
                typeof window !== "undefined" && window.matchMedia
                    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
                    : false;
            if (Math.abs(scroller.scrollTop - top) < 1) {
                paint();
                return;
            }
            programmatic.current = true;
            scroller.scrollTo({ top, behavior: smooth && !reduced ? "smooth" : "auto" });
            window.setTimeout(
                () => {
                    programmatic.current = false;
                    paint();
                },
                smooth && !reduced ? 320 : 40
            );
        },
        [paint]
    );

    // Park the wheel on the active value when it changes from outside. Jumping
    // rather than animating, so a value arriving from the host does not look like
    // the user spun the dial.
    React.useLayoutEffect(() => {
        scrollToIndex(activeIndex, false);
        paint();
    }, [activeIndex, values.length, scrollToIndex, paint]);

    React.useEffect(() => {
        return () => {
            if (settleTimer.current !== undefined) {
                window.clearTimeout(settleTimer.current);
            }
            if (frame.current !== undefined) {
                cancelAnimationFrame(frame.current);
            }
        };
    }, []);

    // Commit once the wheel has come to rest, which is what makes it feel like a
    // dial rather than a list.
    const handleScroll = React.useCallback(() => {
        if (frame.current === undefined) {
            frame.current = requestAnimationFrame(() => {
                frame.current = undefined;
                paint();
            });
        }
        if (programmatic.current) {
            return;
        }
        if (settleTimer.current !== undefined) {
            window.clearTimeout(settleTimer.current);
        }
        settleTimer.current = window.setTimeout(() => {
            const scroller = scrollerRef.current;
            if (!scroller) {
                return;
            }
            const index = Math.min(values.length - 1, Math.max(0, Math.round(scroller.scrollTop / ITEM_HEIGHT)));
            const value = values[index];
            if (value !== undefined && value !== selected) {
                onSelect(value);
            }
        }, 140);
    }, [onSelect, paint, selected, values]);

    const handleKeyDown = React.useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            const step =
                event.key === "ArrowDown" ? 1 :
                event.key === "ArrowUp" ? -1 :
                event.key === "PageDown" ? VISIBLE_ITEMS :
                event.key === "PageUp" ? -VISIBLE_ITEMS :
                0;

            let next = activeIndex;
            if (step !== 0) {
                next = activeIndex + step;
            } else if (event.key === "Home") {
                next = 0;
            } else if (event.key === "End") {
                next = values.length - 1;
            } else {
                return;
            }

            event.preventDefault();
            next = Math.min(values.length - 1, Math.max(0, next));
            const value = values[next];
            if (value !== undefined && value !== selected) {
                onSelect(value);
            }
            scrollToIndex(next, true);
        },
        [activeIndex, onSelect, scrollToIndex, selected, values]
    );

    return (
        <div className={styles.column}>
            <div
                ref={scrollerRef}
                className={styles.scroller}
                role="listbox"
                aria-label={label}
                aria-activedescendant={selected === null ? undefined : optionId(selected)}
                tabIndex={0}
                onScroll={handleScroll}
                onKeyDown={handleKeyDown}
            >
                {values.map((value, index) => (
                    <div
                        key={value}
                        id={optionId(value)}
                        role="option"
                        aria-selected={value === selected}
                        aria-label={unit ? `${format(value)} ${unit}` : format(value)}
                        className={styles.item}
                        onClick={() => {
                            if (value !== selected) {
                                onSelect(value);
                            }
                            scrollToIndex(index, true);
                        }}
                    >
                        <span className={styles.number}>{format(value)}</span>
                        <span
                            className={mergeClasses(styles.unit, value === active && styles.unitVisible)}
                            style={{ width: unitWidth }}
                            aria-hidden="true"
                        >
                            {unit ?? ""}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default WheelColumn;
