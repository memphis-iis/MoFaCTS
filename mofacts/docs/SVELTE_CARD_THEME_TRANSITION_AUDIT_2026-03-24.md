# Svelte Card Theme And Transition Audit (2026-03-24)

Status: Audit complete
Priority: High
Primary repo: `C:\dev\mofacts\svelte-app\mofacts`
Evidence basis: local repo code only

## Scope

- Determine whether the Svelte card flow is truly driven by the theme system or still relies on fixed CSS and hardcoded styling.
- Audit visible card-state transitions and visual stage changes for theme-tier compliance and paint-readiness correctness.
- Treat `transition_instant`, `transition_fast`, and `transition_smooth` as semantic motion tiers rather than fixed millisecond values.

## Executive Summary

Verdict: `partially themed`

The Svelte card uses theme tokens for several core surfaces and semantic colors, but the flow is not fully governed by the declared theme contract and it is not transition-correct end to end. The major issue is sequencing: the card-level fade starts before the full next visible subset is ready, and important child content still appears afterward. That behavior is visible in the main question flow, study flow, feedback flow, multiple-choice controls, image loading, video overlays, and the skip-study control. Evidence: `client/views/experiment/svelte/components/CardScreen.svelte:253`, `client/views/experiment/svelte/components/CardScreen.svelte:1072`, `client/views/experiment/svelte/components/CardScreen.svelte:1210`, `client/views/experiment/svelte/components/TrialContent.svelte:167`, `client/views/experiment/svelte/components/TrialContent.svelte:188`, `client/views/experiment/svelte/components/MultipleChoice.svelte:343`, `client/views/experiment/svelte/components/StimulusDisplay.svelte:123`, `client/views/experiment/svelte/components/VideoSessionMode.svelte:635`.

Major card exit motion also uses the wrong tier. The state machine resolves the fade-out duration from `transition_fast`, while major card-content changes should use the theme-controlled smooth tier. Evidence: `client/views/experiment/svelte/machine/cardMachine.ts:1414`, `client/views/experiment/svelte/components/CardScreen.svelte:1283`.

The stimulus surface is not actually controlled by the admin `stimuli_box_color` option in the Svelte card. The admin contract exposes `stimuli_box_color`, but the Svelte stimulus container uses `--card-background-color` and also references broken tokens `--primary-color` and `--border-radius-md`. Evidence: `client/views/theme.html:153`, `public/themes/mofacts-default.json:21`, `public/styles/classic.css:1494`, `client/views/experiment/svelte/components/StimulusDisplay.svelte:263`, `client/views/experiment/svelte/components/StimulusDisplay.svelte:270`, `client/views/experiment/svelte/components/StimulusDisplay.svelte:293`.

`feedback.forceCorrecting` is visually broken. The machine enters the substate, and `CardScreen` enables input for it, but `TrialContent` continues rendering the feedback branch instead of the correction-input branch. Evidence: `client/views/experiment/svelte/machine/cardMachine.ts:940`, `client/views/experiment/svelte/components/CardScreen.svelte:252`, `client/views/experiment/svelte/components/CardScreen.svelte:253`, `client/views/experiment/svelte/components/TrialContent.svelte:167`, `client/views/experiment/svelte/components/ResponseArea.svelte:70`.

The theme motion contract is also unsafe to edit from the admin UI. The editor renders `transition_fast` and `transition_smooth` as numeric inputs, the save path persists raw values, and the machine parser expects CSS time strings with units. Evidence: `client/views/theme.html:408`, `client/views/theme.html:418`, `client/views/theme.ts:372`, `server/methods.ts:7571`, `client/views/experiment/svelte/machine/cardMachine.ts:1431`.

## Theme Property Matrix

| Theme property | Intended use | Svelte card usage locations | Status | Evidence |
| --- | --- | --- | --- | --- |
| `background_color` | Page background | Card screen root and global body background | used correctly | `public/styles/classic.css:131`, `client/views/experiment/svelte/components/CardScreen.svelte:1260` |
| `text_color` | Base text color | Stimulus text, card shell text, SR status text | used correctly | `client/views/experiment/svelte/components/CardScreen.svelte:1266`, `client/views/experiment/svelte/components/StimulusDisplay.svelte:228`, `client/views/experiment/svelte/components/SRStatus.svelte:84` |
| `font_family` | App font family | Card root uses the token, but the global body still has a hardcoded fallback stack | partially used | `public/styles/classic.css:133`, `client/views/experiment/svelte/components/CardScreen.svelte:1261` |
| `font_size_base` | Base font size | Card root uses the token, but major card copy also depends on runtime `--card-font-size` | partially used | `client/views/experiment/svelte/components/CardScreen.svelte:188`, `client/views/experiment/svelte/components/CardScreen.svelte:1262`, `client/views/experiment/svelte/components/StimulusDisplay.svelte:225` |
| `card_background_color` | Card/panel surface | Footer panel, stimulus container, video overlay panel | partially used | `client/views/experiment/svelte/components/CardScreen.svelte:1292`, `client/views/experiment/svelte/components/StimulusDisplay.svelte:294`, `client/views/experiment/svelte/components/VideoSessionMode.svelte:667` |
| `stimuli_box_color` | Stimulus box background | Exposed in admin contract, used in legacy CSS, not used by Svelte stimulus surface | bypassed by fixed CSS / wrong token wiring | `client/views/theme.html:153`, `public/themes/mofacts-default.json:21`, `public/styles/classic.css:1494`, `client/views/experiment/svelte/components/StimulusDisplay.svelte:294` |
| `button_color` | Default button background | Multiple-choice unselected border and hover only | partially used | `client/views/experiment/svelte/components/MultipleChoice.svelte:323`, `client/views/experiment/svelte/components/MultipleChoice.svelte:324`, `client/views/experiment/svelte/components/MultipleChoice.svelte:349` |
| `primary_button_text_color` | Default button text | Multiple-choice unselected text only | partially used | `client/views/experiment/svelte/components/MultipleChoice.svelte:322`, `client/views/experiment/svelte/components/TextInput.svelte:131` |
| `main_button_color` | Card primary CTA background | Submit, confirm, continue, skip-study, selected MC state | used by card but not exposed in admin editor | `public/themes/mofacts-default.json:22`, `server/lib/themeRegistry.ts:36`, `client/views/experiment/svelte/components/TextInput.svelte:132`, `client/views/experiment/svelte/components/CardScreen.svelte:1374`, `client/views/experiment/svelte/components/MultipleChoice.svelte:372` |
| `main_button_text_color` | Card primary CTA text | Same primary CTAs as above | used by card but not exposed in admin editor | `public/themes/mofacts-default.json:23`, `server/lib/themeRegistry.ts:37`, `client/views/experiment/svelte/components/TextInput.svelte:131`, `client/views/experiment/svelte/components/CardScreen.svelte:1375` |
| `accent_color` | Highlight/focus/accent states | Focus borders, timeout warning bar, some panels; not consistently used for selected states | partially used | `client/views/experiment/svelte/components/TextInput.svelte:119`, `client/views/experiment/svelte/components/PerformanceArea.svelte:155`, `client/views/experiment/svelte/components/MultipleChoice.svelte:372` |
| `secondary_color` | Secondary surfaces and borders | Timeout track, borders, dividers, disabled states | used correctly | `client/views/experiment/svelte/components/TrialContent.svelte:274`, `client/views/experiment/svelte/components/PerformanceArea.svelte:142`, `client/views/experiment/svelte/components/TextInput.svelte:110` |
| `secondary_text_color` | Secondary text | Labels, question numbering, disabled text | used correctly | `client/views/experiment/svelte/components/StimulusDisplay.svelte:220`, `client/views/experiment/svelte/components/PerformanceArea.svelte:105`, `client/views/experiment/svelte/components/TextInput.svelte:154` |
| `success_color` | Correct/success states | Feedback, timeout progress, SR recording status | used correctly | `client/views/experiment/svelte/components/FeedbackDisplay.svelte:38`, `client/views/experiment/svelte/components/PerformanceArea.svelte:150`, `client/views/experiment/svelte/components/SRStatus.svelte:88` |
| `alert_color` | Error/incorrect/warning states | Force-correct text, incorrect feedback, SR error/processing | used correctly | `client/views/experiment/svelte/components/ResponseArea.svelte:150`, `client/views/experiment/svelte/components/FeedbackDisplay.svelte:41`, `client/views/experiment/svelte/components/SRStatus.svelte:92` |
| `audio_icon_disabled_color` | Disabled audio icon | Exposed in admin contract but not used by Svelte replay control | not used in card | `client/views/theme.html:352`, `client/views/experiment/svelte/components/StimulusDisplay.svelte:278` |
| `border_radius_sm` | Small radius for controls | Inputs, buttons, feedback image | used correctly | `client/views/experiment/svelte/components/TextInput.svelte:111`, `client/views/experiment/svelte/components/ResponseArea.svelte:168`, `client/views/experiment/svelte/components/FeedbackDisplay.svelte:169` |
| `border_radius_lg` | Large radius for prominent panels | Video overlay panel, continue button, skip-study button | used correctly | `client/views/experiment/svelte/components/VideoSessionMode.svelte:668`, `client/views/experiment/svelte/components/CardScreen.svelte:1356`, `client/views/experiment/svelte/components/CardScreen.svelte:1374` |
| `transition_instant` | Instant motion tier / accessibility fallback | Not directly consumed by the card flow; reduced motion is handled separately | not used in card | `client/views/theme.html:398`, `public/styles/classic.css:1859` |
| `transition_fast` | Quick UI feedback tier | Used for card fade-out and some quick UI, but many quick interactions still hardcode literals | partially used | `server/lib/themeRegistry.ts:51`, `client/views/experiment/svelte/machine/cardMachine.ts:1414`, `client/views/experiment/svelte/components/PerformanceArea.svelte:151` |
| `transition_smooth` | Major content transition tier | Used by parent fade and MC child fade, but not all major swaps are covered by it | partially used | `server/lib/themeRegistry.ts:52`, `client/views/experiment/svelte/components/CardScreen.svelte:1276`, `client/views/experiment/svelte/components/MultipleChoice.svelte:343` |

## Visual State Transition Matrix

| From state / stage | To state / stage | Visible UI change | Expected theme transition tier | Actual implementation | Paint-ready before transition | Compliant | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `appLoading` | first card visual | Loading overlay clears and trial UI becomes visible | `transition_smooth` or `transition_instant` only after the first visible subset is ready | Hardcoded `0.3s` overlay transition, and `appLoading` is cleared as soon as `cardVisualReady` becomes truthy | no | no | `client/index.html:57`, `client/views/experiment/svelte/components/CardScreen.svelte:267`, `client/views/experiment/svelte/components/CardScreen.svelte:270`, `client/views/experiment/svelte/components/CardScreen.svelte:642`, `client/views/experiment/svelte/components/CardScreen.svelte:652` |
| `presenting.loading` | `presenting.readyPrompt` | Optional ready prompt becomes active after card selection | `instant` or no visible motion | No dedicated visual transition | yes | yes | `client/views/experiment/svelte/machine/cardMachine.ts:322`, `client/views/experiment/svelte/machine/cardMachine.ts:338` |
| `presenting.readyPrompt` | `presenting.prestimulus` | Prestimulus content replaces ready prompt | `transition_smooth` for the visible content swap | State machine switches state, but visible motion depends on the later parent fade rather than a fully prepared swap here | unclear | partial | `client/views/experiment/svelte/machine/cardMachine.ts:506`, `client/views/experiment/svelte/machine/cardMachine.ts:514`, `client/views/experiment/svelte/machine/cardMachine.ts:535` |
| `presenting.readyPrompt` | `presenting.fadingIn` | Question shell begins to appear | `transition_smooth` for the whole next visible subset | Parent `.trial-content-fade` uses `--transition-smooth`, but only the shell is transitioning | no | no | `client/views/experiment/svelte/machine/cardMachine.ts:519`, `client/views/experiment/svelte/components/CardScreen.svelte:1072`, `client/views/experiment/svelte/components/CardScreen.svelte:1276`, `client/views/experiment/svelte/components/TrialContent.svelte:188` |
| `presenting.prestimulus` | `presenting.fadingIn` | Prestimulus content hands off to the actual question | `transition_smooth` for the complete question subset | `restoreQuestionDisplay` swaps content and the parent fade proceeds on its own timing | no | no | `client/views/experiment/svelte/machine/cardMachine.ts:534`, `client/views/experiment/svelte/machine/cardMachine.ts:541`, `client/views/experiment/svelte/components/CardScreen.svelte:1072` |
| `presenting.fadingIn` / `presenting.displaying` / `presenting.audioGate` | `presenting.awaiting` | Input controls become available after the display phase | Still part of the major content reveal, so `transition_smooth` should cover the whole set | Inputs mount only after fade-in and optional audio gating complete | no | no | `client/views/experiment/svelte/machine/cardMachine.ts:440`, `client/views/experiment/svelte/machine/cardMachine.ts:451`, `client/views/experiment/svelte/machine/cardMachine.ts:558`, `client/views/experiment/svelte/machine/cardMachine.ts:571`, `client/views/experiment/svelte/components/CardScreen.svelte:253`, `client/views/experiment/svelte/components/TrialContent.svelte:188` |
| `presenting.awaiting.speechRecognition.ready` / `recording` | SR processing or error substates | SR status text and semantic color change | `transition_fast` for quick UI feedback | Instant text/color swap, no theme transition token | yes | partial | `client/views/experiment/svelte/machine/cardMachine.ts:621`, `client/views/experiment/svelte/components/SRStatus.svelte:84`, `client/views/experiment/svelte/components/SRStatus.svelte:88`, `client/views/experiment/svelte/components/SRStatus.svelte:92` |
| `presenting.displaying` or `presenting.audioGate` | `study.preparing` / `study.speaking` / `study.waiting` | Study answer and optional skip-study control appear | `transition_smooth` for the complete study subset | Study content waits one paint tick via `uiPaintService`, but the skip-study button mounts outside the fading subset and no single transition covers the whole visible set | no | no | `client/views/experiment/svelte/machine/cardMachine.ts:470`, `client/views/experiment/svelte/machine/cardMachine.ts:850`, `client/views/experiment/svelte/machine/services.ts:411`, `client/views/experiment/svelte/components/CardScreen.svelte:1210` |
| `presenting.awaiting` | `feedback.preparing` | Response area swaps to feedback content | `transition_smooth` for the whole feedback subset | Branch swap happens inside `TrialContent` with no synchronized parent transition | no | no | `client/views/experiment/svelte/machine/cardMachine.ts:926`, `client/views/experiment/svelte/components/TrialContent.svelte:167` |
| `feedback.preparing` | `feedback.speaking` / `feedback.waiting` | Feedback is visible and optional TTS/countdown starts | `transition_smooth` only after the full feedback subset is ready | Only one `requestAnimationFrame` wait from `uiPaintService`; no readiness check for feedback images or late child work | no | no | `client/views/experiment/svelte/machine/cardMachine.ts:955`, `client/views/experiment/svelte/machine/services.ts:409`, `client/views/experiment/svelte/components/FeedbackDisplay.svelte:164` |
| `feedback.preparing` | `feedback.forceCorrecting` | Incorrect feedback plus correction prompt/input should become visible | `transition_smooth` for the whole force-correct subset | State exists, but `feedbackVisible` branch blocks the correction input from rendering | no | no | `client/views/experiment/svelte/machine/cardMachine.ts:940`, `client/views/experiment/svelte/machine/cardMachine.ts:972`, `client/views/experiment/svelte/components/CardScreen.svelte:252`, `client/views/experiment/svelte/components/TrialContent.svelte:167`, `client/views/experiment/svelte/components/ResponseArea.svelte:70` |
| image preload pending | `imageReady` | Stimulus image becomes visible | Either prepaint inside the parent reveal or no visible post-fade motion | `StimulusDisplay` hides itself with `visibility: hidden` until async image preload completes, while the machine does not wait on that readiness | no | no | `client/views/experiment/svelte/components/StimulusDisplay.svelte:64`, `client/views/experiment/svelte/components/StimulusDisplay.svelte:72`, `client/views/experiment/svelte/components/StimulusDisplay.svelte:93`, `client/views/experiment/svelte/components/StimulusDisplay.svelte:123`, `client/views/experiment/svelte/components/StimulusDisplay.svelte:214`, `client/views/experiment/svelte/machine/services.ts:126`, `client/views/experiment/svelte/machine/services.ts:341` |
| multiple-choice mount | all choices visible | Choice buttons appear | Quick feedback tier at most, or fully prepainted within the parent reveal | Each choice animates itself with `mc-choice-fade-in` using `--transition-smooth` after mount | no | no | `client/views/experiment/svelte/components/MultipleChoice.svelte:331`, `client/views/experiment/svelte/components/MultipleChoice.svelte:343`, `client/views/experiment/svelte/components/MultipleChoice.svelte:382` |
| timeout state changes | updated timeout bar | Timeout bar width and semantic color update | `transition_fast` | Hardcoded `0.1s` width and `0.3s` color transitions | yes | partial | `client/views/experiment/svelte/components/PerformanceArea.svelte:147`, `client/views/experiment/svelte/components/PerformanceArea.svelte:151`, `client/views/experiment/svelte/components/PerformanceArea.svelte:155`, `client/views/experiment/svelte/components/PerformanceArea.svelte:159` |
| `transition.trackingPerformance` | `transition.fadingOut` / `transition.clearing` | Whole current card exits | `transition_smooth` | Fade-out duration resolves from `--transition-fast` | yes | no | `client/views/experiment/svelte/machine/cardMachine.ts:1106`, `client/views/experiment/svelte/machine/cardMachine.ts:1142`, `client/views/experiment/svelte/machine/cardMachine.ts:1151`, `client/views/experiment/svelte/machine/cardMachine.ts:1414`, `client/views/experiment/svelte/components/CardScreen.svelte:1283`, `client/views/experiment/svelte/components/CardScreen.svelte:1285` |
| `videoWaiting` | overlay question visible | Video overlay panel and question subset appear above the video | `transition_smooth` for the whole overlay subset | Overlay surface mounts instantly in `VideoSessionMode`; inner card content uses the same trial-content fade later | no | no | `client/views/experiment/svelte/machine/cardMachine.ts:1192`, `client/views/experiment/svelte/components/VideoSessionMode.svelte:635`, `client/views/experiment/svelte/components/VideoSessionMode.svelte:661`, `client/views/experiment/svelte/components/CardScreen.svelte:1072` |
| `videoWaiting` | `videoEnded` | End overlay and continue button appear | `transition_smooth` | Overlay mounts instantly with no theme-tier transition | no | no | `client/views/experiment/svelte/machine/cardMachine.ts:1215`, `client/views/experiment/svelte/machine/cardMachine.ts:1234`, `client/views/experiment/svelte/components/CardScreen.svelte:1131`, `client/views/experiment/svelte/components/CardScreen.svelte:1343` |

## Findings

- Severity: High
  Title: Parent fade starts before the next visible subset is fully ready
  References: `client/views/experiment/svelte/components/CardScreen.svelte:253`, `client/views/experiment/svelte/components/CardScreen.svelte:1072`, `client/views/experiment/svelte/components/CardScreen.svelte:1210`, `client/views/experiment/svelte/components/TrialContent.svelte:167`, `client/views/experiment/svelte/components/TrialContent.svelte:188`, `client/views/experiment/svelte/components/MultipleChoice.svelte:343`, `client/views/experiment/svelte/components/VideoSessionMode.svelte:635`
  Why it is a problem: The major card reveal is not a single paint-ready subset. Inputs, feedback, study controls, skip-study, multiple-choice buttons, and video overlays still appear after the fade has already started.
  Type: transition-tier issue; paint/readiness issue

- Severity: High
  Title: Image readiness is local to `StimulusDisplay` and not part of card-level reveal gating
  References: `client/views/experiment/svelte/components/StimulusDisplay.svelte:64`, `client/views/experiment/svelte/components/StimulusDisplay.svelte:72`, `client/views/experiment/svelte/components/StimulusDisplay.svelte:93`, `client/views/experiment/svelte/components/StimulusDisplay.svelte:123`, `client/views/experiment/svelte/components/StimulusDisplay.svelte:214`, `client/views/experiment/svelte/machine/services.ts:126`, `client/views/experiment/svelte/machine/services.ts:341`, `client/views/experiment/svelte/components/CardScreen.svelte:267`
  Why it is a problem: The machine exposes `prefetchImage`, but the reveal pipeline does not wait for it. `StimulusDisplay` hides uncached images on its own, so visible card content can still pop in after the card transition begins.
  Type: paint/readiness issue

- Severity: High
  Title: `feedback.forceCorrecting` is functionally inaccessible in the rendered UI
  References: `client/views/experiment/svelte/machine/cardMachine.ts:940`, `client/views/experiment/svelte/machine/cardMachine.ts:972`, `client/views/experiment/svelte/components/CardScreen.svelte:252`, `client/views/experiment/svelte/components/CardScreen.svelte:253`, `client/views/experiment/svelte/components/TrialContent.svelte:167`, `client/views/experiment/svelte/components/ResponseArea.svelte:70`
  Why it is a problem: The state machine supports force-correct mode and `ResponseArea` has a dedicated correction-input path, but `TrialContent` keeps rendering feedback whenever `feedbackVisible` is true. The visible force-correct state is therefore broken.
  Type: paint/readiness issue

- Severity: High
  Title: Stimulus-box theming is bypassed and `StimulusDisplay` uses broken tokens
  References: `client/views/theme.html:153`, `public/themes/mofacts-default.json:21`, `public/styles/classic.css:1494`, `client/views/experiment/svelte/components/StimulusDisplay.svelte:253`, `client/views/experiment/svelte/components/StimulusDisplay.svelte:263`, `client/views/experiment/svelte/components/StimulusDisplay.svelte:270`, `client/views/experiment/svelte/components/StimulusDisplay.svelte:293`, `client/views/experiment/svelte/components/StimulusDisplay.svelte:294`
  Why it is a problem: The admin contract exposes `stimuli_box_color`, but the Svelte card instead uses `card_background_color` for the stimulus box, while replay-button styling depends on undefined `--primary-color` and `--border-radius-md`. That is both a contract mismatch and a broken-token problem.
  Type: theme-token issue; hardcoded-style issue; broken token

- Severity: High
  Title: Theme motion values can be saved in a format the runtime will reject
  References: `client/views/theme.html:399`, `client/views/theme.html:408`, `client/views/theme.html:418`, `client/views/theme.ts:372`, `client/views/theme.ts:378`, `server/methods.ts:7571`, `client/views/experiment/svelte/machine/cardMachine.ts:1427`, `client/views/experiment/svelte/machine/cardMachine.ts:1431`
  Why it is a problem: Theme editor fields for transition tiers are numeric inputs, the client applies and saves the raw value, and `getCssDuration` only accepts values ending in `ms` or `s`. Motion tiers are therefore not safe end to end as an editable theme contract.
  Type: theme-token issue; transition-tier issue

- Severity: Medium
  Title: Major card exit uses the fast tier instead of the smooth tier
  References: `client/views/experiment/svelte/machine/cardMachine.ts:1413`, `client/views/experiment/svelte/machine/cardMachine.ts:1414`, `client/views/experiment/svelte/components/CardScreen.svelte:1276`, `client/views/experiment/svelte/components/CardScreen.svelte:1285`
  Why it is a problem: The same parent element uses `--transition-smooth` for the reveal path but `--transition-fast` for fade-out. Major card-state changes should use the smooth semantic tier in both directions.
  Type: transition-tier issue

- Severity: Medium
  Title: Several visible interactions still hardcode motion literals
  References: `client/index.html:57`, `client/views/experiment/svelte/components/StimulusDisplay.svelte:262`, `client/views/experiment/svelte/components/TextInput.svelte:112`, `client/views/experiment/svelte/components/TextInput.svelte:140`, `client/views/experiment/svelte/components/ResponseArea.svelte:170`, `client/views/experiment/svelte/components/PerformanceArea.svelte:151`, `client/views/experiment/svelte/components/CardScreen.svelte:1381`
  Why it is a problem: The loading overlay, replay button, text input, confirm button, timeout bar, and skip-study button all use fixed durations instead of the theme motion tiers. Motion feel is therefore only partially theme-controlled.
  Type: hardcoded-style issue; transition-tier issue

- Severity: Medium
  Title: Primary card CTA styling depends on hidden theme properties
  References: `public/themes/mofacts-default.json:22`, `public/themes/mofacts-default.json:23`, `server/lib/themeRegistry.ts:36`, `server/lib/themeRegistry.ts:37`, `client/views/experiment/svelte/components/TextInput.svelte:131`, `client/views/experiment/svelte/components/ResponseArea.svelte:161`, `client/views/experiment/svelte/components/CardScreen.svelte:1359`, `client/views/experiment/svelte/components/CardScreen.svelte:1377`, `client/views/experiment/svelte/components/MultipleChoice.svelte:372`
  Why it is a problem: Card submit, confirm, continue, skip, and selected-choice states are governed by `main_button_*`, but those properties are not exposed in `client/views/theme.html`. The visible card identity is therefore only partially editable through the admin theme UI.
  Type: theme-token issue; theme-option gap

- Severity: Medium
  Title: The declared theme contract is inconsistent across default sources
  References: `public/themes/mofacts-default.json:20`, `public/themes/mofacts-default.json:21`, `server/lib/themeRegistry.ts:36`, `server/lib/themeRegistry.ts:48`, `server/lib/themeRegistry.ts:49`, `public/styles/classic.css:9`, `public/styles/classic.css:133`
  Why it is a problem: Some card-visible properties live only in JSON defaults, others only in registry fallback or root CSS variables. Those mismatches make fixed CSS act as a hidden fallback layer for the card.
  Type: theme-token issue

## Theme Option Gaps

- Current implementation: hidden `main_button_color` and `main_button_text_color` runtime properties govern card submit, confirm, continue, skip-study, and selected multiple-choice states.
  Where used: `client/views/experiment/svelte/components/TextInput.svelte:131`, `client/views/experiment/svelte/components/ResponseArea.svelte:161`, `client/views/experiment/svelte/components/CardScreen.svelte:1359`, `client/views/experiment/svelte/components/CardScreen.svelte:1377`, `client/views/experiment/svelte/components/MultipleChoice.svelte:372`
  Why expose it: These are the card's primary CTA surfaces and materially define visual identity and feedback tone.
  Recommended theme property name: `main_button_color`, `main_button_text_color`
  Recommended CSS variable name: `--main-button-color`, `--main-button-text-color`
  Priority: High

- Current implementation: replay/audio control color depends on undefined `--primary-color`, while disabled appearance relies on generic opacity and grayscale.
  Where used: `client/views/experiment/svelte/components/StimulusDisplay.svelte:263`, `client/views/experiment/svelte/components/StimulusDisplay.svelte:270`, `client/views/experiment/svelte/components/StimulusDisplay.svelte:278`
  Why expose it: Audio controls are prominent interactive elements and currently are not under a valid card-theme token.
  Recommended theme property name: `audio_control_color`
  Recommended CSS variable name: `--audio-control-color`
  Priority: High

- Current implementation: video session background is tied to `text_color`.
  Where used: `client/views/experiment/svelte/components/VideoSessionMode.svelte:647`, `client/views/experiment/svelte/components/VideoSessionMode.svelte:690`
  Why expose it: Video sessions behave like a distinct full-screen mode and should not have to inherit body text color semantics.
  Recommended theme property name: `video_background_color`
  Recommended CSS variable name: `--video-background-color`
  Priority: Medium

- Current implementation: video overlay surface and end overlay backdrop use internal `color-mix` formulas.
  Where used: `client/views/experiment/svelte/components/VideoSessionMode.svelte:667`, `client/views/experiment/svelte/components/VideoSessionMode.svelte:669`, `client/views/experiment/svelte/components/CardScreen.svelte:1349`
  Why expose it: These overlays dominate the feel of video checkpoints and end-of-video transitions.
  Recommended theme property name: `video_overlay_surface_color`, `video_overlay_backdrop_color`
  Recommended CSS variable name: `--video-overlay-surface-color`, `--video-overlay-backdrop-color`
  Priority: High

- Current implementation: prominent surface shadows are hardcoded.
  Where used: `client/views/experiment/svelte/components/StimulusDisplay.svelte:265`, `client/views/experiment/svelte/components/StimulusDisplay.svelte:271`, `client/views/experiment/svelte/components/VideoSessionMode.svelte:669`, `client/views/experiment/svelte/components/MultipleChoice.svelte:354`
  Why expose it: Shadow feel affects the card's overall visual identity across multiple prominent surfaces.
  Recommended theme property name: `surface_shadow`
  Recommended CSS variable name: `--surface-shadow`
  Priority: Medium

- Current implementation: loading overlay color is hardcoded.
  Where used: `client/index.html:57`
  Why expose it: The initial loading handoff is visible to the learner and should be able to match the active theme.
  Recommended theme property name: `loading_overlay_color`
  Recommended CSS variable name: `--loading-overlay-color`
  Priority: Medium

- Current implementation: performance divider color is a fixed literal.
  Where used: `client/views/experiment/svelte/components/PerformanceArea.svelte:124`
  Why expose it: The divider sits in a persistent card HUD and contributes to surface tone and contrast.
  Recommended theme property name: `performance_divider_color`
  Recommended CSS variable name: `--performance-divider-color`
  Priority: Low

## Final Implementation List

- Rebuild the reveal and exit pipeline so a single parent `transition_smooth` covers the whole newly visible card subset for question, study, feedback, and video-overlay states.
- Add explicit readiness signals for image decode, response-control mount, feedback asset readiness, and video overlay readiness, and do not start reveal or clear `appLoading` until those signals resolve.
- Remove or fold child entrance animations into the parent reveal. Multiple-choice per-choice fade, skip-study appearance, overlay mount pop-in, and late control handoffs cannot remain independent if transition correctness is required.
- Fix `feedback.forceCorrecting` so the visible correction prompt and input actually render and transition as part of the same subset as the feedback handoff.
- Repair Svelte theme token wiring in `StimulusDisplay` and related controls so the card uses `stimuli_box_color`, valid radius tokens, and valid audio-control tokens.
- Normalize theme motion values end to end across the admin editor, client preview path, persistence layer, and runtime parser, then move major exit motion from the fast tier to the smooth tier.
- Align the theme contract sources so card-visible properties are not silently governed by fixed CSS defaults outside the admin-editable contract.
