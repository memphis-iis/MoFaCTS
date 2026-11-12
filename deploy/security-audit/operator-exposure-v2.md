# Operator-run staging2 V2 exposure workflow

This is the standard operator execution of the exposure report sequence while
GitHub billing is unavailable. It uses the same host validator, producers,
catalog assembler, authenticated encryption, signed uploader and final assertion
as the optional hosted workflow. No application deployment, account creation,
new SSH permission, GitHub runner registration or Meteor invocation is needed.

Use the pinned Node/npm runtime and an exact committed checkout. Keep evidence in
a new operator-owned private directory. Use the existing approved staging2
restricted SSH identity to acquire the no-argument forced command described in
[staging2 access](staging2-access.md). Save its bounded response as a new
`host-acquisition.json`; do not use the general operator account, run another
remote command, substitute a previous measurement or infer a missing receipt.
The acquisition parser enforces the existing host timestamp and receipt schema.

Check the worker's normal hostname resolution before the costly full-port scan
(for example, a bounded `getent ahosts staging2.optimallearning.org`). A working
Windows browser or earlier DNS result does not establish current Linux resolver
readiness. If resolution fails, retain that boundary and repair the owned worker;
do not hardcode the target IP, disable certificate checks or change DNS providers
inside the scanner. Any resulting report controls remain ERROR.

In the existing Linux scanner environment (Nmap and OpenSSL already approved),
without signing credentials or the private encryption key:

```sh
AUDIT_TARGET=https://staging2.optimallearning.org AUDIT_TYPE=exposure \
AUDIT_REPORT_ID=staging2-operator-UNIQUE-RUN-ID \
node mofacts/scripts/security-audit/run-operator-exposure-v2.mjs acquire \
  /absolute/private/host-acquisition.json /absolute/private/new-acquisition
```

The new directory must not exist. Host carriage validation, external acquisition
and host/composite evaluation retain independent outcomes. The exact catalog
assembler supplies ERROR controls for missing evidence; `acquisition-outcome.json`
records which steps finished. Assembly derives scanner revision from Git, never
from the deployed application revision. The matching protected host receipt
alone supplies deployed image/source identity.

Next use the trusted operator's existing credential mechanism to provide only
`AUDIT_REPORT_INGEST_SECRET` and `AUDIT_REPORT_ENCRYPTION_PUBLIC_KEY` to a separate
pinned Node process, with `AUDIT_TARGET` fixed to staging2. Do not send secrets as
arguments, retain environment dumps, load credentials into the acquisition
process, copy the full application settings, or use the RSA private key here.
The operator may perform this step on Windows using the same source and report;
the scanner and signer need not share a process or credential environment.

```sh
node mofacts/scripts/security-audit/run-operator-exposure-v2.mjs finish \
  /absolute/private/new-acquisition/report.json \
  /absolute/private/new-retained-report.encrypted.json \
  /absolute/private/new-upload-outcome.json
```

Encryption must succeed before the one signed HTTPS POST. Receipt creation
requires HTTP 201; it does not infer storage from a transport timeout. Never
blindly retry an uncertain upload. Verify its report ID/digest through the
existing admin list/get/download operations first. Retained encrypted bytes
remain in operator storage; verify their saved-key decryption and exact payload
digest before claiming recoverable retention. Keep private plaintext until that
readback is finished, then remove only that run's owned plaintext. Retain the
encrypted report and content-free outcome/readback fingerprints under the
existing audit evidence policy (the hosted artifact policy was 90 days).

The final assertion runs after encryption and storage acceptance. A report with
any execution ERROR exits 1 and records `executionComplete: false`, even when its
encryption and ingestion succeeded. Security FAIL controls remain findings;
they are not execution errors. An incomplete UDP probe stays ERROR. Do not change
CSP, firewall, catalog severity or evidence policy to obtain a green outcome.
The upload outcome is workflow evidence, not release qualification or a hosted
GitHub result. Full-profile authentication/repository acquisition remains a
separate milestone; this command supports the exposure profile only.
