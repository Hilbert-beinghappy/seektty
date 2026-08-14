import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { TrajectoryTurnHeader } from "./TrajectoryTurnHeader.js";
import css from './TrajectoryTurn.module.css';
/**
 * Render one turn section (sticky header + body).
 * @param props - turn index and body children.
 * @returns the turn section element.
 */
export function TrajectoryTurn({ turn, children }) {
    return (_jsxs("section", { className: css.root, "data-turn": turn, children: [_jsx(TrajectoryTurnHeader, { turn: turn }), _jsx("div", { className: css.body, children: children })] }));
}
//# sourceMappingURL=TrajectoryTurn.js.map