# Stable hover during streaming

Every transcript snapshot previously cleared all hover presentation. Subsequent
mouse reports restored it, producing flicker during fast reasoning streams.

Ordinary transcript updates now retain hover while still invalidating armed
click confirmation. MouseController remembers the last hover pointer and can
re-hit-test it without fabricating input or incrementing input metrics. After a
full-mode frame is painted, the surface reconciles against its new hit map. For
queued native output, reconciliation occurs only after successful presentation,
not against a prepared frame that has not reached the terminal.

An unchanged target produces neither a hover transition nor an additional render.
A moved, removed, disabled or covered target is resolved against the current hit
map and repainted when needed. Explicit hover clearing forgets the pointer, so
focus loss, session switches, resize and keyboard interaction cannot resurrect
stale hover. Active gestures are not retargeted by hover reconciliation.

Controller regressions cover 1,000 unchanged frames, removal and return under a
stationary pointer, explicit clearing, focus loss, active clicks and native mode.
Existing click confirmation, selection and mouse tests remain required. PTY
smoke tests do not replace visual verification of a real streamed reply.
