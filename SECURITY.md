# Security Policy

## Supported Versions

MoFaCTS is currently in its pre-1.0 public release phase. Security fixes are targeted at the latest development line unless maintainers explicitly announce support for an older release.

| Version | Support status |
| --- | --- |
| `v0.1.0-alpha.x` | Active pre-1.0 support |
| older versions | Not supported |

## Reporting a Vulnerability

Do not open a public GitHub issue for security vulnerabilities.

Report vulnerabilities privately to the project maintainers using the repository contact information. Include:

- a description of the issue,
- steps to reproduce,
- affected configuration or deployment assumptions,
- potential impact,
- any suggested fix or mitigation.

We aim to acknowledge reports within 7 days. Response timelines may vary during the pre-1.0 period, but confirmed issues that affect active deployments will be prioritized.

## Security Scope

Security-sensitive areas include:

- authentication, authorization, and account recovery,
- TDF upload and content-import paths,
- file handling and dynamic assets,
- classroom, research, and administrative data access,
- deployment settings and secrets,
- third-party identity integrations,
- export and reporting workflows.

## Deployment Guidance

For production or institutional pilots:

- use HTTPS,
- keep MongoDB private to the deployment network,
- enable MongoDB authentication,
- keep `settings.json` and environment files out of version control,
- review authentication and identity-provider settings before use,
- coordinate with maintainers before exposing a new deployment to learners or research participants.

The Docker Compose workflow under `mofacts/.deploy/` is the canonical deployment path for this repository.
