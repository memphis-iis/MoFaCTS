# Wiki Documentation Audit Goal Prompt

```text
/goal <WIKI_REPO_PATH>

Audit and update the MoFaCTS wiki so it is accurate, role-aware, and presentable for consortium users.

The goal is to create a complete table of all wiki Markdown pages, classify each page by audience, record what needs to be fixed, make the needed fixes, and then update the table with a concise description of what was fixed.

Primary wiki repo:
<WIKI_REPO_PATH>

Sibling repos to inspect when needed:
<APP_REPO_PATH>
<CONFIG_REPO_PATH>

Audience lanes must be clearly separated:

1. Students
   - Need learning/dashboard/account/help guidance.
   - Must not be sent into deployment guides, developer references, source code, infrastructure setup, or schema-heavy docs unless there is a very deliberate "not for normal student use" boundary.

2. Teachers / Content Authors
   - Need class setup, assignment workflows, content creation, Anki import, lesson testing, troubleshooting, data export basics, and practical authoring references.
   - They may need TDF/stimulus/schema concepts, but in teacher-facing language.
   - They should not be routed to code-level developer pages or deployment instructions unless explicitly acting as an administrator.

3. Experimenters / Researchers
   - Distinct from teachers.
   - Do not assume code access or developer workflow.
   - Need schema understanding, TDF/stimulus fields, experiment routes, data output, privacy/IRB/FERPA, adaptive logic, and reproducible configuration concepts.
   - Should have enough technical schema/reference information to run studies without being pushed into code/deployment docs.

4. Administrators / Deployers
   - Need deployment, remote install, runtime settings, admin features, security, backups, troubleshooting, and operational validation.
   - These pages may be technical and infrastructure-oriented.

5. Developers
   - Need local install, architecture, source-of-truth code references, runtime internals, learning algorithms, and contribution guidance.
   - Developer pages may reference code paths, tests, and implementation details.

6. General / Consortium Overview
   - Need polished entry points, glossary, FAQ, screenshots, license guidance, cost analysis, and orientation for evaluators.

7. Internal Maintenance
   - README, AGENTS, and any repo-maintenance files should be audited, but clearly identified as not normal wiki reading paths.

Required deliverable:

Create or update a wiki audit page, preferably `Wiki-Documentation-Audit.md`, containing a table with one row for every Markdown file in the wiki repo.

The table must include at least these columns:

- Page
- Current title
- Primary audience
- Secondary audience
- User-facing? yes/no/internal
- Current purpose
- Navigation placement
- Should students see this?
- Should teachers see this?
- Should experimenters/researchers see this?
- Should admins/deployers see this?
- Should developers see this?
- Problems found
- Needed fixes
- Fix applied
- Status
- Verification notes

Initial page inventory to cover:

- `_Sidebar.md`
- `Home.md`
- `README.md`
- `AGENTS.md`
- `Student-Overview.md`
- `Teacher-First-Hour.md`
- `Researcher-Guide.md`
- `Admin-Reference.md`
- `Developer-Reference-Guide.md`
- `FAQ.md`
- `Glossary.md`
- `Screenshots.md`
- `Quick-Start-Content-Creation.md`
- `Class-Setup-and-Assignment-Workflow.md`
- `Anki-Import-Guide.md`
- `Content-Creation-Reference-Tables.md`
- `Stimulus-files-(content).md`
- `TDF-Field-Reference.md`
- `Trial-Types-Reference.md`
- `learningsession-(learning-units).md`
- `assessmentsession-(assessment-units).md`
- `videosession-(video-units-and-adaptive-logic).md`
- `Learning-Algorithms-Reference.md`
- `Audio-and-Speech-Settings.md`
- `Data-Output.md`
- `Data-Privacy-IRB-FERPA-Notes.md`
- `Experiment-Routes.md`
- `Custom-Help-Page-Setup.md`
- `Deployment-Guide.md`
- `Remote-Install.md`
- `Local-Install.md`
- `Settings-json-Reference.md`
- `Troubleshooting.md`
- `License-Guidance.md`
- `MoFaCTS-Implementation-Cost-analysis.md`

Work process:

1. Inspect recent and current code/config changes before auditing pages.
   - Inspect `<APP_REPO_PATH>`, especially:
     - `learning-components/`
     - `mofacts/common/`
     - `mofacts/client/views/experiment/`
     - `mofacts/client/views/experiment/svelte/services/`
     - `mofacts/server/methods/analyticsMethods.ts`
   - Inspect `<CONFIG_REPO_PATH>` when TDF/content/schema/config expectations may be affected.
   - Check whether wiki pages need updates for:
     - learning component manifests and capability boundaries
     - canonical history envelope and `historySchemaVersion`
     - H5P trial-display contracts
     - AutoTutor runtime/history behavior
     - learning, assessment, video, and instruction unit boundaries
     - adaptive video/assessment logic
     - removed legacy helpers or obsolete paths
   - Record code/config evidence in the audit table's `Problems found`, `Needed fixes`, and `Verification notes` columns where relevant.

2. Inspect the wiki structure.
   - Read `_Sidebar.md`, `Home.md`, and all Markdown file names first.
   - Build the complete audit table before making broad content edits.
   - Preserve existing wiki filename style and internal link style.

3. Classify every page.
   - Assign a primary audience.
   - Assign secondary audiences only when the page is genuinely useful to them.
   - Mark pages that should not appear in student/teacher paths.
   - Identify pages that mix audiences in a confusing way.

4. Check navigation.
   - Update `_Sidebar.md` and `Home.md` so readers can choose the right path.
   - Keep students, teachers, experimenters/researchers, admins/deployers, and developers separate.
   - Add short orientation text when a page is technical or not intended for a given role.

5. Check content against current code/config.
   - For behavior, workflows, UI names, runtime behavior, and developer architecture, inspect `<APP_REPO_PATH>`.
   - For TDF/content/schema/config expectations, inspect `<CONFIG_REPO_PATH>` when relevant.
   - Remove obsolete or contradictory guidance.
   - Do not preserve old and new narratives side by side unless clearly labeled as historical.

6. Fix each page.
   - Make targeted edits, not unnecessary rewrites.
   - Add an audience line near the top when helpful, such as:
     `Audience: Teachers and content authors`
     or
     `Audience: Administrators and deployers`
   - Add "not the right page?" links where users might otherwise wander into the wrong lane.
   - Keep schema-heavy pages accessible to experimenters/researchers without requiring code knowledge.
   - Keep deployment and developer material away from student/teacher default paths.

7. Update the audit table after each page fix.
   - Fill in `Fix applied` with a concrete description.
   - Set `Status` to one of:
     - `Needs review`
     - `Needs fix`
     - `Fixed`
     - `No change needed`
     - `Internal maintenance`
   - Use `Verification notes` to record what was checked.

8. Required final checks.
   - Confirm every Markdown file has exactly one row in the audit table.
   - Confirm `_Sidebar.md` audience lanes are clear.
   - Confirm `Home.md` has clear start points for:
     - Students
     - Teachers / Content Authors
     - Experimenters / Researchers
     - Administrators / Deployers
     - Developers
   - Confirm student-facing pages do not route students into deployment/developer pages.
   - Confirm teacher-facing pages do not require code knowledge.
   - Confirm experimenter/researcher pages expose schema/data/route concepts without requiring code access.
   - Confirm deployment/admin pages remain available, but only in admin/deployer paths.
   - Confirm developer pages are clearly developer-only.
   - Run a link/reference scan for obvious broken wiki links.
   - Check `git diff --check`.

Completion criteria:

The goal is complete only when:

- The audit table exists and covers every Markdown page.
- Every row has audience classification, problems/needed fixes, fix applied, status, and verification notes.
- The wiki navigation separates students, teachers/content authors, experimenters/researchers, admins/deployers, and developers.
- Pages have been updated where needed, not merely noted.
- The table records what was fixed for each changed page.
- The final wiki is suitable for consortium review: polished enough that a student, teacher, experimenter, deployer, or developer can find the right material without accidentally being pushed into the wrong technical depth.
```
