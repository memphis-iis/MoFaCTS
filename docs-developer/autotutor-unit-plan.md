# AutoTutor Unit Type Plan

## Goal

Add an AutoTutor unit type where each unit represents one AI-guided tutoring session around one question. The first implementation supports a single question per unit. The TDF wires the unit and provider settings; the stimulus file owns the structured AutoTutor curriculum script content.

The design follows the paper's expectation- and misconception-tailored dialogue pattern: a curriculum script has a main question, ideal answer, expectations, hints, prompts, assertions, misconceptions, corrections, and a summary. The tutor guides the learner until enough expectations are current and misconceptions are not current.

## Initial Content Contract

The first target package lives in the private configuration/content repository under `AutoTutor Confidence Interval/`.

The intended authoring shape is:

- `tutor.setspec.openRouterApiKey`: required for AutoTutor units, encrypted on upload like existing speech keys.
- `tutor.setspec.openRouterModel`: default model identifier, such as `openai/gpt-4.1-mini`.
- `unit[].autotutorsession`: marks the unit as an AutoTutor unit.
- `unit[].autotutorsession.cluster`: the stimulus cluster index used as the AutoTutor content record.
- `unit[].autotutorsession.openRouterModel`: optional unit-level model override for model-comparison studies.
- `unit[].autotutorsession.graduation`: authored completion threshold for the unit.
- first stim in the referenced cluster: owns the AutoTutor content for that cluster.
- stimulus `display.text`: the main question prompt shown at session start.
- stimulus `autoTutor`: structured tutoring metadata, including topic, learning goal, ideal answer, expectations, misconceptions, dialogue policy, and summary.

No silent fallback behavior is allowed. Missing API key, missing effective model, invalid cluster, missing prompt, or malformed `autoTutor` script data should fail clearly.

## Invariants

- An AutoTutor unit owns exactly one question for phase 1.
- Structured curriculum content lives in the stimulus file. TDF content is limited to unit wiring, provider configuration, and existing blob-style content patterns such as instructions or media session fields.
- The prompt and tutor script come from the first stim in the referenced stimulus cluster, not from duplicated content in the TDF unit.
- AutoTutor content does not use normal `response.correctResponse`; it is a distinct unit/content path.
- AutoTutor script text is plain text for phase 1.
- The API key lives in the TDF permanently, is stripped/restored by the config repository scripts, and is available to the browser at runtime for direct OpenRouter calls.
- The client owns the AutoTutor turn loop, prompt construction, OpenRouter call, response parsing, state update, progress calculation, and completion logic.
- The server is not part of the AutoTutor reasoning loop. It remains storage and ordinary content access infrastructure.
- The tutoring controller state is explicit and persisted with session history.
- Completion is deterministic over current expectation and misconception state, with a phase-1 hard stop at 20 learner turns.
- Existing learning, assessment, video, and instruction unit behavior remains unchanged.

## Tutor State

The compact state after each turn should include:

- expectation state by expectation ID: current/not current, plus latest evidence if available
- misconception state by misconception ID: current/not current, plus latest evidence if available
- answer quality
- student-question flag
- selected tutor move
- turn count
- completion status
- model/provider metadata
- last tutor utterance

Do not include a dialogue summary in phase 1.

Progress is:

```text
max(0, current_expectation_count - current_misconception_count) / expectation_count
```

Completion is based on the authored TDF graduation rule, with phase 1 supporting a numeric expectation threshold and no current misconceptions.

## Implementation Steps

1. Add the schema contract.
   - Extend `fieldRegistrySections.ts` with `autotutorsession`.
   - Add `openRouterApiKey` and default `openRouterModel` to setspec.
   - Add optional `openRouterModel` to `autotutorsession` for per-unit overrides.
   - Add authored `graduation` settings to `autotutorsession`.
   - Add stimulus `autoTutor` schema to the first-stim content path.
   - Regenerate `mofacts/public/tdfSchema.json` and `mofacts/public/stimSchema.json`.
   - Update unit-type detection and field applicability to include `autotutor`.

2. Extend package upload and persistence.
   - Preserve `openRouterApiKey` as authored TDF runtime configuration so the browser can call OpenRouter directly.
   - Follow the same config strip/restore pattern used for existing Google TTS and speech-recognition keys.
   - Reject AutoTutor TDFs with missing key, missing effective model, invalid cluster, missing stimulus prompt, or malformed stimulus `autoTutor` script.
   - Preserve the raw authored script in stimulus content for inspection and export.

3. Add client-side AutoTutor service.
   - Add client/shared code for OpenRouter request construction, response parsing, cost tracking, and clear error handling.
   - Call OpenRouter directly from the browser with the TDF-provided key.
   - Enforce 20 learner turns per session.
   - Stop the session once tracked phase-1 session cost exceeds 20 cents for non-admin users.
   - Fail clearly on first tutor call if the OpenRouter key is invalid or insufficient.
   - Send only stable anonymous learner/session identifiers to OpenRouter.

4. Add the controller.
   - Use one OpenRouter call per learner turn.
   - Require the model, by prompt contract, to return a JSON envelope with both `tutorMessage` and `stateUpdate`.
   - Provide the expected JSON schema in the prompt, but do not require OpenRouter-enforced structured outputs in phase 1.
   - Track expectations and misconceptions as current/not current.
   - Remove a misconception from current state when the learner repairs or rescinds it.
   - Select moves from the AutoTutor set: feedback, pump, hint, prompt, assertion, misconception correction, student-question response, and summary.

5. Add the unit engine.
   - Register a new `autotutor` unit engine from `autotutorsession`.
   - Initialize session state from the referenced stimulus prompt and `autoTutor` script.
   - Expose card data needed by the Svelte view, including the authored OpenRouter key, because the browser owns the AutoTutor call.
   - Mark the unit finished after the completion rule succeeds, or after 20 learner turns.

6. Add the client experience.
   - Use `deep-chat` for the chat UI: MIT-licensed, AI-chat focused, and usable as a web component from Svelte.
   - Keep Flowbite Svelte or Bits UI as lower-level building blocks only if the chat web component needs surrounding controls.
   - Show the stimulus prompt as the session question.
   - Pin the original question above the chat.
   - Send learner messages to the server method and render tutor replies.
   - Map the top performance metric to AutoTutor progress.
   - Accept short or stuck responses such as "I don't know"; AutoTutor should respond with the appropriate move.
   - Do not add a finish button in phase 1.

7. Persist history and reporting data.
   - Write one history/data-download row per turn with the AI prompt/utterance, learner response, tutor move, expectation state, misconception state, completion status, model/provider metadata, and response timing.
   - Avoid logging the API key.
   - Restore compact tutor state later; full transcript resume is not required for phase 1.

8. Verify.
   - Add unit tests for schema validation, unit detection, script validation, move selection, progress scoring, and OpenRouter payload construction.
   - Add a simplified algorithm test file/fixture for fast controller testing.
   - Run `npm run typecheck` from `mofacts/`.
   - Use the hotfix dev loop at `http://localhost:3200` for browser verification once UI exists.

## OpenRouter Protocol Notes

Use OpenRouter's OpenAI-compatible Chat Completions endpoint directly from the browser for phase 1:

- Endpoint: `POST https://openrouter.ai/api/v1/chat/completions`
- Required headers:
  - `Authorization: Bearer <OPENROUTER_API_KEY>` from the active TDF
  - `Content-Type: application/json`
- Useful attribution headers:
  - `HTTP-Referer`
  - `X-OpenRouter-Title`
- Request body:
  - `model`: from `unit[].autotutorsession.openRouterModel` or `tutor.setspec.openRouterModel`; first test default is an OpenAI 4.1 model through OpenRouter
  - `messages`: app-owned tutoring protocol instructions, stimulus `autoTutor` script, current tutor state, and relevant recent dialogue
  - `stream`: false for phase 1

Prefer direct browser `fetch` over adding `@openrouter/sdk` for phase 1. OpenRouter's REST surface is small for non-streaming chat, and a local wrapper keeps error handling, logging, and tests under MoFaCTS control. Reconsider the SDK if we later add streaming, model listing UI, tool execution, or richer provider routing.

The assistant response must be parseable as a JSON envelope:

```json
{
  "tutorMessage": "student-facing reply",
  "stateUpdate": {
    "expectations": {
      "E1": {
        "current": true,
        "evidence": "brief reason"
      }
    },
    "misconceptions": {
      "M1": {
        "current": false,
        "evidence": "brief reason"
      }
    },
    "answerQuality": "low | partial | high",
    "studentAskedQuestion": false,
    "selectedMove": "feedback | pump | hint | prompt | assertion | correction | answer_question | summary"
  }
}
```

Do not use OpenRouter automatic fallback routing for the first version. If the selected model/provider cannot perform the required turn, fail clearly and surface the configuration problem.

## Open Questions

See `autotutor-implementation-questions.md` for the working decision log and remaining follow-up questions.
