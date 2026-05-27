# Canonical History Envelope

MoFaCTS history rows share one canonical envelope across standard cards, instructions, video sessions, H5P interactions, and AutoTutor turns. Components may add bounded extension fields, but they must write through the app-owned history path so persistence, authorization, compression, and export behavior stay integrated.

## Schema Version

Current envelope version: `historySchemaVersion = 1`.

The shared client helper stamps this field before compression. The server validates it before persistence. A future incompatible envelope change must increment this value, preserve or migrate exported analytics fields, and document the migration in this file.

## Core Fields

Every persisted history row must include:

- `historySchemaVersion`
- `TDFId`
- `sessionID`
- `levelUnit`
- `levelUnitType`
- `time`
- `problemStartTime`
- `selection`
- `action`
- `outcome`
- `typeOfResponse`
- `responseValue`
- `input`
- `displayedStimulus`
- `eventType`

The row must also include either `userId` or `anonStudentId`.

## Event Types

Current event-type vocabulary:

- `''`: standard card response rows.
- `instruct`: instruction-continue rows.
- `video`: video-session interaction rows.
- `h5p`: H5P summary and part rows.
- `autotutor-turn`: AutoTutor learner/tutor turn rows.

New event types must be stable, documented here, added to `HISTORY_EVENT_TYPES` in `learning-components/runtime/historyEnvelope.ts`, and covered by envelope or component contract tests before use.

## Extension Fields

Known component extension fields:

- `CFNote`: compact component note payload, currently used by AutoTutor saved state.
- `h5p`: compact H5P summary or part-event payload.

Extension fields are bounded independently from the total wire payload budget. They must contain compact identifiers, outcomes, timestamps, scores, or resume checkpoints. They must not contain full runtime snapshots, global session state, full experiment state, or unbounded dialogue/history dumps.

## Write Path

Components must not call `insertHistory` directly. They emit canonical history through the app-owned helper/runtime capability:

- Standard cards and H5P rows: `historyLogging.ts`.
- Instructions: instruction history writer.
- Video-session events: shared compressed-history client helper.
- AutoTutor: `AutoTutorHistoryRuntime.writeCanonicalHistory`.

The shared helper validates the canonical envelope, enforces payload budgets, compresses stable fields, and then calls the server method. The server repeats validation before authorization and persistence.

## Compression Map

`HISTORY_KEY_MAP` in `mofacts/common/Definitions.ts` is the wire compression map for stable history fields. Codes are two-digit, contiguous, and append-only. Do not reuse or remap an existing code for a different field. Add new stable fields by appending the next code and updating compatibility tests.
