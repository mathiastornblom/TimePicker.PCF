/**
 * Opt-in trace, for diagnosing a host that behaves differently from the local
 * test harness.
 *
 * Records nothing unless it is switched on, either by setting
 * `window.__DR_TimePicker_debug = true` or by adding `tpdebug=1` to the page URL.
 * The URL switch exists because setting a variable from the console is easy to get
 * wrong: it has to happen before the events you want, and it lands on the wrong
 * window when the control runs inside a frame.
 */
function scope(): Record<string, unknown> | undefined {
    return typeof window === "undefined" ? undefined : (window as unknown as Record<string, unknown>);
}

function enabled(host: Record<string, unknown>): boolean {
    if (host.__DR_TimePicker_debug === true) {
        return true;
    }
    try {
        return String((host.location as Location | undefined)?.search ?? "").includes("tpdebug=1");
    } catch {
        return false;
    }
}

export function trace(event: string, detail?: unknown): void {
    const host = scope();
    if (!host || !enabled(host)) {
        return;
    }
    const log = (host.__DR_TimePicker_trace as unknown[]) ?? [];
    log.push({ at: new Date().toISOString(), event, detail });
    host.__DR_TimePicker_trace = log.slice(-300);
}
