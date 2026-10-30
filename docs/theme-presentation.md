# Central application presentation

The SPARC student move menu uses three connected button columns without visible
headings or radio controls. Segment height is 80% of the central theme button
height; all columns use the same theme-derived padding. Same KC is initially
selected, and the shorter KC column is vertically centered. Selected segments use
the primary action color pair; alternatives remain clickable with a subdued
surface. There is no column focus outline; keyboard focus stays visible on the
individual button. The renderer measures the unwrapped menu and applies one
scale to its width and height when needed, preserving its aspect ratio and
preventing label wrapping. Resize observation also follows theme and locale
changes. Run `node --test scripts/sparcStudentMoveMenu.test.cjs` from `mofacts/`
for the production-component interaction, equal-padding, localization, and
proportional-fit checks in Default and Dark Industrial.

Past student choices reuse that presenter as one read-only row containing only
the selected KC, move, and question type. They use the same compact labels,
padding, theme colors, and proportional scaling, without the worksheet selection
outline that can extend beyond the conversation's scroll boundary. The surface
also measures the floating Progress header and reserves clearance only when it
would cover the first history row at scrollTop zero. The progress card retains
its floating behavior; no opaque header region or fixed-height spacer is added.
The conversation is also the containing block for positioned descendants,
including visually hidden accessibility text. Their overflow must remain inside
the conversation scrollbar so focusing an answer cannot scroll the outer surface,
hide Progress, or clip the usable conversation height.

Question answer lists in tutor dialogue begin one prose line height below the
question text, using the central font-size and relaxed-line-height properties.
This spacing applies to both multiple-choice and true/false questions, including
selected and read-only answers.
Answer buttons use the same compact vertical and horizontal padding as typed
learner replies, with no full-size button minimum height. Multi-line option
labels still grow naturally. Clicked selections are marked in their original
question only; they are not echoed in a separate learner chat bubble. The
display projection preserves canonical answer evidence and model context, while
typed and cloze responses retain their own learner messages.

Tutor message boxes occupy 88% of the conversation width, aligned to the start
edge, leaving visible space toward the learner side on both desktop and phones.
Learner message boxes retain their existing alignment to the opposite edge.

The application theme selected through the admin Theme screen owns appearance throughout MoFaCTS. Authored and LLM-generated markup supplies semantic structure underneath that theme: headings, emphasis, lists, tables, figures, callouts, and choices. SPARC supplies instructional behavior and rendering semantics, not a separate visual theme.

Generated SPARC instruction follows one pipeline: Markdown parsing, HTML sanitization,
then the central theme's semantic-content and support-container rules. The dialogue
collector passes instruction primitives to the grouping renderer once; an existing
grouped instruction is a container for those primitives, not an additional message
to print alongside its children. Authored HTML blocks retain their HTML contract.

`mofacts/client/lib/themeRuntime.ts` applies the existing theme properties. `mofacts/public/styles/classic.css` defines their shared roles and application-wide rules, including semantic tables with or without Bootstrap's `.table` class. `mofacts/public/styles/instructional-content.css`, loaded once by the application shell, presents instructional markup using those same properties. The learner renderers do not own component stylesheets.

Bundled system themes are Default, Dark Industrial, Whimsical Refined, and Imperial Dark. Their JSON files own their saved default properties; the server obtains missing-property defaults from `mofacts-default.json` instead of maintaining another palette. CSS still supplies the initial shared defaults. Built-in updates refresh the registered definition while custom themes retain their saved properties.

Accent and feedback foregrounds must remain readable against the card, stimulus, secondary, and derived state surfaces on which they appear. Filled semantic controls use the central `--app-on-semantic-color` role: the card surface becomes the contrasting label color when a semantic foreground is used as a fill. This inverse pairing uses the same contrast relationship, with the foreground and background exchanged. Primary actions retain their explicit action text/surface pair, including hover. There is no separate learner palette or new saved color setting.

Imperial Dark retains its existing `imperial-dark-488a` ID when promoted from a saved custom theme to a bundled system theme. Registry initialization recognizes only that named ownership transfer, writes one system entry under the same ID, and refreshes the active snapshot without changing the selection. Repeated initialization is safe; other ID collisions still fail. Export the custom theme before a deliberate promotion so its prior definition can be retained independently. A conflicting saved name blocks the transfer rather than silently replacing another theme.

Tables share theme surfaces, text, borders, small corner radius, and density-scaled cell padding (`--app-space-2` vertically and `--app-space-3` horizontally). Column sizing follows content; responsive containers scroll locally when necessary. Do not introduce a separate SPARC table skin or fixed table minimum width. Figures and generated images use the theme's small radius. Instructional panels, controls, progress, focus, and feedback use the existing application state roles.

Shared table cells retain normal intrinsic word widths, allowing multiword headers to wrap between words. Tables wider than their available space scroll within their responsive owner, including instructional text and Markdown help. Emergency word breaks remain available for administrative tables deliberately rearranged into narrow blocks. At the existing narrow-screen breakpoint, tutor bubbles remove their redundant horizontal inset; worked examples retain their theme padding and accent, while prose keeps the shared reading measure. Learner reply bubbles use compact theme padding; tutor desktop spacing retains its existing rules.

Rich tables preserve captions, row/column groups, and explicit header relationships through normalization, editing, and rendering. Saved header IDs remain authored content; rendering scopes header IDs and matching same-table references to each fragment so repeated library and learner views cannot collide. Invalid or ambiguous relationships must be reported, not guessed. Continuous prose uses the shared relaxed line height independently of input height; aligned text/math cells and controls keep their own sizing rules. The application viewport permits normal user zoom.

The existing authoring error boundary retains invalid HTML source as a repairable unsaved draft and blocks Save. Visual table operations that would duplicate header IDs or break explicit header relationships are rejected without changing the draft. Row and column commands preserve grouping and surviving cell content through the existing editor transaction and undo/redo mechanisms.

Keep presentation changes in these central stylesheets. Reuse existing theme properties for color, spacing, typography, radius, borders, shadows, and motion. Do not add component overrides, inline visual values, fixed figure rounding, or a parallel SPARC token system. Content alignment and semantic emphasis remain meaningful, while their visual treatment follows the theme. Preserve keyboard operation, visible focus, contrast, and reduced-motion behavior.

The Content menu's instructional library uses `SparcNode` for saved text, support, and question previews, including thumbnails. `sparcLibraryPreview.ts` adapts library entries to the existing learner node projection without writing history. Choices are read-only during inspection; the answer key remains outside the learner preview as author metadata. Text thumbnails render the complete composition at the theme's reading measure, then uniformly scale it to fit a consistent frame. The only inline geometry is the measured fitting transform; typography, frame proportions, padding, borders, surfaces and selection/focus states remain centrally defined. The redundant speaker label is omitted only inside thumbnail frames; actual dialogue and expanded inspection retain their speaker context. Captions sit close to the frame, use a smaller theme-relative size, and center the component kind. Topic and subgroup overview captions use the same shared treatment. A compact header keeps the smaller library title and breadcrumb together. Breadcrumb links use the theme's normal text color for contrast against the page background, retaining underlines and visible keyboard focus. On phones, the breadcrumb sits below the title and wraps naturally; longer paths also wrap on wider screens instead of requiring horizontal scrolling. Topic and subgroup caption buttons have no minimum button height, keeping their text as close to the thumbnail as individual-component captions. Parent text links and the current-location label replace repeated headings, instructions, and summary counts; counts remain on topic and subgroup cards. There is no separate all-components view. The server returns at most 24 components from the selected subgroup of the current snapshot and rejects stale snapshots or invalid group cursors. Video thumbnails use YouTube poster images in the existing thumbnail frame, with a compact duration label; they do not instantiate an embedded player. No Markdown is truncated or rewritten, and text with a figure retains its full composition. Learner figures and library images share `SparcFigure`; image thumbnails contain the whole asset in the same frame proportions. Offscreen previews and assets load lazily. Library wrappers own fitting, lazy loading, full-size access, and revision/deletion controls; they must not add a second content renderer, palette or table skin.

## Library image access

`SparcLibraryRaster.svelte` owns full-size library image access. Its implementation follows three steps:

1. Read the saved image through `readSparcPromptImage`, retaining the server's authorization and the existing PNG/JPEG/WebP and size validation.
2. Decode the validated data URL directly into image bytes and a browser `Blob`. Create its object URL only while the component is mounted and only for interactive full-size inspection. Do not fetch a data URL or broaden the Content Security Policy.
3. Keep the existing full-size link, accessible label, theme renderer, and error display. Revoke the object URL when the component is destroyed. Thumbnail selection continues to use the validated image data without allocating a full-size object URL.

Library entry selection is independent of image-file availability. While a thumbnail is loading or its authorized image read fails, keep its existing inspection control available alongside the loading/error state so administrators can reach normal revision and deletion controls. An administratively removed entry retains its removal notice.

Verify that an existing image renders in inspection and opens at its original resolution under the normal security policy, including browser zoom. Switching or closing inspection must retain the existing cleanup behavior. This path changes neither stored assets nor learner histories and adds no public image endpoint.

Run `node scripts/sparcInstructionalBrowseMethods.test.cjs`, `node scripts/themePresentation.test.cjs`, `node scripts/bundledThemeContrast.test.cjs`, `node scripts/themeRegistryPromotion.test.cjs`, and `node scripts/checkSparcRichHtml.cjs` from `mofacts/` for the focused presentation contracts, in addition to required application checks. Contrast checks cover every bundled theme and shared interaction/state pair. Visual review uses one light theme (Default) and one dark theme (Dark Industrial), at desktop and narrow widths; verify a newly bundled theme's registration and preserved settings as well. Restore the original personal theme after review. Test existing instruction without submitting learner responses merely to inspect styling.

Mobile images allow native scrolling, panning, and zooming (`touch-action: auto`).
Do not restrict images to `pinch-zoom`: that blocks one-finger scrolling initiated
on the image and panning across its enlarged view. The conversation column retains
its existing scroll ownership. Run `node --test scripts/imageTouchNavigation.test.cjs`
with Playwright's Chromium installed to check upward/downward image-originated
scrolling, two-finger pinch zoom, and left/right panning in SPARC and stimulus images.

SPARC learner replies use compact theme padding and preserve line breaks only in the learner text, so template whitespace does not create empty lines. Pending tutor work uses a compact rotating spinner and localized activity text from the active assessment or instructional component; reduced-motion users receive the same status without animation. The progress card floats over the conversation with an opaque card surface and no surrounding opaque layout region, both expanded and collapsed. SPARC omits the left practice-tools menu. Flashcards retain its original density-scaled 23-by-104-pixel tab and button padding, mirrored across from the right progress tab. The progress tab supplies its viewport center so the two tabs remain vertically aligned as the layout resizes. On touch devices automatic response focus targets the non-editable response region; tapping the input starts text entry. Desktop keyboard focus remains on the input. Multiple-choice and true/false selections receive immediate answer-key correctness on the selected option while assessment and feedback continue; no learner-reply echo is rendered. Typed and cloze responses retain assessment-based review on their own messages.
