# SPARC Fractions 1416 Branch Map

Source inspected: <https://tat.pact.cs.cmu.edu/releases/CTAT_4_4/1416.brd>

The BRD is an example-tracing graph with production-rule labels on edges. The graph edges define branch membership and ordering. The `<rule><text>...</text></rule>` entries identify the KC / production label attached to each edge, but they are not full executable production-rule code.

This map is converter evidence only. Runtime behavior should be generated as SPARC `initialState`, working-memory facts, and production-rule state writes; the learner runtime should not consult a separate branch-map object.

## Branch Selector

Both valid branches start at state `1:1416` and are selected by the first converted denominator.

| Branch | Selector edge | Rule label | Active path fact |
| --- | --- | --- | --- |
| LCD | `firstDenConv UpdateTextArea 12` | `determine-lcd fraction-addition` | `active-common-denominator.path = lcd-12` |
| Product denominator | `firstDenConv UpdateTextArea 24` | `multiply-denominators fraction-addition` | `active-common-denominator.path = common-denominator-24` |

Production-rule implication: the branch selector must replace the prior active denominator/path fact, not accumulate a second active path. In SPARC this is represented with `assert-fact.identitySlots: ["name"]` on the `active-common-denominator` model fact.

## LCD Branch

| Order | From -> To | SAI | Rule label | Production implication |
| --- | --- | --- | --- | --- |
| 1 | `1:1416 -> 2:state1` | `firstDenConv UpdateTextArea 12` | `determine-lcd` | Select LCD path and persist active denominator `12`. |
| 2 | `2:state1 -> 7:state6` | `secDenConv UpdateTextArea 12` | `determine-lcd` | Require active path `lcd-12`; persist second converted denominator. |
| 3 | `7:state6 -> 8:state7` | `ansDen1 UpdateTextArea 12` | `copy-answer-denominator` | Require active denominator `12`; persist intermediate denominator. |
| 4 | `8:state7 -> 9:state8` | `firstNumConv UpdateTextArea 3` | `convert-numerator` | Require active path/denominator `lcd-12` or active denominator `12`. |
| 5 | `9:state8 -> 10:state9` | `secNumConv UpdateTextArea 2` | `convert-numerator` | Require active path/denominator `lcd-12` or active denominator `12`. |
| 6 | `10:state9 -> 11:state10` | `ansNum1 UpdateTextArea 5` | `add-numerators` | Require both LCD converted numerator facts. |
| 7 | `11:state10 -> 12:state11` | `ansNumFinal1 UpdateTextArea 5` | `reduce-numerator` | Graph includes final numerator even on LCD path; display policy may choose whether this is visible or auto-filled. |
| 8 | `12:state11 -> 13:state12` | `ansDenFinal1 UpdateTextArea 12` | `reduce-denominator` | Graph includes final denominator even on LCD path; display policy may choose whether this is visible or auto-filled. |
| 9 | `13:state12 -> 14:Done` | `done ButtonPressed -1` | `unnamed` | Done requires completed LCD branch facts. |

## Product-Denominator Branch

| Order | From -> To | SAI | Rule label | Production implication |
| --- | --- | --- | --- | --- |
| 1 | `1:1416 -> 3:state2` | `firstDenConv UpdateTextArea 24` | `multiply-denominators` | Select product path and persist active denominator `24`. |
| 2 | `3:state2 -> 15:state14` | `secDenConv UpdateTextArea 24` | `multiply-denominators` | Require active path `common-denominator-24`; persist second converted denominator. |
| 3 | `15:state14 -> 16:state15` | `secNumConv UpdateTextArea 4` | `convert-numerator` | Require active path/denominator `common-denominator-24` or active denominator `24`. |
| 4 | `16:state15 -> 17:state16` | `firstNumConv UpdateTextArea 6` | `convert-numerator` | Require active path/denominator `common-denominator-24` or active denominator `24`. |
| 5 | `17:state16 -> 18:state17` | `ansNum1 UpdateTextArea 10` | `add-numerators` | Require both product-path converted numerator facts. |
| 6 | `18:state17 -> 19:state18` | `ansDen1 UpdateTextArea 24` | `copy-answer-denominator` | Require active denominator `24`; persist intermediate denominator. |
| 7 | `19:state18 -> 20:state19` | `ansDenFinal1 UpdateTextArea 12` | `reduce-denominator` | Require intermediate `10/24` or product path. |
| 8 | `20:state19 -> 21:state20` | `ansNumFinal1 UpdateTextArea 5` | `reduce-numerator` | Require intermediate `10/24` or product path. |
| 9 | `21:state20 -> 22:Done_2` | `done ButtonPressed -1` | `unnamed` | Done requires completed product branch facts. |

## Buggy Start-State Edges

| From | SAI | Message | Production implication |
| --- | --- | --- | --- |
| `1:1416` | `firstDenConv UpdateTextArea 10` | "Instead of trying to add the denominators..." | Buggy production for adding denominators. |
| `1:1416` | `secDenConv UpdateTextArea 10` | "Instead of trying to add the denominators..." | Same buggy production, but on second denominator before branch selection. |
| `1:1416` | `ansNum1 UpdateTextArea 2` | "You can't add the numerators until you've converted the fractions." | Premature numerator-addition buggy production. |

## Runtime Invariants

- Only one `active-common-denominator` fact may be current.
- Branch-specific facts should use stable identities:
  - `active-common-denominator`: `["name"]`
  - `converted-denominator`: `["name", "fraction"]`
  - `converted-numerator`: `["name", "fraction"]`
  - intermediate/final answer facts: `["name"]`
  - `completed`: `["name"]`
- Numerator rules must not accept values from a stale branch. Example: after revising `firstDenConv` from `24` to `12`, `firstNumConv = 6` must not fire `convert-numerator`.
- Done must be gated by completed branch facts. It should not be a freestanding correct button action from an incomplete state.
- Display visibility should be produced by rules that consume the same active path state. Product-branch simplification/final-answer widgets should not be active on the LCD path unless the authored display intentionally asks the learner to confirm the already-simplified final answer.

## Converter Implications

The BRD graph must be converted as behavior, not ignored as layout noise.

- Edge source and destination states define ordering and branch membership.
- Edge SAI triples define observable learner actions.
- Edge `<rule>` labels define KC / production attribution.
- Divergent edges from the same source state define branch selectors.
- Downstream edges reachable only from one branch must become production conditions over explicit branch facts.
- Done-state edges must become completion rules gated by the branch facts that precede the done edge.
- Branch-specific UI nodes should be hidden, disabled, progressively revealed, or otherwise controlled from the same branch facts. This replaces the example-tracing graph's implicit path gating.
