# Maintained MoFaCTS upload package

Owner: MoFaCTS maintainers. This is upstream `ostrio:files` 3.0.1 source from
https://github.com/veliovgroup/Meteor-Files/tree/442a08912595c552c49fabebf8684bf896ee0fb5
(tag 3.0.1). LICENSE is preserved. Meteor and npm dependencies are unchanged.
The upstream worker.min.js runtime asset is shipped alongside worker.js; no
Meteor cache, npm cache, compiled package or generated application bundle is included.

Local changes (including behavior-preserving regex/case-block syntax cleanup for app lint):

- The package owns its `FilesCollection` declarations; the application does not
  declare a second constructor. The schema option uses its documented plain-object
  contract and does not import the unused, undeclared `simpl-schema` dependency.

- Uploads require DDP. Explicit HTTP or other transports throw; HTTP upload code
  and file-session authentication are removed. The retired endpoint returns 410.
- `disableSetTokenCookie` must be true. The client expires the former host-only
  `x_mtok` cookie at `/` and never renews it on login or reconnect.
- Start records the authenticated caller in the existing pending `file.userId`.
  Write/finish/abort read that persisted owner before opening streams or touching
  files. Missing owners, anonymous callers and other users fail closed, including
  administrators. Completed assets cannot be aborted.
- Operations for one identifier are serialized within this package instance;
  identifiers already present in either collection cannot be reused. Client
  FSName does not select a storage path; only the upload ID or a configured
  server namingFunction owns the filename.

The generated DDP method names and argument shapes are unchanged. The application
still owns upload eligibility, quotas, completed-asset management and download
visibility. No learner-data migration is involved. Trustworthy existing pending
owners remain usable within the existing upload TTL; missing owners require a new
upload. This queue does not provide distributed filesystem locking: the supported
staging deployment has one application writer.

Upgrade procedure: obtain an immutable upstream revision, compare its source with
this pinned baseline, review each local change and the upstream license/dependency
diff, and reapply the ownership and transport contracts in source. Do not replace
this package with Atmosphere output or patch registered methods at runtime. Run
typecheck, lint, source-security tests, package-method Meteor integration tests,
and owner/other-user/restart probes before promoting a new revision. Request fresh
single-use authorization for each Meteor integration-suite invocation. Dependencies
require separate approval if an upstream upgrade changes them.
