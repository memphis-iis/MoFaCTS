# AI Content image procurement loop plan

This document defines the implemented authoritative Wikipedia image-set path. For automatic Wikipedia requests, item enumeration and image association are one grounded traversal. The pair-generating AI does not invent the item names first.

## Settled interaction contract

1. The creator receives author notes, optional uploads, and Learning/Test mode.
2. An image-set request without uploads starts authoritative Wikipedia discovery directly.
3. Admin Tests provides a separate no-retention Discovery Lab. It accepts notes only and runs only when the administrator clicks **Run Discovery**.
4. The Prompt Lab remains available for pair-prompt experiments, especially text requests, but its output is not an input to automatic Wikipedia discovery.
5. The creator and Discovery Lab use the same discovery function and contracts.

Each accepted Wikipedia member becomes one application pair:

```json
{
  "kind": "image",
  "stimulus": "image: Scaphoid bone",
  "response": "Scaphoid bone"
}
```

The response comes from the canonical linked Wikipedia article title. The stimulus is a deterministic private marker and is never learner-visible.

## Ownership and boundaries

Wikipedia owns automatic image-set enumeration. AI is used at one narrow abstraction boundary:

- choose a Wikipedia collection-level starting topic from the author notes.

After that request, section selection, branch extraction, category inspection, redirect resolution, member registration, image matching, and licensing are deterministic. The model cannot invent a conventional member name, image URL, license decision, package path, or text substitute.

When Wikipedia represents a branch using named subgroup pages rather than one page per physical member, those exact subgroup links are the authoritative granularity. For example, if the relevant page links `Proximal phalanges`, `Intermediate phalanges`, and `Distal phalanges`, the model may select those links but may not construct digit-specific phalanx names that the page did not offer.

An accepted member is registered immediately as an unresolved image pair. Its member page is then inspected for associated images. A member without an acceptable image remains an image pair and blocks Save.

Author-uploaded images remain a separate input-identification path. This plan does not silently combine uploaded images with authoritative Wikipedia enumeration.

## Bounded traversal

### Stage 1: choose collection topics

A strict AI request receives the author notes without an AI-generated response list. Its application output is an ordered array of one to five unique collection-level Wikipedia topics. The provider transport is an object containing only `topics` because the provider requires an object-root strict schema. One repair request is allowed; failure stops the run.

### Stage 2: seed Wikipedia articles

Search English Wikipedia article namespace once for each approved topic. Prefer an exact title match and otherwise use the highest-ranked result. Deduplicate the seed frontier.

### Stage 3: enumerate each collection page

For every collection page:

1. retrieve named sections, wikitext, and bounded main-namespace links;
2. select the section that matches the author notes and its strongest enumerative passage;
3. extract linked collection branches from plural set names in that passage;
4. obtain members from a category with distinctive collection-name overlap, or from exact collection-name links when no such category exists;
5. resolve redirect targets and fragments to remove aliases and reject non-member concepts;
6. enqueue deeper collections and register canonical members as unresolved image pairs.

Every registered title originates in Wikipedia's parsed links or category membership. The trace records the selected section, accepted branches, category evidence, redirect decisions, and member links.

### Stage 4: inspect member pages and Commons evidence

For every registered member page:

1. enumerate images embedded on the article;
2. inspect explicit Commons file, category, and gallery relationships;
3. retrieve file metadata and licensing;
4. match candidates only to that canonical member;
5. retain series/category evidence for bounded family expansion.

The reference chain is:

```text
Hand
  -> Carpal bones
  -> Scaphoid bone
  -> ArticulatedScaphoid.png
```

The traversal permits at most five rounds, 60 visited pages, 500 links per page, 80 images per page, eight series collections, and 120 Wikipedia/Commons API requests. Acquiring selected renditions is counted separately. Cycles and duplicate titles are visited once.

### Stage 5: select coherent contextual images

- require a distinct Commons source file for every pair;
- require an allowed license and complete source attribution;
- prefer an explicit shared source relationship, normalized filename series, or series-specific Commons category/gallery;
- use shared artist/source metadata only as corroboration;
- for members of a system or set, require anatomical or structural context that shows the larger system while distinguishing the requested member;
- do not impose that context requirement on genuinely independent items;
- reject known labeled/annotated plates when printed text could reveal the answer;
- rank contextual suitability before file format and use static media as a tie-breaker;
- allow separate coherent families for natural branches;
- maximize coverage while retaining useful coherent partial coverage.

### Stage 6: acquire and convert

For every selection:

1. request the 1280-pixel rendition, or native size when smaller;
2. download the returned source bytes in their actual source format, commonly PNG;
3. retain the Commons file URL, rendition URL, title, creator, license name, and license URL;
4. convert in the browser to WebP, maximum width 1280 and quality `0.86`;
5. map the resulting local asset unambiguously to the canonical pair.

## Discovery Lab trace

The Discovery Lab exposes, without browser developer tools:

- notes and resolved model;
- every topic-planning request, raw/parsed response, validation result, and repair;
- every Wikipedia search and result;
- each selected collection section and enumerative passage;
- exact accepted collection/member links and rejected structural candidates;
- canonical pair order;
- traversal paths, limits, and stop reason;
- member-page and Commons candidates;
- license, label-risk, context, family, and unique-file decisions;
- selected rendition URLs, source media types, and WebP conversion results;
- unresolved canonical image pairs.

Requests and results are not persisted.

## Maintainability rules

- The creator and Discovery Lab call one authoritative discovery function.
- Topic planning and collection grounding have separate strict schemas and at most one repair each.
- Provider schemas use object roots; application state uses the unwrapped arrays and pairs.
- Wikipedia API normalization, traversal, matching, family selection, acquisition, and conversion remain named stages.
- No general-web source, invisible query-strategy retry, AI-invented member name, text substitution, or parallel pair-to-discovery contract is allowed.

## Fixture and acceptance tests

- Topic planning accepts an empty response list and requests Wikipedia enumeration.
- Grounding accepts only exact offered article-link titles and rejects invented or overlapping titles.
- `Hand -> Carpal bones -> Scaphoid bone -> ArticulatedScaphoid.png` creates the pair and image together.
- Wikipedia member order becomes pair order.
- A member with no acceptable image remains an unresolved image pair.
- Cyclic links are visited once; page, request, depth, and empty-frontier stops remain distinct.
- Unique-file assignment, contextual-family selection, separate natural branches, partial retention, label rejection, license filtering, attribution, 1280px selection, and browser WebP conversion remain covered.
- Admin Tests contains notes-only **Run Discovery** and no Prompt-Lab-to-Discovery pair handoff.
