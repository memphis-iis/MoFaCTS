# First Admin and Content Authoring

Self-hosted first-admin setup uses settings, not a separate bootstrap endpoint.

1. Set `owner` to the first admin email.
2. Include the same email in `initRoles.admins`.
3. Keep `auth.allowPublicSignup: true` for first run unless you create the user through an admin-controlled path.
4. Start the app.
5. Sign up with the configured email.
6. Run readiness from `/admin/tests`.

The existing startup/login role-assignment flow grants admin to matching users. If the configured account does not exist yet, readiness reports that clearly.

Teachers cannot grant roles. Role management remains admin-only.

Beginner content smoke path:

- Use the world countries system as the public sample content path:
  `mofacts_config/World Maps (Top 200 by population)`.
- The package files are `Wiki World Maps_TDF.json`, `Wiki_World_Maps_top200_2025.json`, and `Wiki World Maps URL Map.csv`.
- The content owner has confirmed this sample is redistributable and includes attribution/provenance metadata.
- Do not require H5P for the beginner smoke test.
- After content is available, launch one learner flow and complete one trial.
