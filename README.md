# MoFaCTS

MoFaCTS, the Mobile Fact and Concept Training System, is a web-based adaptive learning system for practice, assessment, and research. It supports adaptive practice through cognitive memory models, Tutor Definition Files (TDFs), multiple stimulus types, and response modalities including multiple choice, fill-in-the-blank, and speech-recognition-based responses.

This repository is being prepared for a first public pre-1.0 release. The current target tag is `v0.1.0-alpha.1`.

## Who It Is For

- Researchers studying adaptive practice, learning, memory, and educational data.
- Instructors and instructional designers preparing adaptive practice activities.
- Content authors building lessons with Tutor Definition Files (TDFs).
- Developers contributing to the MoFaCTS application and deployment workflow.
- Institutional collaborators evaluating MoFaCTS for pilots or research partnerships.

## What MoFaCTS Can Do

- Deliver flashcard-like adaptive practice using cognitive memory models.
- Run lessons defined by Tutor Definition Files (TDFs).
- Present text, image, audio, video, and cloze-style stimuli.
- Collect multiple-choice, typed, and speech-recognition-based responses.
- Support classroom, research, administrative, and deployment workflows.
- Export and analyze learner interaction data for research and operations.

## Project Status

MoFaCTS is actively used and stable enough for evaluation, research collaboration, and managed pilot deployments. This is a pre-1.0 public alpha release because public packaging, documentation, APIs, deployment guidance, and compatibility commitments are still being formalized before a 1.0 release.

For institutional or course deployment, coordinate with the maintainers so configuration, data handling, and support expectations are clear.

## Repository Layout

- `mofacts/`: main Meteor/Svelte application source.
- `mofacts/client/`, `mofacts/common/`, `mofacts/server/`: application code.
- `mofacts/packages/`: local Meteor packages.
- `mofacts/.deploy/`: canonical Docker Compose build and deployment workflow.
- `docs/`: concise public repository documentation.
- `.github/`: GitHub issue templates, pull request template, CI, and security workflow.
- `scripts/`: maintenance and migration utilities.

## Running Locally

For contributor setup, see [docs/development.md](docs/development.md).

Short version:

```bash
cd mofacts
npm ci
cp example.settings.json settings.json
npm run typecheck
```

The supported local runtime baseline is Node.js `22.x`, npm `10.x`, and Meteor `3.4`. See [SUPPORT.md](SUPPORT.md) for the current support policy.

## Documentation

- [Architecture overview](docs/architecture.md)
- [Development guide](docs/development.md)
- [TDF authoring overview](docs/authoring.md)
- [Release process](docs/release-process.md)
- [Support policy](SUPPORT.md)
- [Security policy](SECURITY.md)
- [Contributing guide](CONTRIBUTING.md)

The GitHub wiki remains the best home for long-form operational runbooks, detailed setup notes, and content authoring examples:

- https://github.com/memphis-iis/mofacts/wiki

## Citing MoFaCTS

If you use MoFaCTS in research, cite the software using [CITATION.cff](CITATION.cff). GitHub will surface this metadata through the repository citation panel.

## Contributing

Contributions are welcome through issues and pull requests. Start with [CONTRIBUTING.md](CONTRIBUTING.md), open an issue for substantial changes, and keep pull requests focused.

Security vulnerabilities should not be reported through public issues. Follow [SECURITY.md](SECURITY.md).

## License

MoFaCTS is released under the Business Source License 1.1. See [LICENSE](LICENSE).
