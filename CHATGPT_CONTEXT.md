# MoFaCTS project context

This is the maintained context document for project background, requirements, terminology, and design rationale that would otherwise depend on the original ChatGPT Project. It supplements [AGENTS.md](AGENTS.md), the source code, and existing documentation; it does not authorize implementation, deployment, purchases, submissions, or external communications.

## Provenance and evidence rules

Initial migration: 2026-10-03. Source: `C:\dev\mofacts_config\CHATGPT_PROJECT_EXPORT.md`, exported 2026-10-03, titled **MoFaCTS LLC: durable project context**. Preserve that export unchanged. Maintain this document as evidence and decisions develop; do not maintain a second evolving specification in the export.

Repository observations below were checked against the local `main` working tree, based on commit `061f87a69cd51688572ef2768842ec6d65ae1f3e`, including existing uncommitted work. They establish source structure and behavior expressed in code, not successful execution, deployment, capacity, release, or legal/commercial status. Recheck them before relying on them for a later change.

The export used incomplete conversation excerpts, memory summaries, and Library text extraction of five LLC documents. It did not inspect this repository. Its workbook values were extracted without formula recalculation; PDF checkbox selections, signatures, and layout were not verified. Its external references and discovery sheet were not independently checked. Document contents do not prove user adoption of every assistant suggestion. September 26–27 declarations do not establish October status.

Use these labels throughout:

- **CONFIRMED IN REPOSITORY:** Source or configuration evidence inspected during migration. This is not runtime verification.
- **PROJECT REQUIREMENT / DECISION:** Explicit user instruction or accepted direction identified by the export; summary-only provenance is stated when material.
- **DOCUMENTED PLAN:** Prospective work in a business plan, application, disclosure, or repository plan. Its presence does not make every detail a user requirement.
- **REPORTED / HISTORICAL:** A project statement or earlier condition whose present truth is unverified. Superseded estimates are identified separately.
- **PROPOSAL:** Possibility without evidence of adoption.
- **OPEN:** Unresolved choice, discrepancy, or missing evidence.

Prefer current source for implementation claims. Preserve intended requirements when they conflict with code, and record the discrepancy rather than silently choosing a side. Later explicit user corrections take precedence over earlier suggestions. A source change, saved document, rendered check, deployed feature, live sale, and submitted application are separate evidence levels.

## Project identity and terminology

**PROJECT REQUIREMENT:** Develop a commercial service around MoFaCTS Open Core while preserving the distinction between existing open-source technology and LLC/Enterprise work. Open Core must remain independently usable without Enterprise accounts or payments. The user corrected earlier disclosure framing: Open Core had already been disclosed and was to remain open source. The University's earlier approval is reported, not independently verified here.

| Term | Meaning and qualification |
| --- | --- |
| MoFaCTS | Mobile Fact and Concept Training System, the adaptive-learning application in this repository. |
| MoFaCTS Open Core / Self-Hosted MoFaCTS | Existing background technology, required to remain independently usable. Self-Hosted MoFaCTS is the operator-facing name used by repository deployment planning. |
| MoFaCTS Enterprise | Planned commercial service with managed accounts, persistent progress, content discovery, paid practice access, and scalable operations. Existing core capabilities do not establish completed Enterprise integration. |
| MOFACTS LLC | Intended initial licensee and commercialization vehicle, subject to University licensing; not synonymous with ownership of Open Core. Formation status is unverified. |
| Practice pack | Defined quantity of practice, not ownership of a content set and not necessarily a subscription. |
| Practice trial | Learning interaction/usage unit, distinct from a time-limited free trial of the service. |
| Limited pilot | Limited audience using real accounts and genuine production payments. |
| Scale target | Design/load-test objective, not demonstrated capacity or demand. |
| Grant support | Conditional restricted project cost coverage, distinct from sales and recurring margin. |

**PROPOSAL, summary-only:** Distinct product naming was discussed, with GLIDE favored among GALA, GLIDE, ALTO, LIDA, and SAGE, and a possible “MoFaCTS hosted service built on GLIDE” relationship. No final rename is evidenced. Do not rename products, repositories, or schemas based on this discussion.

## Current repository facts and implementation entry points

**CONFIRMED IN REPOSITORY:** The executable application is under `mofacts/`, with Meteor client/server integration and Svelte learner UI. `mofacts/package.json` declares `client/index.ts` and `server/main.ts` as main modules. Routing is in `mofacts/client/lib/router.ts`; server composition is in `mofacts/server/serverComposition.ts`, and methods are split into `mofacts/server/methods/`. Do not assume an older reference to `mofacts/server/methods.ts` is the current implementation entry point.

Reusable pedagogical behavior is in `learning-components/`, including unit engines, adaptive logistic modeling, stimulus interpretation, and response handling. Relevant entry points include `learning-components/units/createUnitEngine.ts`, `learning-components/units/UnitEngineRegistry.ts`, `learning-components/models/adaptive-logistic/`, and `learning-components/content/tdf/runtimeStimulusInterpretation.ts`. Public extension packages under root `packages/` remain scaffolds unless their build/runtime wiring establishes otherwise. See [architecture overview](docs/architecture.md) and [learning component contracts](docs/learning-component-contracts.md).

The canonical companion repositories are `C:\dev\mofacts_config` for TDF/content and sync work, and `C:\dev\MoFaCTS.wiki` for long-form documentation. Both paths and both environment mappings were verified during migration. Runtime ownership stays here. Use the current root guide for repository selection and verification rules; do not copy its operational rules into this document.

| Area | Confirmed source evidence | Limit of the claim |
| --- | --- | --- |
| Adaptive practice, progress, history | `learning-components/models/adaptive-logistic/`, `mofacts/common/collections.ts`, and `mofacts/client/views/experiment/svelte/services/resumeService.ts` contain model, history, experiment-state, and resume behavior. | This is core functionality, not proof of a versioned Enterprise progress API or cross-replica acceptance tests. |
| Content creation/import | `mofacts/client/views/experimentSetup/contentUpload.html` embeds an AI creator, links advanced manual creation, and provides ZIP upload and Anki/Canvas import sections; routes also expose manual and AI creators. [Authoring documentation](docs/authoring.md) describes local conversion of `.apkg` and `.imscc` into MoFaCTS ZIP packages. | The exported choosing-page mockup is not a verified final UI specification. |
| Public demonstration | `mofacts/common/publicDemoContract.ts`, `mofacts/server/methods/experimentMethods.ts`, and `mofacts/server/lib/publicDemoCleanup.ts` define student/teacher/researcher demos, temporary account handling, and a 24-hour expiry. See [public experience](docs/public-experience.md). | This demo is distinct from Enterprise's proposed one-week/half-month free trial. Source does not prove required demo content is uploaded or live. |
| Self-hosted deployment | `deploy/docker-compose.yml` defines the app, authenticated MongoDB with replica-set initialization, and authenticated Redis. It mounts private settings and sets `MOFACTS_REQUIRE_REDIS` to true. | Compose expresses deployment requirements; no stack was started in this migration. |
| Redis ownership | `mofacts/server/lib/redisBoundary.ts` supplies ping/lock operations; `mofacts/server/methods/dashboardCacheMethods.ts` uses the lock boundary. | This does not establish a general durable job queue or a separate worker tier. |
| Storage | `mofacts/server/lib/storageBoundary.ts` implements local/S3 selection, S3 object operations, configuration checks, and permission checks. Composition injects it into runtime/content/package paths; `mofacts/server/runtime/dynamicAssetsRoute.ts` contains asset serving. | S3 adapter code is present. CloudFront, fully stateless replicas, and a functioning cloud deployment were not established. |
| Readiness and recovery tooling | `mofacts/server/methods/deploymentReadinessMethods.ts` requires login and admin role; `deploy/backup-self-hosted.sh` and `deploy/restore-self-hosted.sh` exist. | Source presence is not proof of completed readiness, restore rehearsal, or release acceptance. |
| Software license | Root `LICENSE`, `README.md`, and `mofacts/package.json` identify AGPL-3.0-only. | This does not establish University Enterprise licensing or ownership/equity terms. |

Bounded searches of application source, collections, and package declarations did not identify an Enterprise merchant checkout, purchase ledger, practice-pack entitlement, or refund integration. Research participant approval/bonus payment text exists; it is not evidence of consumer commerce. This search does not prove absence in an external/private Enterprise repository, which was not inspected.

### Authored stimulus fields versus runtime/model values

**CONFIRMED IN REPOSITORY:** `mofacts/common/stimFieldRegistries.ts` defines authored `display.text`, `display.clozeText`, `display.clozeStimulus`, `display.imgSrc`, `display.audioSrc`, `display.videoSrc`, `response.correctResponse`, `response.incorrectResponses`, and stimulus `parameter`. `mofacts/common/tdfFieldRegistries.ts` defines `buttontrial`. Use these registries and generated schemas for complete constraints, rather than the export's abbreviated field list.

The export's `setspec.clusters[i].stims[j].parameter` refers to authored stimulus metadata. `learning-components/content/tdf/runtimeStimulusInterpretation.ts` maps authored `parameter` to runtime `params`; `learning-components/models/adaptive-logistic/probabilityCalculation.ts` derives expression-context `stimParameters` by splitting/parsing `params` and may apply the delivery optimum threshold. These names represent different stages, not interchangeable schema keys. The authored cloze fields also have distinct roles; do not replace them with the flattened runtime names merely because the runtime interpreter uses them.

JSONEditor use is confirmed in `mofacts/client/views/experimentSetup/contentEdit.ts`. General CSV/TSV-to-JSON tooling and Split.js use were reported only as adjacent technical context by the export; a complete pipeline and current Split.js ownership were not established in this migration. They are not an Enterprise integration contract.

## Requirements and design rationale from the ChatGPT Project

**PROJECT REQUIREMENTS:**

1. Aim for an eight-month development/launch sequence. The user accepted that duration; it does not establish an award's authorized term. Relative months start at future award/project activation, not the export date.
2. Test live payment flow with about 20 adults making real purchases. The user emphasized that the underlying learning system works and that charging is the complex new behavior. Sandbox-only testing or a wholly non-paying pilot does not satisfy this requirement.
3. Keep the main business plan comprehensive and the grant application a concise reviewer-focused extract. Preserve their different scopes while aligning assumptions.
4. Include a research-informed first-year financial analysis covering formulas, timing, cash, post-launch costs, payment/usage costs, founder time, contribution, and break-even.
5. Exclude PI salary and fringe from the grant budget (**summary-supported user requirement**). This is a budget choice, not a verified grant-program prohibition.
6. Reduce interface burden by presenting one main workflow with secondary tools separately accessible. The visible August discussion extended this direction from practice to content creation and requested a mockup of only the main choosing page. It did not authorize an architectural rewrite or a full set of newly invented controls.

The user explicitly corrected Anki and Canvas to **uploaders**, not creators, and questioned the invented “table uploader.” An AI creator and an uploader were discussed; the final complete menu/mockup was unavailable to the exporter. Repository import terminology may be used to explain actual conversion behavior without losing the creator/uploader distinction.

**DOCUMENTED PLAN:** Enterprise is a hosted service around an independently usable core. The central commercial hypothesis is that a defined group will pay for convenient curated adaptive practice, saved progress, and reliable access. Demand, profitability, learning superiority, and specific competitor feature absences are unestablished.

## Planned Enterprise architecture and commerce contract

Everything in this section is **DOCUMENTED PLAN**, with the architecture discrepancy recorded below. Exact endpoints, schema fields, authentication mechanism, version negotiation, and security contract remain unspecified.

The export describes a separate Enterprise repository/codebase and a versioned Open Core boundary: Enterprise passes authorized learner context and selected content; Open Core returns practice events/progress for durable hosted storage. Independent Open Core operation must be verified as integration develops.

| Service role | Planned approach | Qualification |
| --- | --- | --- |
| Web/application | Local containerization, then one hosted app container, DNS/load balancer, and tests with two or three replicas | ECS/Fargate is a preference, not a committed vendor. |
| Persistence | Managed MongoDB Atlas for accounts, catalog/version references, learner records, transactions, entitlements | Tier follows measurements; M20/M30 were historical choices. |
| Static content | S3 and CloudFront | Requires measured storage, requests, and transfer costs. |
| Shared state/cache | Redis/ElastiCache for justified cross-replica state/queue needs | Do not rely on process-local payment/account state or count Redis costs twice. |
| Background jobs | Separate workers with SQS or Redis-backed queue when needed | Workload, queue choice, and worker count remain open. |
| Operations | Logging, monitoring, daily backup, restoration checks, repeatable deployment | CloudWatch/Sentry/APM, WAF, and CI/CD selections/charges remain unresolved. |

Logical layers do not require a physical server for each function. Start small; establish identity, persistence, and commerce accounting before measuring scaling. Web and worker capacity may scale separately.

Planned commerce correctness includes account-bound orders; merchant checkout without application storage of card credentials; verified merchant notifications; an auditable ledger of merchant order/event identifiers, amount, and status; entitlements granted only on successful confirmed payment; idempotent handling of retries and duplicate/out-of-order notifications; access checks before practice; recorded consumption; and refund adjustments to both ledger and access. Reconcile merchant orders, amounts, statuses, receipts, entitlements, consumption, and return access after sign-out.

Sandbox tests should cover failed charges, retries, interrupted sessions, duplicate/out-of-order events, expiry, and refunds before live charges. Verify actual live refund/access adjustments when refunds occur. Account isolation and progress persistence must hold across sessions and replicas. The plan requires resolving all unexplained merchant/application mismatches and retesting blocking defects before broader release.

Planned scale objectives are approximately **3,000 registered users**, **100 concurrent users**, and **10,000–50,000 practice trials/day**, reported separately. Measure latency, errors, database behavior, recovery, ledger correctness, and cost/completed trial. CPU/RAM, replica/worker counts, acceptance thresholds, and sustained capacity remain unestablished.

## Commercial discovery and pilot evidence

**DOCUMENTED PLAN:** Non-logged-in demonstration, then a time-limited free trial, then paid practice packs. No additional ongoing unpaid tier appears in the exported plan. Trial duration is unresolved between one week and half a month. Fix and display duration/usage limits, pack quantity, price, expiry, refund policy, and partial-consumption rules before charging.

The workbook's **$10 pack** is illustrative. **$120 annual gross purchases/payer** is a separate sensitivity, not an adopted subscription, observed spending, or proven twelve-purchase frequency.

The initial self-paying-adult segment is provisional: recurring practice for a specific course, language skill, or examination. The comprehensive plan allows comparing two or three concrete use cases in Months 1–2 before choosing one learner/problem/content/payer/acquisition combination; an earlier review suggested at most two nearby alternatives. Neither is a user-mandated quota. Institution-paid course tools and self-paying adult sales need separate analysis.

Discovery should establish recent needs, current materials/software, setup effort, failures, actual spending, payer, and switching reason. Compare alternatives by the job they perform, including notes/rereading/worksheets, flashcards/spaced-practice tools, course/tutoring/exam services, and self-hosted Open Core. Convenience, algorithm quality, and integrated features remain hypotheses.

Instrument exposure, demonstration, trial start, meaningful first practice, return session, offer, checkout, entitlement, consumption, and repeat purchase with timestamps and qualified exposure denominators by acquisition source. Test one or two accessible channels; record spend and founder effort. Separate compensated/uncompensated cohorts and state observation windows.

The recruited 20-person pilot primarily tests operational commerce and usability, not population conversion or annual retention. Compensation is separate from receipts and confounds willingness-to-pay inference. This qualification does not replace the required real-payment test. A larger, less selected market test is a separate possible next step.

**PROPOSALS / DEFERRED:** Creator credits/payouts, institutional licensing, custom contracts, and distribution partnerships. Carnegie Learning and Pearson are illustrative organizations, not committed/interested partners. The broader disclosure mentions creator/institutional administration, analytics, and research deployment; these are not automatically initial consumer-release commitments.

**REPORTED, summary-only:** Researcher discovery used “Researcher Value Propositions” and “Researcher Interview Log” sheets. Contacts mentioned include Brendan Schuetz, Geoffrey McKinley, and Stephen Hutt. A visible Hutt note paraphrases difficulty integrating pre-existing data/context with end-user delivery and work with companies to widen adoption. It is neither a transcript nor a market-wide conclusion. Keep this researcher-buyer work distinct from the provisional adult consumer plan; neither is proven to have displaced the other. Requested log additions were not verified complete. The protocol, final propositions, and complete findings cannot be reconstructed reliably from the export. Retrieve the [actual discovery sheet](https://docs.google.com/spreadsheets/d/1zHHIjQcB4zz2i7o_shP89Xp19N7Eoxg_/edit?gid=872045886#gid=872045886) before extending its records.

## Planned schedule, review, and acceptance

**DOCUMENTED PLAN:**

| Relative month | Work/evidence |
| --- | --- |
| 1 | Architecture, Enterprise boundary/repository, local container, risks/acceptance criteria, discovery hypotheses/interviews; consultant planning review, 4 hours. |
| 2 | Choose provisional segment; one app container/managed database; accounts, isolation, saved progress, return access. |
| 3 | Five to ten usable curated practice sets; catalog, load balancer/DNS, content delivery, repeatable deployment, initial channel evidence. |
| 4 | Timed trial, paid packs, transaction/practice-trial ledger, sandbox failures; define offer. |
| 5 | Two/three-replica tests, measured autoscaling, justified cache/queue/worker additions, load/recovery/cost evidence and review package. |
| 6 | Main consultant review, 12 hours; PI remediation; license/merchant prerequisites before charges. |
| 7 | Consultant follow-up, 4 hours; about 20 adults purchase; reconcile payments/access/refunds and record support/failures. |
| 8 | Resolve discrepancies; report reliability, capacity, costs, contribution from priced inputs, burden, and go/revise/delay decision to OTT; conditional broad launch at month end. |
| 9–12 | First regular modeled sales and ongoing operations; acquisition/repeat cohorts; shift revenue if launch slips. |

Proposed consultant: Toptal expert with AI expertise, no selected person or quote. **20 hours × $200 = $4,000**, allocated **$800/$2,400/$800** in Months **1/6/7**. Same expert preferred for continuity. This is focused architecture/evidence review, not exhaustive code audit, security certification, hired implementation, or a substitute for PI testing/operations. No general coding contractor is budgeted.

Set numeric gates before seeing results, including denominators, windows, and provenance. Segment/problem, offer/channel, live commerce, service/cost, and continuation gates exist in the plan, but validated conversion cutoffs do not. Log founder development, content, support, incident, discovery, and acquisition time separately. Sustainable coverage/response thresholds remain open. Broader launch depends on license authorization, merchant readiness, payment/access correctness, capacity, and commercial criteria.

## Financial model and interpretation

All amounts below are **DOCUMENTED/HISTORICAL ASSUMPTIONS** from the September workbook/plan, not current quotes, observed demand, committed expenses, or a finalized grant request. Formula behavior was not re-audited during export or migration. Workbook sheets: **Overview**, **Monthly Model**, **Assumptions**.

| Input | Documented assumption |
| --- | --- |
| Ordinary hosting, Months 1–6 | $300–$600/month; base $450 |
| Launch-capacity hosting, Months 7–12 | $700–$1,300/month; base $1,000 |
| Mixed eight-month hosting | $3,200–$6,200; base $4,700 |
| Full-year base hosting | $8,700, including $4,000 in Months 9–12 |
| Consultant | $4,000 |
| Optional pilot compensation | Up to 20 × $50 = $1,000; included in base, not committed |
| Month 7 pilot receipts | Illustrative 20 × $10 = $200; Month 8 additional purchases zero |
| Grant sensitivity | $10,000; modeled 100% eligibility of consulting/cloud/pilot/AI costs, available Month 1; unconfirmed |
| Starting cash | $0 modeled, not actual verified cash |
| Previously paid formation fee | Reported $300 sunk cost, excluded from future cash need; not proof of filing |

Whole-stack envelopes included historical Mongo M20 (~$147/month), M30 (~$388/month), and Redis (~$25–$60/month); do not add them twice. Price compute, network/egress, databases/storage, delivery, workers, monitoring, backups, protection, and load tests from current evidence when financial work is authorized.

Consulting plus mixed eight-month hosting: **$7,200–$10,200**; optional compensation raises the upper bound to **$11,200**. If compensation is definitely included: **$8,200–$11,200**. Eight ordinary-only hosting months plus consulting was an alternative **$6,400–$8,800** scenario. These exclude unpriced AI/API and separate vendor fees. Do not pad spending to reach $20,000.

| Base sensitivity | Months 1–8 | Months 9–12 | Year 1 |
| --- | ---: | ---: | ---: |
| Priced cash costs | $9,700 | $4,000 | $13,700 |
| Assumed gross receipts | $200 | $6,000 | $6,200 |
| Assumed grant coverage | $9,700 | $0 | $9,700 |

Months 9–12 modeled revenue: **$375, $1,125, $1,875, $2,625**. These are fractional payer-equivalent linear-ramp calculations, not whole-pack transaction forecasts. Mature-year scenarios at $120/payer/year: **2,000 active × 5% = 100 payers/$12,000 gross**, **3,000 × 10% = 300/$36,000**, and **10,000 × 20% = 2,000/$240,000**.

The priced subset yields **−$7,500** year-one cash without grant and **+$2,200** with modeled same-month coverage; peak outside cash is **$10,125/$425**, respectively, both in Month 9. These optimistic partial results omit unpriced costs and assume an unverified grant cash schedule. Months 9–12 hosting is business expense outside the proposed eight-month project.

**Unpriced, not free:** AI/API usage, accounting/administration/insurance/legal, license consideration, acquisition, percentage/fixed merchant fees, refunds/chargebacks, marginal cloud/storage/support, and founder time. Zeroes are placeholders. Founder opportunity cost is economic cost, distinct from cash salary and excluded from the grant request.

Preserve the analytical contracts:

- Gross receipts = completed purchases × actual price; account separately for refunds and processing fees.
- Contribution deducts variable payment/refund/delivery/support costs. Cash CAC = attributable acquisition spend/new payers; economic CAC also values founder acquisition time.
- Compare CAC with contribution over a stated observation window, not assumed lifetime value.
- Recurring break-even payers = recurring fixed costs/annual contribution per payer only with positive, defensible contribution. One-time consulting/pilot costs affect startup cash.
- Historical “100-payer break-even” = $12,000 hosting/$120 gross payer-year with other costs zero; it does not establish viability. Workbook v3 displays **Unpriced** and **Essential costs validated for decision use = No**.
- Grant coverage does not improve recurring margin. Evaluate no grant, delayed reimbursement/license/launch, slow sales, higher cloud/merchant/refund costs, and founder time.

**SUPERSEDED / INCONSISTENT:** Review notes concern workbook v2; v3 already includes fixed transaction-fee, refund/chargeback-share, annual-license-cost, and accumulated eligible-cost inputs through Month 8 for later support. Do not carry forward earlier “missing input” findings as current. A review-note **$100/payer-year contribution** phrase conflicts with the **$120 gross** placeholder and 100-payer arithmetic; it is not a validated contribution figure. Delayed-reimbursement formula repair was reported prior work, not independently tested.

## Ownership, disclosure, and grant boundaries

**REPORTED / HISTORICAL as of September 26–27:** Enterprise planning began June 2026; implementation had not begun. Philip I. Pavlik Jr. was sole investigator/contributor; no additional researchers assigned. Planning used individual cost-recovery funds and inventor-provided facilities, with no prior federal support/sponsor obligations reported for Enterprise. Do not generalize this to Open Core research history or advance the status by elapsed time.

The disclosure title is **MoFaCTS Enterprise: Hosted Commercial Learning Design Platform**. It records June 2026 conception and first planning disclosure, and no first experiment because implementation had not begun. Its September 27 declaration reports no Enterprise publication, online description, grant submission, presentation, sale/offer, or public use, with a grant being prepared. Public offering was contemplated after implementation/licensing, with no date set. This is not current submission evidence.

**DOCUMENTED PLAN:** University rights are to be addressed by disclosure and license negotiation. The application states University rights in Enterprise; disclosure contains assignment language. No executed license, royalty, equity share, or settled ownership interpretation is established. A summary's “owns a share” phrase is insufficient. Formal LLC filing/effective date, prior open-source determination's scope/permanence, naming implications, operating obligations, and commercial authorization remain open. Tennessee domestic LLC/series/duration/fiscal-year discussions and relocation considerations did not establish filing selections or legal conclusions. Hai and Ido at OTT were intended contacts; no completed agreement is evidenced.

**HISTORICAL EDITING DECISIONS, summary-supported:** Paid-pack/planned-function/creator-publishing text was removed from the disclosure's non-confidential summary; present-tense technical claims were corrected, and form completion was requested. These were section-specific edits, not abandonment of packs or all broader creator/institutional ideas. Signed/visually complete PDF status remains unverified.

**REPORTED:** OTT Development Grants for Commercialization announcement range was $10,000–$20,000, requiring disclosure and application. Original announcement/current terms were not inspected. Authorized duration, limits, deadline, disbursement, procurement, and expense eligibility remain open. Contractor/hosting/participant/AI eligibility needs confirmation.

The grant draft contains ten responses: technology, status, milestones, work, additional researchers, timeline, grant use, economic proposition, economic value, potential licensees. Q7 calls it the FedEx Institute Development Grant. Q9's **300 × $120 = $36,000 gross-sales** illustration explicitly disclaims credible market valuation.

Preserved workflow references: [Qualtrics application](https://memphis.co1.qualtrics.com/jfe/form/SV_ezlbeOglpKnUqmW), disclosure contact `hhtrieu@memphis.edu`, and [OTT page](http://www.memphis.edu/fedex/ott.php). These are source references, not verified current instructions. Earlier browser authorization was only to enter the first page in the already-open local Chrome tab and stop for user review/Next. Neither entry nor submission was verified; that task does not authorize future submission or substituting another browser session while claiming to operate the requested tab.

## Discrepancies and historical repository descriptions

| Topic | Export/project position | Repository evidence and consequence |
| --- | --- | --- |
| Enterprise separation | Separate Enterprise codebase/repository with versioned boundary | `docs-developer/open-core-architecture-vetting.md` instead describes hosted operations around the same core application, without a product fork/second runtime. Separate commercial code may coexist with a shared learning runtime, but the exact boundary is unresolved. Preserve both intentions; do not declare one architecture adopted or implement either from this migration. |
| Sequencing | Eight-month Enterprise development/launch plan | `docs-developer/open-core-implementation-plan.md` places Enterprise implementation after completion of the public Open Core distribution. Its completion status requires current acceptance evidence; the exported schedule is not authorization to bypass it. |
| Redis | Conditional managed shared-state/queue addition in Enterprise plan | Current self-hosted Compose requires Redis and dashboard methods use its lock boundary. This core dependency does not settle Enterprise queue/worker needs. Older baseline/vetting statements that Redis is absent are historical. |
| S3/storage | Hosted S3/CloudFront planned | Current source contains an injected S3 object adapter and permission-check code. Baseline/decision/status passages saying no adapter or configuration-only support are stale for source presence. Cloud deployment, CloudFront, full statelessness, and acceptance remain unverified. |
| Demos/free trial | Non-logged-in demo then week/half-month service trial | Core demo source creates temporary accounts with 24-hour expiry. Do not treat that expiry or anonymous-account implementation as the settled Enterprise free-trial contract. |
| Interface simplification | Main choosing page, secondary tools, uploader/creator distinction | Current upload template embeds the AI creator and includes several import/upload sections. This is not evidence the exported choosing-page mockup was fully adopted. No redesign was performed. |
| Enterprise status | “Implementation had not begun” in September documents | This tree contains core account/progress/authoring/infrastructure code. These do not contradict the dated Enterprise declaration or prove independent-operation acceptance. Current Enterprise status elsewhere is unknown; local commerce searches found no identified implementation. |
| Financial figures | Current extracted v3 assumptions versus older v2 review | Preserve v3 placeholders and identified inconsistencies; do not present review findings, gross-sales scenarios, or partial cash totals as validated economics. |

Existing `open-core-baseline-inventory.md`, `open-core-architecture-vetting.md`, and `open-core-decision-answers.md` mix past observations with targets/decisions. Their useful rationale remains valuable, but “current” wording must be rechecked against code. Read `open-core-implementation-plan.md` for sequencing/acceptance intent, not as proof that every checked or described feature passed runtime validation. This migration leaves those documents intact and makes the discrepancies discoverable here.

## Source inventory and research rationale

The five source documents were extracted by the exporter from Library folder **/MoFaCTS LLC/**. They were not independently opened during this repository migration or located among the named files in `mofacts_config`. Library identities aid recovery; they are not local paths or implementation release versions.

| Filename | Library version / modified | Library identity |
| --- | --- | --- |
| `MoFaCTS_Enterprise_Comprehensive_Business_Plan.md` | v4 / 2026-09-27 | `libfile_2d0923b7eca081918f78ff5dbb48690d` |
| `MoFaCTS_Enterprise_OTT_Development_Grant_Draft.md` | v9 / 2026-09-26 | `libfile_dfc07fdf64e08191b7c38b0efbb2875c` |
| `MoFaCTS_First_Year_Financial_Model.xlsx` | v3 / 2026-09-26 | `libfile_2969df290d1c81919f2af2e377867a12` |
| `MoFaCTS_Enterprise_Invention_Disclosure_Updated.pdf` | v4 / 2026-09-27 | `libfile_f2e4b570f5088191bf16cf21d514a00f` |
| `MoFaCTS_Enterprise_Business_Review_Notes.md` | v1 / 2026-09-27 | `libfile_8a90e18072f08191b306d46522652783` |

Prior supplemental working notes were described as the de facto comprehensive plan and integrated into the titled plan. Their exact separate filename was unavailable; do not treat them as another controlling version.

Preserved research references, **not revalidated during migration**:

- [Camuffo et al. (2020)](https://doi.org/10.1287/mnsc.2018.3249), entrepreneurial decision-making experiment; [Camuffo et al. (2024)](https://doi.org/10.1002/smj.3580), replication/extension.
- [Delmar & Shane (2003)](https://doi.org/10.1002/smj.349), observational planning study; [Brinckmann, Grichnik & Kapsa (2010)](https://doi.org/10.1016/j.jbusvent.2008.10.007), planning-performance meta-analysis.
- [NSF I-Corps](https://www.nsf.gov/funding/opportunities/nsf-national-innovation-corps-teams-nsf-national-i-corps-tm), [List & Gallet (2001)](https://doi.org/10.1023/A:1012791822804) on hypothetical/actual valuation, and [SBA planning guidance](https://www.sba.gov/business-guide/plan-your-business/write-your-business-plan).

The project used this literature to support explicit hypotheses and firsthand testing, not MoFaCTS-specific demand, universal interview quotas, or launch thresholds. Observational planning associations do not prove that a longer plan causes profit.

Disclosure background publications concern **Open Core**, not Enterprise: Pavlik, Kelly & Maass (2016), *The Mobile Fact and Concept Training System (MoFaCTS)*, doi:10.1007/978-3-319-39583-8_25; Pavlik et al. (2020), *The Mobile Fact and Concept Textbook System (MoFaCTS)*, CEUR-WS 2674; Pavlik & Eglington (2021), *The MoFaCTS Computational Model and Scheduling System*, CEUR-WS 2895. Complete bibliography was not verified.

## Open decisions and future verification

1. Establish status since September 27 from evidence: Enterprise work/repository, LLC formation, disclosure/application submission, award, and license negotiations.
2. Reconcile separate commercial-code ownership with the shared core runtime intent; define versioned authentication, content/progress, commerce, and security contracts before implementation.
3. Establish Open Core completion through supported acceptance/release evidence. Recheck outdated status passages and S3/Redis/readiness/backup assertions before relying on them. Source inspection here did not start services, run tests, restore data, build images, or deploy.
4. Confirm grant rules, dates, eligibility, procurement, reimbursement, current consultant/cloud pricing, and a justified request. Obtain executed rights/authorization before real charges; resolve license terms and prior Open Core approval questions.
5. Choose the initial buyer/problem/content/channel from actual evidence, including the researcher-discovery sheet; set trial/pack/refund/partial-consumption rules and select a merchant provider.
6. Recalculate/audit the actual workbook, price omitted costs, distinguish cash/economic costs and gross/contribution, test delayed funding/launch, and keep participant compensation separate from sales.
7. Set capacity, payment reliability, support, and commercial acceptance thresholds with denominators/windows before results. Conduct the required small live-payment pilot only under the relevant future authorization; resolve discrepancies before broader paid launch.

Preserve technical distinctions and qualifications when maintaining this context. Answer the requested task literally; do not silently replace live commerce with non-paying research or a comprehensive plan with only an application extract. Avoid invented quotations, parameters, vendors, paths, market evidence, or completed work. The export also records a preference for concise, technically explicit writing without em dashes.
