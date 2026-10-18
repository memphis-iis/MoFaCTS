# SPARC Content Test Point

The active SPARC content test point lives in the configuration repository, not
in runtime code.

Current target packages:

- `C:\dev\mofacts_config\SPARC Fractions Addition`
- `C:\dev\mofacts_config\SPARC Stoichiometry`
- `C:\dev\mofacts_config\SPARC Confidence Interval`
- `C:\dev\mofacts_config\SPARC Species and Speciation`

The two instructional-cycle references and their runtime contracts are described
in [SPARC instructional cycle](sparc-instructional-cycle.md). The original
`AutoTutor Confidence Interval` package remains the AutoTutor regression reference.

Runtime code must stay content-agnostic. It should expose generic SPARC
capabilities such as node addressing, display normalization, content readiness
validation, response processing, replay, reactive rules, model-history exchange,
and layout policy. It must not import, name, or special-case either target TDF.

The content test loop should load those TDF packages from the config repository
and validate their SPARC display payloads through generic SPARC validators. If a
target package cannot run with the generic runtime, either improve the generic
runtime contract or update the authored TDF content. Do not add lesson-specific
runtime branches.

The goal is for the Fractions Addition and Stoichiometry packages to run in the
new SPARC system with CTAT-like learner-facing behavior while keeping the SPARC
runtime independent of specific content files.

Run the isolated SPARC regression suite from `mofacts/` with
`node scripts/sparcAutoTutorRules.test.cjs --include-general-rules --include-client-contracts`.
It covers rule evaluation, display/history bridges, semantic and progressive nodes,
and the instructional cycle. It does not start Meteor or establish browser/Mongo
integration confidence.

Semantic scoring uses an authored `regex` as its matcher; otherwise it uses
`acceptedValues`, `value`, `expected`, or the input's expected answer. Multiple
accepted values are alternatives. Generated default feedback excludes every
authored response matcher. The production test operators `in` and `not-in` compare
against an array without type coercion; `not-regex` complements `regex`.
These operators are declared in the authoring catalog and executed by the common
production evaluator. Existing authored questions need no additional fields.

Display cluster attachments must be numeric, non-negative integers; invalid values
are rejected instead of converted to cluster zero. Fraction and dropdown controls
are input nodes. Matching OR branches return one activation per rule and binding,
while different bindings remain separate activations.
