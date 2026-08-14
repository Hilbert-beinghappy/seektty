// Component-local calendar-day tick: memoized message rows keep stable props
// across midnight, so the IconActions clock needs a local day seat that
// re-fires at the next local midnight without reaching for framework hooks.
import { useEffect, useState } from 'react';
import { msUntilNextLocalMidnight, startOfLocalDay } from "./message-chrome.js";
/**
 * Local calendar-day epoch that advances at each local midnight.
 * @returns Midnight ms for the current local day; updates after the boundary.
 */
export function useCalendarDay() {
    const [day, setDay] = useState(() => startOfLocalDay(Date.now()));
    useEffect(() => {
        let timer;
        const arm = () => {
            const now = Date.now();
            setDay(startOfLocalDay(now));
            timer = setTimeout(arm, msUntilNextLocalMidnight(now));
        };
        timer = setTimeout(arm, msUntilNextLocalMidnight(Date.now()));
        return () => { clearTimeout(timer); };
    }, []);
    return day;
}
//# sourceMappingURL=use-calendar-day.js.map