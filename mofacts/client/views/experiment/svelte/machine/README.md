# Card State Machine

The card state machine coordinates learner trial lifecycle for the Svelte card runtime.

## Responsibilities

- Load and present the current trial.
- Track display, input, feedback, timeout, and transition states.
- Coordinate typed, multiple-choice, and speech-recognition-based responses.
- Surface hard errors when trial data or runtime invariants are invalid.
- Keep UI transitions ordered so history logging and adaptive scheduling remain consistent.

## Files

- `contentRuntimeMachine.ts`: main state machine.
- `contentRuntimeMachineTypes.ts`: machine and trial-flow types.
- `contentRuntimeMachineServiceInputs.ts`: input builders for invoked service contracts.
- `contentRuntimeMachineTransitionGuards.ts`: transition-specific guard helpers.
- `constants.ts`: timing values, trial codes, and defaults.
- `guards.ts`: transition predicates.
- `contentRuntimeMachineActions.ts`: composed action map used by the machine.
- `*Actions.ts`: domain-scoped state assignment and side-effect dispatch.
- `*Machine.ts`: domain-scoped context defaults and state fragments.
- `services.ts`: invoked runtime services.
- `index.ts`: exports.

## Boundary Rules

- Put state shape and trial lifecycle transitions in `contentRuntimeMachine.ts` and `contentRuntimeMachineTypes.ts`.
- Put transition predicates in `guards.ts` or `contentRuntimeMachineTransitionGuards.ts`.
- Put context assignment and side-effect dispatch in the relevant `*Actions.ts` file, then expose it through `contentRuntimeMachineActions.ts`.
- Put invoked service wiring in `services.ts` and keep the concrete effectful implementation in `../services/`.
- Put video-session state-machine behavior in `videoSessionMachine.ts`; keep DOM/player integration in `../services/videoMachineBridge.ts` or `../components/VideoSessionMode.svelte`.
- Do not add AutoTutor, H5P, or video runtime branches directly to the standard card lifecycle unless the behavior truly changes shared trial lifecycle semantics.

## Trial Types

Common supported trial patterns include:

- `s`: study trial.
- `d`: drill trial with feedback.
- `t`: test trial without ordinary feedback.
- `m` and `n`: force-correct style variants where configured.

Unsupported or malformed trial data should enter an explicit error path rather than falling through silently.

## Fail-Clear Expectations

The machine should surface invalid trial data, missing service results, impossible timing state, and unsupported transition events as explicit machine errors or rejected service paths. Do not recover silently by inventing trial data, changing trial type, or skipping history/logging transitions.

## Verification

For machine changes, run:

```bash
cd mofacts
npm run typecheck
```

Add or update focused tests when changing trial state, timing behavior, speech recognition behavior, or history logging boundaries.
