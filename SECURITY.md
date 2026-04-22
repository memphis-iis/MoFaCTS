# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| Latest  | :white_check_mark: |

## Reporting a Vulnerability

We take the security of MoFaCTS seriously. If you discover a security vulnerability, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

### How to Report

1. **Email:** Send a detailed report to the project maintainers at the email listed in the repository contact information.
2. **Include:**
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Expect

- **Acknowledgment:** We will acknowledge receipt of your report within 48 hours.
- **Assessment:** We will investigate and provide an initial assessment within 7 days.
- **Resolution:** We aim to release a fix within 30 days for confirmed vulnerabilities.
- **Credit:** We will credit reporters in release notes (unless you prefer to remain anonymous).

## Security Practices

MoFaCTS currently follows these security practices:

- **Authentication surface:** Dedicated auth routes under `/auth/...` for login, signup, forgot-password, reset-password, verify-email, and logout. Legacy auth routes remain as redirects during migration.
- **Identity model:** Normal non-experiment accounts use canonical email identity. `username` remains an internal compatibility field mirrored to canonical email for those accounts.
- **Email verification:** Native password signup can require email verification before sign-in. Verification email send, resend, and token confirmation flows are implemented.
- **Password policy:** Native password signup and reset use a length-first policy with an 8-character minimum and no composition-rule requirement.
- **Breached-password screening:** Password signup and reset can screen candidate passwords against the HIBP Pwned Passwords range API. When enabled, the flow fails closed if screening cannot complete.
- **Password hashing:** Meteor `accounts-password` remains the auth runtime. Deployment must explicitly choose `auth.argon2Enabled: true` to use Meteor's Argon2 path for new and refreshed password hashes; otherwise bcrypt remains active.
- **Password reset:** Password reset uses cryptographically secure 256-bit tokens, stores only token hashes server-side, expires tokens after 1 hour, and uses emailed reset links.
- **Session revocation:** Password reset revokes old sessions, and the app records session-revocation audit events for reset/logout-related flows.
- **Rate limiting:** Server-side IP + identifier throttles exist for password login, signup, password reset request/completion, and verification resend. Password login also applies soft lockouts after repeated failures.
- **Audit logging:** Auth audit logs cover signup requested/completed, verification sent/completed, login success/failure, password reset requested/completed, canonical email changes, and session revocation.
- **Input validation:** Server-side `check()` calls validate method arguments, and regex usage is constrained to avoid broad unsafe matching patterns.
- **File uploads:** Extension validation (zip/apkg only), path traversal prevention, and authentication checks are enforced for upload flows.
- **Dependencies:** `npm audit` runs during Docker builds; vulnerable packages are patched via `overrides` in `package.json`.
- **Secrets scanning:** `gitleaks` runs in GitHub Actions (`.github/workflows/security.yml`) on push, pull request, and a weekly schedule.
- **Dependency updates:** Dependabot is enabled (`.github/dependabot.yml`) for GitHub Actions, npm, and Docker metadata updates.

Known remaining gaps:

- **Abuse escalation:** Soft lockouts exist for repeated password-login failures, but challenge escalation is not yet implemented.
- **Argon2 confirmation:** The repo supports explicit Argon2 enablement, but production security depends on the deployed environment intentionally setting `auth.argon2Enabled`.
- **MFA:** Account/session-state scaffolding exists for future MFA support, but there is no current MFA enrollment or challenge flow.

## Deployment Security Recommendations

When deploying MoFaCTS for production use:

- **Always use HTTPS** — configure a reverse proxy (Nginx/Caddy) with TLS certificates (e.g., Let's Encrypt).
- **Do not expose MongoDB** to the host network — keep it internal to the Docker network.
- **Use MongoDB authentication** — set `MONGO_INITDB_ROOT_USERNAME` and `MONGO_INITDB_ROOT_PASSWORD`.
- **Keep `settings.json` private** — it contains admin roles and mail configuration. Never commit it to version control.
- **Restrict server access** — use SSH key authentication, disable password SSH login, and configure firewall rules.
