# Clipboard writer termination

The T07 review reproduced a failed writer receiving SIGTERM, then writing later
and overwriting an already successful fallback. Both timeout and stdin EPIPE
now force termination with SIGKILL and wait for an observed exit (or close)
before the next helper starts. Exit suffices even if inherited pipe handles
delay close. stdin error listeners remain installed after settlement.

Exit confirmation is bounded by 250 ms after termination. If it cannot be
confirmed, the copy reports an unknown outcome and does not start a fallback
or report an earlier OSC52 write as a confirmed final result. An injected
spawn seam timing out cannot prove process exit either, so it also fails closed.

Two POSIX subprocess regressions use a fake clipboard file and temporary
wl-copy/xclip executables: one closes fd 0 during a 5 MiB write; the other
never exits after reading input. Their SIGTERM handlers would write stale data
150 ms later. Both tests assert the fallback value remains and the old PID has
exited. No real clipboard, credentials, model traffic or user history is used.
The subprocess regressions are explicitly skipped on Windows; force termination
and bounded-exit logic is covered with process seams, but real Windows helpers
remain a separate platform acceptance item.
