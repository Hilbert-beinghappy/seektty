import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Hero chrome for the blank-draft phase of ConversationRoot: fish headline,
// glow backdrop, and the workspace row. Pure presentation — the resident
// composer is NOT rendered here (it keeps its own stable tree position in
// ConversationRoot so the textarea survives the hero → composer flip); CSS
// positions it over this shell's glow area during the hero phase.
import { useId } from 'react';
import { FishLogo, IconChevronDownOutline14, IconFolderClose16, IconFolderOpen16, } from '@deepseek-ai/dsh-client-ui-primitives';
import { workspaceTitleOf } from '@deepseek-ai/dsh-client-runtime/client';
import css from './HeroShell.module.css';
/**
 * Basename label for the workspace chip (the shared derivation);
 * separator-only paths echo the raw cwd.
 * @param cwd - workspace directory path (non-empty).
 * @returns chip label.
 */
export function workspaceLabel(cwd) {
    const base = workspaceTitleOf(cwd);
    return base !== '' ? base : cwd;
}
/**
 * The workspace chip (folder + label + chevron), always interactive: before
 * the first message the workspace stays switchable — picking another one
 * moves the New Session flow to that workspace's blank session. Without a
 * label the chip renders its placeholder state: closed folder + the
 * "Choose workspace" call to action.
 * @param props.label - chip label (see {@link workspaceLabel}); omitted → placeholder.
 * @param props.menuOpen - menu expansion echo.
 * @param props.onClick - menu toggle.
 * @returns the chip button element.
 */
export function WorkspaceChip({ buttonRef, label, menuOpen = false, onClick, t }) {
    return (_jsxs("button", { ref: buttonRef, type: "button", className: css.workspace, "aria-label": t('hero.chooseWorkspace'), "aria-haspopup": "menu", "aria-expanded": menuOpen, onClick: onClick, children: [label === undefined
                ? _jsx(IconFolderClose16, { className: css.folder, size: 16 })
                : _jsx(IconFolderOpen16, { className: css.folder, size: 16 }), _jsx("span", { className: css.workspaceLabel, children: label ?? t('hero.chooseWorkspace') }), _jsx(IconChevronDownOutline14, { className: css.chevron, size: 12 })] }));
}
/**
 * The soft blue backdrop ellipse (figma 313:14109). Rendered by the hero
 * owner (ConversationRoot), not HeroShell, so it can center on the input
 * card; the owner's className supplies all positioning.
 * @param props.className - positioning class from the owner.
 * @returns the blurred-ellipse svg element.
 */
export function HeroGlow({ className }) {
    // Stable filter id so multiple hero mounts do not collide in the DOM.
    const glowFilterId = `empty-glow-${useId().replace(/:/g, '')}`;
    return (_jsxs("svg", { className: className, viewBox: "0 0 1051 468", fill: "none", "aria-hidden": "true", children: [_jsx("defs", { children: _jsxs("filter", { id: glowFilterId, x: "0", y: "0", width: "1051", height: "468", filterUnits: "userSpaceOnUse", colorInterpolationFilters: "sRGB", children: [_jsx("feFlood", { floodOpacity: "0", result: "BackgroundImageFix" }), _jsx("feBlend", { mode: "normal", in: "SourceGraphic", in2: "BackgroundImageFix", result: "shape" }), _jsx("feGaussianBlur", { stdDeviation: "50", result: "effect1_foregroundBlur" })] }) }), _jsx("g", { filter: `url(#${glowFilterId})`, children: _jsx("ellipse", { cx: "525.5", cy: "234", rx: "425.5", ry: "134", fill: "#6187D8", fillOpacity: "0.08" }) })] }));
}
/**
 * Render the hero chrome (headline only; no glow, no composer, no workspace
 * row — the glow is the owner's {@link HeroGlow}).
 * @param props - see {@link HeroShellProps}.
 * @returns the centered hero element tree.
 */
export function HeroShell({ t, children }) {
    return (_jsxs("div", { className: css.root, children: [_jsxs("div", { className: css.stack, children: [_jsxs("div", { className: css.headline, children: [_jsx("span", { className: css.fishHitbox, children: _jsx(FishLogo, { size: 34, className: css.fish }) }), _jsx("span", { className: css.headlineText, children: t('hero.headline') }), _jsx("span", { className: css.previewBadge, children: t('hero.preview') })] }), _jsx("div", { className: css.body })] }), children] }));
}
//# sourceMappingURL=EmptyHero.js.map