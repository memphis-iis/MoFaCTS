# Recovery-store setup review

Status: review draft, not provisioning permission or completed recovery. The
selected design remains one encrypted AWS Secrets Manager secret containing
complete current and explicitly retained last-accepted configuration versions.
Account readiness is accepted; source-document provenance is the next gate.

## Completed account prerequisite

On 2026-11-04 the operator confirmed a fresh AWS sign-in with the physical USB
key, independent access to the AWS password and root-email inbox, and separate
key custody. A fresh authenticated console appeared in the expected account.
Earlier AWS read-back showed the new `root-backup-usb-key` entry with FIDO L2
certification and all four MFA registrations preserved. Physical-key use during
the sign-in and recovery arrangements are operator-confirmed evidence; they are
not claimed as an automated authentication or device-loss test.

See [account readiness](account-recovery.md) and the
[execution record](../../docs-developer/security-audit-durable-redesign-status.md).

## Proposed resource and cost boundary

| Setting | Proposed value |
| --- | --- |
| Account | The operator's verified account containing staging2; account ID retained privately |
| Region | `us-east-2` (Ohio) |
| Secret name | `mofacts/security-audit/recovery` (proposed, not created) |
| Secret type | Other type of secret; complete portable configuration document |
| Encryption | AWS-managed `aws/secretsmanager` key |
| Automatic rotation | Off |
| Regional replicas | None |
| Runtime integration | None; GitHub receives deployment copies through its existing owner |
| Retention | Current plus explicitly labeled last-accepted rollback; no automatic application rollback |

The read-only Ohio Secrets Manager list displayed **No secrets**. The service
baseline is $0.40 per secret per month (about $4.80/year), plus $0.05 per 10,000 API
calls. Creating versions has no separate version fee; AWS's managed encryption
key has no separate key cost. These are reviewed baseline prices, not a spending
approval. No replica, custom KMS key, rotation Lambda, new static AWS credential
or new application dependency is proposed. Sources: [AWS pricing](https://aws.amazon.com/secrets-manager/pricing/)
and [secret creation/encryption choices](https://docs.aws.amazon.com/secretsmanager/latest/userguide/create_secret.html).

## Complete input and provenance

The active production audit environment lists these nine existing deployment
secrets, matching the public scanner setup contract:

- `AUDIT_AUTH_FIXTURES_JSON`
- `AUDIT_IMAPS_PASSWORD`
- `AUDIT_REPORT_INGEST_SECRET`
- `AUDIT_SSH_HOST`, `AUDIT_SSH_USER`, `AUDIT_SSH_PRIVATE_KEY`, `AUDIT_SSH_KNOWN_HOSTS`
- `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET`

Its existing `AUDIT_REPORT_ENCRYPTION_PUBLIC_KEY` variable is also a required
binding. This inventory is names only; it does not prove that the secret values
are complete, valid or recoverable. The report-decryption private key is not
available from this GitHub environment and must not be added there. Root-account
password/MFA material is not part of the fixture/provider document.

Bounded searches of the approved private Desktop folder, canonical config repo
and local audit work directories did not locate the complete original fixture
document or a previous accepted copy. The existing staging2 files contain a
smaller working set; they cannot silently replace the full audit configuration.
GitHub's normal secret APIs return metadata without secret values, so listing
the environment is not a backup. See [GitHub environment-secret API](https://docs.github.com/en/rest/actions/secrets#get-an-environment-secret).

First locate the original complete private source and last-accepted version.
Record only paths/provenance and bounded completeness/size outcomes. Preserve
exact credential bytes and validate both serialized documents against the
65,536-byte limit before upload; do not infer fit from local file sizes.

If an original cannot be located, stop for an explicit bootstrap decision. A
possible one-time transfer from the protected GitHub deployment environment must
be reviewed and authorized separately: exact destination, temporary scoped AWS
access, no raw secrets in logs/artifacts, read-back validation and access removal.
No such export workflow, IAM role or credential transfer has been created or run.
Do not claim a historical last-accepted version can be recovered from GitHub's
current secret metadata or manufacture it by relabeling a current copy.

## Remaining execution gates

After source provenance is settled, prepare the exact complete documents and
least-privilege setup/restore operations for approval. Use only an explicitly
approved credential source and verify its account identity before mutation. An
installed AWS CLI/profile alone does not establish that source or account.

Provision/upload only after concrete permissions, destination and cost approval.
Then restore and validate both the complete current and dedicated retained
rollback versions on staging2 under the applicable execution permissions, verify
that the retained label survives candidate updates, and restore the accepted
state afterward. Missing historical input or unverified restore remains an open
gate. Account readiness, cloud storage and a digest alone do not close Phase 0.
