# SPARC AutoTutor Prompt Runtime Implementation Plan

## Objective

Replace the active SPARC AutoTutor runtime move prompts with the proposed policies in `docs-developer/sparc-autotutor-current-ai-prompts.md`, while separating universal shared prompt invariants from move-specific pedagogical execution.

The implementation preserves the existing SPARC target-selection algorithm, ordinary scaffold state machine, history contract, and response envelope. The later learner-question extension adds two dedicated actions that preserve, rather than advance, the current scaffold stage.

The original prompt-policy work changed prompt definitions and construction. The learner-question extension also changes authored production-rule selection and persists the unchanged scaffold stage for question turns.

## Current Ownership

The active SPARC AutoTutor moves are runtime-defined.

| Concern | Current owner | Implication for this change |
| --- | --- | --- |
| Move registry and prompt policies | `learning-components/units/sparcsession/sparcMoveDefinitions.ts` | Owns the seven active `promptPolicy` strings. |
| Production-rule selection | Authored `display.productionRules`, evaluated by the SPARC runtime | Owns `pump`, `prompt`, `hint`, `assertion`, `question-deferral`, `question-scope-refusal`, and `summary`. |
| Runtime move lookup | `createSparcUtteranceRequestFromFacts(...)` calls `requireActiveSparcMoveDefinition(action)` | Resolves both scaffold and dedicated learner-question actions. |
| Target identity | `targetType` / `targetKind` from target selection and instructional control | Uses `learningTarget`, `misconception`, `learnerQuestion`, and `completion`. |
| Shared AI prompt wrapper | `mofacts/client/views/experiment/svelte/services/sparcControllerDialogueOpenRouter.ts` | Retain only output, metadata, and universal content boundaries here. |
| Problem-statement extraction | `commitSparcTrialDisplayControllerDialogueTurn(...)` | Require `opening-tutor-message.value` once and pass the same authored text to scoring and utterance generation. |
| Structured utterance inputs | `SparcUtteranceRequest` and `buildSparcUtteranceUserPrompt(...)` | Continue supplying the problem statement, learner text, target type, target content, current planner state, and dialogue history. |

## Architectural Decision

Do not create expectation-specific and misconception-specific copies of the production rules.

The production rules continue to decide **when** to select a scaffold move. The runtime move prompt decides **how** that move operates for the active target type.

```text
authored production rule
  -> selected action: pump | prompt | hint | assertion | question-deferral | question-scope-refusal | summary
  -> runtime move definition
  -> target-specific execution branch inside promptPolicy
  -> constrained AI utterance
```

Duplicating production rules without changing the action would still resolve to the same runtime prompt. Creating new actions such as `pump-expectation` and `pump-misconception` would unnecessarily expand the move registry, schemas, authored packages, validators, and tests.

## Prompt-Layer Responsibilities

### Shared SPARC system prompt

The shared prompt owns only invariants that apply to every move:

- Return JSON matching the required envelope.
- Echo the app-selected `targetType`, `targetId`, and `selectedMove` without changing them.
- Do not expose internal IDs, rule IDs, rubric labels, scores, or planner metadata.
- Use only supplied authored lesson content and dialogue context.
- Follow the selected runtime move policy.

The shared prompt must not prescribe:

- how the tutor message begins;
- feedback polarity or sequencing;
- pumping, prompting, hinting, assertion, or summary behavior;
- misconception-repair execution; or
- expectation-specific execution.

### Structured inputs

Structured inputs identify the current state without prescribing pedagogical behavior:

- original authored problem statement;
- latest learner response;
- learner-contribution classification;
- app-selected target and move;
- current merged target scores;
- authored target content;
- planner state; and
- dialogue history.

For a misconception target, the structured input must present the authored misconception as internal diagnostic context, not automatically as the learner's expressed position.

For a completion target, the structured input supplies the completion reason and status-tagged authored expectations and misconceptions. A `max-turns` summary describes partial progress and unresolved content without implying mastery; a `required-coverage` summary consolidates the established trajectory.

### Runtime move policy

Each runtime move policy owns:

- conversational receipt and acknowledgement;
- learner-language attribution boundaries;
- the transition into the selected move;
- local scaffolding principles;
- separate `learningTarget` and `misconception` execution branches;
- repetition or strength calibration; and
- move-specific content and completion boundaries.

## Implementation Steps

### 1. Finalize the current prompt table as the implementation input

- Treat the `New prompt policy` column in `docs-developer/sparc-autotutor-current-ai-prompts.md` as the reviewed implementation input for this change. After implementation, `sparcMoveDefinitions.ts` is the authoritative runtime source and the table is an audited snapshot.
- Confirm all seven policies have contiguous numbering and no Markdown emphasis markers.
- Confirm `pump`, `prompt`, `hint`, and `assertion` contain explicit `learningTarget` and `misconception` branches.
- Confirm `summary` contains completion-specific treatment of established expectations, repaired misconceptions, and unresolved misconceptions.
- Move the current truthfulness requirement into the misconception branches: repetition or endorsement of an active misconception must not be described as progress, closeness, or a good start.

### 2. Replace the runtime move policies

- Within `SPARC_AUTOTUTOR_DIALOGUE_MOVE_DEFINITIONS`, keep the seven active entries aligned with their authored production-rule actions and the shared and user prompt builders.
- Preserve each move's ID, version, family, paper-rule references, prompt ID, output schema, renderer, and history action.
- Convert the numbered policies into plain-text runtime lines joined with `\n`. Preserve the numbering and labels, but do not send Markdown emphasis, inline-code backticks, Markdown-table syntax, or HTML `<br>` elements to the model.
- Do not modify authored production-rule action IDs.

### 3. Remove move execution from the shared system prompt

Classify the current shared instructions as follows:

| Current instruction | Action |
| --- | --- |
| Return JSON only | Keep as shared invariant. |
| Echo target and move exactly | Keep as shared invariant. |
| Do not expose internal metadata | Keep as shared invariant. |
| Use only supplied lesson content and dialogue context | Keep as shared invariant. |
| Begin with immediate feedback of a particular polarity | Remove; the move policy owns acknowledgement and feedback. |
| Do not describe an active misconception as progress | Remove from the shared prompt and place the requirement in each relevant misconception branch. |
| Treat `selectedMisconception` as an incorrect learner belief to repair | Remove as shared execution guidance; represent it neutrally as internal diagnostic context in the user prompt. |
| Use correct expectations to infer the repair | Remove as shared execution guidance. Keep all correct expectations available as authored content so the selected misconception branch can use the relevant content without introducing a new mapping. |
| Inject selected move and its `promptPolicy` | Keep. |
| Require the response envelope | Keep. |

The final shared system prompt must not compete with the ordering or target-specific branches in the selected move policy.

### 4. Clarify misconception input semantics

- Keep the existing selected misconception and all independently scored correct expectations available to the model. Do not add misconception-to-expectation mappings.
- In `buildSparcUtteranceUserPrompt(...)`, label misconception target content exactly as `Internal diagnostic target context (authored content; not necessarily the learner's expressed position):`.
- Keep the existing `Relevant authored target content:` label for learning-target and completion requests.
- Do not rename stored authored fields or change package schemas.
- Do not imply that authored misconception text is something the learner said, meant, believed, or knew.

### 5. Preserve controller and production-rule behavior

Do not change:

- misconception scoring thresholds;
- expectation coverage thresholds;
- misconception priority over expectation targets;
- `instructionalTarget.active` facts;
- scaffold stages or transitions;
- production-rule salience or eligibility;
- move action IDs;
- history actions or replay state; or
- the tutor response JSON envelope.

If prompt implementation exposes a genuine controller defect, report it separately rather than broadening this prompt change.

### 6. Add prompt-contract tests

Update or add tests that prove the constructed prompts, not merely the registry shape.

| Test area | Required assertion |
| --- | --- |
| Move registry | The five original move IDs retain their metadata; the two learner-question move IDs use the same output and rendering contract. |
| Policy structure | Every policy contains ordered numbered requirements and sends no Markdown emphasis, inline-code backticks, HTML `<br>` elements, or table markup. |
| Target branching | `pump`, `prompt`, `hint`, and `assertion` each contain both `learningTarget` and `misconception` execution instructions. |
| Completion framing | `summary` distinguishes established expectations, repaired misconceptions, and unresolved misconceptions. |
| Shared prompt separation | Shared system text contains envelope/invariant instructions but no forced opening-feedback sequence or move-specific repair behavior. |
| Learner-language boundary | Every move policy prohibits presenting rubric language as something the learner said, meant, believed, or knew. |
| Misconception input semantics | The user prompt labels selected misconception content as internal diagnostic context. |
| Plan fidelity | Generated requests still require the model to echo the exact app-selected target and move. |

### 7. Exercise the prompt matrix

Use nine representative cases in deterministic, table-driven prompt-construction tests:

| Move | Learning-target case | Misconception case |
| --- | --- | --- |
| `pump` | Incomplete but productive answer needs elaboration. | Learner claim needs its reasoning elicited without pumping for more misconception content. |
| `prompt` | Learner needs attention directed to one missing relation. | Learner needs to examine a consequence, contradiction, or contrast in the claim actually expressed. |
| `hint` | Learner needs a clue toward missing content. | Learner needs a clue exposing a problem or limitation in the expressed claim. |
| `assertion` | Tutor supplies the missing expectation. | Tutor directly corrects the expressed misconception and supplies the correct contrast. |
| `summary` | One completion case consolidates learned expectations and distinguishes repaired from unresolved misconceptions. | Not a separate target type; completion owns the combined trajectory. |

The deterministic cases must capture the constructed system and user messages before the provider call and assert:

- the exact selected move and target type;
- the applicable target-specific execution branch;
- the learner-language boundary;
- neutral misconception-context labeling;
- absence of removed shared move-execution instructions; and
- preservation of the response envelope and plan-fidelity instructions.

These tests prove prompt construction and ownership boundaries. They do not claim to prove how a live language model will respond.

The primary regression case is:

```text
Learner: Well I guess you get $50 every year.
Internal misconception context: A fixed annual rate means the same dollar amount is added every year.
```

Required behavior:

- Start with a natural conversational receipt.
- Refer to `$50 every year` because the learner used that construction.
- Do not say or imply that the learner used or understood `fixed annual rate`.
- Execute the app-selected move using the misconception branch.
- Do not expose target IDs, rubric labels, or scoring metadata.

### 8. Verify the implementation

From `mofacts/`:

```text
npm run typecheck
npm run lint
```

Add the prompt-contract coverage to the existing SPARC move-definition, utterance-request, dialogue-provider, and controller-dialogue test files. These tests run through the Meteor suite; this repository does not currently provide a supported focused local command for them. Run `CI=1 npm run test:ci` only with explicit user authorization. Without that authorization, report the Meteor tests as not run and rely on typecheck, lint, static prompt inspection, and the supported browser smoke test.

Because this changes learner-facing runtime dialogue, perform a native hotfix SPARC smoke test through the MoFaCTS Playwright sidecar. Treat the live-model result as observational evidence, not a deterministic guarantee. Verify:

- the Compound Interest route and prompt;
- the actual tutor response for the primary regression case;
- the browser-visible selected production;
- absence of rubric-language attribution;
- presence of conversational receipt;
- browser console errors; and
- relevant network/provider errors.

Verify target type and the selected execution branch in the deterministic captured-request tests. Do not claim that the browser proves target type unless an existing browser-visible trace exposes it directly.

### 9. Documentation and compatibility review

- Update `docs-developer/sparc-autotutor-current-ai-prompts.md` to mark the implemented policy revision, identify `sparcMoveDefinitions.ts` as the authoritative runtime source, and record verification evidence.
- Check whether the MoFaCTS wiki's SPARC AutoTutor authoring documentation describes prompt behavior that changed.
- No config-repo package rebuild should be needed because move IDs, production rules, and authored schemas remain unchanged.
- No migration is expected because stored history and target identities remain unchanged.

## Acceptance Criteria

- The five original SPARC AutoTutor moves retain their runtime identities, and the two dedicated learner-question moves have explicit identities.
- Shared prompt text contains only universal invariants and the selected move-policy injection.
- Move policies own receipt, feedback, target-specific execution, and scaffold behavior.
- Misconception content is treated as internal diagnostic context rather than presumed learner language.
- The controller and production-rule behavior are unchanged.
- The Compound Interest regression does not attribute `fixed annual rate` to a learner who only said `$50 every year`.
- Typecheck and lint pass.
- Deterministic prompt-contract tests pass when the authorized Meteor test environment is run; otherwise their unexecuted status is reported explicitly.
- The authenticated hotfix smoke test observes the intended learner-facing behavior for the primary regression case without being treated as a deterministic model guarantee.
