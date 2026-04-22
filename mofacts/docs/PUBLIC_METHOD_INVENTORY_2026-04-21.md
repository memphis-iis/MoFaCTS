# Public Meteor Method Inventory Before First Formal Tag

Date: 2026-04-21

Scope: `C:\dev\mofacts\svelte-app\mofacts`

Branch audited: `Video-System-Upgrade`

Purpose: record the public DDP method surface before a first formal MoFaCTS version tag. This inventory is release-prep evidence, not an API stability promise.

## Registration Surfaces

Public Meteor methods are registered in two places:

1. `server/serverComposition.ts`
   - `Meteor.methods({...methods, ...asyncMethods})`
   - This is the modern app composition surface.
2. `server/turk_methods.ts`
   - Separate legacy MTurk methods registered with `Meteor.methods({...})`.

`serverComposition.ts` also keeps some server-only helper exports, for example `getHistoryByTDFID`, but this inventory only treats methods registered into `Meteor.methods` as public DDP methods.

## Access Class Legend

| Class | Meaning |
| --- | --- |
| `PUBLIC` | Callable without login. Must be intentionally public and rate-limited or otherwise abuse-resistant. |
| `AUTH_SELF` | Logged-in caller can only act on their own user record/state. |
| `OWNER` | Caller must own the target TDF, asset, course, or other record. |
| `ACCESSIBLE_TDF` | Caller must have canonical access to the target TDF/content context. |
| `TEACHER_ADMIN` | Caller must be a teacher or admin, sometimes further scoped to owned courses/experiments. |
| `ADMIN` | Admin-only. |
| `INTERNAL_ONLY` | Should not be registered as a public DDP method. |
| `NEEDS_WRAPPER` | Registered today, but should be wrapped, removed, projected, or otherwise tightened before a final tag. |

## Release-Blocking Findings From This Inventory

The method surface is much cleaner after the recent hardening passes, but the inventory still found a small set of methods that should block a final `v0.1.0` tag until resolved or explicitly accepted as public product behavior.

| Method or group | Current issue | Smallest pre-tag action |
| --- | --- | --- |
| `getExperimentState` | Registered as a raw helper that accepts `userId` from the client. Active clients pass `Meteor.userId()`, but the server should not trust that parameter for learner state reads. | Replace with a public wrapper that derives learner identity from `this.userId`; allow admin/teacher override only through an explicit relationship check. |
| `setExperimentState` | Registered directly and accepts `userId`, `TDFId`, and `experimentStateId`. It validates TDF access for the passed user id, not the authenticated method caller. | Remove from public registration if unused, or make it a wrapper that requires `this.userId` to match the state owner. Prefer `updateExperimentState`. |
| Raw learner analytics helpers | `getStudentPerformanceByIdAndTDFIdFromHistory`, `getStudentPerformanceForUnitFromHistory`, `getAssessmentCompletedTrialCountFromHistory`, `getVideoCompletedCheckpointQuestionCountFromHistory`, `getLearningHistoryForUnit`, `getHiddenStimulusKCsFromHistory`, and `getNumDroppedItemsByUserIDAndTDFId` accept arbitrary `userId`/`TDFId` and read learner history-derived data. Several are active client callers. | Add wrappers that derive the user id from `this.userId`, validate TDF access, and only allow teacher/admin cross-user reads through course/ownership relationship checks. |
| `getLastTDFAccessed`, `getUserRecentTDFs` | Registered raw user-id reads. `getLastTDFAccessed` has an active router caller. | Derive user id from `this.userId`; remove `getUserRecentTDFs` if no active caller remains. |
| `getUserIdforUsername` | Public username/email to user-id lookup with no auth or rate limit. No direct client caller was found in the audit grep. | Remove from `asyncMethods`, or restrict to admin/teacher workflows that need explicit user resolution. |
| `getTdfByExperimentTarget` | Public unauthenticated experiment-target lookup returns the full TDF. This may be acceptable only if experiment target is intentionally a bearer entry token and full entry content is public. | Prefer a projected `getExperimentEntryByTarget` response for pre-login routing/provisioning, then require login and canonical access for full TDF content. |

These are small, focused changes. They do not imply the app is generally unstable, but they are the remaining places where public DDP shape and authorization intent are still too implicit for a clean first formal tag.

## Modern Composition Inventory

### System And Operational Methods

| Method | Access class | Status |
| --- | --- | --- |
| `removeTurkById` | `AUTH_SELF` or `ADMIN` for cross-user | OK |
| `saveAudioSettings` | `AUTH_SELF` | OK |
| `setLockoutTimeStamp` | `AUTH_SELF` | OK |
| `getServerStatus` | `ADMIN` | OK |
| `sendErrorReportSummaries` | `ADMIN` | OK |
| `sendEmail` | `ADMIN` | OK |
| `sendUserErrorReport` | `AUTH_SELF` with capped payloads | OK, rate-limit later |
| `logUserAgentAndLoginTime` | `AUTH_SELF` | OK |
| `serverLog` | Authenticated, capped text | OK, rate-limit later |
| `debugLog` | Authenticated, capped text | OK, rate-limit later |
| `setVerbosity` | `ADMIN` | OK |
| `getVerbosity` | `ADMIN` | OK |
| `ensureClientVerbositySetting` | `ADMIN` | OK |
| `setClientVerbosity` | `ADMIN` | OK |
| `getUserPreference` | `AUTH_SELF` | OK |
| `setUserPreference` | `AUTH_SELF` | OK |

### Auth And Experiment Entry Methods

| Method | Access class | Status |
| --- | --- | --- |
| `getCurrentUserRoleFlags` | Public-safe current-caller flags | OK |
| `getAuthClientConfig` | `PUBLIC` config only | OK |
| `setUserLoginData` | `AUTH_SELF` | OK |
| `requestPasswordReset` | `PUBLIC`, rate-limited, non-enumerating | OK |
| `resetPasswordWithToken` | `PUBLIC`, rate-limited token flow | OK |
| `cleanupExpiredPasswordResetTokens` | `ADMIN` | OK |
| `signUpUser` | `PUBLIC` only when configured, rate-limited | OK |
| `populateSSOProfile` | `AUTH_SELF` or `ADMIN` | OK |
| `clearLoginData` | `AUTH_SELF` | OK |
| `getUserSpeechAPIKey` | `AUTH_SELF` | OK |
| `isUserSpeechAPIKeySetup` | `AUTH_SELF` metadata | OK |
| `hasUserPersonalKeys` | `AUTH_SELF` metadata | OK |
| `saveUserSpeechAPIKey` | `AUTH_SELF` | OK |
| `getTdfTTSAPIKey` | `ACCESSIBLE_TDF` | OK, long-term prefer server proxy |
| `getTdfSpeechAPIKey` | `ACCESSIBLE_TDF` | OK, long-term prefer server proxy |
| `setUserSessionId` | `AUTH_SELF` | OK |
| `recordSessionRevocation` | `AUTH_SELF` | OK |
| `getPasswordHashRuntimeInfo` | `ADMIN` | OK |
| `deleteUserSpeechAPIKey` | `AUTH_SELF` | OK |
| `resendVerificationEmail` | `PUBLIC`/current user, rate-limited and non-enumerating | OK |
| `getTdfByExperimentTarget` | `PUBLIC` experiment entry lookup | NEEDS_WRAPPER |
| `provisionExperimentUser` | `PUBLIC`, rate-limited experiment provisioning | OK |
| `getUserIdforUsername` | `INTERNAL_ONLY` or privileged user resolution | NEEDS_WRAPPER |

### TDF, Stimulus, And Derived Map Methods

| Method | Access class | Status |
| --- | --- | --- |
| `getTdfByFileName` | `ACCESSIBLE_TDF` | OK |
| `getTdfById` | `ACCESSIBLE_TDF` | OK |
| `getStimuliSetById` | `ACCESSIBLE_TDF` via associated TDF | OK |
| `getResponseKCMapForTdf` | `ACCESSIBLE_TDF` | OK |
| `getStimDisplayTypeMap` | Public derived boolean capability map | OK |
| `getStimDisplayTypeMapVersion` | Public derived version marker | OK |
| `updateStimDisplayTypeMap` | `ADMIN` | OK |

### Access Sharing Methods

| Method | Access class | Status |
| --- | --- | --- |
| `getAccessorsTDFID` | `OWNER` | OK |
| `getAccessors` | `OWNER` | OK, project fields later |
| `getAccessableTDFSForUser` | `AUTH_SELF` | OK |
| `getAssignableTDFSForUser` | `AUTH_SELF`, `TEACHER_ADMIN`, or `ADMIN` override | OK, project fields later |
| `resolveUsersForTdf` | `OWNER` | OK |
| `assignAccessors` | `OWNER` | OK |
| `transferDataOwnership` | `OWNER` | OK |

### Admin Methods

| Method | Access class | Status |
| --- | --- | --- |
| `adminCreateOrUpdateUser` | `ADMIN` | OK |
| `userAdminRoleChange` | `ADMIN` | OK |
| `userAdminDeleteUser` | `ADMIN` with blocking checks | OK |
| `deleteAllFiles` | `ADMIN` | OK |
| `insertNewUsers` | `ADMIN` | OK |

### Course, Class, And Instructor Methods

| Method | Access class | Status |
| --- | --- | --- |
| `getAllCourses` | `ADMIN` | OK |
| `getAllCourseSections` | Authenticated broad section discovery | OK if self-enrollment remains product policy |
| `getAllCoursesForInstructor` | Current teacher or `ADMIN` | OK |
| `getAllCourseAssignmentsForInstructor` | Current teacher or `ADMIN` | OK |
| `editCourseAssignments` | Course-owning teacher or `ADMIN` | OK |
| `getTdfAssignmentsByCourseIdMap` | Current teacher or `ADMIN` | OK |
| `getTdfsAssignedToStudent` | Current student, course teacher, or `ADMIN` | OK |
| `getTdfNamesAssignedByInstructor` | Current teacher or `ADMIN` | OK |
| `getAllTeachers` | Authenticated teacher directory | OK if class join UI needs it |
| `addCourse` | `TEACHER_ADMIN`, non-admin forced to self owner | OK |
| `editCourse` | Course-owning teacher or `ADMIN` | OK |
| `addUserToTeachersClass` | Authenticated self-enrollment into valid section | OK if product policy |
| `addUserDueDateException` | Course-owning teacher or `ADMIN` | OK |
| `checkForUserException` | `AUTH_SELF` or `ADMIN` | OK |
| `removeUserDueDateException` | Course-owning teacher or `ADMIN` | OK |

### Content Upload, Asset, And Export Methods

| Method | Access class | Status |
| --- | --- | --- |
| `getContentUploadSummariesForIds` | Authenticated `ACCESSIBLE_TDF` upload policy | OK |
| `getContentUploadListIds` | Authenticated owner/accessor list | OK |
| `listManualContentDrafts` | `AUTH_SELF` | OK |
| `getManualContentDraft` | `AUTH_SELF` owner | OK |
| `saveManualContentDraft` | `AUTH_SELF` owner | OK |
| `deleteManualContentDraft` | `AUTH_SELF` owner | OK |
| `getPackageDownloadLink` | `ACCESSIBLE_TDF` upload policy | OK |
| `getStimuliFileForTdf` | `ACCESSIBLE_TDF` upload policy | OK |
| `getUserAssetByName` | `AUTH_SELF` asset lookup | OK |
| `deletePackageFile` | Asset/TDF owner or `ADMIN` | OK |
| `removeAssetById` | Asset owner or `ADMIN` | OK |
| `removeMultipleAssets` | Asset owner or `ADMIN`, max 50 | OK |
| `auditPublicAssetsWithoutSharedTdf` | `ADMIN` | OK |
| `toggleTdfPresence` | `ADMIN` | OK |
| `getTdfOwnersMap` | Authenticated, scoped to accessible owner ids or `ADMIN` | OK |
| `getTdfsByOwnerId` | Owner or `ADMIN`, projected | OK |
| `getUploadQuotaStatus` | `AUTH_SELF` | OK |
| `setTdfUserSelect` | `OWNER` | OK |
| `processPackageUpload` | Authenticated uploader; package asset owner or `ADMIN`; quota path for non-teacher uploaders | OK |
| `saveContentFile` | `TEACHER_ADMIN`, non-admin owner only | OK |
| `tdfUpdateConfirmed` | Existing TDF manager or owner/admin for new pending update | OK |
| `saveTdfStimuli` | TDF manager | OK |
| `saveTdfContent` | TDF manager | OK |
| `copyTdf` | Owner, accessor, or `ADMIN` | OK |

### Theme Methods

| Method | Access class | Status |
| --- | --- | --- |
| `initializeCustomTheme` | `ADMIN` | OK |
| `setCustomThemeProperty` | `ADMIN` | OK |
| `generateFaviconsFromLogo` | `ADMIN` | OK, payload cap later |
| `toggleCustomTheme` | `ADMIN` | OK |
| `createThemeFromBase` | `ADMIN` | OK |
| `duplicateTheme` | `ADMIN` | OK |
| `importThemeFile` | `ADMIN` | OK |
| `exportThemeFile` | `ADMIN` | OK |
| `deleteTheme` | `ADMIN` | OK |
| `renameTheme` | `ADMIN` | OK |
| `setActiveTheme` | `ADMIN` | OK |
| `setCustomHelpPage` | `ADMIN` | OK |
| `getCustomHelpPage` | `PUBLIC` read of active help content | OK |
| `removeCustomHelpPage` | `ADMIN` | OK |
| `getCustomHelpPageStatus` | `PUBLIC` read of active help metadata | OK |

### Analytics, History, And Learner State Methods

| Method | Access class | Status |
| --- | --- | --- |
| `createExperimentState` | `AUTH_SELF` plus TDF access validation | OK |
| `getClassPerformanceByTDF` | Course-owning teacher or `ADMIN` | OK |
| `getStudentPerformanceByIdAndTDFIdFromHistory` | Should be `AUTH_SELF`/relationship-scoped | NEEDS_WRAPPER |
| `getStudentPerformanceForUnitFromHistory` | Should be `AUTH_SELF`/relationship-scoped | NEEDS_WRAPPER |
| `getAssessmentCompletedTrialCountFromHistory` | Should be `AUTH_SELF`/relationship-scoped | NEEDS_WRAPPER |
| `getVideoCompletedCheckpointQuestionCountFromHistory` | Should be `AUTH_SELF`/relationship-scoped | NEEDS_WRAPPER |
| `getLearningHistoryForUnit` | Should be `AUTH_SELF`/relationship-scoped | NEEDS_WRAPPER |
| `getHiddenStimulusKCsFromHistory` | Should be `AUTH_SELF`/relationship-scoped | NEEDS_WRAPPER |
| `getNumDroppedItemsByUserIDAndTDFId` | Should be `AUTH_SELF`/relationship-scoped | NEEDS_WRAPPER |
| `getStudentPerformanceForClassAndTdfId` | Current instructor or `ADMIN` | OK |
| `getExperimentState` | Should be `AUTH_SELF` or relationship-scoped | NEEDS_WRAPPER |
| `setExperimentState` | Should be `INTERNAL_ONLY` or `AUTH_SELF` wrapper | NEEDS_WRAPPER |
| `getLastTDFAccessed` | Should be `AUTH_SELF` | NEEDS_WRAPPER |
| `insertHistory` | `AUTH_SELF` plus TDF access validation | OK |
| `getUserRecentTDFs` | Should be `AUTH_SELF` or removed | NEEDS_WRAPPER |
| `getLearnerProgressSignals` | `AUTH_SELF`, `TEACHER_ADMIN`, or `ADMIN` | OK |
| `updateExperimentState` | `AUTH_SELF` plus TDF access validation | OK |
| `getOutcomesForAdaptiveLearning` | `AUTH_SELF` or `ADMIN` | OK |
| `downloadDataByTeacher` | `AUTH_SELF` or `ADMIN` | OK |
| `downloadDataByClass` | Authenticated but intentionally denied | OK |
| `downloadDataByFile` | Owner raw data export | OK |
| `downloadDataById` | Owner raw data export | OK |
| `updateTdfConditionCounts` | `AUTH_SELF` plus TDF access validation | OK |
| `resetTdfConditionCounts` | TDF owner or `ADMIN` | OK |

### Dashboard Cache Methods

| Method | Access class | Status |
| --- | --- | --- |
| `initializeDashboardCache` | `AUTH_SELF` or `ADMIN` for another user | OK |
| `updateDashboardCacheForTdf` | `AUTH_SELF` current-user cache | OK, TDF access validation later |
| `refreshDashboardCache` | `AUTH_SELF` | OK |
| `removeTdfFromCache` | `ADMIN` | OK |

### Speech Methods

| Method | Access class | Status |
| --- | --- | --- |
| `makeGoogleTTSApiCall` | `ACCESSIBLE_TDF` or user personal key path | OK, long-term prefer server-side speech proxy policy |
| `makeGoogleSpeechAPICall` | `ACCESSIBLE_TDF` or user personal key path | OK, long-term prefer server-side speech proxy policy |

### Modern MTurk Workflow Methods

| Method | Access class | Status |
| --- | --- | --- |
| `getTurkWorkflowExperiments` | `TEACHER_ADMIN`, non-admin scoped to owned experiments | OK |
| `getUsersByExperimentId` | Experiment owner or `ADMIN` | OK |
| `saveUserAWSData` | `TEACHER_ADMIN` current user, encrypted credential write | OK |

## Legacy MTurk Method Inventory

These remain in `server/turk_methods.ts`. They are still part of the public method table and should be treated as release-relevant even though they are legacy.

| Method | Access class | Status |
| --- | --- | --- |
| `turkGetAssignment` | `TEACHER_ADMIN`, current user's AWS profile | OK |
| `turkSendMessage` | `TEACHER_ADMIN`, current user's AWS profile | OK |
| `turkScheduleLockoutMessage` | `ADMIN`, experiment owner, or matching experiment participant | OK |
| `turkPay` | `TEACHER_ADMIN` and owner of experiment TDF | OK |
| `turkBonus` | `TEACHER_ADMIN` and owner of experiment TDF | OK |
| `turkUserLogStatus` | Experiment owner or `ADMIN` | OK |
| `turkTest` | `ADMIN` | OK |

## Methods Removed From Public Registration During Hardening

These are intentionally not in the public method inventory now:

- `getStimuliSetByFileName`
- `getMaxResponseKC`
- `getHistoryByTDFID`
- `getStimSetFromLearningSessionByClusterList`
- `getUserLastFeedbackTypeFromHistory`
- `getSourceSentences`
- `checkForTDFData`
- `getTdfNamesByOwnerId`
- `resolveAssignedRootTdfIdsForUser`

## Pre-Tag Remediation Checklist From This Inventory

1. Replace or remove raw public analytics/state methods flagged `NEEDS_WRAPPER`.
2. Remove or restrict `getUserIdforUsername`.
3. Replace `getTdfByExperimentTarget` full-TDF public response with a minimal public experiment-entry response, unless the project explicitly accepts experiment target as bearer access to the full entry TDF.
4. Add negative tests for the new wrappers:
   - caller cannot read another learner's experiment state,
   - caller cannot read another learner's unit history/progress helpers,
   - caller cannot resolve arbitrary username/email to user id,
   - unauthenticated experiment target lookup returns only the intended projected entry data.
5. After those changes, rerun:
   - `npm run knip`
   - `npm run typecheck`
   - `npm run lint`

## Release Judgment

After this inventory, the first formal tag should wait for one more focused method-surface patch. The remaining work is not broad architectural churn; it is mostly replacing raw registered analytics helpers with caller-derived wrappers and removing one likely-unused public user lookup helper.

Once those are resolved and canonical Docker build/deploy verification is recorded, the public method surface should be reasonable for a `v0.1.0` release candidate.
