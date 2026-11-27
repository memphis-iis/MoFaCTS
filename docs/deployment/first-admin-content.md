# First Admin and Content Authoring

Self-hosted first-admin setup starts with the private deployment settings.

1. Set `owner` to the first admin email.
2. Include the same email in `initRoles.admins`.
3. Configure the sign-in method you want for the owner.

   - **Google sign-in.** Set the private `google.clientId` and `google.secret`. In Google Auth Platform, authorize the new host's exact HTTPS callback, such as `https://mofacts.example.org/_oauth/google`. Start the app, choose **Sign in with Google** on the first visit, and select the configured Google account. The first sign-in creates the owner account and grants the administrator role during that login.
   - **Email and password.** Set `auth.allowPublicSignup` to `true` for first run unless you plan to create the account through an admin-controlled path. Start the app, sign up with the configured email, and complete verification if required.

4. Run readiness from `/admin/tests`.

The existing startup/login role-assignment flow grants admin to matching users. If the configured account does not exist yet, readiness reports that clearly.

Only administrators can manage roles. For an administrative handoff, grant the successor the admin role and have them remove yours. For a role granted by site settings, first update the deployment configuration, then remove the role in User Admin. The site owner also receives the admin role at startup. Remove deployment role settings before deleting the configured account. Deleting an eligible account permanently removes its learner history and saved experiment progress.

Beginner content smoke path:

- Use the world countries system as the public sample content path:
  `mofacts_config/World Maps (Top 200 by population)`.
- The package files are `Wiki World Maps_TDF.json`, `Wiki_World_Maps_top200_2025.json`, and `Wiki World Maps URL Map.csv`.
- The content owner has confirmed this sample is redistributable and includes attribution/provenance metadata.
- Use a standard card lesson for the beginner smoke test.
- After content is available, launch one learner flow and complete one trial.

In non-production private-repository bootstrap, TDF records are keyed by the server-owned `sourceIdentity` (`private-repo` plus the repository-relative source key), not by filename. Renaming a displayed/archive filename therefore does not create a second identity, and same-named TDFs from other sources are not overwritten.
