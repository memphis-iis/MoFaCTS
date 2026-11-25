# V2 application candidate and production scanner isolation

The application candidate accepts only `/internal/security-audits/v2`. The
existing three `admin.securityAudits.*` method names and admin role requirement
are unchanged. `/admin/security-audits` loads the V2 presentation. Its private
`security_audit_reports_v2` collection is separate from retained V1 records;
there is no V1 reader, collection registration or ingestion route in the
candidate. No database migration or record deletion accompanies activation.

This is source activation, not evidence that an image has been deployed or a
scanner has completed against it. The status ledger separately tracks native
Meteor proof, staging2 ingestion and candidate/previous/candidate qualification.
The operator approved replacing the five unidentified publication selections
with explicit progress-privacy cases. Their source-owned intent, successful
own-user baselines and six registered real-Mongo publication cases are verified;
live staging2 selected-case qualification still requires protected synthetic
bindings. See [authorization verification](authorization-verification.md).

Staging2 subsequently qualified the 1c72734b V2 image, matching protected receipt
and raw-measurement host wrapper on 2026-11-11. All 29 selected authorization
cases pass; both disposable fixture attempts are independently cleaned. A real
23-control exposure report was ingested and read/downloaded through the visible
admin UI. It contains 22 PASS and one honest UDP evidence-incomplete ERROR.
Live candidate/previous/candidate rollback preserved the exact accepted record
and JSON/HTML hashes; the previous V1 app could not read the V2 record.
Production and its scheduled scanner remain unchanged. See the
[staging2 operating procedure](staging2-v2-operations.md).

The current checkout now contains only V2 producer/assembly/ingestion entry
points. The ten superseded V1 scanner files and their duplicate control
tables are removed. Shared parsing, recovery-binding validation and crypto
utilities retain their actual V2/recovery owners; they are not V1 ingestion.
Phase 0 defect witnesses load the exact immutable V1 Git source in private
test-only temporary files. They cannot launch the old network/browser producers,
and cleanup removes their synthetic assembler support. This preserves historical
evidence without a maintained V1 runtime copy or old-report reader.
The production workflow still checks out its full reviewed historical source;
removing files from the current checkout does not alter that pinned execution.

## Production selection

Production has not been upgraded to this receiver. Its scheduled workflow
therefore checks out the reviewed V1 scanner commit
`09f0c32fc2af6d220c699dd805133df3c0507c2e`, verifies the exact checkout, and
identifies that checkout in its reports. Workflow commit identity and scanner
source identity are deliberately distinct. The production schedule, protected
environment, credentials and target are unchanged. Publishing this selection
does not dispatch a production scan or authorize application deployment.

The approved conditional scanner-isolation design owns this temporary pairing.
Do not introduce a dual-ingestion mode, translate V1 results into V2, point the
production scanner at staging2, or select the moving application branch.

## Selection, update and rollback

1. Retain the previous complete workflow and its exact scanner revision. Inspect
   the proposed commit's uploader, assembler and receiver contract with
   `git show <commit>:<path>` before selecting it. An existing Git object is not
   evidence that its scanner is qualified for a different receiver.
2. Update the checkout's full SHA and its runtime equality assertion together.
   Preserve the assembler's explicit checked-out `GITHUB_SHA` binding. Run
   `node --test scripts/security-audit/tests/productionScannerIsolation.test.mjs`
   from `mofacts/`. The regression checks the retained commit's real V1 files,
   rejects a moving reference, mismatched assertions and workflow-commit report
   identity, and exercises complete selection replacement/reversal.
3. Reverting a scanner selection restores the entire reviewed workflow change,
   including the checkout, equality assertion and report identity binding.
   Re-run the selection regression. Do not substitute the latest branch tip.
4. An actual production scanner dispatch or receiver deployment still requires
   production authorization. Coordinate their V2 switch only after staging2
   qualification and the source-owned authentication evidence are complete.

The regression proves selection and identity guards. It does not claim a live
production run or a qualified new scanner merely because a SHA was edited.
