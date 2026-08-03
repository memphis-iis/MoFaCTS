# MongoDB In-Place Replica-Set Conversion

This runbook converts the existing self-hosted MongoDB service and data volume
to a named one-member replica set. It does not copy data, move writer authority,
or require a second server. Polling remains the MoFaCTS reactivity driver during
and after the conversion.

A one-member set enables Change Streams and transactions but does not provide
host redundancy. The configuration deliberately preserves two later options:
add members to the same set, or build and rehearse a parallel target before a
separate data-authority migration.

## Preconditions

Do not execute the live steps without an approved maintenance window and a
named recovery decision owner.

1. Retain the exact last-good application and pre-conversion Compose/config
   artifacts.
2. Confirm the current service, data volume, MongoDB patch/FCV, database name,
   app/root identities, external asset locations, and every application, job,
   admin, backup, sidecar, and tunnel that can write to MongoDB.
3. Set one immutable `MOFACTS_MONGO_REPLICA_SET_NAME` and a resolvable
   `MOFACTS_MONGO_REPLICA_SET_MEMBER`. The default initial member is
   `mongodb:27017` on the Compose network.
4. Create and securely store the keyfile named by
   `MONGO_REPLICA_SET_KEYFILE_HOST_PATH`. Never print or commit its contents.
   All future members of this set must receive the same key securely.
5. Update every private app-user URI to include the configured `replicaSet`
   value and existing `authSource`. Native host-side development also uses
   `directConnection=true` because the container member advertises its Compose
   DNS name.
6. Render the configuration without starting services:

   ```bash
   cd deploy
   docker compose --env-file .env.self-hosted -f docker-compose.yml config --quiet
   ```

## Disposable-copy rehearsal

Before the live conversion, restore a current protected backup into an isolated
Compose project and execute the conversion there. The rehearsal passes when:

- MongoDB initializes exactly once and becomes writable primary in the expected
  replica set;
- the app-user URI authenticates and application readiness reports the exact
  set rather than standalone or another set;
- collection counts, users/roles, indexes, collection options, representative
  learner/admin records, and external assets match the protected preflight;
- the application starts with polling, SockJS, and disconnect grace zero; and
- a fresh destructive restore from the resulting protected backup succeeds.

Do not require multi-server election testing for this one-member outcome. Test
multi-member failure behavior when members or a parallel target are actually
introduced.

For the repository-level synthetic rehearsal, use a unique project name and the
tracked `docker-compose.rehearsal-standalone.yml` override to create the
standalone source. Seed only synthetic records, then run `down` without `-v` so
the project volume survives:

```bash
docker compose -p mofacts-rs-rehearsal --env-file .env.local.example \
  -f docker-compose.yml -f docker-compose.rehearsal-standalone.yml \
  up -d --wait mongodb
docker compose -p mofacts-rs-rehearsal --env-file .env.local.example \
  -f docker-compose.yml -f docker-compose.rehearsal-standalone.yml down
```

Restart that same project using only the canonical replica-set definition, wait
for the initializer, and verify continuity, authentication, a real Change Stream
event, backup/restore, and restart. The optional
`docker-compose.rehearsal.yml` overlay removes the fixed production container
name and binds the isolated polling app to
`127.0.0.1:${MOFACTS_REHEARSAL_HTTP_BIND:-13200}`. Remove only the exact
rehearsal project with `down -v --remove-orphans` after recording sanitized
results. This synthetic rehearsal validates repository mechanics; it does not
replace the protected-backup continuity rehearsal required before live writer
authority changes.

## Live conversion

1. Announce maintenance and stop all MoFaCTS application instances plus every
   identified writer. Verify that none remains connected as a writer.
2. Create the final protected backup while writers are stopped:

   ```bash
   ENV_FILE=.env.self-hosted ./backup-self-hosted.sh /protected/path/mofacts-pre-replica-set
   ```

   The bundle contains learner data, credentials, settings, and the replica-set
   keyfile. Keep it encrypted and access-restricted. Prove it can be read and
   restored in the rehearsal environment before continuing.
3. Start MongoDB and the idempotent initializer with the new configuration:

   ```bash
   docker compose --env-file .env.self-hosted -f docker-compose.yml up -d mongodb-replica-init
   docker compose --env-file .env.self-hosted -f docker-compose.yml wait mongodb-replica-init
   docker compose --env-file .env.self-hosted -f docker-compose.yml up -d --wait mongodb
   ```

4. Through an authenticated administrative connection, capture a sanitized
   `hello` result proving the expected set name and `isWritablePrimary: true`.
   Check `rs.status()` and `rs.conf()` without recording credentials or learner
   data. The configured initial member must be present; extra pre-existing
   members are never removed automatically.
5. Re-run protected continuity checks for users/roles, collection/index/options
   inventories, representative records, and external assets.
6. Start MoFaCTS and verify connected readiness before reopening traffic:

   ```bash
   docker compose --env-file .env.self-hosted -f docker-compose.yml up -d --wait mofacts
   ```

   Confirm startup reports the replica-set topology and authenticated session,
   while reactivity remains polling. Exercise focused sign-in, learner
   launch/response/resume, content access, and administrator readiness checks.
7. Reopen traffic and watch MongoDB/app readiness, write errors, and resource
   use. A concrete correctness, authentication, recovery, readiness, or capacity
   failure stops acceptance; missing optional benchmark evidence does not.

## Abort and recovery boundary

Before the converted primary accepts an application write, stop the services
and use the rehearsed last-good configuration/backup procedure. Do not improvise
a partial reconfiguration.

After the converted primary accepts an application write, keep the converted
database authoritative. Recover the replica set or restore its verified backup;
do not start the same data as a concurrent standalone authority and do not send
traffic to two database authorities.

Changing `METEOR_REACTIVITY_ORDER` later affects observer behavior only. It does
not require or authorize a database topology rollback.

## Future expansion

To add members, provision a distinct member volume and resolvable DNS name,
install the same replica-set name and keyfile, then use an explicitly reviewed
`rs.add(...)` operation and expand private seed-list URIs. Verify initial sync,
replication lag, elections, backups, capacity, and monitoring for the new
failure model.

To migrate to a parallel server or managed target, use the plan's separate
parallel-target continuity and writer-authority procedure. The current
one-member conversion does not remove or weaken that option.
