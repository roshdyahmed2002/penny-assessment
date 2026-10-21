# Implementation Notes

## 1. What I changed

- Fixed diff classification: a matching SKU is changed when quantity, unit price, or description differs. The original comparison checked only unit price, so quantity and description changes could be hidden as unchanged.
- Gated Approve and Reject on both `PENDING_APPROVAL` status and the current user's approval policy. Approve remains visible but disabled when the user cannot act; Reject is only offered when the user can act.
- Completed the list status filter while retaining explicit loading, loaded, empty, and error states. Retry reloads the list after an API error.
- Improved the detail history's readability with clearer event spacing and formatted dates. Added before/after description columns to the diff so changes such as CR-2's supplier description are visible. The detail also renders totals and diff rows, reloads on selected-id changes, and ignores responses for an old id.
- Implemented Approve and Reject with a required, non-whitespace rejection reason. While an action is pending, both controls are disabled. Successful responses update the detail; errors trigger a reload because the mock can save before rejecting. The list refreshes after an action completes.

## 2. Component & state model

The list and detail components each expose a `ViewState<T>` with `idle`, `loading`, `loaded`, `empty`, and `error` statuses. The list loads org-scoped summaries from `CrApiService`; `visibleRows` derives the displayed rows from the current status filter. Selecting a row emits its id to the app shell.

The detail component loads one `CrDetail` by id. Its getters derive the diff, chronological timeline, formatted values, and permission-aware action eligibility for the template. If the input id changes, it loads the new CR and ignores any response belonging to the previous id. Action state is kept separately: `submitting` prevents overlapping actions, `actionError` represents a failed action that left the CR pending, and `rejectControl` stores and validates the reason. The shell listens for `actionDone` and reloads the list.

## 3. Invariants I keep

| Invariant | How / where |
|---|---|
| Actions require pending status and approval permission. | `canApprove` checks status and policy; `canReject` uses the same status-and-policy rule. Methods guard again before calling the API. |
| Only one action runs at a time. | `submitting` guards both methods and disables both template buttons. |
| The detail does not optimistically assume an action succeeded. | The loaded response from the API becomes the detail state. |
| A failed action is reconciled with server state. | `runAction` reloads after a failure; the mock's `failNext` can save before returning its error. |
| Responses for a previously selected id are ignored. | `load` and `runAction` capture the id and compare it after awaiting. |
| A rejection requires a real reason. | Required and non-whitespace validators guard the control; `reject` trims the reason before submission. |
| Timeline ordering does not mutate API data. | The getter sorts a copied audit array by timestamp. |

## 4. Testing strategy

The suite has 30 Jest tests. Pure diff tests cover added, removed, unchanged, and changes to each compared field. Component tests assert rendered list/detail states, filter behavior, diff rows, totals, timeline order, and permission gating. Action tests cover reason validation, API calls, success rendering, slow requests, failures with and without a saved transition, and a failed recovery reload. They use the mock API's `latencyMs` and `failNext`, spies, and fake timers rather than real network delays.

## 5. Assumptions

- Reject uses the same approval policy as Approve because the README defines no separate reject policy.
- The provided permission helper checks whether any approval policy is present. The UI does not determine whether a `cr_a_u` policy applies to a particular CR, because the available contract does not expose that scope check.
- A description-only difference counts as a changed line item, even when quantity and price are unchanged.
- Baseline and proposed totals, and the delta, come from the API rather than being recalculated in the component.
- I kept Approve visible but disabled when the user lacks approval permission or the CR is not pending, as in the starter template and original viewer test. I interpreted the acceptance criterion that read-only users get “no enabled actions” as allowing this disabled button; Task 4's phrase “cannot see/enable actions” could also be read more strictly. Reject remains hidden unless the user can act.

## 6. Where I used AI
I led the implementation process, made the technical decisions, and reviewed the changes throughout the assessment. GitHub Copilot was used as an assisting tool to explore implementation approaches, suggest test cases, and clarify specific technical behaviors. I reviewed its suggestions against the assessment requirements, validated the resulting implementation, and ran the relevant project checks to ensure correctness.

## 7. What I'd improve with more time

- Show action-specific progress text such as “Approving…” or “Rejecting…” while keeping the buttons disabled during submission.
- Add a server-supported idempotency key so retrying an action after an uncertain response cannot apply it twice.
- Explain why actions are unavailable, for example by distinguishing a non-pending CR from a missing user permission.
- Show an explicit no-matches state when a status filter returns no rows, rather than leaving an empty table body.
- If the real API uses `HttpClient`, consider Observables and request cancellation to manage in-flight loads when the selected CR changes.
