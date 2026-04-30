# Production Smoke Load Test Notes

This note tracks the first-pass path for using Playwright MCP and lightweight SSH sampling to exercise the production MoFaCTS app.

## Goal

Run a small, human-scale production check: one logged-in user completes 10 Wiki World Maps practice trials while the remote host records simple one-second process and host samples.

## Guardrails

- Do not run Docker build, push, or deploy commands.
- Do not restart production services.
- Do not run `meteor run`.
- Keep remote sampling lightweight.
- Stop if Playwright MCP cannot interact with normal practice trials.

## First Attempt Findings

The first run was blocked before practice because Playwright MCP reported that `/tmp/playwright-mcp/browser` was already in use. Local inspection found two Playwright MCP containers, including one stale/extra container and one sidecar bound to `127.0.0.1:8931`.

After stopping the extra local MCP containers and restarting the sidecar, MCP loaded `https://mofacts.optimallearning.org` normally.

The production run then logged in, opened Learning Dashboard, and started Wiki World Maps. Remote sampling identified the app process as `node main.js` and wrote samples to `/tmp/mofacts_loadtest_20260428T230845.csv`.

The run stopped after 8 submitted trials because the card UI became blank on `/card`. Console output showed a client transition stall:

```text
[ERROR] Error from xstate.after.FADE_OUT_STALL_TIMEOUT.cardMachine.transition.fadingOut: undefined
```

The trial submission path appeared to complete before the blank state: answer evaluation, history logging, and engine update all logged successfully. This makes the result more consistent with a headless/MCP transition timing artifact than a server scalability failure.

## Tighter MCP Procedure

For repeatable smoke/load checks:

1. Use exactly one local Playwright MCP container bound to `127.0.0.1:8931`.
2. Start MCP from a fresh browser profile for each run.
3. Avoid reusing old `/tmp/playwright-mcp/browser` state unless testing session persistence.
4. Use a predictable viewport.
5. Use slower, human-like input cadence.
6. Prefer typing answers over immediate fill-and-submit when exercising practice flow.
7. Collect browser console and lightweight network observations.
8. Stop immediately if the practice UI stops presenting answerable trials.

## Tighter Rerun Result

The follow-up run replaced the local MCP sidecar with a fresh isolated container:

```text
docker run ... mcr.microsoft.com/playwright/mcp --isolated ...
```

The run completed 10 submitted Wiki World Maps trials and returned to Learning Dashboard. One early automation mistake submitted a blank answer after typing the first answer, so the run should be treated as a successful MCP/app-flow smoke test rather than a clean accuracy sample.

Remote samples were written to `/tmp/mofacts_loadtest_tight_20260428T231537.csv`.

The previous blank-card `FADE_OUT_STALL_TIMEOUT` did not recur during the isolated, slower-input run.

## Insert History Instrumentation

The raw per-trial `insertHistory` payload dump should not run in normal production because it stringifies and logs full records on the hot path. The replacement approach is:

- `MOFACTS_INSERT_HISTORY_TIMING=1`: emit one concise timing record per `insertHistory`.
- `MOFACTS_INSERT_HISTORY_PAYLOAD_DEBUG=1`: emit raw and persisted payloads for targeted debugging.
- default: no per-trial payload stringify/logging overhead.

The timing record breaks out decompression, sanitization, authorization/access check, record build, Mongo insert, total method time, and payload byte sizes when timing is enabled.

## Later Tight Rerun Result

A subsequent production smoke run used a fresh isolated local MCP container and completed the Wiki World Maps flow back to Learning Dashboard. Remote samples were written to `/tmp/mofacts_loadtest_tight_20260429T014701.csv`.

Because the instrumentation change was local and not deployed, this production run did not exercise the new server-side `insertHistory` timing logs.

## Metrics To Report

- Production URL used.
- Whether SSH connected.
- Whether login was needed and successful.
- Whether the run started and ended on Learning Dashboard.
- Lesson used.
- Number of completed trials.
- Elapsed time and average time per trial.
- App process CPU min/mean/max.
- App process RSS min/mean/max and start/end delta.
- Overall server CPU min/mean/max.
- Overall available memory min/mean/max.
- Observed `insertHistory` count, if practical.
- Browser console warnings and errors.
- Limitations, especially if the app process or browser interaction was uncertain.
