# Dependency Security Remediation Plan (2026-03-23)

Status: Planned  
Priority: Security maintenance

## Scope
- Dependency and lockfile vulnerability remediation for `c:\dev\mofacts\svelte-app\mofacts`
- Focus on the 7 remediation steps identified from current audit review

## Working Rules
1. Execute the fixes in the order listed below unless a blocker forces reordering.
2. Make a separate commit for each numbered fix.
3. Do not combine multiple fixes into one commit, even if they touch the same lockfile.
4. After each fix, rerun the relevant verification for that step before making the commit.

## Audit Context
- GitHub push output reported 63 vulnerabilities on the default branch.
- Local `npm audit` grouped the current branch into 21 findings total.
- Local `npm audit --omit=dev` grouped production-impacting issues into 7 findings.
- Differences are expected because GitHub and npm group dependency paths differently and may be evaluating different branches.

## Remediation Plan
1. Upgrade `underscore` from `1.13.7` to `1.13.8`.
Commit: one commit only for the `underscore` bump and any lockfile changes it produces.
Verification: reinstall if needed, rerun audit, and smoke-check code paths that use underscore-heavy helpers.

2. Upgrade `dompurify` from `3.3.1` to `3.3.3`.
Commit: one commit only for the `dompurify` bump and resulting lockfile changes.
Verification: smoke-check rendered/sanitized HTML flows that rely on DOMPurify.

3. Upgrade `@aws-sdk/client-mturk` from `3.985.0` to the current patched line and confirm the resolved `@aws-sdk/xml-builder` and `fast-xml-parser` versions are no longer vulnerable.
Commit: one commit only for the MTurk/AWS SDK remediation.
Verification: rerun audit, confirm the MTurk dependency tree resolves patched XML packages, and smoke-check MTurk-related code paths.

4. Upgrade `meteor-node-stubs` from `1.2.26` to `1.2.27` and recheck the bundled `bn.js` findings.
Commit: one commit only for the `meteor-node-stubs` update.
Verification: rerun audit and confirm whether the remaining `bn.js` findings are reduced or eliminated.

5. Refresh the transitive lockfile fixes for the easier non-framework advisories: `minimatch`, `flatted`, `ajv`, `socket.io-parser`, `terser-webpack-plugin`, and `devalue`.
Commit: one commit only for this transitive cleanup batch.
Verification: rerun audit and confirm these advisories drop out without introducing new install or build issues.

6. Upgrade `svelte` from `5.50.1` to the current patched `5.54.x` line.
Commit: one commit only for the Svelte upgrade.
Verification: rerun audit, then do a focused smoke pass on SSR-sensitive and Svelte-rendered views.

7. Clean up the remaining low-severity build-tool chain centered on `@meteorjs/rspack`, `node-polyfill-webpack-plugin`, `crypto-browserify`, `elliptic`, and related tooling.
Commit: one commit only for the build-tool remediation.
Verification: rerun audit, then run build-oriented checks to confirm bundling and dev-server behavior still work.

## Suggested Commit Sequence
1. `chore(deps): upgrade underscore to 1.13.8`
2. `chore(deps): upgrade dompurify to 3.3.3`
3. `chore(deps): upgrade mturk aws sdk chain`
4. `chore(deps): upgrade meteor-node-stubs`
5. `chore(deps): refresh transitive security fixes`
6. `chore(deps): upgrade svelte to patched 5.54 line`
7. `chore(deps): remediate remaining rspack security advisories`

## Exit Criteria
- The 7 planned commits are complete.
- `npm audit` and `npm audit --omit=dev` both show materially reduced findings.
- Remaining alerts, if any, are documented with reason, owner, and next action.
