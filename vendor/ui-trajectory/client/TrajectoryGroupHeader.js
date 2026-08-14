import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// TrajectoryGroupHeader: "Message" or "Step N" row with optional description.
import css from './TrajectoryGroupHeader.module.css';
/**
 * Render a Message/Step group header inside a turn body.
 * @param props - title and optional description.
 * @returns the group header element.
 */
export function TrajectoryGroupHeader({ title, description }) {
    return (_jsxs("div", { className: css.root, children: [_jsx("span", { className: css.title, children: title }), description !== undefined && description !== ''
                ? _jsx("span", { className: css.description, children: description })
                : null] }));
}
//# sourceMappingURL=TrajectoryGroupHeader.js.map