# Card State Machine

The card state machine coordinates learner trial lifecycle for the Svelte card runtime.

## Responsibilities

- Load and present the current trial.
- Track display, input, feedback, timeout, and transition states.
- Coordinate typed, multiple-choice, and speech-recognition-based responses.
- Surface hard errors when trial data or runtime invariants are invalid.
- Keep UI transitions ordered so history logging and adaptive scheduling remain consistent.

## Files

- `cardMachine.ts`: main state machine.
- `types.ts`: machine and trial-flow types.
- `constants.ts`: timing values, trial codes, and defaults.
- `guards.ts`: transition predicates.
- `actions.ts`: state assignment and side-effect dispatch.
- `services.ts`: invoked runtime services.
- `index.ts`: exports.

## Trial Types

Common supported trial patterns include:

- `s`: study trial.
- `d`: drill trial with feedback.
- `t`: test trial without ordinary feedback.
- `m` and `n`: force-correct style variants where configured.

Unsupported or malformed trial data should enter an explicit error path rather than falling through silently.

## Verification

For machine changes, run:

```bash
cd mofacts
npm run typecheck
```

Add or update focused tests when changing trial state, timing behavior, speech recognition behavior, or history logging boundaries.
