import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
// Legacy standalone trajectory cell retained for direct consumers and specs.
import { formatElapsedSeconds, } from "./trajectory-record.js";
import css from './TrajectoryCell.module.css';
export { formatElapsedSeconds };
/** Display label per kind (matches the design tags). */
const KIND_LABEL = {
    system: 'System',
    user: 'User',
    context: 'Context',
    compacted: 'Compacted',
    message: 'Message',
    tool: 'Tool',
    subtool: 'Sub',
};
const TAG_CLASS = {
    system: css.tagSystem,
    user: css.tagUser,
    context: css.tagContext,
    compacted: css.tagSystem,
    message: css.tagMessage,
    tool: css.tagTool,
    subtool: css.tagSubtool,
};
/**
 * Render one trajectory step cell.
 * @param props - index, kind, text, time, and optional Message metrics.
 * @returns the cell element.
 */
export function TrajectoryCell({ index, kind, text, inputDetail: _inputDetail, promptDetail: _promptDetail, previousPromptDetail: _previousPromptDetail, outputDetail: _outputDetail, thinkingDetail: _thinkingDetail, sourceBlocks: _sourceBlocks, outputBlocks: _outputBlocks, schemaDetail: _schemaDetail, assistantMetrics: _assistantMetrics, result: _result, callId: _callId, isError: _isError, timeSeconds, startedAt: _startedAt, input, output, think, selected = false, className, ...rest }) {
    const rootClass = [
        css.root,
        selected ? css.selected : undefined,
        className,
    ].filter((c) => c !== undefined).join(' ');
    const showMetrics = kind === 'message';
    return (_jsxs("div", { className: rootClass, "data-kind": kind, "data-selected": selected || undefined, ...rest, children: [_jsxs("span", { className: css.index, children: ["#", index] }), _jsx("span", { className: css.tagSlot, children: _jsx("span", { className: [css.tag, TAG_CLASS[kind]].filter((c) => c !== undefined).join(' '), children: KIND_LABEL[kind] }) }), _jsx("span", { className: css.text, children: text }), _jsxs("span", { className: css.trailing, children: [showMetrics ? (_jsxs(_Fragment, { children: [_jsx("span", { className: css.metric, children: input ?? '' }), _jsx("span", { className: css.metric, children: output ?? '' }), _jsx("span", { className: css.metric, children: think ?? '' })] })) : null, _jsx("span", { className: css.time, children: formatElapsedSeconds(timeSeconds) })] })] }));
}
//# sourceMappingURL=TrajectoryCell.js.map