# Playwright MCP Operations Guide

This guide documents practical conventions for using Playwright MCP with MoFaCTS. It is based on production smoke-test experience and is meant to keep browser automation repeatable, interpretable, and low-risk.

## Purpose

Use Playwright MCP for browser-level checks of MoFaCTS behavior: login, Learning Dashboard navigation, practice trials, console collection, and light network observation.

Playwright MCP is not a substitute for unit tests, TypeScript verification, or production deployment checks. Treat it as an interactive browser probe.

## Guardrails

- Do not run `meteor run` for production confidence.
- Do not run Docker build, push, or deploy commands unless explicitly requested.
- Do not restart production services as part of MCP browser troubleshooting.
- Stop the browser test if MCP cannot see or interact with the normal UI.
- Treat normal app data created by an approved smoke test as allowed; avoid extra trial submissions when debugging MCP itself.

## Preferred MCP Setup

Use one local Playwright MCP sidecar bound to `127.0.0.1:8931`.

For repeatable runs, prefer a fresh isolated browser profile:

```powershell
docker run -d --name mofacts-mcp-tight-playwright `
  -p 127.0.0.1:8931:8931 `
  -e BASE_URL=https://mofacts.optimallearning.org `
  mcr.microsoft.com/playwright/mcp `
  --isolated `
  --output-dir /tmp/playwright-mcp/output `
  --host 0.0.0.0 `
  --port 8931
```

Use a persistent profile only when the purpose of the run is to test saved login/session behavior.

## Before A Run

Check that exactly one Playwright MCP container is serving the expected endpoint:

```powershell
docker ps --format "{{.ID}} {{.Image}} {{.Names}} {{.Ports}} {{.Status}}" |
  Select-String -Pattern "playwright|mcp|8931"
```

If multiple Playwright MCP containers are running, stop or remove the extras before starting a production smoke run. Multiple MCP containers or shared browser profiles can produce misleading lock errors.

Common lock symptom:

```text
Browser is already in use for /tmp/playwright-mcp/browser
```

This usually means a live or stale Chromium process owns the shared user-data directory. Prefer restarting with `--isolated` instead of deleting profile files by hand.

## Browser Interaction Practices

Use interactions that resemble a real user when exercising practice flow:

- Prefer visible UI navigation over direct URL jumps after login.
- Start from Learning Dashboard when testing practice behavior.
- Click the lesson's `Continue` or `Start` button in the dashboard table.
- Prefer sequential typing into the answer box over immediate fill-and-submit.
- Submit by Enter only after the answer is present.
- Wait for each next trial to render before answering.
- Return to Learning Dashboard through the navbar brand/home link and then the Learning Dashboard button.

Avoid treating one stale Playwright element reference as an app failure. Capture a fresh snapshot when a ref goes stale.

## What Counts As An MCP Problem

Stop and diagnose MCP before interpreting app behavior if:

- The browser cannot navigate because the MCP endpoint is unavailable.
- The browser reports the profile is already in use.
- Snapshots show stale or missing elements while screenshots/DOM indicate the page is changing.
- Element refs go stale repeatedly during normal transitions.
- A test failure disappears after using a fresh isolated MCP profile.

## What Counts As An App Signal

Treat the result as an app signal when MCP is clean and the same behavior appears through normal UI interaction:

- The app renders an error state or blank state after a completed interaction.
- Console errors recur across isolated MCP runs.
- A trial cannot be answered because the app stops presenting an answer box.
- Network or method calls fail while the browser remains responsive.
- The same failure reproduces in a normal headed browser.

When in doubt, rerun once with a fresh isolated MCP profile and slower input before opening an app bug.

## Console And Network Capture

Collect console messages after the run, and report warnings/errors separately from routine app logs.

Useful observations:

- Browser console errors and warnings.
- App log lines containing `ERROR`, `WARN`, or transition-stall messages.
- Failed non-static network requests.
- Whether `insertHistory` calls can be observed; DDP/WebSocket calls may not appear as ordinary request rows.

Do not over-interpret missing `insertHistory` rows in simple MCP network output. Meteor DDP traffic usually needs deeper WebSocket capture or server-side method timing.

## Production Smoke Test Pattern

Recommended high-level sequence:

1. Start a fresh isolated MCP sidecar.
2. Open the production URL.
3. Log in if needed.
4. Navigate to Learning Dashboard.
5. Start lightweight remote sampling if the run includes server metrics.
6. Click `Continue` or `Start` for the target lesson.
7. Complete the requested number of trials with human-like typing.
8. Return to Learning Dashboard.
9. Stop remote sampling only after the dashboard loads.
10. Collect console/network observations.

## Interpreting Results

MCP tells us whether a real browser-like client can complete a workflow. It does not, by itself, explain server performance.

For scalability questions, combine MCP with server-side measurements:

- app process CPU and RSS
- overall host CPU and available memory
- method-level timing, especially `insertHistory`
- Mongo insert latency
- event-loop lag
- DDP/subscription behavior

Single-user smoke runs are useful for correctness and obvious regressions. They are not enough to identify concurrency bottlenecks.

## Cleanup

After a run, either keep the known sidecar running for follow-up investigation or stop it explicitly:

```powershell
docker rm -f mofacts-mcp-tight-playwright
```

Do not leave multiple Playwright MCP sidecars running on overlapping ports or shared profile directories.
