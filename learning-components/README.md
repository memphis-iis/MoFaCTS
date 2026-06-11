# Learning Components

This directory is the target home for contributor-facing pedagogical extension points.

Current status: contributor-facing source root under active expansion. TypeScript, lint, and CI test bundling include this directory. Unit-engine code now runs here behind behavior-preserving import facades from legacy app paths.

Start with `docs/learning-component-boundary-map.md` for the human/AI orientation map of component-owned code, app-owned services, manifest contracts, history flow, and current packages.

Before adding new executable areas here, make sure Meteor/Rspack, Docker, lint, and tests cover the path deliberately so unresolved imports fail clearly.

Current extension boundaries:

- `runtime/ComponentManifest.ts`: learning component manifests with explicit runtime capabilities.
- `runtime/LearningComponentCatalog.ts`: catalog packaging for unit and trial-display manifest groups.
- `runtime/registerLearningComponents.ts`: shared manifest-list bootstrap and manifest summary helpers.
- `defaultLearningComponentCatalog.ts`: default in-repo component package used by app bootstraps.
- `samples/echo-unit/`: test-only sample component package that demonstrates the manifest, implementation, fixture, and README shape for future component bundles.
- `runtime/TrialDisplayAdapterRegistry.ts`: display-owned trial adapter registry for H5P-style interactions.
- `units/UnitEngineRegistry.ts`: unit engine registration and creation.
- `units/learning-session/`: model learning-session unit package, including learning/video session runtime-config interpretation and model-card selection behavior.
- `units/sparcsession/`: SPARC session unit package; current wrapper over shared adaptive/logistic sequencing and target home for the reactive instructional document graph described in its README.
- `units/assessment-session/`: assessment schedule unit package and authored schedule construction.
- `units/autotutor/`: AutoTutor unit package, runtime contracts, saved state/history validation, and planning helpers.
- `units/instruction/`: instruction-only unit-engine package.
- `units/video-session/`: minimal video-session unit package and adaptive video question helpers.
- `trial-displays/h5p/`: H5P trial-display package and result/display normalization.

Belongs here:

- Unit engines.
- Trial types.
- Adaptive models and model policies.
- TDF, stimulus, display, and response-normalization logic.
- H5P, xAPI, and external-widget adapters.
- Runtime contracts for pedagogical components.

Does not belong here:

- Meteor startup, routing, publications, collections, or app-level persistence.
- Admin, authoring, or learner shell UI.
- Deployment operations.

Dependency direction: `app/` may import `learning-components/`; `learning-components/` should avoid deep dependence on `app/`.

## Component Package Checklist

Use this checklist before adding a production component such as a deeper AutoTutor unit, a new H5P-style display, or another external-widget adapter:

1. Create one package folder under the relevant component family, for example `units/<component>/` or `trial-displays/<component>/`.
2. Keep pedagogical behavior, display/result normalization, model policy, and authored-content interpretation in the package.
3. Keep Meteor routing, publications, collections, authorization enforcement, server methods, upload/storage persistence, and app shell UI in `mofacts/`.
4. Export exactly one `LearningComponentManifest` from the package entry point.
5. Declare every required capability in the manifest. Do not read Meteor globals or app singletons to hide a missing dependency.
6. Declare component-owned service surfaces in `providedServices` when the package exposes renderer-independent behavior such as replay, layout validation, trace comparison, or history bridges. Use a service descriptor with `name` and `runtimeEntry` when the service is exposed through a concrete unit-engine or adapter method.
7. Add focused fixtures/tests near the package or in `mofacts/common/` proving registration, capability failure, and runtime behavior.
8. Add the manifest to the approved default catalog only when the component should ship by default.
9. Run `npm run typecheck`, `npm run lint`, and any schema generation required by changed TDF/stimulus fields.

External package discovery is intentionally not part of this checklist yet. Approved in-repo or local bundles should be explicitly imported and composed through the catalog validation boundary until manifest validation, capability validation, and package fixtures are strong enough to support discovery.
