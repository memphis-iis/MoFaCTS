# Isolated staging2 audit access

The manual `Staging2 restricted audit access` workflow exercises the existing
root-owned staging2 host auditor through its forced-command SSH account. It does
not deploy, run Meteor, create a production report, ingest data, or qualify a
release. It requires an explicit accepted release-record digest for each run.

## Identity and ownership

- GitHub environment: `staging2-security-audit`, limited to the `main` branch.
- Runner identity: only `tag:staging2-audit`, issued by a separate Tailscale OAuth
  client with writable `auth_keys` and that single tag. No device-management or
  policy-write scope is needed. The existing production client is unchanged.
- Tailnet grant: `tag:staging2-audit` to `tag:staging2`, TCP 22 only. Preserve
  existing grants and Tailscale SSH rules. Do not enable Tailscale SSH on staging2.
- Server account: `mofacts-audit`, using the already installed restricted key and
  exact no-argument host-audit sudo command. No general shell, terminal or port
  forwarding capability is added.

The operator owns the tailnet policy, client revocation, environment protection
and credentials. Root deployment owns the server's installed command/key policy
and protected receipt. The workflow reads both; it changes neither.

The accepted policy retains its existing 12 tests and adds three groups covering
allowed staging SSH, denied TCP/UDP connections to production/operator peers,
denied staging application/database ports, and denied reverse connections from
staging2 to the audit identity. Saving is subject to Tailscale's policy tests.
Live TCP probes complement these policy tests; they cannot independently prove
which network layer dropped traffic. No production authentication or application
requests are sent by the negative probes.

## Protected GitHub configuration

Populate only this environment, using the operator's existing GitHub sign-in:

| Secret | Purpose |
| --- | --- |
| `TS_OAUTH_CLIENT_ID` / `TS_OAUTH_SECRET` | The separate single-tag staging OAuth client |
| `AUDIT_SSH_HOST` | Staging2's private Tailscale IP |
| `AUDIT_SSH_USER` | Exactly `mofacts-audit` |
| `AUDIT_SSH_PRIVATE_KEY` | The dedicated forced-command key, never an operator/root key |
| `AUDIT_SSH_KNOWN_HOSTS` | Staging2's pinned host key associated with that private IP |

The environment variable `AUDIT_DENIED_PEERS_JSON` contains exactly four explicit
private peer addresses: the existing production and operator devices, each IPv4
and IPv6. These are denial-test targets, not additional permitted destinations.
Missing or malformed targets fail before acceptance. Do not introduce
shell-added line endings into the client ID, secret, host or username.

The installed GitHub CLI trims trailing CR/LF from ordinary `secret set` stdin.
For the OpenSSH private key, use its supported **in-memory dotenv input**
(`gh secret set --env-file - --env staging2-security-audit`), with the key as a
double-quoted value containing escaped `\n`, including its required terminal LF.
Do not write a plaintext dotenv file. This selects the CLI's documented structured
input rather than repairing keys in the runner. The local saved key and server
authorization remain unchanged. A missing terminal newline fails in Linux's SSH
parser; do not relax key or host validation. See the
[installed CLI's input implementation](https://github.com/cli/cli/blob/v2.81.0/pkg/cmd/secret/set/set.go#L347-L400).

Keep credentials in the operator's approved private storage. The local staging
OAuth copy is a Windows DPAPI-encrypted `PSCredential` with a protected DACL for
the operator, SYSTEM and Administrators. Verify encrypted read-back before
closing the one-time secret display. Never retain that display in screenshots
or artifacts. Local DPAPI storage does not complete the separate AWS recovery
design. Prior and accepted nonsecret policy files are retained privately.

## Run and acceptance

Read the exact digest of the accepted staging2 workstation authority through its
existing storage owner. Do not infer it from the host response or use CI's smoke
image as a workstation identity. Then invoke on `main`:

```powershell
gh workflow run staging2-audit-access.yml --ref main `
  -f "expected_record_digest=$AcceptedStaging2RecordDigest"
```

Only a manual dispatch on `main` can select this protected environment. There is
no schedule, pull-request trigger or caller-supplied target. Pinned actions and
the repository-pinned Node runtime are used, with no application installation or
new runner dependency. The existing Tailscale action owns ephemeral-node logout.

The shared checker requires all nine exact host control IDs to PASS and a valid
`observed/MATCH` receipt with the explicitly supplied record digest and the
separate staging2 image repository. It checks the runner has only its audit tag,
arbitrary commands cannot execute, PTYs and forwarding are refused, and all 44
bounded negative TCP probes time out. A connection refusal or other network
error is inconclusive and fails acceptance. Four workers limit probe concurrency.

SSH key/host files are created in a private temporary directory and removed in
`finally`. The checker captures bounded diagnostics without printing or retaining
them. An always-running runner teardown is still required if the job is killed;
the existing hosted runner and Tailscale action own that teardown. Retained
artifacts contain only fixed statuses, counts and public receipt identity fields,
for 14 days. A failed run uploads no raw host output or credential files.

An accepted result is `staging2-access-accepted-unqualified`. This is an access
and host identity rehearsal, not full report/catalog authentication, automated
receipt integration into the V1 assembler, Phase 1 activation or Phase 0 closure.
An updated deployed release requires its newly accepted workstation record
digest on the next manual dispatch; missing or stale identity fails explicitly.

The first accepted live run was
[`41845349663`](https://github.com/memphis-iis/MoFaCTS/actions/runs/41845349663)
on `e745f4a8`, after correcting the private-key publication boundary above. It
passed all nine controls, receipt matching, restricted SSH and 44 negative TCP
probes; ephemeral logout passed and only the original three devices remained.
The underlying source batch `c4276faf` separately passed complete CI/Meteor/image
checks and matching Security. See the
[exact evidence and authorization ledger](../../docs-developer/security-audit-durable-redesign-status.md).

## Revocation and recovery

To stop GitHub access, revoke the staging-only OAuth client and remove its
environment secrets; retire any still-connected staging audit nodes. Remove only
the added staging audit grant/tag/tests through the policy owner if retiring the
identity permanently, preserving intervening unrelated edits. Existing PC access
and production identity do not depend on this client. Application rollback and
receipt recovery remain owned by their existing procedures.
