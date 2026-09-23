# REPORT

_A condensed three-page version of this document is at [REPORT.pdf](REPORT.pdf)._

## 1. Architecture

Understudy is a monorepo of eight TypeScript packages and four apps that together implement the discover → record → replay pipeline.

| Package            | Role                                                                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **schemas**        | Zod schemas for every shared type. Runtime validators, not just compile-time types — load-bearing at four boundaries: model output, artifact files, typed extraction, API surface. |
| **surface**        | `Surface` interface backed by `PlaywrightSurface`. The seam for heterogeneous surfaces (§4).                                                                                       |
| **model-provider** | One interface, one method (`completeWithTools`), two adapters: Gemini (default) and Ollama (local, no API key).                                                                    |
| **discovery**      | The model-driven observe → decide → act loop. Four tools, a step budget, a time budget, a policy check before every action.                                                        |
| **recorder**       | Distills a run log into an artifact: drops dead ends, derives locator ladders and checkpoints, parameterises by provenance, shapes business outcomes.                              |
| **replay**         | The deterministic executor. Resolves ladders, asserts checkpoints, extracts typed outputs, classifies the outcome. Cannot reach a model — it does not depend on `model-provider`.  |
| **redaction**      | Masks policy-declared field names and patterns across run logs and artifacts at the write boundary.                                                                                |
| **session**        | State machine (idle → running → paused → handed_off), append-only ledger, intervention raising, operator handoff and hand-back.                                                    |

| App            | Role                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **target-app** | A deliberately hostile Express stand-in for a legacy credit-union portal: server-generated IDs, bare `<td>` labels, form-posted navigation, session timeout served as HTTP 200. |
| **cli**        | `discover`, `replay`, `task`, and a `handoff` demonstration.                                                                                                                    |
| **server**     | NestJS: REST for capabilities, runs, interventions and policy; a WebSocket gateway for run log streaming.                                                                       |
| **client**     | Next.js console. Reads `evidence/` from disk, or the server when `NEXT_PUBLIC_API_URL` is set.                                                                                  |

**Why a server and a console at all.** The artifact is the deliverable, and an artifact nobody reads is an opaque policy with extra steps. The console exists to make one reviewable: the capability catalog, the discovery trace that produced it, the replay results that tested it, and the intervention inbox where a stuck run surfaces. The server exists so those outlive one operator's disk. Both are optional and neither is on the path of any core operation — the CLI writes everything to `evidence/`, and the console reads that directory directly unless pointed at a server.

**Why NestJS and Next.js specifically.** The server needs two things that usually fight each other: a conventional REST surface over four resources, and a push channel for streaming a run log while it is still being written. NestJS gives both from one module graph — controllers for the resources, a WebSocket gateway sharing the same providers — so the streaming path is not a second application bolted on. The console is read-heavy and mostly static per artifact, which is what Next.js server components are for: the capability catalog and discovery traces render on the server with no client-side fetching, and only the intervention inbox needs interactivity. Neither choice is load-bearing on the argument this project makes; both were picked to keep the optional half small rather than to demonstrate anything.

**Key architectural bet: replay before discovery.** The executor was built and tested with hand-written artifacts before the LLM loop existed. This made the replay engine testable at zero LLM cost and meant discovery only needed to produce an artifact that matched an already-proven contract.

**No database.** The filesystem is the persistence layer — artifacts are JSON, run logs are JSONL, screenshots are PNGs, all under `evidence/<capability-slug>/<phase>/<run-id>/`. For a system whose deliverable is a curated evidence directory, this is the right call. The schemas are shaped so a future migration to Postgres would store artifacts as `jsonb` unchanged.

## 2. Artifact schema

The `Capability` schema (Zod, ~170 lines) is the contract between discovery and replay. It declares:

| Field              | Purpose                                                                                                                                                                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inputs`           | Typed parameters the caller supplies per invocation. Each has a `valueType`, `required` flag, and `secret` flag. Secrets are held by reference — the step carries `{{operatorPassword}}`, never the value.                                                                         |
| `outputs`          | Typed values the replayer extracts and returns. Each names a `valueType` so the extraction phase can coerce raw text (e.g. `"$4,182.90"` → `4182.9`).                                                                                                                              |
| `steps`            | Ordered actions: `navigate`, `click`, `fill`. Each carries a locator ladder (see below), an optional wait condition (`pageLoad`, `selectorPresent`, `textPresent`, `fixedDelay`), and a `risk` of `reversible` or `irreversible`.                                                  |
| `checkpoints`      | Assertions evaluated after a step completes: `text_present`, `text_absent`, `element_present`, `url_matches`. All must pass (conjunction). Derived automatically during recording — a `url_matches` after each page transition and a `results-present` for each extraction target. |
| `extractions`      | Maps each declared output to a locator ladder and a `valueType` for coercion.                                                                                                                                                                                                      |
| `businessOutcomes` | Rules that reclassify specific failures as expected answers. Each carries a `condition` (which step or checkpoint failed) **and** a `signal` — something the page must positively show for the rule to fire.                                                                       |
| `expectedDialogs`  | Native dialog text this flow legitimately raises. Anything else is an `unexpected_dialog` failure.                                                                                                                                                                                 |
| `interstitials`    | Notices that can appear over the flow and be cleared without changing anything, each with a `when` signal and a `dismiss` locator ladder.                                                                                                                                          |
| `provenance`       | Which model discovered it, when, and the discovery run ID.                                                                                                                                                                                                                         |

**Why this shape:**

_Locator ladders._ Each element is identified by 1–3 ranked strategies, most durable first: accessible name → label-anchored walk → CSS selector. Resolution runs against the in-memory observation snapshot (microseconds), not the live page. Which rung resolved is recorded in the run log — a free drift signal. The `adjacent` strategy exists because the target app's `<td>Label:</td><td><input></td>` pattern leaves inputs with no accessible name; the resolver walks from the label cell to the neighboring input.

_Signals on business outcomes._ The field the schema most depends on, and the one it originally lacked. A rule keyed only on "checkpoint X failed" fires for every reason that checkpoint can fail — an empty result set, a rejected input, an expired session and a 500 all arrive through the same failed assertion. So a rule must also declare a `signal`: text the page shows when _this_ outcome is the right one. `superRefine` rejects a `text_absent` signal, since a rule firing on an absence reintroduces the ambiguity the field exists to remove. The example artifact carries two outcomes that stop on the same step with the same failure code, separated only by `No records matched` versus `SEC-MBR-004`.

_Risk is recorded, not inferred._ Whether a step can be undone is decided at record time from the policy's `irreversibleControlLabels`, matched against every name the page hangs on the control. It cannot be deferred to replay: by the time replay is looking at the button, it is already on the page it would be changing. A recording made without a policy marks everything `reversible` rather than guessing — replay then treats the artifact as unguarded rather than as safe.

_`approved` has to be earned, not claimed._ The recorder emits `draft`. Discovery then replays the artifact it just wrote, once, with the same inputs, and promotes it to `approved` only if the checkpoints hold _and_ the extracted outputs match what discovery itself read off the page. Anything else stays a draft, and the unattended `task` path refuses drafts. Without this, `approved` means only that the model said it had succeeded — a claim about its own work, checked by nobody, which is the weakest possible basis for the one status the system uses to decide what may run unsupervised. Comparison is normalised, so `$4,182.90` and `4182.9` are the same answer.

_Re-discovery archives rather than overwrites._ A goal that slugs to an existing capability id bumps `version` and renames the previous file to `capability.v1.json`. Re-recording is how an artifact gets fixed after the application changes, and it is also how a working artifact gets silently replaced by a worse one — the old file is the only way to tell which happened.

_Cross-field validation._ The schema's `superRefine` enforces five integrity rules at parse time: extractions must reference declared outputs, checkpoints must anchor to real step IDs, business outcome rules must reference real steps or checkpoints, business outcome signals must be positive assertions, and `{{placeholder}}`s in navigate URLs and fill values must name declared inputs. A placeholder anywhere else (locator, wait condition) is rejected outright — `resolveActionInputs` only substitutes those two fields.

_Input provenance._ During recording, a filled value traceable to the run's declared inputs or the operator's goal becomes a `{{placeholder}}`; a value the model supplied from nowhere becomes a hardcoded constant. This means the artifact is parameterized without the model being asked to think about parameterization.

_Credentials are placeholders before they are anything else._ The discovery prompt names the run's inputs but never their values, and instructs the model to type `{{operatorPassword}}` literally. Substitution happens at the page boundary, on the way into `fill`. So the secret is absent from the prompt, the conversation and the run log by construction rather than by redaction — there is no point at which it is present and then removed. The earlier prompt told the model to try `admin`/`admin`, which is where the hardcoded username in older artifacts came from.

## 3. Determinism & error handling

**How replay is deterministic.** The executor walks steps in order, substitutes `{{name}}` placeholders, resolves each ladder against the current page, and calls `surface.act()` with the step's wait condition. No model is invoked. The only non-determinism left is the target app — network timing and data state — which is what checkpoints and wait conditions exist to absorb. Each step declares how to wait (`pageLoad`, `selectorPresent`, `textPresent`, `fixedDelay`); discovery records whichever worked and replay reuses it. A click that navigates uses `Promise.all([waitCondition, click()])`, so the listener is attached before the click fires rather than after the navigation has already started.

**Error taxonomy — four outcome classes:**

1. **`success`** — all steps completed, all checkpoints passed, all extractions coerced. Returns `outputs`.
2. **`business_outcome`** — the flow worked and the answer is negative. Carries a `code` and an operator-readable `message`.
3. **`recovered`** — the outputs were reached, but not first time. Carries the same `outputs` a success does plus a `recoveries` list saying what was cleared: `retried_read` or `dismissed_interstitial`, each with the step and a description. The CLI exits 0 for this, same as a success — from the caller's side it is one.
4. **`failed`** — an unrecoverable failure. Carries `failureCode`, `message`, `failedAtStepId`, and `interventionRaised`.

**The order these are decided in is the contract.** A failed checkpoint says only that the expected result is missing; it never says why. Deciding business outcomes first — which is what this classifier did originally — means the first rule listed wins for every cause, and an expired session comes back to the caller as "no such member". The order is now explicit:

1. **Completed?** → `success`, or `recovered` if anything had to be cleared to get there.
2. **Is the failure about the run rather than the answer?** `session_expired`, `app_error`, `unexpected_dialog`, `approval_required` and `policy_denied` can never be a business outcome, whatever the page happens to say.
3. **Does a declared rule match?** Both halves must hold: the condition (which step or checkpoint failed) _and_ the signal (what the page positively shows). Replay checks the signal against the live page and records the verdict for every rule whose condition matched — so a rule refused on evidence is a visible line in the run log, not a silent difference in the answer.
4. **Otherwise** → `failed`.

**Runtime conditions the brief names, and what each returns.** Every row is a target-app trigger with a test behind it, as reported by the hand-written example artifact — whose rules were written already knowing the taxonomy:

| Condition          | Trigger        | Result                                     |
| ------------------ | -------------- | ------------------------------------------ |
| Record not found   | member `99999` | `business_outcome` / `member_not_found`    |
| Validation error   | member `88888` | `business_outcome` / `validation_rejected` |
| Permission denial  | member `55555` | `business_outcome` / `access_denied`       |
| Transient slowness | member `66666` | `recovered` via `retried_read`             |
| Known interstitial | member `22222` | `recovered` via `dismissed_interstitial`   |
| Unexpected dialog  | member `33333` | `failed` / `unexpected_dialog`, escalated  |
| App error          | member `44444` | `failed` / `app_error`                     |
| Session timeout    | member `77777` | `failed` / `session_expired`, escalated    |

`99999` and `55555` stop on the same step with the same failure code. Only their signals tell them apart, which is the demonstration that the signal is load-bearing rather than decorative.

**What a real discovery actually produced.** `evidence/` also holds an artifact Gemini discovered against this same flow, unedited.

**The happy path works.** The discovered artifact replays the core flow — log in, search a member, read the savings balance — correctly and repeatably, including for member numbers the discovery run never saw. Discovery found the path, the recorder froze it, and replay follows it deterministically with no model in the loop. That is the loop this project set out to demonstrate, and it holds.

What the nine-scenario replay measures is something narrower: which _edge cases_ each half of the system can recognise. It splits the taxonomy cleanly in two:

| Detected by mechanism — 4 of 4 correct                         | Dependent on what the artifact declares — 0 of 5 correct                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `success`, `unexpected_dialog`, `app_error`, `session_expired` | `member_not_found`, `validation_rejected`, `access_denied`, and both recoverable conditions |

Three distinct faults, none of them the model being careless:

1. **A rule that is unreachable by construction.** The model proposed `member_not_found` and keyed it on the checkpoint that follows the click into the member's record. That checkpoint is only evaluated if the click succeeded, and the not-found case is exactly the one where it cannot — so the rule can never fire for the situation it names. It proposed no rule at all for the validation error or the permission denial, having seen neither.
2. **A locator pinned to the instance it was recorded against.** The click step's two strongest rungs are the literal name of the member discovery happened to use. For a different member the ladder drops to its positional rung, which resolved correctly here; for a search returning no rows nothing resolves, and the step fails as a locator problem before any rule is consulted.
3. **A checkpoint guarding an extraction with the extraction's own locator.** It asserts the element is present; on a slow-rendering grid the element is present and empty; the checkpoint passes and the extraction then fails coercing `""`. Presence and having-a-value are different assertions, and only one of them was derived.

The dividing line is the finding. What the engine detects by mechanism — a dialog listener, an HTTP status, an auth-page heuristic — is artifact-independent and held up against cases it had never seen. What the artifact must declare is only ever as good as what the model observed, and it observed the happy path. A green table from hand-written rules proves the executor and nothing about the pipeline that has to produce them; §7 proposes a fix for each fault.

**Recoverable conditions, and why only reads are retried.** Two recoveries, tried cheapest first: a declared interstitial over the result is dismissed and the checkpoint re-read immediately, and only if that was not the problem does the run pay for a 2-second wait and retry. Both land in `recoveries`. Only interstitials the capability _declares_ are touched — dismissing an unknown overlay means clicking a control nobody recorded, on a page replay cannot account for — so an undeclared notice is left alone and the run fails, which is tested. Retries are confined to checkpoints and extractions because those only read. A click or fill cannot be retried safely when replay has no way to know whether the first attempt took effect. Tested against member `66666`, whose grid frame renders immediately and whose rows arrive 1.5 seconds later.

**Session expiration detection.** When a run fails with a vague cause (`locator_not_found`, `assertion_failed`, `extraction_failed`), the executor checks for an auth page using two generic signals: an auth-shaped URL (`/login`, `/signin`, `/auth`, `/sso`) or a password field on screen. Only fires if the run had already cleared the auth wall.

**App errors are caught on the status, not the page.** A 500 renders perfectly well and can satisfy every text assertion a checkpoint makes, so the surface tracks the last document response status and replay consults it. It is checked on the failure path too, because a 5xx usually surfaces as the step's own wait timing out on content that was never going to render — reporting that as a missing locator sends someone to debug an artifact that is not at fault.

**Dialogs.** Playwright dismisses native dialogs silently when nothing is listening, which is precisely the blind proceed the brief warns against. The surface listens, dismisses (accepting would confirm something no artifact declared), and records. The run then fails with `unexpected_dialog` unless the capability declared that text. Dialog delivery races the action that triggered it, so draining first flushes the browser's event queue — without that, a dialog raised by one run was being attributed to the next, which is a bug these tests caught.

**A failed assertion reports what it saw, not just that it failed.** Each assertion returns the page state alongside its verdict — `not present anywhere on /members/search` rather than a bare false. "Expected X" is in the artifact already; the only part a reader does not have is what the page actually showed, and that is the part that distinguishes a broken locator from a page that legitimately has nothing on it.

**Known weak point.** `fixedDelay` waits, CSS-rung locators and `textPresent` waits are all web-specific and all brittle in different ways. A `textPresent` wait is the worst of them: when the awaited text never appears, the step fails as a locator problem even though nothing is wrong with the locator. Three of the outcome rules in the shipped artifact are keyed on exactly that failure, which works but reads as a workaround for the wait strategy rather than a design.

**Failure codes:** `locator_not_found`, `assertion_failed`, `extraction_failed`, `type_coercion_failed`, `navigation_failed`, `session_expired`, `unexpected_dialog`, `app_error`, `approval_required`, `policy_denied`, `timeout`, `step_budget_exhausted`.

## 4. Heterogeneity & multi-tenant

**Surface abstraction.** The `Surface` interface (`observe`, `act`, `resolve`, `extractText`, `pageUrl`, `hasText`, `drainDialogs`, `lastResponseStatus`, `screenshot`) is the seam. `PlaywrightSurface` is the only implementation today. To support a legacy web app with framesets, a new implementation would handle frame traversal inside `observe()` and `act()` — the rest of the stack sees the same `Observation` shape. For a desktop app, a `DesktopSurface` would use accessibility APIs (UI Automation on Windows, AXUIElement on macOS) for `observe()` and coordinate-based input for `act()`. The `adjacent` locator strategy already works by DOM walk rather than semantic lookup, so it handles the "no clean DOM" case that's common in legacy apps.

The locator ladder design deliberately accommodates drift: when the most durable rung (accessible name) fails, the resolver falls through to less durable ones (CSS selector). Which rung resolved is recorded, so a shift from rung 0 to rung 2 across runs is a measurable drift signal.

**Multi-tenant reuse.** The artifact schema separates the _task shape_ (goal, input/output types, step structure) from _instance values_ (specific member numbers, URLs, locator text). Input placeholders (`{{memberNo}}`) make the artifact reusable across tenants with the same flow. `capabilityIdFrom()` strips numbers from the goal so the identity is the task shape, not the instance.

**Falling to a weaker rung is not the same as succeeding.** It is tempting to claim the ladder absorbs tenant variation — that a field labelled "Member Number" at one institution and "Member No:" at another is handled by a partial label match. The discovery run makes the case against that concretely: for a member whose name did not match the recorded one, the ladder fell through to a positional rung and clicked link number eight. It happened to be the right link. Nothing in the system knew that, and nothing would have reported it if it had been the wrong one.

So the honest design for multi-tenant is not "the ladder copes." It is:

- **base artifacts keyed by vendor product and version**, not by tenant, since the flow is the vendor's;
- **tenant overlays** carrying the labels, routes and extra dialogs that tenant adds, applied before ladder resolution;
- **a way to detect which product version a tenant is running**, so the right base is selected rather than assumed;
- **a rule for weak-rung resolution** — resolving below the rung a step was recorded at should flag the run or escalate, not proceed silently. The run log already records which rung resolved, so the signal exists; nothing acts on it.

Aggregated across replays, that same rung-drift record is what tells you an application has changed before a run fails outright.

`adjacent` is best read as a walk over a generic element tree rather than a DOM-specific trick — the same walk over an accessibility tree is what makes it plausible on a desktop surface.

## 5. Escalation & handoff

**Detection.** Six failure codes are escalation-worthy: `timeout`, `session_expired`, `assertion_failed`, `navigation_failed`, `approval_required`, `unexpected_dialog`. When the replay executor encounters one, it raises an intervention through the session registry.

The test is whether a human at the keyboard could actually do something about it. Two codes are deliberately excluded. `locator_not_found` means a ladder matched nothing — that is an artifact needing re-recording, and parking an operator in front of it asks them to fix a bug by hand, once, invisibly. `app_error` means the server returned a 500, which nobody can repair from inside the session; that run needs retrying later, not taking over.

**Discovery does not escalate, and that is a gap rather than a decision.** A discovery run that exhausts its step budget or its time budget stops and reports a failure with `interventionRaised: false`. The case for escalating it is at least as strong as for replay — a model stuck two steps from the end is exactly when a human should be offered the session, and the machinery is already there. It was not wired up.

**Approval pauses.** A step recorded as `irreversible` stops the run _before_ the locator is resolved and raises an `approval_required` intervention through the same path. The run is intact and waiting on a decision rather than broken, so it is raised at `warning` severity. `--approve-irreversible` is the caller stating up front that this run may commit — for an unattended schedule, or an operator who approved the whole run in advance.

**Session state machine.** `idle → running → paused → handed_off`. Transitions are validated — you can't hand off a session that isn't paused, and you can't resume one that's still handed off. Every transition is recorded in an append-only ledger tagged with the actor (`system`, `model`, or `operator`).

**Intervention.** Carries enough context to act: `runId`, `capabilityId`, `failureCode`, `failedAtStepId`, `pageUrl`, `lastSuccessfulStepId`, severity (`warning` or `critical`), and state (`raised` → `acknowledged` → `resolved`).

**Operator takeover.** `OperatorTakeover` opens a CDP session for `Page.startScreencast`, streams frames to the operator, and forwards operator input (mouse, keyboard, scroll) through Playwright's coordinate-based APIs. Backpressure: the CDP `screencastFrameAck` is sent only after the consumer callback resolves, so a slow consumer receives fewer frames rather than accumulating a queue.

**Control is a token, checked per input.** Every forwarded event asks the session whether the operator currently holds control, rather than the stream being opened once by someone who was entitled to it at the time. The distinction matters because the interesting case is the second half of a handoff: control returns to the system, the operator's browser tab is still open, and a stray click has to be refused rather than raced against a resuming run. Reading live session state on each event is what makes that refusal automatic instead of dependent on the UI having closed cleanly.

**Operator actions land in the ledger.** Each forwarded input is recorded with `actor: operator` — what kind of input and, for typing, how many characters, never the characters themselves, since the most likely thing an operator types after a session expiry is a password. Artifacts stay untouched (below); this is the audit trail, which is a separate need from the artifact and is why an operator-driven run is still accountable despite deliberately teaching the system nothing.

**Hand-back and resume.** On hand-back, the system re-asserts the checkpoints of the last successful step. If they fail, a fresh intervention is raised — the operator could have navigated anywhere. If they pass, `execute()` resumes at `resumeAtStepId`. The executor supports this via a `resumeAtStepId` parameter and a re-assertion gate.

**Design decision: operator actions never feed back into artifacts.** The operator is usually recovering from environmental failure, not demonstrating the flow. If they log back in after a session timeout, folding those clicks into the capability would produce an artifact that logs in twice.

**What's mocked, precisely.** The mechanism — CDP screencast, input forwarding, the control token, state transitions, the re-assertion gate, ledger recording — is real and tested. What does not exist is an operator _UI_: there is no takeover screen in the console, and the screencast frames are not rendered anywhere. A handoff is driven from the CLI (`apps/cli/src/handoff.ts`), which runs until a step gets stuck, prints the intervention context, demonstrates that operator input before hand-off is refused, waits at the terminal, then hands back and resumes. That is also how the handoff in `evidence/` was produced. The assignment permits this: "Mock the operator UI if needed, but make the handoff mechanism and the control-transfer model real."

## 6. Safety

**Allowlist.** The `Policy` schema declares `allowedOrigins`, `allowedPathPrefixes`, per-action-class rules (`read: allow`, `navigate: allow`, `mutate: confirm`), `redactedFieldNames`, `redactedPatterns`, `irreversibleControlLabels`, `maxStepsPerRun` and `maxRunSeconds`. Navigation outside the allowlist is refused as a policy event — the run log records _why_, not what broke.

Origins alone are too coarse for a tenant deployment: the admin screens and the money-movement screens usually share one. `allowedPathPrefixes` narrows a run to the routes its task needs, which is the difference between "this application" and "this screen". The CLI leaves it empty on purpose — it is pointed at one app and the whole of it is in scope — so this is a seam that a real tenant policy would use rather than something the demo exercises.

**Two budgets, because they bound different failures.** `maxStepsPerRun` catches a model looping; `maxRunSeconds` catches one that is not looping but is stuck behind something slow, where a step budget never fills. Both apply to discovery only. Replay is bounded by the artifact's own step list, which is finite before the run starts.

**Action classification.** Three classes: `read`, `navigate`, `mutate`. The question the allowlist is really asking is what an action can _commit_, and classifying every click as a read was the hole: "Post Transaction" and "Back to Search" are the same DOM event and could not be more different. A click is now a mutation when the control's name matches the policy's `irreversibleControlLabels`, and a read otherwise.

A `fill` stays a mutation. It looks inert, but on the server-rendered admin screens this system targets a field can post back as it loses focus, and a staged amount or account number is a change waiting to be committed. Reclassifying it as a read to match the click fix would trade one wrong default for another, in the unsafe direction.

**Confirm before mutate.** The CLI's default policy is `mutate: confirm`. On a terminal, discovery prompts the operator per action and logs the decision either way. With no TTY there is nobody to ask, and the honest answer to a question nobody heard is no — the action is denied and the model is told to find another way. `--allow-mutations` is the operator approving up front. The previous default allowed everything on the reasoning that someone was probably watching, which is an allowlist that permits what it was put there to gate.

**Irreversible steps.** Replay refuses to perform a step recorded as `irreversible` unless the caller passed `--approve-irreversible`, raising an intervention instead (§5). The step does not run: the locator is never resolved and nothing is clicked.

**Credential handling.** Secrets are held by reference in the artifact (`{{operatorPassword}}`), never by value. The `@understudy/redaction` package gathers a run's sensitive values from policy-declared field names and regex patterns, then masks them across the run log and artifact at the write boundary. Field name comparison is fuzzy — `"cardNumber"`, `"card_number"`, and `"Card Number"` are treated as the same field. A test runs a real replay with a real password and fails if that string appears anywhere in the run log written to disk; the replay path wrote it out in full for a while, which is why the test exists rather than the reasoning alone.

**Screenshots.** Redaction elsewhere works on strings on their way to disk. A screenshot carries the same values as pixels, where no string filter reaches them, so the covering happens on the page before the frame is captured: elements are marked and passed to Playwright's `mask`. Password fields are always covered, whatever the policy says. Beyond those, the marking is label-driven — form controls whose own labelling matches a redacted field name, and table cells sitting under or beside a matching header, which is how read-only PII appears on these screens.

**Limits.**

- **Screenshot masking is only as good as the labelling.** A value with no label, or one labelled in a way no policy entry matches, is captured in the clear. The mask is deliberately narrow rather than covering the page, because evidence nobody can read is not evidence.
- **The `operatorUserId` is not redacted.** Only inputs marked `secret` are, and a user id is not a credential in the same sense as a password. That is a defensible line but it is a line, and the artifact draws it.
- **Outcome rules are a model's hypothesis, and the measured failure rate is high.** §3 reports what a real discovery produced: every condition depending on a declared rule was wrong, for three different reasons. The containment is that a wrong rule degrades to a plain `failed` — visible in the log, fixable in the file — rather than to a confidently wrong answer. A _missing_ signal would instead report every failure as whichever rule came first, so a rule proposed without one is dropped rather than stored half-formed. What this costs in practice is that a freshly discovered artifact is trustworthy on its happy path and on engine-detected failures, and should be read before it is relied on for anything else.
- **`irreversibleControlLabels` is a word list.** A button labelled in a way the policy does not anticipate is recorded as reversible and replay will press it. The list is policy rather than code so it can be corrected per tenant, but nothing detects the miss.
- **App errors are detected by HTTP status.** An application that returns 200 with an error page renders as an ordinary failure.
- **Page content reaches a third-party model during discovery.** The observation text — including whatever PII is on screen — is sent to Gemini. Ollama is supported as a local alternative, keeping all data on the machine. Replay sends nothing anywhere.

## 7. Cuts

**What was deliberately left out:**

- **Retrieval for intent matching.** `task` makes one model call that matches on the _shape_ of the task rather than its words, so a capability discovered against member `12345` serves a request about `67890` and binds the new value to the declared input. What was cut is retrieval in front of it: every capability in the library goes into that prompt, so cost and latency grow with the catalogue and precision falls as capabilities come to resemble one another.
- **Per-tenant overrides.** The schema supports locator ladders that tolerate drift, but there's no mechanism to patch a base artifact with tenant-specific locator overrides. The design is straightforward (overlay patches keyed by tenant ID), but it wasn't built.
- **Desktop surface.** The `Surface` interface is designed for it (the `adjacent` strategy works by DOM walk, not semantic lookup), but no `DesktopSurface` implementation exists.
- **Context trimming in discovery.** Every observation stays in message history. At 30 steps this is fine for large-context models; at 100+ it would need pruning.
- **Discovery resumption.** A run that hits the step budget is discarded entirely. No partial artifact, no "continue from step 30."
- **Confidence scoring / multi-run stability.** No mechanism to replay N times and report a flakiness signal.
- **Vision fallback.** The model is shown text built from the DOM only, never screenshots. Screenshots are evidence. A vision-based fallback would plug in at `Surface.observe()`, which is also where a desktop accessibility tree would.
- **An operator takeover screen.** The control-transfer mechanism is real and the CLI drives it end to end (§5), but nothing renders the screencast. This is the cut the assignment explicitly allows.
- **Automatic re-login on session expiry.** An expired session escalates instead. Logging back in would mean replay handling credentials mid-run and then resuming a flow whose completed steps may already have committed something — a double-submission risk taken in order to avoid asking a human. Worth revisiting only for expiries that happen before the first irreversible step, where the replay is provably repeatable.

**What I'd build next, in order.** The first three are the faults §3 measured, and they rank above everything else because they are the difference between an artifact that is reviewable and one that is correct. None needs a schema change.

1. **Offer the shaping step the condition that can actually fire.** The schema already supports `when: step_failed` with a failure code, and for the not-found case that is the right condition — the click into the record fails, and the checkpoint the model chose is never reached. The model was shown the derived checkpoints and picked from those. Showing it both forms, and naming for each checkpoint which step failing would preempt it, is a prompt-and-payload change to `shape.ts`. It should also be told the outcomes the flow _could_ produce rather than only what the happy path showed, since it proposed nothing at all for the validation error and the permission denial.
2. **Keep discovery's instance values out of locator rungs.** The recorder already knows which values were parameterised; what it does not track is that text arriving on the page _downstream_ of a parameterised fill is equally instance data. A row whose accessible name came from a search for `{{memberNumber}}` should have that rung demoted beneath the positional one, or the ladder flagged as instance-pinned so review catches it. Today the two strongest rungs are the least reusable.
3. **Derive a non-empty assertion for extraction targets, not just presence.** A checkpoint that resolves the same locator the extraction will use cannot protect it, because presence is satisfied by an empty cell. Either a `text_non_empty` assertion variant, or — cheaper and probably better — treat an empty extraction as a retryable read, which routes it through the existing recovery path and turns a slow grid into `recovered` instead of `type_coercion_failed`.
4. **Per-tenant locator patches** — overlay patches keyed by tenant ID, applied at replay time before ladder resolution, plus a rule for what happens when a locator resolves on a weaker rung than it was recorded at.
5. **Retrieval-backed intent matching** — shortlist by embedding similarity over capability goals, then let the model pick from the few.
6. **Multi-run stability reporting** — replay N times, report per-step resolution statistics, flag locators that drift between rungs.
