import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Strict per-session header/body content inserted into the resident conversation layout. */
import { useEffect, useSyncExternalStore } from 'react';
import clsx from 'clsx';
import css from './ConversationRoot.module.css';
const DEFAULT_VIEW_ID = 'chat';
/** Resolve by id and keep stale persisted selections on the stable Chat fallback. */
function resolveActiveView(tabs, selectedId) {
    const requestedId = selectedId ?? DEFAULT_VIEW_ID;
    return tabs.find(view => view.id === requestedId)
        ?? tabs.find(view => view.id === DEFAULT_VIEW_ID);
}
function deriveAncestry(list, id) {
    const chain = [];
    const seen = new Set();
    let cursor = id;
    while (cursor !== undefined) {
        if (seen.has(cursor))
            break;
        seen.add(cursor);
        const summary = list.byId[cursor];
        if (summary === undefined)
            break;
        chain.unshift({ id: summary.id, displayTitle: summary.displayTitle });
        if (summary.origin !== 'subagent')
            break;
        cursor = summary.parentId;
    }
    return chain;
}
function equalBreadcrumbs(left, right) {
    return left.length === right.length
        && left.every((item, index) => {
            const other = right.at(index);
            return other !== undefined && item.id === other.id && item.displayTitle === other.displayTitle;
        });
}
/**
 * Renders Session header chrome above the resident conversation scrollport.
 * @param props - Strict Session store, view ledger, navigation, render, and locale shares.
 * @returns the hidden blank-session header or visible title and tabs.
 */
export function ConversationSessionHeader({ sessionId, useSession, useSessions, useStore, actions, renderSlot, views, open, t, }) {
    useSyncExternalStore(views.subscribe, views.version);
    const tabs = views.list();
    const selectedId = useStore(s => s.view);
    const active = resolveActiveView(tabs, selectedId);
    const ancestry = useSessions(s => deriveAncestry(s, sessionId), equalBreadcrumbs);
    const composerPhase = useSession(s => s.composerPhase);
    const blank = useSession(s => s.blank);
    const hideChrome = blank && composerPhase === 'blank';
    return (_jsx("header", { className: clsx(css.header, hideChrome && css.headerHidden), "aria-hidden": hideChrome || undefined, children: !hideChrome && (_jsxs(_Fragment, { children: [_jsxs("div", { className: css.titleRow, children: [_jsxs("div", { className: css.titleCluster, children: [_jsxs("nav", { className: css.crumbs, "aria-label": t('session.hierarchy'), children: [ancestry.map((summary, index) => {
                                            const last = index === ancestry.length - 1;
                                            return (_jsxs("span", { className: css.crumbSeg, children: [index > 0 && _jsx("span", { className: css.crumbSep, children: "/" }), _jsx("button", { type: "button", className: clsx(css.crumb, last && css.crumbCurrent), disabled: last, onClick: () => { open(summary.id); }, children: summary.displayTitle })] }, summary.id));
                                        }), ancestry.length === 0 && _jsx("span", { className: css.crumbCurrent, children: sessionId })] }), _jsx("div", { className: css.headerActions, children: renderSlot('conversation.session.header.actions', {}) })] }), _jsx("div", { className: css.headerUtilities, children: renderSlot('conversation.session.header.utilities', {}) })] }), tabs.length > 1 && (_jsx("div", { className: css.tabs, role: "tablist", children: tabs.map(viewTab => (_jsx("button", { type: "button", role: "tab", "aria-selected": viewTab.id === active?.id, className: clsx(css.tab, viewTab.id === active?.id && css.tabActive), onClick: () => { actions.setView(viewTab.id); }, children: viewTab.label }, viewTab.id))) }))] })) }));
}
/**
 * Renders the active Session view inside the resident scrollport and keeps
 * the input draft mirrored while blank Hero chrome is visible.
 * @param props - Strict Session input/store, view ledger, and render shares.
 * @returns the active view area, or null while the Session remains blank.
 */
export function ConversationSession({ sessionId, useSession, useInput, inputActions, useStore, actions, renderSlot, views, bindDraftMirror, releaseSessionImages, }) {
    useSyncExternalStore(views.subscribe, views.version);
    const tabs = views.list();
    const selectedId = useStore(s => s.view);
    const active = resolveActiveView(tabs, selectedId);
    const composerPhase = useSession(s => s.composerPhase);
    const blank = useSession(s => s.blank);
    const inputState = useInput(s => s);
    const storedDraft = useStore(s => s.draft);
    // `?? null`: persisted snapshots from before the inspect field rehydrate without it.
    const inspect = useStore(s => s.inspect ?? null);
    useEffect(() => {
        if (inputState.draft === '' && storedDraft !== '')
            inputActions.setDraft(storedDraft);
        const unmirror = bindDraftMirror(actions.setDraft);
        return () => { unmirror(); };
        // Mount-only (deps pinned to inputActions): later store writes come from
        // the machine mirror, not this seed effect.
    }, [inputActions]);
    useEffect(() => () => {
        releaseSessionImages(sessionId);
    }, [releaseSessionImages, sessionId]);
    if (blank && composerPhase === 'blank')
        return null;
    return (_jsx("div", { className: css.viewArea, children: active !== undefined && renderSlot('conversation.view', {
            inspect,
            onInspectDone: () => { actions.setInspect(null); },
        }, { only: active.id }) }));
}
//# sourceMappingURL=ConversationSession.js.map