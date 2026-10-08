# Upload ownership and transport

MoFaCTS uses DDP for package and media uploads through its maintained local
`ostrio:files` 3.0.1 source package. See
[package maintenance](../mofacts/packages/ostrio-files/MAINTENANCE.md) for the
immutable upstream revision, owner and upgrade procedure. Existing npm and Meteor
dependencies are preserved.

Application upload callers explicitly set `transport: 'ddp'`. Explicit HTTP or
other transports fail; `/cdn/storage/Assets/__upload` returns **410 Gone** before
asset lookup. Downloads retain their existing URLs and public/private rules.

Upload start derives `file.userId` from the authenticated DDP invocation.
Continuation, finish and abort require that same persisted pending owner before
filesystem access. Client ownership claims are ignored. Client `FSName` does not
choose the storage path; the upload identifier or a configured server naming
function owns it. An identifier already present in pending or completed records
cannot replace an upload. Anonymous callers, other users and administrators
cannot operate another user's upload. Completed assets cannot be aborted; normal
guarded asset-management methods still own completed-file deletion.

Pending uploads with trustworthy owners remain resumable within the existing
upload TTL, including after reconnect or process restart. Missing owners are
rejected and require a new upload; filenames, cookies and the current caller do
not supply a missing owner. No learner-history or completed-asset migration runs.

`disableSetTokenCookie: true` is required. The package expires the old host-only
`x_mtok` cookie at `/` without renewing it during login or reconnect. Accounts
authentication and storage are unchanged.

Verification from `mofacts/`:

```sh
npm run typecheck
npm run lint
npm run security:test:source
node --test scripts/voicePreview.test.cjs
```

Meteor integration discovers `server/runtime/uploadOwnership.test.ts`,
`server/runtime/dynamicAssetsRoute.test.ts`, `client/lib/uploadTransport.test.ts`
and `client/views/themeConfirmation.test.ts`. Each `npm run test:ci` invocation
requires fresh single-use authorization. Package-handler tests use synthetic
records and real Mongo/filesystem streams; simulated stream disposal does not
replace a staging process-restart test.

Theme deletion keeps the existing inline controller. Cancel/Escape return focus
to the row's Delete button. Confirm moves focus to the existing Export Active
Theme control, which remains available while the selected row is disabled or
removed. Closing a confirmation hides its retained section; it does not require
removing that section from the DOM.

Before release, exercise normal package/media uploads, synthetic owner-versus-other
operations and restart/resume on staging2. Verify Chrome voice playback, visible
theme confirmation with Cancel/Escape/focus return and selected-theme deletion,
cookie absence after login/reload/reconnect, and existing CSP, public/private
assets, learner resume, Anki analysis, hosted fonts and YouTube playback. A WAV
response alone does not establish successful playback. Keep production and the
older staging installation outside this qualification batch.
