# Understudy

An LLM works out how to do a task on a web application once. Understudy writes down what it
did as a typed, versioned artifact. Every time after that, the task is performed from the
artifact — deterministically, in milliseconds, without a model deciding anything.

The name is the idea: a model rehearses the part once, and then something cheaper and more
reliable performs it every night.

---

## Why

Driving a browser with an LLM on every run is expensive, slow, and non-deterministic. The same
prompt against the same page can produce a different click on Tuesday than it did on Monday,
and there is nothing to review, diff, or approve — the behaviour lives in the model's head.

But writing selectors by hand doesn't scale either, and it is exactly the work nobody wants.

Understudy splits the difference. Exploration is a model problem and is solved once, with a
model. Repetition is an engineering problem and is solved with a typed artifact and a
deterministic executor. The interesting part is the boundary between them: what has to be
captured during exploration so that repetition never needs the model again.

---

## Quick start

Requires **Node 24 or newer** (`node --version`).

```bash
npm install
npx playwright install chromium
```

Start the target application — a deliberately awkward legacy banking app to automate against:

```bash
npm run target-app          # http://localhost:4000
```

Point a model at it. Gemini is the default provider:

```bash
export GEMINI_API_KEY=...
npm run task "log in and look up member 12345, then read the savings balance"
```

The first run has nothing to replay, so it discovers: the model explores the app, and the run
is recorded as a capability under `evidence/`. Ask for the same task again with a different
member and it replays what it learned — one model call to recognise the request, and none to
carry it out:

```bash
npm run task "look up member 67890 and read the savings balance"
```

Any user id and password are accepted by the target app's login, so `--input password=anything`
is fine.

---

## The three commands

| Command                          | What it does                                                               |
| -------------------------------- | -------------------------------------------------------------------------- |
| `npm run task "<goal>"`          | The one you'd actually use. Decides between replaying and discovering.     |
| `npm run discover "<goal>"`      | Forces exploration. Always calls a model, always records a new capability. |
| `npm run replay <artifact.json>` | Forces replay of a specific artifact. Never calls a model.                 |

`task` loads every capability under `evidence/`, makes one model call to ask whether any of
them already performs the requested job, and dispatches accordingly. Matching is on the
**shape** of the task, not its literal words — a capability discovered against member `12345`
matches a request about member `67890`, binding the new number to the capability's declared
input. Without that, you would re-discover the same task once per customer, which defeats
the point.

If nothing matches, it falls through to discovery, and the capability that produces will serve
the next request like it.

### Where the model is used

Worth being exact about, because "no LLM at replay time" is easy to state too broadly.
Recognising a request and performing it are separate jobs, and only the first one needs
judgment:

| Command    | Routing                       | Performing the task                         |
| ---------- | ----------------------------- | ------------------------------------------- |
| `task`     | 1 call — intent match         | 0 calls on a match; a full discovery if not |
| `discover` | none — always explores        | many calls, plus 1 to shape outcomes        |
| `replay`   | none — you named the artifact | 0 calls                                     |

So `replay` is genuinely model-free from end to end. `task` spends exactly one call deciding
_which_ capability applies and binding values to its inputs, then hands over to the same
model-free executor. Nothing about how the task is carried out — which element to click, what
to type, whether it worked — ever consults a model at run time; that was all settled during
discovery and frozen into the artifact.

That one routing call is also the piece most likely to change. It is a convenience at the front
door, not part of the execution guarantee, and it can be replaced by retrieval or skipped
entirely by calling `replay` directly.

### Flags

```
--provider  gemini | anthropic | ollama     (default: gemini)
--model     model id                        (overrides the provider default)
--url       start url                       (default: http://localhost:4000)
--input     key=value                       (repeatable; overrides values read from the goal)
--headed    show the browser
--output    evidence directory              (default: evidence)
--maxSteps  step budget for discovery       (discover only)
```

Credentials never appear in a goal string, so `--input` stays the way to supply them, and
anything passed there wins over a value inferred from the request.

### Providers

| Provider    | Default model              | Credential                                             |
| ----------- | -------------------------- | ------------------------------------------------------ |
| `gemini`    | `gemini-3.6-flash`         | `GEMINI_API_KEY`                                       |
| `anthropic` | `claude-sonnet-4-20250514` | `ANTHROPIC_API_KEY`                                    |
| `ollama`    | `llama3.1`                 | none — `OLLAMA_HOST`, default `http://localhost:11434` |

All three sit behind one `ModelProvider` interface with a single method, `completeWithTools`.
Ollama exists so the discovery loop can be exercised without spending anything.

---

## How it works

```
  DISCOVERY — a model explores, once

     goal ──▶ Discovery loop ──▶ run log ──▶ Recorder ──▶ capability.json
                  │                             │
                  │ observe/act/                │ distill · locator ladders ·
                  │ extract/finish              │ checkpoints · outcome shaping
                  ▼                             ▼
               Surface ──▶ target app       one model call to name outcomes


  EXECUTION — the artifact is performed, every time after that

     request ──▶ Intent match ──▶ Replay executor ──▶ Outcome
                      ▲                 │
                      │                 ▼
            one model call,          Surface ──▶ target app
            routing only             no model, at all
```

### 1. Surface — the only thing that touches a browser

`packages/surface` wraps Playwright behind a six-method interface: `observe`, `act`, `resolve`,
`extractText`, `pageUrl`, `hasText`. Everything above it is browser-agnostic and trivially
fakeable in tests, which is why most of the suite runs without a browser at all.

`observe()` returns a structured snapshot of the page — roles, accessible names, nearby text —
rather than raw HTML, and stamps each interesting element with a temporary
`data-understudy-ref` attribute. The model can only act on elements it was actually shown, and
those handles are renumbered on every observation, so they can never leak into a saved
artifact.

### 2. Discovery — the model explores

`packages/discovery` runs a tool-use loop with four tools:

- **`observe`** — what is on the page right now
- **`act`** — navigate, click, or fill
- **`extract`** — this text here is one of the answers we were asked for
- **`finish`** — the goal is met, or it cannot be

Every call and its result is appended to a **run log**: an ordered, replayable record of what
was observed, what was done, and what came back. The run log is the sole input to the next
stage. Discovery has a step budget and a policy that confines navigation to an allowed origin.

### 3. Recorder — turning one run into a repeatable one

`packages/recorder` is where most of the real work is, because a transcript of one successful
run is not a program. It has to:

**Distill.** Drop the observations, the dead ends, the retries, the repeated fills of the same
field. What survives is the shortest path that would reproduce the result.

**Build locator ladders.** The model clicked an element identified by a throwaway handle. That
handle is meaningless tomorrow. The recorder derives up to three ways to find the same element,
ordered most durable first:

| Strategy   | Example                                              | Durability                          |
| ---------- | ---------------------------------------------------- | ----------------------------------- |
| `role`     | button named "Sign On"                               | survives restyling and markup churn |
| `text`     | the exact string "Share Summary"                     | survives markup, not copy changes   |
| `adjacent` | the textbox next to the cell reading "Member Number" | for pages with no real labels       |
| `css`      | `#ctl00_ContentMain_txtPassword`                     | last resort — brittle, but precise  |

Replay tries each rung in order and takes the first that resolves, so a capability degrades
gracefully instead of snapping the moment a class name changes.

`adjacent` exists because of a specific real problem: legacy pages label their inputs with a
bare `<td>` next to the field rather than a `<label for>`, so the field has no accessible name
and role lookup can't find it. The ladder walks from the label's cell to its neighbour instead.

**Parameterise.** Values the run was handed — a member number, a password — become
`{{placeholders}}` in the steps and declared inputs on the artifact. Secrets are held by
reference only: the artifact carries `{{password}}`, never the password, and the value is
supplied at replay time.

**Derive checkpoints.** A sequence of clicks that asserts nothing will happily walk an entire
flow past a failed login and report success. So the recorder emits assertions with no model
involved: a URL assertion after every page transition, and an element-present assertion on each
extraction target after the step that produced it. The second is load-bearing — it's what
separates "the result never appeared" from "the selector broke".

**Shape outcomes.** A recorder that only ever saw the happy path can derive structure but not
meaning. It cannot invent the name `member_not_found`. So one model call at discovery time
turns checkpoints into business outcome rules, asking the model to distinguish a legitimate
business answer from a genuine malfunction. This happens at discovery time and costs a model
turn — replay still never does.

### 4. The capability artifact

The contract between the two halves. A Zod schema in `packages/schemas`, so a malformed
artifact is rejected at the boundary rather than halfway through a run:

```jsonc
{
  "capabilityId": "log-in-and-look-up-member-then-read-the-savings-balance",
  "name": "Look up member savings balance",
  "version": 1,
  "goal": "log in and look up member 12345, then read the savings balance",
  "status": "approved",

  // What must be supplied to run this. Secrets are by reference, never by value.
  "inputs": [
    { "name": "memberNumber", "valueType": "string", "required": true },
    { "name": "operatorPassword", "valueType": "string", "required": true, "secret": true },
  ],

  // What it produces.
  "outputs": [{ "name": "savingsBalance", "valueType": "number", "required": true }],

  // The distilled path, each element found by a ladder rather than one selector.
  "steps": [
    {
      "stepId": "fill-member-number",
      "action": {
        "actionType": "fill",
        "target": [
          { "strategy": "adjacent", "labelText": "Member Number", "direction": "next" },
          { "strategy": "css", "selector": "#ctl00_ContentMain_txtMemberNo" },
        ],
        "value": "{{memberNumber}}",
      },
    },
  ],

  // What must be true afterwards, or the run did not do what it claims.
  "checkpoints": [
    {
      "checkpointId": "results-present",
      "afterStepId": "submit-search",
      "allOf": [{ "assert": "element_present", "target": [/* ... */] }],
    },
  ],

  // Where the answers are read from.
  "extractions": [{ "outputName": "savingsBalance", "target": [/* ... */], "valueType": "number" }],

  // Which failures are actually ordinary business answers.
  "businessOutcomes": [
    {
      "code": "member_not_found",
      "message": "No member matched that number.",
      "condition": { "when": "checkpoint_failed", "checkpointId": "results-present" },
    },
  ],

  "provenance": { "discoveredByModel": "gemini-3.6-flash", "discoveredAt": "..." },
}
```

The schema enforces cross-field integrity with `superRefine`: an extraction can't write to an
undeclared output, a checkpoint can't run after a non-existent step, a business outcome can't
reference a checkpoint that isn't there. These would otherwise surface mid-replay as confusing
runtime errors instead of as a malformed file.

### 5. Replay — performing the artifact

`packages/replay` walks the artifact: resolve the ladder, perform the action, wait for the
declared condition, evaluate any checkpoints, extract and coerce outputs. It calls nothing but
the Surface — it does not depend on `model-provider` and has no way to reach one. A replay
costs a browser and some milliseconds.

---

## Outcomes

The distinction the whole design is built around: **a member number that matches nobody is a
correct answer, not a broken run.** Reporting that as a failure is how automation earns a
reputation for crying wolf, and it's the single most common way this kind of system goes wrong.

| Classification     | Meaning                                                                |
| ------------------ | ---------------------------------------------------------------------- |
| `success`          | Every step ran, every checkpoint held, outputs extracted               |
| `business_outcome` | The application gave a legitimate negative answer — `member_not_found` |
| `recovered`        | Something went wrong and replay handled it — **see Known gaps**        |
| `failed`           | A genuine malfunction, with a failure code and the step it died on     |

Failure codes: `locator_not_found`, `assertion_failed`, `extraction_failed`,
`type_coercion_failed`, `navigation_failed`, `session_expired`, `policy_denied`, `timeout`,
`step_budget_exhausted`.

Classification is mechanical: completed all steps means success; otherwise the business outcome
rules are matched in order; otherwise it failed.

---

## Safety

**Redaction at the write boundary.** Run logs and artifacts are scrubbed before they are
written, not before they are read, so no text a run observed reaches disk unfiltered. The
default policy redacts by field name (`password`, `token`, `ssn`, `cvv`, `date of birth`, and
others) and by pattern — payment card numbers however the page groups the digits, and US
social security numbers.

**Secrets by reference.** Even unredacted, an artifact never contains a credential. The step
carries `{{operatorPassword}}`; the value arrives at replay time via `--input`.

**Policy.** Navigation is confined to allowed origins, and actions are classed `read`,
`navigate`, or `mutate` with an `allow` / `confirm` / `deny` decision each. Runs have a step
budget. Note that the CLI allows mutations rather than confirming them — it has no channel to
ask on, and an operator is already sitting in front of it. The confirm path is exercised by
callers that supply `onConfirmAction`.

**Element provenance.** The model can only act on elements a preceding `observe` actually
showed it. A handle it invented is refused.

### What is not protected

Understudy drives a browser against a real application with real credentials, so the sharp
edges are worth naming rather than leaving to be found.

**Screenshots are not redacted.** Redaction is text-only — run logs and artifacts. Screenshots
capture the page exactly as rendered, including the account numbers, names and balances the
text redaction would have stripped. Since `evidence/` is committed deliberately, a run against
a system holding real data will put unredacted images of that data into version control. Treat
the screenshots in an evidence directory as sensitive, and don't point this at production data
without changing that.

**Values passed with `--input` are visible on the machine.** They land in shell history and, for
the lifetime of the run, in the process list — where any other user on the same host can read
them. `task` also forwards them as arguments when it hands off to `discover` or `replay`, so
they appear twice. Fine for a local target app; not how a real credential should be supplied.
The same applies to `export GEMINI_API_KEY=...` in an interactive shell — prefer a `.env` file
or a secret manager, and note that `.env` is already gitignored.

**Page content is untrusted input to the model.** During discovery the model reads whatever the
target renders, so a page that contains instructions can try to redirect it — the browser
equivalent of prompt injection. What limits the blast radius is structural, not detective: the
model can only act on elements it was shown, navigation is confined to allowed origins, actions
are classed and can be denied, and the run has a step budget. Nothing detects an injection
attempt as such. A capability is worth reading before it is trusted, which is the main reason
the artifact is a reviewable file rather than an opaque policy.

**Replay inherits whatever discovery believed.** An artifact is a sequence of actions that will
be performed without further judgment. If discovery was manipulated, or simply wrong, replay
will repeat it faithfully and quickly. The `mutate` action class and the `confirm` decision
exist for this reason, though the CLI allows mutations rather than confirming them.

**The target app has no real authentication.** `apps/target-app` accepts any user id and
password by design — it is a fixture for automating against, not a model of an auth system, and
it should not be exposed beyond localhost.

---

## The target application

`apps/target-app` is a deliberately hostile stand-in for the kind of system this problem
actually shows up in: table-based layout, `ctl00$ContentMain$` form field names, no proper
labels, a results grid that posts a form instead of linking, and a maintenance banner.

Any user id and password log in. Three member numbers trigger specific behaviours, which is how
the outcome taxonomy gets exercised:

| Member number       | Behaviour                                  | Expected classification                     |
| ------------------- | ------------------------------------------ | ------------------------------------------- |
| `12345`, `67890`, … | Normal member                              | `success`                                   |
| `99999`             | Search returns no rows                     | `business_outcome` / `member_not_found`     |
| `88888`             | Three validation errors with codes         | `business_outcome`                          |
| `77777`             | Session silently expires, bounced to login | `failed` / `session_expired` → intervention |

`99999` returning `business_outcome` rather than `failed` is the specific proof that checkpoint
derivation and outcome shaping both worked. The right-hand column is what a correctly shaped
capability should report — the classification is only as good as the rules the shaping step
produced for that particular artifact, which is exactly why it is worth checking against a real
discovery rather than asserting here.

---

## Repository layout

```
packages/
  schemas/          Zod schemas — the contract everything else agrees on
  surface/          Playwright behind an observe/act/resolve interface
  discovery/        The model-driven exploration loop
  recorder/         Run log → capability artifact
  replay/           Deterministic executor + outcome classifier
  redaction/        Scrubbing at the write boundary
  session/          Takeover state machine, ledger, intervention raiser
  model-provider/   One interface, three adapters

apps/
  cli/              discover · replay · task
  target-app/       The legacy banking app to automate against
  server/           REST + WebSocket API backing the console
  client/           The console UI
```

### Evidence layout

Each capability owns a directory, so the whole life of one task sits in one place:

```
evidence/<capability-id>/
  capability.json
  discovery/
    runlog.json
    screenshots/
  replays/<outcome>/
    runlog.json
    screenshots/
```

Replays are keyed by outcome deliberately — a `success/`, a `business_outcome/` and a `failed/`
sitting side by side is the clearest possible demonstration that the taxonomy is real.

---

## Development

```bash
npm test              # 191 tests, 21 files
npm run typecheck
npm run lint
npm run build
npm run format
```

Most tests run without a browser, because everything above the Surface talks to the interface
rather than to Playwright.

| Package   | Tests |
| --------- | ----- |
| replay    | 47    |
| session   | 39    |
| recorder  | 33    |
| surface   | 28    |
| schemas   | 22    |
| redaction | 10    |
| cli       | 6     |
| discovery | 6     |

---

## Design decisions worth knowing

**Deciding what to do is separated from doing it.** Choosing _which_ capability a request means
is judgment, and `task` spends one model call on it. Carrying that capability out is not, and
nothing in that path can reach a model — `packages/replay` doesn't even depend on
`model-provider`. Every decision about how the task is performed was made during discovery and
frozen into the artifact, which is what makes a run auditable and reproducible.

**A capability is a task shape, not a task instance.** Its `capabilityId` has sample values
stripped out, so discovering against member `12345` yields
`log-in-and-look-up-member-then-read-the-savings-balance`, not `...member-12345...`. The `goal`
keeps the original wording as provenance and as context for matching.

**Ladders, not selectors.** One selector is a single point of failure, and the most precise one
is usually the most brittle. Three ordered attempts cost nothing at replay time and change the
failure mode from "broke" to "fell back".

**The run log is the interface between halves.** Discovery produces it; the recorder consumes
it. Neither knows about the other, and the recorder is fully testable against a handwritten
log with no model and no browser.

**Operator takeover never feeds back into artifacts.** Takeover is a recovery mechanism.
Letting a human's ad-hoc fix silently rewrite a reviewed capability would destroy the property
that makes artifacts trustworthy.

---

## Known gaps

Current limitations, stated plainly so nobody has to discover them the hard way.

**The newest pieces have only been tested against fakes.** A real Gemini discovery run
succeeded end to end and its artifact replayed with no model in the loop — that part is proven.
Checkpoint derivation, outcome shaping and intent matching all landed after that run, and are
covered by unit tests with a stand-in provider rather than by a live run. So the headline claim
— discover a task against one member, then replay it for a different one via `task` — is
implemented and unit-tested, but not yet demonstrated against a real model.

**`recovered` is declared but never produced.** It is in the schema, the console renders a
screen for it, the fixtures show one — and no code path in the replay engine can emit it. Three
outcomes are handled on paper; two in practice. It needs a real recovery path (retry a timed-out
load, dismiss a known interstitial) and a way to deliberately inject the condition it recovers
from.

**The shipped example artifact doesn't run.**
`packages/schemas/examples/lookup-savings-balance.capability.json` uses `{{operatorUserId}}` and
`{{operatorPassword}}` in its steps but declares only `memberNumber` as an input, so replay
stops on it. It passes validation because `superRefine` checks three cross-references but not
placeholder-to-input — the one check that determines whether an artifact can actually run.

**Redaction is unverified.** Replay scrubs credentials before writing, but no test fails if
that stops happening. The protection is correct because it was written correctly, not because
anything enforces it.

**The console is fixture-driven.** `apps/client` renders from static fixtures and is not wired
to the server. `apps/server` holds runs and capabilities in in-memory maps and is not wired to
the CLI. Both are real in shape, neither is connected to a live run.

**Intent matching doesn't scale as written.** Every capability in the library goes into the
prompt on every request, so cost and latency grow with the catalogue, and precision drops as
capabilities come to resemble each other. Retrieval over capability goals — shortlist the
nearest few, then let the model pick — is the obvious next move.

**Parameterisation partly guesses.** A value the run was explicitly handed is a parameter by
definition, and that path is sound. The fallback path searches the goal text for the typed
string, which fails silently if the model normalises what it types — goal says `12345`, field
wants `0012345` — and bakes the value in as a constant. The failure is silent and in the unsafe
direction.

**`approved` is the model's own word.** A capability is only recorded when the model reports
success, and nothing checks that claim against the page. Now that checkpoints exist, there is a
real check available: have discovery replay its own fresh artifact once and approve only if the
checkpoints hold and the outputs match.

**Re-discovery overwrites.** A goal that slugs to an existing capability id replaces it.
`version` exists in the schema and is always `1`.

**One task shape.** Everything has been proven against the member lookup flow. A second,
structurally different task would be the real test of whether the recorder generalises.
