# MoFaCTS Administrative Interface Code-Quality Audit

Conduct a comprehensive code-quality audit of all administrative interface implementations in the MoFaCTS system. The purpose of this audit is not to redesign functionality or introduce new features. The goal is to identify code changes required to make the existing administrative experience stable, internally consistent, responsive, accessible, professional, and suitable for a production SaaS application.

Your primary deliverable is a prioritized, implementation-ready checklist. Each recommendation must identify the affected page or component, describe the implementation defect or risk, explain why it matters, and specify how it should be fixed.

## Audit method: static code review only

This audit must be performed entirely through source-code inspection and repository analysis.

- Do not open or interact with the running application.
- Do not use Playwright, the MoFaCTS MCP sidecar, Browser, Chrome, screenshots, screen recordings, or any other browser-automation or visual-inspection tool.
- Do not start or restart the native hotfix server, sidecar, Docker services, or any other runtime solely for this audit.
- Do not throttle networks, resize browser windows, simulate devices, or manually exercise routes.
- Do not describe a defect as visually observed, reproduced, or runtime-confirmed unless separate evidence already exists in the repository and is cited.
- Base findings on route wiring, component lifecycle, reactive state, asynchronous data flow, templates, semantic HTML, shared components, CSS, responsive rules, accessibility attributes, and existing test source.
- Do not run UI, browser, integration, or end-to-end tests to observe behavior; inspect existing tests as code and specify future verification without executing it.
- Distinguish confirmed implementation defects from code-based risks that require runtime confirmation after implementation begins.
- Runtime verification belongs in the acceptance criteria and suggested tests for future implementation work; it is not part of this audit.

## 1. Audit scope

Review the implementation of every administrative page, including code paths for:

- Initial page load
- Browser refresh
- Navigation between admin pages
- Navigation between admin and non-admin areas
- Loading, empty, error, warning, and success states
- Forms, tables, filters, toolbars, dialogs, menus, and navigation
- Desktop, tablet, and mobile layout rules
- Shared components, CSS, HTML structure, and layout patterns
- Any administrative interface reached through nested routes or secondary navigation

Trace each route from access control and shell rendering through template/component loading, state initialization, data readiness, markup, styling, and cleanup. Review nested routes and secondary entry points even when they are not linked directly from the primary admin navigation.

## 2. Core rendering-architecture invariant

Treat the following as a key interface invariant:

> A page should be visually coherent before it is presented to the user.

Normal users should not see components being inserted, removed, repositioned, or restyled after the page has already appeared.

Specifically inspect code paths that can cause:

- Post-mount repainting caused by late state or style changes
- Layout shifts caused by conditional insertion or missing reserved geometry
- Warning or status banners initialized to transient values
- Messages briefly appearing above or around the navigation bar
- Navigation bars moving after mount
- Content jumping when asynchronous data arrives
- Visual discontinuity during refresh code paths
- Flash of unstyled content
- Flash of incorrect content
- Hydration or client-rendering mismatches
- Skeletons being replaced in ways that alter the overall page geometry
- Routes briefly displaying the previous page, an incomplete page, or a misleading transient state
- Components that mount before required state, permissions, feature flags, or data have been resolved
- Images, fonts, icons, or controls causing late layout changes
- Loading indicators that appear for only a fraction of a second and create unnecessary flicker

A skeleton loader or reserved empty region is acceptable when content is genuinely loading. However, the shell, navigation, headings, spacing, and major page geometry should remain stable.

Warnings about unusually slow loading may be shown when justified, but they should not flash during normal operation. Consider whether delayed disclosure, minimum display thresholds, debouncing, or route-level loading states are appropriate.

For every rendering defect or risk, identify the owning technical cause. Examples include:

- Incorrect component mounting order
- Asynchronous state initialized to a misleading value
- Missing loading-state coordination
- Conditional rendering without reserved space
- CSS loading too late
- Font swapping
- Client hydration or Blaze/Svelte mounting behavior
- Route transitions without a stable application shell
- Effects that alter layout after first paint
- Duplicate data requests
- Components independently deciding whether the page is loading
- Error or warning states being rendered before a request has had time to resolve

## 3. Page-transition and refresh code paths

Review whether route, layout, authentication, and loading-state ownership implements one coherent application shell rather than a collection of separately assembled pages.

Trace implementation paths for:

- Hard refreshes
- Client-side route transitions
- Browser back and forward navigation
- Opening admin routes directly
- Authentication and authorization resolution
- Delayed asynchronous responses
- Cached and uncached state branches
- Repeated navigation between the same pages

Determine from the current route/layout architecture whether MoFaCTS should use a consistent application shell that remains mounted while page content changes.

Recommend changes that produce:

- Stable navigation and page chrome
- Predictable route-level loading behavior
- No unnecessary full-screen clearing
- No brief display of unauthorized, empty, or erroneous states
- No warnings that flash and disappear
- No old content remaining visible after navigation unless intentionally preserved
- Smooth transitions without gratuitous animation

Do not recommend decorative animation merely to hide rendering defects. Fix the underlying rendering sequence first.

## 4. Shared design patterns and component consistency

Inspect whether similar controls are implemented using shared components and common design patterns.

Identify places where the application is manually recreating:

- Buttons
- Text inputs
- Select controls
- Search fields
- Checkboxes
- Radio buttons
- Toggle switches
- Date or time controls
- Form rows
- Labels and validation messages
- Tooltips
- Status badges
- Alerts
- Confirmation dialogs
- Modal windows
- Dropdown menus
- Pagination
- Tabs
- Breadcrumbs
- Page headers
- Action bars
- Empty states
- Loading states
- Error states
- Table wrappers
- Mobile table alternatives

Controls serving the same function should have identical:

- Dimensions
- Typography
- Border treatment
- Corner radius
- Padding
- Alignment
- Icon placement
- Hover behavior
- Focus behavior
- Disabled appearance
- Loading appearance
- Validation behavior

Recommend where duplicated markup or CSS should be replaced with reusable components, layout primitives, tokens, utilities, or documented patterns.

Do not propose a large rewrite when targeted component consolidation would solve the problem.

## 5. Tables and data-dense interfaces

Review every administrative table carefully.

Evaluate:

- Whether a table is the correct presentation pattern
- Column purpose and priority
- Column width allocation
- Fixed versus flexible widths
- Minimum and maximum widths
- Text wrapping
- Truncation and disclosure of full values
- Alignment of text, numbers, dates, statuses, and actions
- Header clarity
- Row density
- Vertical alignment
- Sorting affordances
- Filtering controls
- Pagination
- Selection behavior
- Bulk-action placement
- Empty states
- Loading states
- Error states
- Sticky headers
- Horizontal scrolling
- Action-column design
- Responsiveness
- Accessibility and semantic table markup

Columns should not all receive equal width by default. Allocate space according to information type and importance.

Use principles such as:

- Short identifiers, icons, statuses, dates, counts, and action columns should generally receive constrained widths.
- Names, titles, descriptions, and other variable-length primary content should receive flexible space.
- Numeric values should generally be right-aligned.
- Repeated action buttons should not dominate the table.
- Long text should wrap or truncate according to its importance and expected use.
- The table should retain a clear visual hierarchy at common viewport widths.
- Column widths should not unpredictably change when data loads.
- Loading placeholders should approximate the final column geometry.

For mobile layout rules, do not assume that compressing the desktop table is sufficient. Determine from the information hierarchy and current markup whether each table should use:

- Intentional horizontal scrolling
- A reduced set of priority columns
- Expandable rows
- A card or stacked-row representation
- A detail panel
- Another responsive disclosure pattern

Make specific recommendations for each table rather than applying one mobile behavior indiscriminately.

## 6. CSS and HTML implementation review

Review the CSS and HTML structure for maintainability, predictable rendering, and clear ownership.

Look for:

- Invalid or non-semantic markup
- Inconsistent heading hierarchy
- Excessive nested wrappers
- Layout implemented with brittle margins or absolute positioning
- Duplicated styles
- Page-specific overrides that conflict with shared components
- High-specificity selectors
- Overuse of `!important`
- Inline styles that should be tokens or component variants
- Magic numbers
- Inconsistent spacing values
- Uncontrolled `z-index` values
- Overflow defects
- Fixed heights that clip content
- Viewport-height assumptions that fail on mobile browsers
- CSS that produces cumulative layout shift
- Styles loaded or applied too late
- Media queries that conflict or leave intermediate widths unsupported
- Controls constructed from generic elements when semantic HTML controls should be used
- Clickable elements without appropriate keyboard behavior
- Tables constructed from arbitrary `div` elements without a compelling reason
- Visual styles that rely on document order or fragile selectors
- Browser-default behavior that varies visibly across pages

Identify where the code should use:

- Flexbox
- CSS Grid
- Shared spacing and typography tokens
- Container and stack primitives
- Standardized breakpoints
- Component variants
- Semantic HTML
- Stable aspect ratios or reserved dimensions
- Consistent focus-visible styles
- Centralized layering rules
- Shared responsive patterns

## 7. Layout, spacing, and hierarchy implementation

Review each page's markup and CSS for:

- Consistent maximum content width
- Appropriate use of available desktop space
- Page margins and gutters
- Vertical rhythm
- Alignment between headings, forms, tables, and toolbars
- Clear distinction between primary and secondary actions
- Consistent page-title placement
- Consistent placement of descriptions and contextual help
- Logical grouping of related settings
- Excessive empty space
- Overly dense regions
- Unnecessary borders and boxes
- Weak or inconsistent hierarchy
- Misaligned labels and controls
- Inconsistent button placement
- Content that appears visually detached from its heading or controls

Administrative interfaces should feel systematic. A user should be able to infer page structure and interaction patterns from previous admin pages.

## 8. Forms and interaction states

Review administrative forms for:

- Label placement
- Required-field indication
- Help text
- Validation timing
- Error placement
- Preservation of entered values
- Submission feedback
- Prevention of duplicate submission
- Disabled and loading states
- Destructive-action safeguards
- Keyboard navigation
- Focus management
- Appropriate input types
- Consistent button ordering
- Mobile usability
- Long-form organization

Check all relevant states:

- Default
- Hover
- Focus
- Focus-visible
- Active
- Disabled
- Read-only
- Loading
- Invalid
- Valid
- Submitted
- Error
- Empty

Do not recommend changing workflows unless the current implementation contains a specific interaction or accessibility defect that makes the workflow difficult to use.

## 9. Responsive implementation

Review whether the CSS, markup, and component structure define coherent behavior at representative width classes, including:

- Large desktop
- Standard laptop
- Narrow desktop or split-screen window
- Tablet portrait and landscape
- Common mobile widths
- Very narrow mobile widths

Assess the implementation contracts for:

- Navigation behavior
- Page gutters
- Heading wrapping
- Toolbar wrapping
- Button sizing
- Touch-target size
- Form layout
- Dialog dimensions
- Table behavior
- Overflow
- Sticky elements
- Fixed elements
- Long labels and translated text
- On-screen keyboard interference
- Landscape mobile layouts

Do not infer that the presence of a media query makes a page responsive. Evaluate breakpoint coverage, intrinsic sizing, overflow ownership, wrapping rules, information priority, and touch-target definitions from the code.

## 10. Accessibility and usability baseline

Include interface-related accessibility findings that affect polish and adoption, including:

- Color contrast
- Keyboard operability
- Visible focus
- Label associations
- Heading hierarchy
- Semantic landmarks
- Table headers and captions
- Dialog focus trapping and restoration
- Status and error announcements
- Icon-only button labels
- Reliance on color alone
- Touch-target size
- Zoom and text resizing
- Reduced-motion support where relevant

Distinguish accessibility defects from broader visual-polish recommendations, but include both in the implementation checklist.

## 11. Cross-browser and environmental code review

Inspect code for assumptions and compatibility risks affecting:

- Chromium-based browsers
- Firefox
- Safari or WebKit
- Desktop and mobile environments

Pay particular attention to implementation choices involving:

- Font loading and fallback metrics
- Form controls
- Sticky positioning
- Viewport units
- Scrollbars
- Table overflow
- Flex and grid sizing
- Dialog behavior
- Focus outlines
- Dynamic mobile viewport units and browser chrome
- Refresh, hydration, and client-mount behavior

Do not run cross-browser tests as part of this audit. Record proposed browser coverage in acceptance criteria for future implementation work.

## 12. Constraints

Follow these constraints throughout the audit:

- Do not add features.
- Do not use the running application, browser automation, MCP browser tools, screenshots, or visual inspection.
- Do not alter business logic unless necessary to correct a rendering or interaction defect.
- Do not change established workflows without a clear usability justification.
- Do not recommend a wholesale rewrite when incremental corrections are sufficient.
- Prefer shared, maintainable solutions over page-specific patches.
- Prefer deterministic state and layout ownership over visual effects.
- Preserve existing functionality.
- Identify regressions that proposed changes could introduce.
- Where possible, connect recommendations to specific files, components, selectors, routes, or code regions.

## 13. Required deliverables

Produce the audit in the following structure.

### A. Executive summary

Summarize:

- The overall quality and consistency of the admin interface
- The most consequential implementation defects and rendering risks
- The main systemic causes
- The recommended order of implementation

### B. Page inventory

List every administrative page reviewed, including:

- Route or entry point
- Main purpose
- Implementation review status
- Responsive-rule review status
- Major issues found
- Relevant shared components

Explicitly identify any pages or code paths that could not be fully traced statically, including the missing data, generated source, external package, or runtime state that prevents a complete conclusion.

### C. Prioritized implementation checklist

Create a concrete checklist organized by priority.

Use these priority levels:

- **P0, release blocker:** Severe rendering, accessibility, or usability failure that makes the interface unreliable or unusable.
- **P1, high priority:** Highly visible defect that materially reduces trust, usability, consistency, or perceived product quality.
- **P2, medium priority:** Important polish, maintainability, responsiveness, or consistency improvement.
- **P3, low priority:** Minor visual refinement or cleanup with limited user impact.

For every checklist item, include:

1. Priority
2. Affected route, page, or component
3. Implementation defect or code-based risk
4. Expected user-visible consequence
5. Likely technical cause
6. Exact recommended change
7. Relevant files or code regions
8. Shared solution or pattern to use
9. Desktop implications
10. Mobile implications
11. Accessibility implications
12. Acceptance criteria
13. Estimated implementation scope:
   - Small
   - Medium
   - Large
14. Dependencies or sequencing requirements
15. Regression risks and suggested future tests

Avoid vague items such as “improve styling,” “make responsive,” or “clean up CSS.” Every item must be specific enough for a developer to implement and verify.

### D. Rendering-stability code-risk report

Provide a separate list of all implementation paths that can produce:

- Layout shifts
- Repaints
- Flashes
- Warning-message flicker
- Navigation movement
- Refresh artifacts
- Route-transition artifacts
- Loading-state inconsistencies

For each defect or risk, document:

- The triggering code path or state sequence
- Whether the path applies to refresh, navigation, or both
- Whether the path depends on asynchronous timing or delayed data
- The user-visible sequence implied by the implementation
- The expected state and rendering sequence
- The probable root cause
- The recommended fix
- A future test that would confirm the defect is resolved

Do not claim that a sequence was observed or reproduced during this audit. Label timing-dependent conclusions as code-based risks unless existing automated tests or repository evidence prove the behavior.

### E. Table review

Provide one subsection for each table.

For each table specify:

- Current column structure
- Recommended width behavior
- Recommended alignment
- Wrapping and truncation rules
- Action-column treatment
- Loading-state geometry
- Empty-state behavior
- Desktop overflow behavior
- Mobile presentation pattern
- Semantic or accessibility corrections
- Whether a shared table component should be used or modified

### F. Shared component and design-system recommendations

Identify:

- Duplicate controls that should be consolidated
- Components that should become standardized primitives
- CSS tokens that should be introduced or normalized
- Page-layout patterns that should be shared
- Loading, warning, error, and empty-state patterns that should be standardized
- Table patterns that should be standardized
- Responsive patterns that should be standardized

For each recommendation, distinguish between:

- Immediate consolidation required to fix defects
- Near-term standardization
- Optional future design-system work

### G. Quick wins

Provide a short list of changes that are:

- Low risk
- Small in scope
- Highly visible
- Suitable for an initial polish pass

### H. Suggested implementation sequence

Organize the work into phases, such as:

1. Rendering stability and application shell
2. Shared loading, warning, and error states
3. Shared controls and page layout
4. Table corrections
5. Mobile responsiveness
6. Accessibility corrections
7. Final consistency and cross-browser implementation verification

Explain dependencies between phases.

The final audit should function as a development specification, not merely a design critique.
