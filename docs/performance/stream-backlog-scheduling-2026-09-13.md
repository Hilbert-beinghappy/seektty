# Stream backlog scheduling repair (2026-09-13)

The Node terminal client has no requestAnimationFrame. Its retained Notifier previously fell back to microtasks for frame updates. Async queue iteration therefore allowed each buffered assistant frame to notify the surface and project the cumulative document before timers or terminal input could run. The render scheduler's later frame coalescing did not avoid this work.

The repair separates lossless event ingestion from replaceable display notification:

- Node frame notifications use a 16ms timer, while browser requestAnimationFrame behavior remains intact. ensureFresh still provides synchronous up-to-date reads. markDirty and notifyNow supersede/cancel an obsolete frame timer, preserving immediate terminal/control state updates.
- TerminalStream yields to the event loop after 128 consumed items or about 4ms including consumer work. This is cooperative scheduling, not a hard bound on one unusually expensive handler. The queue uses a head cursor, clears consumed references, and periodically compacts instead of shifting every item.
- Normal close and errors preserve ordered draining. Explicit lifetime cancellation discards unread old-stream work, and generator return releases remaining references. Per-stream counters record enqueued/consumed/discarded items, peak pending count and yields.

## Evidence and limits

A component-level backlog reproduction uses actual TerminalStream, Notifier and Transcript, with 240000 existing characters plus 20000 buffered increments. Before repair it made 20000 transcript updates and delayed an already pending timer by 10194.56ms. With production changes (no scheduler stub or consumer yield in the fixture), the same workload produced one update, consumed the queue in 8.60ms, and serviced the timer after 0.89ms while preserving all 320000 final characters. These are illustrative local measurements, not a universal latency guarantee or proof that the user's live queue contained 20000 items.

Tests cover ordered event/error draining, cancellation during backlog consumption, consumer return, Node microtask bursts, synchronous reads, priority terminal-state publication, session subscriber replacement, and browser scheduling. Final local check: 180 test files, 1554 passed, 1 existing skip; typecheck, build and pack check passed. Official compatibility remains exactly dsh 0.1.5-rc.1 and is validated with the packed install/boot/remove/reinstall cycle.

This changes no Harness Session API, durable log, permissions or settings. It does not drop body/approval/end/error events to gain speed. A real mouse/full-mode retest remains necessary: if stalls persist, measure actual queue depths and notification counts alongside GC, host event state and terminal writes. Long synchronous per-frame layout is a separate remaining cost.
