import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// ProducedFiles: the produced-file row a finished turn ends with. The paths
// come pre-matched by the turn-tail chain from the mutation tools'
// follow-along locations, never from the closing prose. Clicking one goes
// through the same openFile the tool rows use — the Host's own opener, on the
// Host machine.
import { useLayoutEffect, useRef, useState } from 'react';
import { basename } from "./turn-deliverables.js";
import css from './ProducedFiles.module.css';
/** At most six chips compete for the one-line summary; every other path stays counted. */
const SHOWN_LIMIT = 6;
/**
 * Select the largest prefix whose measured chips and exact remainder fit.
 * @param available - usable width of the one-line file lane.
 * @param gap - computed flex gap between adjacent visible items.
 * @param chipWidths - measured widths for the candidate file chips.
 * @param moreWidthsByShown - exact localized remainder width for each shown count.
 * @returns Number of leading chips to render.
 */
export function fitProducedFiles(available, gap, chipWidths, moreWidthsByShown) {
    if (available <= 0)
        return chipWidths.length;
    const prefix = [0];
    let prefixWidth = 0;
    for (const width of chipWidths) {
        prefixWidth += width;
        prefix.push(prefixWidth);
    }
    let largestFit = 0;
    for (const [shown, width] of prefix.entries()) {
        const more = moreWidthsByShown[shown];
        const items = shown + (more === undefined ? 0 : 1);
        const needed = width + (more ?? 0) + Math.max(0, items - 1) * gap;
        if (needed <= available)
            largestFit = shown;
    }
    return largestFit;
}
function moreLabel(t, count) {
    return count === 1 ? t('produced.moreOne') : t('produced.more', { count: String(count) });
}
/**
 * Render one turn's produced files as openable chips.
 * @param props - selector-matched paths, the chat view's file opener, and the locale seat.
 * @returns The produced-files row.
 */
export function ProducedFiles({ matched: paths, openFile, isLoopback, useHostDescription, t, }) {
    const hostCanOpenPath = useHostDescription(description => description?.canOpenPath === true);
    const canOpenPath = isLoopback && hostCanOpenPath;
    const limit = Math.min(paths.length, SHOWN_LIMIT);
    const [shownCount, setShownCount] = useState(limit);
    const rowRef = useRef(null);
    const chipProbes = useRef([]);
    const moreProbe = useRef(null);
    useLayoutEffect(() => {
        const row = rowRef.current;
        const remainderProbe = moreProbe.current;
        /* v8 ignore next -- React attaches both refs before the layout effect runs. */
        if (row === null || remainderProbe === null)
            return;
        const measure = () => {
            const styles = getComputedStyle(row);
            const gap = Number.parseFloat(styles.columnGap || styles.gap) || 0;
            // React attaches every still-mounted callback ref before layout effects run.
            const activeChipProbes = chipProbes.current.slice(0, limit);
            const chips = activeChipProbes.map(probe => probe.getBoundingClientRect().width);
            const more = Array.from({ length: limit + 1 }, (_, candidate) => {
                if (paths.length === candidate)
                    return undefined;
                remainderProbe.textContent = moreLabel(t, paths.length - candidate);
                return remainderProbe.getBoundingClientRect().width;
            });
            setShownCount(fitProducedFiles(row.clientWidth, gap, chips, more));
        };
        measure();
        if (typeof ResizeObserver === 'undefined')
            return;
        const observer = new ResizeObserver(measure);
        observer.observe(row);
        for (const probe of [...chipProbes.current, moreProbe.current]) {
            if (probe !== null)
                observer.observe(probe);
        }
        return () => { observer.disconnect(); };
    }, [limit, paths, t]);
    const visibleCount = Math.min(shownCount, limit);
    const shown = paths.slice(0, visibleCount);
    const hidden = paths.length - shown.length;
    return (_jsxs("div", { className: css.root, children: [_jsx("span", { className: css.label, children: t('produced.label') }), _jsxs("div", { ref: rowRef, className: css.row, "data-produced-files-row": true, children: [shown.map(path => (_jsx("button", { type: "button", className: css.file,
                        // The full path is the disambiguator when two turns produce files
                        // that share a basename; the chip itself stays short.
                        title: path, "aria-label": t('produced.open', { name: path }), onClick: () => { openFile(path); }, children: basename(path) }, path))), hidden > 0 && _jsx("span", { className: css.more, children: moreLabel(t, hidden) })] }), hidden > 0 && canOpenPath && (_jsx("button", { type: "button", className: css.showFolder, onClick: () => { openFile('.'); }, children: t('produced.showInFolder') })), _jsxs("div", { className: css.measure, "aria-hidden": "true", children: [paths.slice(0, limit).map((path, index) => (_jsx("button", { ref: (node) => { chipProbes.current[index] = node; }, type: "button", tabIndex: -1, className: `${css.file} ${css.probe}`, children: basename(path) }, path))), _jsx("span", { ref: moreProbe, className: `${css.more} ${css.probe}` })] })] }));
}
//# sourceMappingURL=ProducedFiles.js.map