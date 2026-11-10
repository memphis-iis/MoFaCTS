# Hosted staging

The private canonical config repository owns the hosted operator inputs and
entry points: `deploy staging.txt` and `deploy staging.ps1`. Production retains
its separate `deploy production.txt` procedure. Run the staging script with
PowerShell 7.4 or newer. It builds the current local MoFaCTS source, including
uncommitted changes, publishes a unique staging image tag, pulls its immutable
digest on the staging host, and verifies the running image ID and source label.
No commit or push of source is implied by deployment.

Staging uses the canonical `deploy/docker-compose.yml` with the private
`staging/docker-compose.staging.yml` overlay. Its Compose project, app container,
runtime directory, database and Redis volumes, replica key, backup directory,
and dynamic assets are distinct from the retired staging site's resources.
The app binds to loopback behind the staging Apache HTTPS virtual host. The
overlay keeps the canonical authenticated MongoDB replica-set, Change Streams,
Redis, settings mounts, and health checks; it does not define another runtime.
There is no data migration from the retired site into the new empty database.
Mongo initialization source directories must be readable by MongoDB's container
user after its entrypoint drops privileges; private env/settings/key files keep
their separate restrictive permissions. Replica initialization waits for the
local server's `hello.isWritablePrimary` before provisioning application roles,
including when replica status already reports an elected primary member.

## Deployment and acceptance

Run the complete staging entry point from the private command sheet. It checks
the fixed staging host identity and URL before uploading or starting services;
there are no production-host parameters. It stops on native-command failures.
`-DeployPublished` explicitly installs the staging tag already recorded in the
private staging env after an interrupted installation; it requires the local
image's revision to match the current source commit and resolves and verifies
the registry digest again. It does not choose an alternate image or rebuild.
The old site's archive must already have been copied off-server, checksum
verified, and recorded in the staging archive verification receipt before the
new stack can be installed. Routine staging releases preserve the current
staging volumes and do not repeat the one-time retirement or reset the database.

After deployment, HTTPS health, the tracked staging CSP header, SockJS discovery,
and immutable image identity are checked automatically. These checks do not
establish authenticated application acceptance. Sign up/sign in with the
configured owner email, run Deployment Readiness at `/admin/tests`, and verify
lesson upload/listing, practice response, reload/resume, export, and dynamic
media. Verify SPARC and speech integrations when used; deployment does not copy
localhost administrator provider keys or choose provider/model settings.

The normal script asks for the exact `VERIFIED <staging-tag>` attestation only
after these checks. `-DeferAcceptance` records an installed deployment with
acceptance pending. `-AcceptExisting` checks the installed identity again and
collects the attestation without rebuilding. An accepted release record is
written only after attestation and a final identity check. An acceptance failure
does not undo a deployment; inspect the reported boundary before proceeding.

## Retired site's recovery boundary

The November 2026 retirement keeps the old containers stopped with automatic
restart disabled. Their database volumes, old runtime directory, and original
assets remain in place. The archive includes a quiesced logical dump, cold
database volumes, image IDs and saved images, container configuration and
writable filesystem, original assets/configuration, Apache/TLS material, and
host recovery metadata. A separate isolated MongoDB restore compares collection
counts with the original, excluding MongoDB's transient session cache (the cold
volume copy also preserves its original files). This verifies database recoverability; it is not a
complete host or old-application restore rehearsal.

Keep the archive and its checksums outside public repositories with access
restricted to the operator. It contains learner data and credentials. Retain
an off-server copy. The private archive recovery instructions identify the
exact paths and recovery commands. Restoring the retired site requires an
explicit maintenance operation: stop the new stack before starting the old
app on its original port, restore its Apache configuration, and verify the old
app and data. Do not start both app containers on the same port, delete old
volumes, or use a current Compose definition to reinterpret the old database.

Use **Admin > Backups** for the new staging site's routine backups, verification,
download, and restore; see [backup and restore](backup-restore.md). The standalone
shell helpers assume the original `/dynamic-assets` host topology and are not
installed as staging operators. Staging's actual durable asset mount is
`/srv/mofacts-staging/dynamic-assets`; never archive or restore the retired site's
asset directory as if it belonged to the new site.
Emergency restoration, container health, and operator acceptance are
separate evidence and must be reported separately.
