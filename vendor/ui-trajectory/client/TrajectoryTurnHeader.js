import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
// TrajectoryTurnHeader: sticky per-turn bar with Input/Output/Think/Time labels.
import css from './TrajectoryTurnHeader.module.css';
const COLUMN_LABELS = ['Input', 'Output', 'Think', 'Time'];
/**
 * Render the sticky turn header row.
 * @param props.turn - turn index.
 * @returns the sticky header element.
 */
export function TrajectoryTurnHeader({ turn }) {
    return (_jsx("div", { className: css.root, children: _jsxs("div", { className: css.inner, children: [_jsxs("span", { className: css.title, children: ["Turn ", turn] }), _jsx("div", { className: css.columns, "aria-hidden": "true", children: COLUMN_LABELS.map(label => (_jsx("span", { className: css.column, children: label }, label))) })] }) }));
}
//# sourceMappingURL=TrajectoryTurnHeader.js.map