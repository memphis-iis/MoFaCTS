# Inline Message Placement and Width Standardization Plan

Status: Implementation ledger
Implementation status: Planned source migration implemented; final verification waived by the user
Date: 2026-07-17
Scope: Non-practice user, teacher, content-management, reporting, and system-administration interfaces

## Objective

Make result, warning, confirmation, and error messages appear within the same meaningful UI container as the control that produced them. When feedback appears in a table, prevent it from making a cell or column unreasonably wide; use an approximate maximum inline width of 400 pixels.

This plan covers the current working-tree implementation. Practice screens and the practice runtime are explicitly excluded.

## Non-Goals and Invariants

- Do not change server method signatures, database documents, publications, authorization, or persistence contracts.
- Do not add a new npm, Meteor, or system dependency.
- Do not create a second compatibility message path. Once a command is migrated, remove its write to the old page-global state.
- Do not turn page-load failures into command feedback or command failures into page-load failures.
- Do not change successful command behavior, navigation, or business rules except where replacing native `alert()` with owned inline feedback requires preserving the error across a redirect.
- Preserve existing localization keys when their meaning remains correct. Add keys only when one formerly generic message must be split into genuinely different command-specific copy.
- Preserve current authorization boundaries. A locally displayed message is not an authorization control.
- Do not auto-dismiss error messages. Success messages may retain an existing timeout, but the shared implementation must not introduce a new universal timeout.
- Do not put raw user identifiers, email addresses, or arbitrary message text into DOM IDs. Use stable database IDs or a sanitized opaque scope suffix.
- Keep public documentation unchanged unless implementation alters a user workflow. This plan is the implementation ledger for the internal UI migration.

## Placement Contract

1. Page-load failures belong to the page or card being loaded.
2. Form validation belongs beside the affected field or within that form's action region.
3. Button results belong inside the button's logical command region.
4. Repeated row/card actions use feedback keyed by a stable record identifier.
5. Confirmations render beside the action that opened them, not in a page-global confirmation slot.
6. `Session.uiMessage` is reserved for genuinely application-wide conditions.
7. Table feedback uses a bounded inner wrapper or a companion detail row. It must not rely on `max-width` applied only to a table cell.
8. Feedback remains keyboard accessible, screen-reader announced, localized, and associated with its trigger using stable IDs and `aria-describedby` where appropriate.

### Width decision: the 400px limit is table-only

The approximate 400px/25rem maximum is not a general inline-message width. It applies only when feedback is rendered inside table markup and could influence a table cell or column's intrinsic width. This includes:

- feedback inside an ordinary data cell or Actions cell;
- feedback inside a companion detail row's spanning cell;
- result/error text in an intentional Message column; and
- an inline confirmation rendered within any of those table locations.

Use `.admin-table-feedback` for those cases. Ordinary messages and confirmations in forms, cards, toolbars, page headers, dropdowns, editor panels, and wizard steps use their owning container's natural width. They must remain within `max-inline-size: 100%`, but they must not receive the special 25rem/400px maximum.

If the responsive implementation has separate mobile card markup, render its feedback with `.admin-inline-feedback`, not `.admin-table-feedback`. If the same table DOM is visually transformed into cards, `min(100%, 25rem)` remains safe because the feedback cannot exceed the narrower card; a page may explicitly restore `max-inline-size: 100%` at its card breakpoint if the card is wider than 25rem and full-width feedback is intended.

## Audit Findings

### User and account surfaces

| Surface | Current placement problem | Intended owner |
| --- | --- | --- |
| Account menu | Locale and theme failures escape the account menu and render in the shell-global message. | Locale or theme control group inside the account menu. |
| Profile | Profile-save, locale, and avatar results render inside the unrelated AI Provider card. | Private-account region, avatar region, AI Provider region, or shared Save action region according to the command. |
| Audio Settings | One template-top message handles TTS, speech-recognition, and API-key commands from separate cards. | Separate TTS, speech-input, and API-key feedback regions. |
| Courses | Course Join and assignment-launch failures share the page-load error above all course rows/cards. | The affected course or assignment row/card. |
| Home dashboard | Configuration warnings, reset success, audio/startup failures, start failures, and completed-lesson warnings render in the shell-global message. One lesson-load failure uses native `alert()`. | The affected lesson row/card or learner-configuration panel. |
| Sign in | Provider-login failures and disabled-signup feedback appear at the card top instead of in the secondary provider-action region. | Provider/supporting action region. |
| Forgot/reset password | Missing email, password mismatch, short password, and related errors render at the card top. | The affected field or password form action region. |
| Verify email | Resend validation and results render in the page-entry status region. | Resend email field/button region. |

### Teacher, reporting, and content surfaces

| Surface | Current placement problem | Intended owner |
| --- | --- | --- |
| Course editor | Save/delete feedback renders before the editor card. | Editor action region. |
| Instructor Reporting | Student navigation errors, missing exception-date validation, and per-student exception results render above every reporting section. | Date field and affected student row. |
| Data Download | Own-history, owned-data aggregate, and per-TDF downloads share one page-top status. | Corresponding download card or TDF row. |
| Content manager | The package-upload message also reports asset-row, media, popup, download, reset, and administration operations. | Package upload card, affected TDF row, media region, or administration danger region. |
| Content editor | One page-top message handles toolbar operations, Save failures, and field-level media errors. Validation summary is outside the editor card. | Toolbar, Save bar, affected media field, and editor card respectively. |
| TDF editor | Save warnings/errors and OpenRouter model-catalog failure render above the editor. | Save action bar and affected OpenRouter field region. |
| SPARC editor | A header error receives Save errors plus rich-text, node, drag/drop, and rule-editor failures. Delete confirmation renders between the header and editor instead of in the selected-node card. | Save actions or the affected editor card/control. |
| Manual Content Creator | Draft status is outside the header action region. One root confirmation handles both draft deletion and a Step 5 upload-overwrite prompt. | Draft action region or Step 5 upload region. |
| APKG wizard | A global message and confirmation precede all steps while serving commands throughout the wizard. | Active step and command region. |

### System-administration surfaces

| Surface | Current placement problem | Intended owner |
| --- | --- | --- |
| Admin Control Panel | Display-cache and verbosity feedback renders before all cards; server-storage failure is also duplicated globally. | Display-cache, server-verbosity, or client-verbosity card. |
| Backups | Create and row actions share a page-top message. Confirmation is after all cards, and manifest output is detached into a later section. | Create card or affected backup-history row/detail region. |
| User Administration | Role, deletion, and import results share the page-top message. One API-key message is shared above all providers. | Affected user row, import card, or provider group. |
| Mechanical Turk | Experiment-log, remove-user, send-message, and per-row payment feedback share one global message. | Corresponding select/form/row region. |
| Theme Management | Theme-library, property, underlay, logo, and help-file operations share page-top message/confirmation regions. | Affected theme row, property group, branding group, or help-file group. |
| Theme Generation Wizard | Palette, JSON, Paste, Add Color, Preview, and Create commands reuse messages in other command regions. | The control group that initiated the command. |

### Strict-container borderline cases

These remain inside a plausible logical card but not inside the immediate command region:

- Class Selection feedback above the selector/button row.
- TDF Assignment feedback above the editor contents and Save bar.
- Profile OpenRouter test/delete feedback with buttons in the shared page footer.
- Sign-up and primary password sign-in form summaries above their forms.
- User Administration Usage Refresh and News Email feedback below, but outside, their button clusters.
- Direct class-invitation failures that use native alerts but have no originating on-page control.

### Surfaces without a definite placement defect

- AI Content Creator
- IMSCC Wizard
- Help
- Administration Tests command cards

Administration Tests still has a table-width defect described below.

## Table-Width Findings

### User Administration

The Delete User confirmation is inside an Actions cell. The table uses max-content/auto layout, and its body cells inherit `white-space: nowrap`, `overflow-wrap: normal`, and `word-break: normal`. The shared confirmation has no maximum inline size or wrapping override. The full confirmation can therefore determine the action-column width.

### Administration Tests

The SPARC and deployment-readiness tables render unrestricted result/error text directly in Message cells. The tables use generic auto layout and have no bounded Message column or inner feedback wrapper.

### Content Upload

Pending/error text, media confirmations, access results, and action confirmations appear inside the outer content table. The table uses auto layout at some viewport widths. An intended 220-pixel confirmation rule targets a direct child, but the confirmation is nested inside another wrapper and does not match that selector.

### Instructor Reporting

Arbitrary performance-load error text appears in a spanning cell of an auto-layout table without a bounded inner wrapper.

### Existing compliant width behavior

Data Download uses fixed table layout, 100% width, word breaking, and overflow containment. Courses/dashboard tables also use fixed-layout or full-width detail regions. These should not be replaced with a less explicit global table rule.

## Shared Implementation Design

### Owning files

The shared implementation belongs in the existing administration UI modules:

| Concern | Owning file |
| --- | --- |
| Status and confirmation Blaze markup | `mofacts/client/views/shared/adminUi/adminUi.html` |
| Status/confirmation presentation helpers | `mofacts/client/views/shared/adminUi/adminUi.ts` |
| Shared feedback and table CSS | `mofacts/client/views/shared/adminUi/adminUi.css` |
| Single-command lifecycle | `mofacts/client/lib/adminUi/asyncCommandState.ts` |
| Confirmation lifecycle and focus return | `mofacts/client/lib/adminUi/inlineConfirmationController.ts` |
| New repeated-scope command registry | `mofacts/client/lib/adminUi/scopedAsyncCommandRegistry.ts` |
| Unit tests for the registry | `mofacts/client/lib/adminUi/scopedAsyncCommandRegistry.test.ts` |
| Source-level management UI characterization | `mofacts/server/lib/managementInterfaceBaseline.test.ts` or a focused sibling `inlineFeedbackBaseline.test.ts` |

Do not put shared UI state in `methods.ts`, a collection, or a global `Session` key.

### Reuse existing primitives

Continue using:

- `adminStatus` for visual variants and live-region semantics.
- `adminInlineConfirmation` and `InlineConfirmationController` for confirmation lifecycle and focus return.
- `adminTableShell` as the horizontal-overflow safety boundary.
- `AsyncCommandState` / `AsyncCommandController` for pending, success, failure, and stale-command protection.

Do not keep a legacy page-global message channel in parallel after a surface is migrated.

### `adminStatus` data contract

Add and export a typed presentation contract from `adminUi.ts`:

```ts
export type AdminStatusTemplateData = Readonly<{
  id?: string;
  className?: string;
  variant?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  text: string;
  urgent?: boolean;
}>;
```

Update `adminUi.html` so the root element receives optional normalized ID attributes and an extra class:

```html
<div
  {{statusIdAttrs}}
  class="admin-status admin-status-{{statusVariant}} {{statusClassName}}"
  role="{{statusRole}}"
  aria-live="{{statusLive}}"
  aria-atomic="true">
```

Implementation requirements:

- `statusIdAttrs` returns `{ id }` only for a non-empty string; otherwise it returns `{}`.
- `statusClassName` returns the supplied internal class string or `''`.
- Existing callers that pass only `variant`, `text`, and `urgent` must render unchanged.
- Newly appearing errors use `role="alert"` / `aria-live="assertive"`; pending, informational, and success messages use `role="status"` / `aria-live="polite"`.
- Do not move focus to a status message. For field validation, focus the first invalid control and associate the message using `aria-describedby` and `aria-invalid`.

### Repeated-scope registry contract

Repeated rows need one reusable registry rather than a different ad hoc `ReactiveVar<Record<...>>` implementation on every page. Add `scopedAsyncCommandRegistry.ts` as a thin owner of existing `AsyncCommandController` instances; do not duplicate the command state machine.

```ts
export type ScopedAsyncCommandRegistry<TResult> = Readonly<{
  getState(scope: string): AsyncCommandState<TResult>;
  run(
    scope: string,
    work: () => Promise<TResult>,
    options?: AsyncCommandRunOptions<TResult>,
  ): Promise<boolean>;
  reset(scope: string): void;
  remove(scope: string): void;
  destroy(): void;
}>;

export function createScopedAsyncCommandRegistry<TResult>(
  onStateChange: (scope: string, state: AsyncCommandState<TResult>) => void,
): ScopedAsyncCommandRegistry<TResult>;
```

Registry behavior is fixed as follows:

- Trim and reject an empty scope.
- Lazily create one `AsyncCommandController` per scope.
- Block a second command only when the same scope is pending; different scopes may run concurrently.
- Delegate stale-completion protection and error normalization to `AsyncCommandController`.
- `reset(scope)` retains the controller but publishes `idle`; it must retain the existing rule that a pending command cannot be reset.
- `remove(scope)` destroys and deletes that controller. Use it when a row disappears.
- `destroy()` destroys every controller and prevents future runs. Call it from the owning Blaze template's `onDestroyed` or the Svelte component's `onDestroy`.
- The registry does not own localization or convert successful results into strings. Each surface maps `AsyncCommandState` to its localized `AdminStatusTemplateData`.

Implement the registry: Courses, Backups, User Administration, Content Upload, Instructor Reporting, Mechanical Turk, and Theme all require repeated, independently keyed command state. Do not replace it with seven surface-specific registries.

### Scope command state

Each command should have a stable feedback scope. Examples:

```text
profile:avatar
profile:save
audio:tts
audio:speech-input
audio:speech-api-key
backup:verify:<backup-id>
user:role:<user-id>
content:media:<tdf-id>
course:join:<course-id>
lesson:launch:<tdf-id>
```

For a single command, use a dedicated `AsyncCommandController`. For repeated rows/cards, store feedback by scope or by `{ action, recordId }` and expose a helper such as `feedbackFor(action, recordId)`.

Separate load state from command state. A page's `loadError` must not double as its row-action error.

### Scope and lifecycle rules

- Scope format is `<surface>:<action>[:<stable-id>]` in lowercase kebab-case.
- Construct scopes in one helper per surface; do not concatenate them independently in handlers and templates.
- A new run clears only the previous result for the same scope.
- A successful command replaces pending state with success in the same region.
- A failed command replaces pending state with error in the same region.
- Input changes may clear field validation for that field, but they must not clear unrelated command feedback.
- Navigation or template destruction clears all template-owned feedback.
- Removing a row removes its registry scope(s).
- Do not add automatic global cleanup timers. Preserve an existing command-specific timeout only if it is already part of the behavior and is canceled during destruction.
- When one button initiates a redirect, show feedback locally if the page remains mounted. If the failure occurs after redirect, carry a typed route result to the destination rather than falling back to native `alert()` or `Session.uiMessage`.
- For confirmation flows, keep the confirmation open and mark it pending during the destructive command. On failure, clear pending, keep focus within the confirmation, and render the error in the same local region. On success, close it and return focus unless the row or route no longer exists.

### Standard command markup

Use a predictable local container:

```html
<div class="admin-command-region">
  <button
    type="button"
    {{avatarFeedbackDescriptionAttrs}}>
    Save avatar
  </button>

  {{#if avatarFeedback}}
    {{> adminStatus
        id="profile-avatar-feedback"
        class="admin-inline-feedback"
        variant=avatarFeedback.variant
        text=avatarFeedback.text
        urgent=avatarFeedback.urgent}}
  {{/if}}
</div>
```

`avatarFeedbackDescriptionAttrs` returns `{ 'aria-describedby': 'profile-avatar-feedback' }` only while that feedback is rendered; otherwise it returns `{}`. Follow this conditional-attribute pattern for result feedback, `aria-controls`, and `aria-expanded` so controls do not point at absent elements.

`adminStatus` will need optional `id` and extra-class inputs. Existing callers can remain unchanged while surfaces are migrated.

### Standard repeated-row markup

For short feedback that naturally fits beneath row actions, use a companion detail row:

```html
<tr>
  <!-- Normal record cells and action buttons. -->
</tr>
{{#with feedbackFor "role" _id}}
<tr class="admin-feedback-row">
  <td colspan="{{columnCount}}">
    <div class="admin-table-feedback">
      {{> adminStatus variant=variant text=text urgent=urgent}}
    </div>
  </td>
</tr>
{{/with}}
```

This keeps the message associated with its record without forcing it into a narrow Actions cell. The corresponding mobile/card rendering should place the same keyed feedback directly below that card's actions.

Where a Message column is intentional, give the column an explicit width contract and still wrap the message in `.admin-table-feedback`.

### General containment and table-only width utility

Add general containment for normal inline feedback, plus a separate table-only maximum:

```css
.admin-inline-feedback {
  max-inline-size: 100%;
  min-inline-size: 0;
  white-space: normal;
  overflow-wrap: anywhere;
}

.admin-inline-confirmation {
  max-inline-size: 100%;
  min-inline-size: 0;
  white-space: normal;
  overflow-wrap: anywhere;
}

.admin-table-feedback {
  display: block;
  inline-size: fit-content;
  max-inline-size: min(100%, 25rem); /* approximately 400px */
  min-inline-size: 0;
  white-space: normal;
  overflow-wrap: anywhere;
}

.admin-table-feedback > .admin-status,
.admin-table-feedback > .admin-inline-confirmation {
  max-inline-size: 100%;
}

.admin-feedback-row > td {
  white-space: normal;
}

.admin-table-message-column {
  inline-size: 25rem;
}
```

The 25rem declaration belongs only to `.admin-table-feedback` and the intentional table Message-column contract. The table-specific utility must override inherited nowrap behavior where necessary. Keep `adminTableShell` horizontal scrolling as a final safety boundary, not as the primary width policy.

Use the shared 25rem value consistently for feedback that remains inside table markup rather than retaining page-specific 220px/320px/34rem table-feedback limits without a documented reason. Do not replace legitimate non-table card/form widths with 25rem. If a table region legitimately needs a smaller value, apply both `.admin-table-feedback` and a page-specific modifier.

### Confirmation placement

Use the existing confirmation controller's context to carry a scope/placement key. Render `adminInlineConfirmation` only at the matching local slot. When that slot is in a table, wrap the confirmation in `.admin-table-feedback`; outside tables, do not apply the 25rem limit. Content Upload's placement-aware confirmation helpers are the closest current example, though its action-cell width selector must be corrected.

The controller remains single-open-confirmation per page unless the page already supports multiple simultaneous independent confirmations. The context shape should include the information needed to locate the render slot without parsing the confirmation ID:

```ts
type ScopedConfirmationContext = Readonly<{
  placement: 'card' | 'row' | 'field' | 'toolbar';
  action: string;
  recordId?: string;
}>;
```

Templates expose explicit predicates such as `confirmationFor('delete', _id)` rather than comparing translated titles or message text.

## File-Level Migration Matrix

The following table is the implementation checklist. “Remove” identifies the old state/write path that must disappear for the listed commands; page-load uses of the same variable may be retained only if renamed to make that ownership explicit.

| Surface | Files | Add/split state and local render slots | Remove or narrow |
| --- | --- | --- | --- |
| Account menu | `client/views/home/home.html`, `home.ts`, `home.css`; shell host in `client/index.html` | `account:locale` and `account:theme` feedback inside their dropdown control groups. | Locale/theme writes to `Session.uiMessage`; keep shell message only for application-wide events. |
| Profile | `client/views/profile/profile.html`, `profile.ts`, `profile.css` | `profile:save` in `.profile-actions`; `profile:avatar` under avatar controls; `profile:locale` under locale field; `profile:openrouter` inside AI card. Move Test/Delete buttons into the AI card or add a distinct AI action region there. | Shared `statusMessage` as owner of unrelated commands. Keep OpenRouter catalog load status local to its model field. |
| Audio Settings | `client/views/audioSettings.html`, `audioSettings.ts`, `audioSettings.css` | Dedicated `audio:tts`, `audio:speech-input`, and `audio:speech-api-key` regions. Keep initial `loadState` at page boundary. | Template-top command message writes. |
| Courses | `client/views/home/courses.html`, `courses.ts`, `courses.css` | Keep `loadError`; add `course:join:<course-id>` and `course:launch:<assignment-id>` keyed feedback after the affected table row and below mobile card actions. | Row commands writing `errorMessage`. |
| Learning dashboard | `client/views/home/learningDashboard.html`, `.ts`, `.css` | `lesson:launch:<tdf-id>` after lesson row/card; `lesson:config:<tdf-id>` and reset result inside learner configuration panel. | Dashboard command writes to `Session.uiMessage`; native `alert()` for lesson-load failure. |
| Sign in | `client/views/login/signIn.html`, `signIn.ts`, auth stylesheet | Preserve field messages; add `signin:primary` inside primary form and `signin:provider` inside secondary actions. | Provider and disabled-signup writes to the card-top server message. |
| Forgot/reset password | `client/views/login/resetPassword.html`, `resetPassword.ts` | Email-required error beside email; mismatch/length errors beside password fields; token/server result inside the active form action region. | Field validation routed only through the card-top status. |
| Verify email | `client/views/login/verifyEmail.html`, `verifyEmail.ts` | Keep token-verification page status; add `verify-email:resend` inside resend form. | Resend writes to page-entry status. |
| Class Selection | `client/views/home/classSelection.html`, `classSelection.ts` | Move feedback into the selector/button command row. | Card-top command status. |
| Course editor | `client/views/experimentSetup/classEdit.html`, `.ts`, `.css` | Keep load error outside card if it prevents the card loading; add `class-edit:save` and `class-edit:delete` to editor actions. | `classEditMessage` as the shared command owner. |
| Instructor Reporting | `client/views/experimentReporting/instructorReporting.html`, `.ts`, `.css` | `reporting:exception-date` beside date input; `reporting:exception:<user-id>` and `reporting:navigate:<user-id>` in a companion row/card region; bounded load error inside table shell. | Row/navigation writes to `reportingMessage`; duplicate page-top performance error. |
| Data Download | `client/views/experimentReporting/dataDownload.html`, `.ts` | Keep page load state; add `download:history`, `download:owned`, and `download:tdf:<tdf-id>` local regions. Preserve fixed table layout. | Action writes to page-level `downloadMessage`; duplicate table/page load error presentation. |
| Content manager | `client/views/experimentSetup/contentUpload.html`, `.ts`, `.css` | Keep `uploadMessage` only for package upload. Add keyed `content:asset:<tdf-id>`, `content:media:<tdf-id>`, and `content:access:<tdf-id>` plus `content:admin-delete-all`. Render action confirmation in a companion row; retain mobile card placement. | Asset/media/admin writes to `setUploadMessage`; obsolete direct-child confirmation-width selector. |
| Content editor | `client/views/experimentSetup/contentEdit.html`, `.ts`, `.css` | `content-edit:toolbar` in toolbar; `content-edit:save` in Save bar; validation summary inside editor card; field media error beside enhanced field. | Multipurpose page-top `editorMessage` for those commands. Retain a separately named initialization error if needed. |
| TDF editor | `client/views/experimentSetup/tdfEdit.html`, `.ts`, `.css` | `tdf-edit:save` in action bar; validation summary inside editor card; inject OpenRouter catalog feedback adjacent to the generated model control. | Save/catalog writes to page-top `editorMessage`; retain distinct editor-initialization failure. |
| TDF Assignment | `client/views/experimentSetup/tdfAssignmentEdit.html`, `.ts`, `.css` | Split course/picker load error from `assignment:save` validation/server feedback in Save bar. | One `editorError` serving load and Save. |
| SPARC editor | `client/views/experimentSetup/sparc/SparcAuthoringEditor.svelte`, `SparcAuthoringHeader.svelte`, `SparcSelectedNodeCard.svelte`, `SparcVisualEditorTab.svelte`, relevant rule cards/styles | Header owns Save only; selected-node card owns node/delete; visual tab owns palette/drop/rich-text; rule card owns JSON/rule errors. Render delete confirmation in selected-node card via props/context. | Shared `errorText` for unrelated editor actions; shell-level delete confirmation. |
| Manual Content Creator | `client/views/experimentSetup/manualContentCreator.html`, `.ts`, `.css` | `manual:draft` status/confirmation inside header action region; `manual:upload` confirmation/status inside Step 5. | Root-level draft status and multipurpose confirmation slot. |
| APKG wizard | `client/views/experimentSetup/apkgWizard.html`, `.ts`, `.css` | Command state keyed by wizard step/action; confirmation rendered in active step. Keep analysis/config/generation/upload statuses already local. | Global wizard message/confirmation for step-specific commands. |
| Admin Control Panel | `client/views/adminControls.html`, `.ts`, `.css` | Keep `admin-controls:load`; add cache, server-verbosity, and client-verbosity regions in their cards. | Command writes to `adminMessage`; duplicate server-storage error. |
| Backups | `client/views/adminBackups.html`, `.ts`, `.css` | `backup:create` in create card; keyed verify/manifest/download/restore/delete feedback in backup row/detail region; confirmation placed in affected row. Manifest details expand below the affected row. | Page-top `backupMessage` for commands; bottom-of-page confirmation and detached manifest section. |
| User Administration | `client/views/userAdmin.html`, `.ts`, page rules in `public/styles/classic.css` | `user:role:<id>` and `user:delete:<id>` companion rows; `user:import` in import card; provider-specific API feedback; separate usage/news toolbar feedback scopes. | Page-top `adminMessage`; shared provider `apiKeyMessage`; confirmation inside nowrap action cell. |
| Mechanical Turk | `client/views/turkWorkflow.html`, `.ts`, `.css` | Experiment-log, remove-user, send-message, approve/pay, and bonus scopes in their owning form/row. Preserve already-local AWS and assignment lookup feedback. | Corresponding writes to `turkWorkflowMessage`. |
| Theme Management | `client/views/theme.html`, `.ts`, `.css` | Theme-row scopes; library import/export/reset scope; property-group scope; underlay/logo/help scopes. Render confirmations inside theme row or branding/help group. | Page-top `themeMessage` and global confirmation for these commands. |
| Theme Generation Wizard | `client/views/themeGenerationWizard.html`, `.ts`, `.css` | Palette, JSON, Paste, Add Color, Preview, and Create each report inside their control group. | Cross-group `wizardError` / `wizardStatus` reuse. |
| Administration Tests width | `client/views/testRunner.html`, `.ts`, applicable stylesheet/shared CSS | Wrap both Message-cell values in `.admin-table-feedback`; apply `.admin-table-message-column` to the Message columns. Command-card placement remains unchanged. | Unbounded raw message text in cells. |

Paths in this matrix are relative to `mofacts/` unless prefixed otherwise.

## Table-Specific Implementation Decisions

### User Administration

- Move Delete User confirmation out of the Actions cell into a companion `<tr>` immediately following that user.
- Render role-change and deletion pending/result/error in that same companion row, keyed separately so one action cannot overwrite the other.
- The companion row spans the current visible column count and contains a `.admin-table-feedback` wrapper.
- Keep action buttons in the normal row; connect the active button to the feedback/confirmation ID using `aria-controls` and `aria-expanded` for confirmation, and `aria-describedby` for result feedback.
- Update both desktop table and any responsive/mobile representation from the same keyed state.
- Remove the `nowrap` dependency from feedback descendants without changing nowrap on identifiers and compact action buttons.

### Administration Tests

- Keep the Message column because message text is a core result, not transient row-action feedback.
- Add a Message `<col>`/class with a 25rem preferred width and wrap its contents in `.admin-table-feedback`.
- Do not truncate or ellipsize errors; wrap with `overflow-wrap: anywhere` so traces remain inspectable.
- Keep `adminTableShell` scrolling for viewports where all explicit columns cannot fit.

### Content Upload

- Pending/asset errors and access feedback remain in the TDF summary region but gain the bounded feedback wrapper.
- Media confirmation remains inside the expanded table-cell media region and is wrapped by `.admin-table-feedback` to gain the table-only bound.
- Asset-row destructive confirmation moves to a companion row on desktop and directly below actions in the mobile card layout.
- Replace `.content-upload-actions > .admin-inline-confirmation` with `.admin-table-feedback` on the actual table confirmation wrapper; do not depend on Blaze expansion producing a direct child. Package-upload and administration-card confirmations outside the table do not receive the 25rem limit.
- Verify the intermediate 769–1100px range, where table layout becomes auto and the action-cell maximum is removed.

### Instructor Reporting

- Keep the performance-load error inside the table shell but wrap it in `.admin-table-feedback`.
- Add/remove exception feedback uses a companion row immediately after the affected student.
- Missing exception date is field feedback beside the date input and is also referenced by the clicked action when that validation blocks a row command.

### Data Download

- Do not alter the existing fixed-layout width contract.
- Per-TDF command feedback may use a companion row but must not replace the existing fixed table layout with generic auto-layout styles.

## Error, Pending, and Result Presentation

Each surface maps command state consistently:

| Command state | Presentation |
| --- | --- |
| `idle` | Render no feedback element. |
| `pending` | Disable only conflicting controls in the same scope, set `aria-busy="true"`, and show localized progress text when the operation is not effectively instantaneous. |
| `success` | Render localized success feedback with `variant="success"`, `urgent=false`. Preserve returned details only when useful to the user. |
| `error` | Render normalized/localized error feedback with `variant="error"`, `urgent=true`. |

Additional rules:

- Do not stringify whole server responses into table cells when a concise localized summary and optional detail region can convey the result.
- Preserve actionable server reasons, but never display stack traces, secrets, keys, connection strings, or raw learner records.
- Validation errors do not start an async command. Set field state directly, mark the field invalid, and leave unrelated command state untouched.
- When a successful operation removes its row, do not leave an orphaned companion row. Announce success in the nearest surviving container if the result would otherwise disappear before assistive technology can perceive it.
- When a result includes substantive output rather than a status—such as a backup manifest—render it as a local expandable detail region, not as `adminStatus` text.

## Implementation Phases

### Phase 1: Shared contract and characterization

Files: shared `adminUi.*`, `asyncCommandState.ts`, `inlineConfirmationController.*`, new scoped registry and tests, management-interface baseline test.

- [x] Extend `adminStatus` with optional `id` and `className` inputs without changing existing callers.
- [x] Add `.admin-command-region`, general `.admin-inline-feedback`/confirmation containment, and the table-only `.admin-feedback-row`, `.admin-table-feedback`, and `.admin-table-message-column` rules.
- [x] Implement and unit-test `ScopedAsyncCommandRegistry` using `AsyncCommandController` internally.
- [x] Add characterization coverage for status roles/live regions, optional IDs/classes, confirmation focus behavior, and the shared width-class contract.
- [x] Add comments at the owning modules describing the page-load versus command-feedback boundary.

Phase exit gate: shared APIs typecheck and lint; existing status/confirmation markup remains source-compatible; registry tests cover concurrent scopes and destruction.

### Phase 2: Highest-risk tables and detached confirmations

- [x] User Administration Delete User confirmation, role/delete results, and nowrap overrides.
- [x] Administration Tests Message columns.
- [x] Content Upload row/media/access feedback and action confirmations. Browser measurement at 769–1100px remains pending.
- [x] Instructor Reporting row feedback and bounded table-load error.
- [x] Backups row confirmations and manifest detail placement.
- [x] Theme row/branding/help confirmations.

Phase exit gate: synthetic 200-character unbroken messages and long localized text do not expand action columns; every destructive confirmation returns focus correctly.

### Phase 3: Page-global command messages

- [x] Narrow Content Manager's upload status to package upload only.
- [x] Split Profile and Audio Settings state by command owner.
- [x] Split Courses load state from keyed Join/Launch feedback.
- [x] Replace learning-dashboard shell messages/native alert with lesson/config scopes.
- [x] Split Admin Control Panel, Mechanical Turk, and User Administration import/provider feedback.
- [x] Split Data Download command regions while preserving fixed table layout.
- [x] Move course-editor command feedback into its action region.

Phase exit gate: none of the migrated command handlers writes the old page-global variable; concurrent actions on two records display independent feedback.

### Phase 4: Editors and wizards

- [x] Content Editor toolbar, field, validation-summary, and Save regions.
- [x] TDF Editor initialization, OpenRouter field, validation-summary, and Save regions.
- [x] SPARC header, selected-node, visual/rich-text, and rule-card error ownership.
- [x] Manual Content Creator draft and upload confirmation regions.
- [x] APKG wizard step/action ownership.
- [x] Theme Generation Wizard control-group ownership.

Phase exit gate: editor initialization errors remain distinguishable from field and Save errors; changing tabs/steps cannot leave feedback visible in the wrong region.

### Phase 5: Authentication and borderline cases

- [x] Provider sign-in and disabled-signup feedback inside secondary actions.
- [x] Forgot/reset-password field and form feedback.
- [x] Verify-email resend feedback.
- [x] Class Selection feedback inside its selector/action row.
- [x] TDF Assignment load/Save state split.
- [x] Profile OpenRouter actions and feedback consolidated inside the AI card.
- [x] Sign-up and primary sign-in summaries moved inside their forms.
- [x] User Administration Usage/News actions receive separate local scopes.
- [x] Direct class-invitation errors replace native alerts with an explicit destination-owned route result.

Phase exit gate: no remaining native alert or strict-borderline case violates the placement contract.

## Recommended Change Slices

Keep each slice buildable and behaviorally coherent. Do not mix unrelated feature work into these files while migrating them.

1. Shared primitives and tests only.
2. User Administration plus Administration Tests table containment.
3. Content Upload plus Instructor Reporting table containment.
4. Backups and Theme confirmation placement.
5. Profile, Audio Settings, and account menu.
6. Courses, learning dashboard, Class Selection, and class invitation route result.
7. Admin Control Panel, Mechanical Turk, Data Download, and course editor.
8. Content/TDF editors and TDF Assignment.
9. SPARC editor.
10. Manual/APKG/Theme wizards.
11. Authentication forms and final source inventory cleanup.

At the end of every slice, search the migrated files for the old global setter/state name and verify that only legitimate page-load or application-wide uses remain. Do not delete a global message host until its remaining callers have been classified.

## Verification

### Verification environment

Run static checks from `C:\dev\MoFaCTS\mofacts`:

```powershell
npm run typecheck
npm run lint
```

For browser verification, use the supported native hotfix loop and MoFaCTS Playwright sidecar described by the repository guide:

```powershell
cd C:\dev\MoFaCTS\deploy
.\hotfix-dev.ps1 start -SettingsPath "$env:USERPROFILE\OneDrive\Desktop\settings.local.json"

cd C:\dev\MoFaCTS\mofacts-mcp-sidecar
.\scripts\check-hotfix-sidecar.ps1 -Start
```

The app target is `http://localhost:3200`; the sidecar reaches it at `http://host.docker.internal:3200`. Do not run a Docker image build, push, deploy, or local Meteor test workflow for this UI migration. Use CI for Meteor integration coverage, and obtain fresh explicit authorization before every `npm run test:ci` invocation.

For every migrated surface:

1. Trigger success, validation failure, server failure, cancellation, and retry states.
2. Confirm that feedback appears beside the originating control and not in a global message region.
3. Confirm that simultaneous or rapidly repeated row actions cannot display feedback on the wrong record.
4. Confirm focus returns to the originating button after confirmation cancellation/completion.
5. Confirm `aria-live`, `role`, `aria-describedby`, keyboard operation, and localized text remain correct.
6. Test long unbroken messages, URLs, identifiers, and localized strings in affected tables at desktop, intermediate, and mobile widths.
7. For feedback inside table markup, confirm `.admin-table-feedback` does not exceed approximately 25rem/400px or its narrower container. For non-table feedback, confirm only that it remains within its owning container.
8. Run `npm run typecheck` and `npm run lint` from `mofacts/`.
9. Use the native hotfix development server and MoFaCTS Playwright sidecar for browser-visible verification of each affected route.

### Automated test requirements

Add the following pure/unit coverage:

#### `scopedAsyncCommandRegistry.test.ts`

- Rejects blank scopes.
- Starts a command and publishes pending then success for that scope.
- Publishes normalized failure for that scope.
- Blocks a second pending command in the same scope.
- Allows two different scopes to remain pending concurrently.
- After a scope is removed and recreated, prevents the old scope's later completion from replacing the recreated scope's state.
- `reset` rejects pending state and returns completed state to idle.
- `remove` destroys one scope without affecting another.
- `destroy` destroys all scopes and rejects subsequent runs.

#### `inlineConfirmationController.test.ts`

- Retains typed placement/action/record context while open.
- Rejects replacement of a pending confirmation.
- Returns focus to the original trigger on cancel and completion.
- Uses the supplied fallback only if the original trigger was removed.
- Destroys without restoring focus or publishing later state.

#### Shared markup/CSS characterization

- Existing `adminStatus` callers remain valid when no ID/class is supplied.
- Optional status ID is rendered and can be referenced by `aria-describedby`.
- Error and non-error variants retain their correct live-region behavior.
- General inline feedback and confirmation selectors contain `max-inline-size: 100%`, `min-inline-size: 0`, normal whitespace, and `overflow-wrap: anywhere`, with no 25rem limit.
- `.admin-table-feedback` alone contains the special 25rem maximum plus the wrapping/containment rules.
- User Administration no longer renders confirmation inside the normal Actions cell.
- Administration Tests wraps both Message fields.
- Content Upload's confirmation selector matches the actual wrapper.

These tests run through the supported Meteor/CI test environment. Do not use local `npm test` or routine local `npm run test:ci` as a substitute for the supported integration path; every `npm run test:ci` invocation requires fresh user authorization. Typecheck and lint remain required locally for TypeScript/Svelte changes.

### Browser smoke matrix

Use synthetic accounts/content appropriate to each role. Do not use or capture production learner data.

| Route/surface | Required scenario |
| --- | --- |
| `/home` | Trigger lesson configuration validation, reset result, completed-lesson warning, and launch failure on two different lessons. |
| `/courses` | Fail Join and assignment launch in separate rows; verify independent feedback in table and card layouts. |
| Account menu | Force locale/theme failure and verify the dropdown owns the message. |
| `/profile` | Trigger locale, avatar, aggregate Save, OpenRouter test/delete, and model-catalog errors. |
| `/audioSettings` | Force TTS autosave, speech autosave, and API-key failures independently. |
| Auth routes | Trigger field validation, provider failure, reset failure, and resend failure; verify field association and form ownership. |
| `/classEdit` and `/tdfAssignmentEdit` | Trigger load failure separately from Save validation/server failure. |
| `/instructorReporting` | Trigger missing date and failures on two student rows; inject a long table-load error. |
| `/dataDownload` | Trigger each of the three download scopes; verify fixed-layout columns do not change. |
| `/contentUpload` | Trigger package, asset, media, access, and administration failures; open confirmations at desktop, 900px, and mobile widths. |
| `/contentEdit` and `/tdfEdit/:id` | Trigger initialization, toolbar/field, validation, catalog, and Save failures independently. |
| `/sparcEdit/:id` | Trigger Save, rich-text URL, node/drop, rule JSON, and Delete Node confirmation states. |
| Manual/APKG/IMSCC flows | Verify draft, overwrite, step-action, upload, and close feedback stays in the active region; ensure IMSCC remains unchanged. |
| `/adminControls` | Trigger cache and both verbosity failures independently. |
| `/admin/backups` | Open Verify/Manifest/Download/Restore/Delete states on different rows and verify focus return. |
| `/userAdmin` | Trigger role/delete feedback in different rows, provider API failures, import, usage, and news commands. |
| `/turkWorkflow` | Trigger experiment-log, removal, send-message, Approve/Pay, and Bonus feedback. |
| `/theme` | Trigger theme-row, library, property, underlay, logo, help, and generation-wizard failures. |
| `/admin/tests` | Render long SPARC and readiness messages in both result tables. |

For each route, report the browser-visible result plus console/network errors observed through the sidecar.

### Width assertions

At 1440px, 1024px, 900px, 768px, and 390px viewports where the surface supports them:

- Measure each `.admin-table-feedback`, including any status or confirmation it wraps; its width must be at most `min(container width, 400px)` allowing a 1px rounding tolerance.
- For `.admin-inline-feedback` and confirmations outside table markup, verify only that their width does not exceed the owning container. They may legitimately be wider than 400px.
- Use a synthetic string of at least 200 characters with no whitespace and a long localized sentence with normal whitespace.
- For companion-row designs, record the Actions column width before and after feedback opens; it must remain unchanged within a 1px rounding tolerance.
- For intentional Message columns, verify the column does not exceed 25rem and content remains fully readable through wrapping, not clipping or ellipsis.
- Verify the table does not acquire new page-level horizontal overflow. Existing `adminTableShell` scrolling may remain where the sum of intentionally sized columns exceeds the viewport.
- Verify the Content Upload intermediate viewport range explicitly; this is the current auto-layout risk window.

### Accessibility assertions

- Triggering controls reference the active feedback with `aria-describedby` when the feedback supplements the control.
- Confirmation triggers use `aria-controls` and `aria-expanded` while open.
- Pending controls expose `aria-busy` and prevent only conflicting commands.
- Field errors set `aria-invalid` and preserve visible labels.
- Newly inserted error feedback is announced once; nested live regions must not cause duplicate announcements.
- Escape/cancel and confirmation completion return focus according to the controller contract.
- When a successful deletion removes the trigger, focus moves to the documented nearest surviving row action or card action, not the document body.

## Current Implementation and Verification Record

Implemented in the working tree on 2026-07-17:

- The shared status template accepts stable IDs/classes and retains assertive error versus polite non-error live-region semantics.
- A shared scoped async-command registry now owns repeated command state in Courses, Backups, User Administration, Content Upload, Instructor Reporting, Data Download, Mechanical Turk, and Theme. Each surface maps stable scopes to its own localized presentation.
- The 25rem/approximately 400px rule exists only on `.admin-table-feedback` and `.admin-table-message-column`. General form/card feedback and confirmations are limited only by their owning container.
- User, teacher, reporting, content, administration, authentication, editor, SPARC, and wizard surfaces in the file-level matrix have local feedback slots. Class-invitation and lesson-launch errors no longer use native alerts.
- Backup manifests and destructive confirmations render in their affected row; SPARC node deletion renders in the selected-node card; theme confirmations render in the affected theme/branding/help region.
- Shared confirmation lifecycle/markup now owns trigger ARIA state, Escape/cancel behavior, focus return, pending state, and localized presentation across Theme, User Administration, Course Edit, Content Edit, and Manual Content Creator instead of retaining page-specific confirmation markup.
- Profile, Audio Settings, Admin Controls, Content/TDF editors, provider API-key controls, and Content Upload access operations keep independent scoped messages so unrelated concurrent commands do not overwrite one another.
- Sign-up, verify-email, Profile, User Administration provider metadata, Instructor Reporting dates, and other field-level failures expose local assertive error semantics and field associations.

Verification completed before the final source-cleanup pass:

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run check:sparc-authoring`: passed with 30 palette entries and 14 rule-catalog entries.
- Native hotfix server: running and reachable at `http://localhost:3200`; app port 3200 and HMR port 8082 are reachable. The current templates hot reload. Existing historical dev-log entries include a SPARC unused-export warning and transient missing-module/server-socket errors; the current public routes remained reachable.
- Playwright sidecar tools are exposed. Public smoke checks passed for sign-in empty-field validation and forgot-password empty-email validation at 900px: each error rendered in the owning field region, the invalid field received focus, and `aria-invalid`/`aria-describedby` referenced the visible error. A fresh navigation produced no console warnings or errors.
- A browser computed-style probe using the shipped shared classes confirmed the table-only distinction: inside a 700px owner, `.admin-table-feedback` measured 400px with `max-inline-size: min(100%, 400px)` and `overflow-wrap: anywhere`, while `.admin-inline-feedback` used the full 700px with only `max-inline-size: 100%`. In a 300px table owner, table feedback stayed below the container width and introduced no page-level horizontal overflow.
- Authenticated administration, teacher, user-menu, responsive table-width, confirmation-focus, and network smoke checks were not run. The user explicitly removed browser verification from scope; no credential bypass or secret transfer was used.
- Meteor test suites were not invoked because `npm test` is not the supported local verification path and `npm run test:ci` requires fresh explicit authorization.
- After the final confirmation and command-scope cleanup, the user explicitly waived all further verification. Typecheck, lint, tests, browser checks, and hot-reload validation were therefore not rerun against the final working tree.

The implementation is complete as a source migration. The verification-dependent criteria below remain acceptance checks for any later verification pass, not prerequisites for this user-waived handoff.

## Completion Criteria

- No command-specific result/error uses a page-global message unless the event is genuinely application-wide.
- Every repeated-row command uses stable keyed state.
- Every confirmation is rendered in the triggering command's logical region.
- Every table feedback message has an explicit bounded inner wrapper or bounded Message column.
- No affected table becomes wider because of an inserted message or confirmation.
- Accessibility, localization, focus behavior, and responsive layouts follow the shared source contracts; final runtime verification was waived.
- Typecheck, lint, and UI smoke checks remain recommended for a later verification pass; they were waived for the final working tree.
- Searches of migrated files show no obsolete page-global setter for command-specific feedback.
- No new dependency, server contract, persistence field, or compatibility path was introduced.
- The implementation matrix is checked off or updated with an explicit reason for any intentionally deferred surface.

## Audit Notes

This document began as a static audit and now serves as the implementation ledger. The migration changed application code, and earlier iterations ran local static checks and exercised public authentication routes through the supported hotfix/sidecar loop. The final cleanup was handed off without additional static or browser verification at the user's explicit request. Existing unrelated modifications were preserved.
