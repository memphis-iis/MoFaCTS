# SPARC Content Test Point

The active SPARC content test point lives in the configuration repository, not
in runtime code.

Current target packages:

- `C:\dev\mofacts_config\SPARC Fractions Addition`
- `C:\dev\mofacts_config\SPARC Stoichiometry`

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
