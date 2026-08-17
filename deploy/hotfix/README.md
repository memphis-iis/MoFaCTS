# Local Hotfix Watch Helpers

Scripts in this folder support the sole source-watching localhost application loop.

Belongs here:

- The local admin bootstrap used after the watcher becomes ready.

Does not belong here:

- A second native or containerized localhost application server.
- Release build, push, or deploy automation.
- Source patches to generated bundle output.

This workflow owns the only supported localhost application server. Run it
through `deploy/hotfix-local.ps1`; that script owns the native Meteor/Rspack
watcher while Docker owns MongoDB. Do not introduce another application process
or Compose overlay for port 3200. It is local verification, not release confidence.

The manager launches one durable supervisor, which places the pinned Meteor
tool and all Rspack descendants in a Windows Job Object for the entire run.
Closing that one owner terminates the complete process tree. PID files are
accepted only when the executable path and process start time match the tracked
run, without expensive whole-system process scans. Start, restart, stop, and
failed-start cleanup protect unrelated listeners.

Before Meteor starts, MongoDB must pass four consecutive checks for its TCP
listener, authenticated root and app access, and the configured writable
replica-set primary. If Meteor still loses its MongoDB pool during startup, the
manager archives that failed run and retries the same canonical supervised run
once after repeating the stable-primary gate. It does not hide a recurring
failure behind an unbounded restart loop.

The CommonJS boundary is the stable ignored `.meteor/local/package.json` file.
There is no polling helper and no source-touch rebuild loop. The pinned Rspack
package keeps `_build/main-dev` entry and bridge files present throughout a
development run. A cold start clears and recreates that generated context only
after the previous owned process tree has stopped, so a crashed run cannot seed
a fresh Rspack module graph with stale generated files.
Development uses Rspack's supported in-memory cache, so an interrupted process
cannot restore a stale native module graph from disk on the next invocation.
The live watcher still caches incremental rebuild work for the duration of its
run; production cache behavior is unchanged.

Each run records non-secret lifecycle state and keeps its stdout/stderr files.
Before the next run, those files move to ignored `deploy/local-hotfix/runs/` so
the previous failure is not erased. `status` reports supervisor, Meteor,
Rspack, stale PID, obsolete guard, readiness, Change Stream, and recognized
last-failure state.
