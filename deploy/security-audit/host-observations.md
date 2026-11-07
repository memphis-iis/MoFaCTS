# V2 host acquisition candidate

**Local source and synthetic Linux fixtures verified; not installed or activated.** The active
`host-exposure-audit.sh` and its scheduled V1 caller remain unchanged. Continue
from the [written plan](../../docs-developer/security-audit-durable-redesign-plan.md)
and [current checklist](../../docs-developer/security-audit-durable-redesign-status.md).

`host-observations.sh` prepares the acquisition-only replacement for that host
entry point. The checked-in `host-measurements.v1.json` is its field/type owner,
installed alongside the protected acquisition helpers. The shell derives the
canonical descriptor digest rather than keeping a second list of fields or
copying the control catalog. The Node parser independently checks the digest,
complete envelope, types, freshness and bounds. The Node evaluator owns control
membership, outcomes and failure severity.

The candidate accepts no arguments or original SSH command and requires root.
It reads the existing root-owned mode-0600 Bash-assignment configuration only
after verifying the file, link count and parent directory protections. As in V1,
that configuration is trusted executable input; this is not a new parser format.
Missing or unsafe configuration produces explicit unavailable facts, retaining
safe ownership/permission observations where possible. No caller-supplied config
path, descriptor, environment identity or arbitrary command is accepted.

Each command is time- and byte-bounded. Only declared scalar facts and fixed
unavailable categories enter canonical output; raw commands, records, identifiers,
settings, credentials and error text do not. `host-mongo-connectivity.js` reads
through the same bounded `find`/replica observations as V1; query failure does not
prove authentication bypass. Authentication input is not printed. Exact role
inspection reuses `host-mongo-roles.js`; an explicitly absent helper is not logged
into. Redis probes use PING and the application container's existing Redis route.
No account provisioning, setting mutation or remediation is performed.

The V2 entry point temporarily repeats acquisition orchestration while sharing
the existing AWK/jq/Mongo helpers. This preserves the approved inert-development
boundary: extracting a shared runtime orchestrator now would change imports of
the active V1 scanner. Deployment maintainers own removal of the superseded V1
orchestration at the coordinated, qualified cutover. No dual active host protocol
is proposed.

## Approved contract completion

The old implementation explicitly requires exactly one `127.0.0.1:3000` app
publication, active Apache, and a successful Apache configuration check. The
initial descriptor omitted independent measurements for those requirements.
The operator approved their addition in decision P1-D5 on 2026-11-06.

The still-unreleased descriptor now has `expectedApplicationPublicationCount`,
`apacheActive` and `apacheConfigValid`. An observed publication count other than
one, inactive Apache, or a demonstrated Apache syntax error establishes FAIL.
An unavailable measurement cannot become a successful check. Service/query
failure or timeout alone does not establish a violation. Configured-host and
upstream checks retain their independent measurements.

Shared validators, complete fixtures and the golden descriptor digest are updated
together. Current descriptor SHA-256:
`4646d0cae686fe24499a554e27101fc95a8266d3e3f3308d7a3396d9c91696e0`.
The 70/23 catalog membership and catalog digest are unchanged. Preserve the
completed native Meteor run as proof of its older source/descriptor, not this
amended candidate. Released contracts remain immutable. No application permission
or service-account requirement changed.

## Verification prerequisite

The existing Linux host tests use jq. With explicit approval, Ubuntu-MoFaCTS now
has distribution packages jq/libjq1 `1.7.1-3ubuntu0.24.04.2` and libonig5
`6.9.9-1build1`. No packages were upgraded and no Docker/JEDM service was restarted.
This is an operator test-environment dependency, not an application dependency.
The retained Meteor tooling image is unchanged. Tests never install or emulate jq.

Use repository-pinned Node on root Linux, or the existing hosted CI sudo lane:

```sh
node --test mofacts/scripts/security-audit/tests/hostCollectorV2.test.mjs
```

The native fixture passed all 26 cases on Ubuntu-MoFaCTS. The full source-security
suite passed 134/135 tests, zero failed; the one existing V1 CI-only fixture was
skipped. Full typecheck/lint, explicit probe/fixture lint and Bash syntax also
passed. The new shared Meteor case and amended descriptor still need supported
Meteor execution before this batch's runtime gate is satisfied.

Both acquisition files are reviewed supplemental inputs in the existing
`qualification/testInputs.mjs` capture contract. Its 16 regression tests pass,
including exact copy and digest-change checks for the new readers. An isolated
test snapshot must contain and bind these files; copying them into an already
sealed snapshot or silently omitting them is not an accepted procedure.

The native fixture rewrites fixed installation paths into one private `/root`
temporary directory and supplies synthetic service commands. It does not contact
live Docker, Apache, Redis or MongoDB, or read host application settings. It uses
the real Bash/jq/AWK code and shared Node parser/evaluator. It assigns root
ownership/modes explicitly to the disposable installed-file copies; source mount
metadata must not weaken the protected-file guard. A skipped fixture or
standalone Mongo VM success is not Linux emitter or forced-SSH qualification.
Protected staging installation and real forced-command rejection remain later
explicit approval/qualification boundaries under plan Section 14.2.
