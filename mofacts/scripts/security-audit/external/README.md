# Inert V2 external producer

This directory is an uninvoked Phase 1 candidate. The active V1 producer and
scheduled workflow are unchanged. The external artifact contributes its eleven
catalog-owned controls; UDP's final control belongs exclusively to the existing
composite evaluator. No catalog metadata or report counts are copied here.
It requires the existing application npm dependencies, including the already-
declared XML parser. The active V1 exposure workflow currently skips that npm
setup; the future V2 workflow must explicitly supply it before this entry point
can be activated. No dependency or workflow change is made by this candidate.

- `observationsV2.mjs` validates Nmap XML and evaluates bounded measurements.
  It reuses the already-declared `fast-xml-parser`, disables entity processing,
  rejects entity/external DTD input, caps bytes, and requires one completed scan
  with the exact address, protocol and port inventory. Duplicate, missing,
  contradictory or foreign results cannot establish scan completeness.
- `acquireV2.mjs` owns DNS, command, HTTP, TLS and WebSocket acquisition. It
  derives actual measurement counts and has an explicit complete injected-I/O
  interface for offline tests. Imports perform no requests or command execution.
- `producerFilesV2.mjs` validates the complete artifact before creating
  `external.json` through the existing file writer, and separately writes the
  composite producer's raw three-count UDP input when its inventory is known.
  Missing inventory leaves that file absent, making the existing composite
  recovery report ERROR. Existing output files are rejected before probes.

The optional explicit entry point is:

```text
node scripts/security-audit/emit-external-producer-v2.mjs <exposure|full> <private-producer-directory> <raw-udp-output.json>
```

Keep the UDP output outside the private producer directory. Use a fresh per-run
location; emission never overwrites earlier evidence. The selected protected
environment supplies required `AUDIT_TARGET`. This fixed external policy tests
public HTTP/TLS on ports 80/443, so a different HTTPS origin port is rejected
before acquisition. No production target, target CLI option, redirect following
or alternate transport is supplied. Live invocation needs explicit target/run
authorization; source approval and offline test success are not that permission.

TCP, TLS, cipher and WebSocket probes iterate the complete bounded resolved
IPv4/IPv6 inventory. The three HTTP redirect paths and header request exercise
the hostname, retaining their existing policy/scope. Missing DNS-family results
caused by transport errors do not masquerade as a complete address inventory.
Nmap calls remain sequential across addresses and scan families, preserving
V1's one-process resource bound rather than multiplying full scans in parallel.
The external header and cipher policy is preserved from V1; this source work
does not independently recertify its policy strength.

TLS negotiation and certificate authorization are separate observations. Only
the explicit peer protocol-version alert proves rejection. A timeout, reset or
local crypto limitation stays unavailable. Legacy protocol probes offer the
legacy handshake only in a new credential-free observer context; no global
cipher setting, application TLS rule, HTTP/WSS certificate check or CSP changes.
The observer sends no application data and records only acceptance, certificate
verification and expiry. This follows the pinned
[Node TLS behavior](https://nodejs.org/download/release/v24.22.1/docs/api/tls.html#openssl-security-level).
Both completed modern-protocol results contribute certificate evidence; an
unavailable legacy observation does not erase independent modern certificate
measurements. A missing modern result never becomes invented validity data.

A UDP `open` result requires the actual `udp-response` reason. Closed results
and positive service responses contribute conclusive coverage; `open|filtered`
and unanswered/ambiguous results do not. Partial positive UDP evidence can still
establish the already-approved HIGH finding without host observations. Silence
or incomplete coverage cannot become PASS.

TLS and WebSocket probes have a fixed ten-second overall deadline, including
connection setup and response acquisition. Incoming byte activity cannot reset
that deadline. Completion, early close and timeout dispose the socket/timer
through one owner; the offline cases exercise this using virtual time.

Run the offline cases using the repository-pinned Node runtime:

```text
node --test scripts/security-audit/tests/externalV2.test.mjs
```

The cases use synthetic XML, injected probes, bounded socket-event doubles and
temporary files. They do not run Nmap, reach an audit target, use credentials or
start Meteor. Until publication of the preceding reviewed file-pipeline batch,
this separate candidate remains outside its unchanged source-suite import list;
run it explicitly alongside `security:test:source` when verifying both batches.
Live scanner, combined workflow and staging2 ingestion acceptance remain open.
At coordinated V2 cutover, retire the superseded V1 external path and parser;
the two implementations are development isolation, never parallel ingestion.
