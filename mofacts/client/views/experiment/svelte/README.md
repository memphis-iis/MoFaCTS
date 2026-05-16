# Svelte Card Runtime

This directory contains the Svelte-based learner card runtime used by MoFaCTS practice sessions.

## Purpose

The card runtime presents trials, manages learner response UI, coordinates speech recognition and text-to-speech display state, and connects the client UI to the adaptive practice engine.

## Structure

- `components/`: Svelte components for the card screen, stimulus display, response controls, feedback, video session mode, and supporting UI.
- `machine/`: state-machine logic for trial lifecycle, response handling, feedback, timing, and transitions.
- `services/`: runtime services for initialization, resume behavior, history logging, media, speech recognition, and unit-engine integration.
- `utils/`: local helpers and validators.

## Supported Interaction Patterns

- Study, drill, and test trials.
- Text and cloze-style prompts.
- Multiple-choice responses.
- Typed responses.
- Speech-recognition-based responses.
- Image, audio, and video media paths when configured by the TDF and delivery settings.

## Development Notes

- Keep routine browser diagnostics behind the project client logging gate.
- Keep state-machine changes paired with type and behavior checks.
- Prefer explicit error states over silent fallback behavior when card runtime invariants break.
- Run the full app TypeScript check after TypeScript-bearing changes:

```bash
cd mofacts
npm run typecheck
```
