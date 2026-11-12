# Staging2 report-writer access review

Status: prepared for the Section 0 access decision; **not granted or executed**.
The existing `staging2-security-audit` GitHub environment has only the restricted
SSH/Tailscale bindings and its denied-peer variable. Metadata inspection found
neither a report-ingestion signing secret nor an encryption-public-key variable.
Do not dispatch the [reviewed workflow](staging2-v2-workflow.yml.review) or add
these bindings before approval. Production and its V1 workflow remain excluded.

## Proposed permission and custody

Allow this existing main-only GitHub environment to submit signed reports to the
existing staging2 HTTPS `/internal/security-audits/v2` endpoint. Reuse staging2's
current ingestion key from its protected Desktop `.env.staging2`; put it only in
`AUDIT_REPORT_INGEST_SECRET` in that environment. Read it locally with the pinned
Node environment parser and send it to `gh secret set` through private stdin,
using the existing sign-in. Do not put the value in arguments, console output,
temporary plaintext files, a source commit or a transfer artifact. Do not change
the server key or copy a production key.

This adds report-write authority. It adds no app login, account management,
database, shell, SSH/sudo or Tailscale network permission. The ingestion endpoint
still independently validates signatures, catalog membership, evidence, digest,
identity, freshness and nonce uniqueness. Reports are appended; existing report
records are not overwritten or deleted.

Create one separate staging2 RSA-3072 report-encryption key pair under the
approved private Desktop `MoFaCTS-Lightsail-Test` folder. Keep the private key
there, solely with the operator; preserve the existing production/recovery keys.
Publish only its public PEM as environment **variable**
`AUDIT_REPORT_ENCRYPTION_PUBLIC_KEY`. Before publishing any real encrypted report,
verify an in-memory synthetic encrypt/decrypt round trip through the existing
RSA-OAEP-SHA256/AES-256-GCM report implementation. Record only public fingerprints
and finite results. No AWS resource, charge or production access is proposed.

## Execution after approval

1. Revalidate repository/environment/main restriction, current staging2 release
   digest and Desktop key name/length without logging any value. Read only the
   single local ingestion value; do not transfer a whole environment file.
2. Prepare the RSA pair in the approved folder and prove the private/public
   mapping and synthetic round trip. Do not replace a colliding existing file.
3. Publish the one signing secret and one public variable; read back names/public
   fingerprint only. GitHub cannot disclose a secret value on readback.
4. Publish the reviewed manual-only workflow under `.github/workflows/`, keeping
   the production workflow unchanged. It uses existing Node/npm/Playwright and
   Nmap/jq/SSH dependencies on its disposable runner. No Meteor, image build,
   deployment, application reset or report deletion is part of that workflow.
5. Run one `exposure` acquisition only when GitHub capacity permits. Billing
   restrictions do not authorize a paid plan, new runner or production run.
   Retain truthful ERROR results, one signed-upload receipt and encrypted bytes;
   require independent app readback. An incomplete report must fail the final
   completion assertion after storage/retention, rather than suppressing evidence.
6. Preserve private-key custody and existing recovery limits. This proves new
   staging2 report decryption, not historical production-key recovery.

The full profile is infrastructure for the later Phase 2 qualification. Its
selected cases require prepared canonical value-only bindings, valid actors and
an existing accepted V2 report baseline. No such credential secret is installed
by this proposal. Its other 21 authentication protocol controls remain explicit
ERROR until their Phase 2 acquisition owners exist. Unavailable repository tools
or client canaries similarly remain ERROR. Never call that a passing full audit.

## Revocation

Disable the staging2 V2 workflow and delete only this environment's
`AUDIT_REPORT_INGEST_SECRET` to remove the added GitHub write capability. Preserve
the existing restricted SSH/Tailscale environment, production environment and
operator private key. Keep accepted encrypted reports and public-key fingerprint;
do not destroy their private decryption key as a shortcut to revoking writes.
