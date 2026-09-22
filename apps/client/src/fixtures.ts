import type {
  Capability,
  DiscoveryRun,
  PolicyProfile,
  RunLog,
  ShapingSession,
} from '@/types';

export const capabilities: Capability[] = [
  {
    capabilityId: 'read_member_savings_balance',
    name: 'read_member_savings_balance',
    version: 3,
    goal: 'Member lookup, then read primary share balance',
    status: 'draft',
    inputs: [
      {
        name: 'memberNumber',
        valueType: 'string',
        required: true,
        description: 'Institution-issued member number. Validated before the browser is opened.',
      },
      {
        name: 'portalPassword',
        valueType: 'string',
        required: true,
        secret: true,
        description: 'Service-account credential, supplied per call and never written to the artifact.',
      },
    ],
    outputs: [
      {
        name: 'savingsBalance',
        valueType: 'number',
        required: true,
        description:
          'Parsed from the share-summary grid; currency symbol and separators stripped at extract time, not by the caller.',
      },
      {
        name: 'shareAccountNumber',
        valueType: 'string',
        required: true,
        secret: true,
        description:
          'Returned as last-4 only. The full value exists in the DOM and is discarded at the extractor boundary.',
      },
      {
        name: 'asOf',
        valueType: 'date',
        required: false,
        description:
          "The app's own staleness stamp. Included because a balance without an as-of time is not an answer.",
      },
    ],
    steps: [
      {
        stepId: 'navigate-to-login',
        action: { actionType: 'navigate', url: 'http://127.0.0.1:4000/login' },
        waitFor: { waitUntil: 'pageLoad' },
        description: 'Open the servicing portal',
      },
      {
        stepId: 'fill-password',
        action: {
          actionType: 'fill',
          target: [
            { strategy: 'role', role: 'textbox', accessibleName: 'Password' },
            { strategy: 'adjacent', labelText: 'Password', direction: 'next' },
          ],
          value: '{{portalPassword}}',
        },
        description: 'Password field ← portalPassword',
      },
      {
        stepId: 'click-sign-in',
        action: {
          actionType: 'click',
          target: [{ strategy: 'role', role: 'button', accessibleName: 'Sign In' }],
        },
        waitFor: { waitUntil: 'pageLoad' },
        description: 'Sign in',
      },
      {
        stepId: 'fill-member-number',
        action: {
          actionType: 'fill',
          target: [
            { strategy: 'role', role: 'textbox', accessibleName: 'Member Number' },
            { strategy: 'adjacent', labelText: 'Member No', direction: 'next', targetRole: 'textbox' },
            { strategy: 'css', selector: '#ctl00_ContentMain_txtMbrNo' },
          ],
          value: '{{memberNumber}}',
        },
        waitFor: { waitUntil: 'selectorPresent', selector: '#ctl00_ContentMain_txtMbrNo' },
        description: 'Member number field ← memberNumber',
      },
      {
        stepId: 'click-search',
        action: {
          actionType: 'click',
          target: [
            { strategy: 'role', role: 'button', accessibleName: 'Search' },
            { strategy: 'css', selector: '#ctl00_ContentMain_btnSearch' },
          ],
        },
        waitFor: { waitUntil: 'pageLoad' },
        description: 'Search button',
      },
      {
        stepId: 'click-member-row',
        action: {
          actionType: 'click',
          target: [
            { strategy: 'role', role: 'link', accessibleName: 'JOHNSON, MARGARET A' },
            { strategy: 'css', selector: '#ctl00_ContentMain_grdResults tbody tr:first-child a' },
          ],
        },
        waitFor: { waitUntil: 'textPresent', text: 'SHARE SUMMARY' },
        description: 'Result row 1',
      },
    ],
    checkpoints: [
      {
        checkpointId: 'on-detail-page',
        afterStepId: 'click-member-row',
        allOf: [
          { assert: 'text_present', text: 'SHARE SUMMARY' },
          { assert: 'url_matches', pattern: '/members/detail' },
          { assert: 'text_absent', text: 'No records matched' },
        ],
      },
    ],
    extractions: [
      {
        outputName: 'savingsBalance',
        target: [
          { strategy: 'adjacent', labelText: 'Current Balance', direction: 'below' },
          { strategy: 'css', selector: '#ctl00_ContentMain_grdShares tbody tr:first-child td:nth-child(3)' },
        ],
        valueType: 'number',
      },
      {
        outputName: 'shareAccountNumber',
        target: [
          { strategy: 'css', selector: '#ctl00_ContentMain_grdShares tbody tr:first-child td:nth-child(2)' },
        ],
        valueType: 'string',
      },
      {
        outputName: 'asOf',
        target: [{ strategy: 'adjacent', labelText: 'As of', direction: 'next' }],
        valueType: 'date',
      },
    ],
    businessOutcomes: [
      {
        code: 'member_not_found',
        message: 'No member matched the supplied number',
        signal: { assert: 'text_present', text: 'No records matched' },
        condition: { when: 'checkpoint_failed', checkpointId: 'on-detail-page' },
      },
    ],
  },
  {
    capabilityId: 'verify_member_address',
    name: 'verify_member_address',
    version: 5,
    goal: 'Read mailing address of record for KYC checks',
    status: 'approved',
    inputs: [{ name: 'memberNumber', valueType: 'string', required: true }],
    outputs: [
      { name: 'address', valueType: 'string', required: true },
      { name: 'verifiedAt', valueType: 'date', required: true },
    ],
    steps: [
      {
        stepId: 'navigate-to-login',
        action: { actionType: 'navigate', url: 'http://127.0.0.1:4000/login' },
      },
      {
        stepId: 'fill-member-number',
        action: {
          actionType: 'fill',
          target: [{ strategy: 'role', role: 'textbox', accessibleName: 'Member Number' }],
          value: '{{memberNumber}}',
        },
      },
    ],
    checkpoints: [],
    extractions: [],
    businessOutcomes: [],
  },
  {
    capabilityId: 'list_recent_transactions',
    name: 'list_recent_transactions',
    version: 2,
    goal: 'Last N postings on a given share',
    status: 'approved',
    tenantOverride: true,
    inputs: [
      { name: 'memberNumber', valueType: 'string', required: true },
      { name: 'shareId', valueType: 'string', required: true },
      { name: 'limit', valueType: 'number', required: false },
    ],
    outputs: [{ name: 'transactions', valueType: 'string', required: true }],
    steps: [
      {
        stepId: 'navigate-to-login',
        action: { actionType: 'navigate', url: 'http://127.0.0.1:4000/login' },
      },
      {
        stepId: 'open-transactions',
        action: { actionType: 'click', target: [{ strategy: 'text', text: 'Transaction History' }] },
      },
    ],
    checkpoints: [],
    extractions: [],
    businessOutcomes: [],
  },
  {
    capabilityId: 'open_savings_subaccount',
    name: 'open_savings_subaccount',
    version: 1,
    goal: 'Create a new share and reach the confirmation screen',
    status: 'draft',
    irreversible: true,
    inputs: [
      { name: 'memberNumber', valueType: 'string', required: true },
      { name: 'shareType', valueType: 'string', required: true },
      { name: 'initialDeposit', valueType: 'number', required: true },
    ],
    outputs: [{ name: 'newShareId', valueType: 'string', required: true }],
    steps: [
      {
        stepId: 'navigate-to-login',
        action: { actionType: 'navigate', url: 'http://127.0.0.1:4000/login' },
      },
      {
        stepId: 'open-subaccount-form',
        action: { actionType: 'click', target: [{ strategy: 'text', text: 'Open Sub-Account' }] },
      },
    ],
    checkpoints: [],
    extractions: [],
    businessOutcomes: [],
  },
];

export const runs: RunLog[] = [
  {
    runId: 'rpl_01K7M2',
    mode: 'replay',
    capabilityId: 'read_member_savings_balance',
    capabilityVersion: 3,
    artifactSha: '4f1c…9ab2',
    tenant: 'riverbend-cu',
    caller: 'agent:servicing-copilot',
    inputs: { memberNumber: '<redacted>' },
    startedAt: '2026-09-16T09:10:00Z',
    completedAt: '2026-09-16T09:10:03.912Z',
    modelCalls: 0,
    evidencePath: 'runs/rpl_01K7M2/',
    timeline: [
      {
        stepId: 'navigate',
        title: 'navigate → /servicing/default.aspx',
        detail: 'frameset settled',
        durationMs: 412,
        state: 'passed',
      },
      {
        stepId: 'assert-menu',
        title: 'assert → servicing menu present',
        detail: 'session still authenticated',
        durationMs: 96,
        state: 'passed',
      },
      {
        stepId: 'fill-member-number',
        title: 'fill → Member Number',
        detail: 'a11y name match',
        durationMs: 128,
        state: 'passed',
        resolvedByIndex: 0,
      },
      {
        stepId: 'click-search',
        title: 'click → Search',
        detail: 'postback settled',
        durationMs: 1204,
        state: 'passed',
        resolvedByIndex: 0,
      },
      {
        stepId: 'assert-rows',
        title: 'assert → result grid rows ≥ 1',
        detail: '1 row — no branch taken',
        durationMs: 88,
        state: 'passed',
      },
      {
        stepId: 'click-member-row',
        title: 'click → member row 1',
        detail: 'row link by a11y name',
        durationMs: 1340,
        state: 'passed',
        resolvedByIndex: 0,
      },
      {
        stepId: 'extract',
        title: 'extract → savingsBalance, asOf',
        detail: 'typed and masked at boundary',
        durationMs: 156,
        state: 'passed',
      },
      {
        stepId: 'checkpoint',
        title: 'checkpoint → all_of passed',
        detail: '3 of 3 asserts true',
        durationMs: 88,
        state: 'passed',
      },
    ],
    outcome: {
      classification: 'success',
      outputs: {
        savingsBalance: 4182.9,
        shareAccountNumber: '****1189',
        asOf: '2026-09-12T14:22:00Z',
      },
    },
  },
  {
    runId: 'rpl_01K8Q9',
    mode: 'replay',
    capabilityId: 'read_member_savings_balance',
    capabilityVersion: 3,
    artifactSha: '4f1c…9ab2',
    tenant: 'riverbend-cu',
    caller: 'agent:servicing-copilot',
    inputs: { memberNumber: '<redacted>' },
    startedAt: '2026-09-16T11:04:00Z',
    completedAt: '2026-09-16T11:04:18Z',
    modelCalls: 0,
    interventionId: 'itv_4471',
    evidencePath: 'runs/rpl_01K8Q9/',
    failureEvidence: {
      atStepId: 'click-member-row',
      expected: 'text "SHARE SUMMARY" in frame[main]',
      observed: 'text "Session has expired" · frame src /login.aspx',
    },
    timeline: [
      {
        stepId: 'navigate',
        title: 'navigate → /servicing/default.aspx',
        detail: 'frameset settled',
        durationMs: 440,
        state: 'passed',
      },
      {
        stepId: 'assert-menu',
        title: 'assert → servicing menu present',
        detail: 'passed',
        durationMs: 102,
        state: 'passed',
      },
      {
        stepId: 'fill-member-number',
        title: 'fill → Member Number',
        detail: 'a11y name match',
        durationMs: 131,
        state: 'passed',
        resolvedByIndex: 0,
      },
      {
        stepId: 'click-search',
        title: 'click → Search',
        detail: 'retried once — postback slow (6.2s)',
        durationMs: 8410,
        state: 'degraded',
        resolvedByIndex: 1,
      },
      {
        stepId: 'assert-rows',
        title: 'assert → result grid rows ≥ 1',
        detail: '1 row',
        durationMs: 94,
        state: 'passed',
      },
      {
        stepId: 'click-member-row',
        title: 'click → member row 1',
        detail: 'halted — content frame replaced by /login.aspx; undeclared state',
        durationMs: 8820,
        state: 'failed',
      },
      {
        stepId: 'extract',
        title: 'extract → savingsBalance, asOf',
        detail: 'not reached',
        state: 'not_reached',
      },
      {
        stepId: 'checkpoint',
        title: 'checkpoint → all_of',
        detail: 'not reached',
        state: 'not_reached',
      },
    ],
    outcome: {
      classification: 'failed',
      failureCode: 'session_expired',
      message:
        'Session expired mid-flow and the login frame replaced the content frame. Not a declared outcome, so replay halted rather than clicking blindly into an authentication screen. An intervention was raised automatically.',
      failedAtStepId: 'click-member-row',
      recoveries: [],
      interventionRaised: true,
    },
  },
  {
    runId: 'rpl_01K9T4',
    mode: 'replay',
    capabilityId: 'read_member_savings_balance',
    capabilityVersion: 3,
    artifactSha: '4f1c…9ab2',
    tenant: 'riverbend-cu',
    caller: 'agent:servicing-copilot',
    inputs: { memberNumber: '<redacted>' },
    startedAt: '2026-09-16T13:22:00Z',
    completedAt: '2026-09-16T13:22:04.4Z',
    modelCalls: 0,
    evidencePath: 'runs/rpl_01K9T4/',
    timeline: [
      {
        stepId: 'navigate',
        title: 'navigate → /servicing/default.aspx',
        detail: 'frameset settled',
        durationMs: 402,
        state: 'passed',
      },
      {
        stepId: 'fill-member-number',
        title: 'fill → Member Number',
        detail: 'a11y name match',
        durationMs: 120,
        state: 'passed',
        resolvedByIndex: 0,
      },
      {
        stepId: 'click-search',
        title: 'click → Search',
        detail: 'postback settled',
        durationMs: 1180,
        state: 'passed',
        resolvedByIndex: 0,
      },
      {
        stepId: 'assert-rows',
        title: 'assert → result grid rows ≥ 1',
        detail: '0 rows — "No records" banner matched',
        durationMs: 92,
        state: 'passed',
      },
    ],
    outcome: {
      classification: 'business_outcome',
      code: 'member_not_found',
      message: 'No member matched the supplied number',
    },
  },
  {
    runId: 'rpl_01KB18',
    mode: 'replay',
    capabilityId: 'read_member_savings_balance',
    capabilityVersion: 3,
    artifactSha: '4f1c…9ab2',
    tenant: 'riverbend-cu',
    caller: 'agent:servicing-copilot',
    inputs: { memberNumber: '<redacted>' },
    startedAt: '2026-09-16T15:47:00Z',
    completedAt: '2026-09-16T15:47:12.6Z',
    modelCalls: 0,
    evidencePath: 'runs/rpl_01KB18/',
    timeline: [
      {
        stepId: 'navigate',
        title: 'navigate → /servicing/default.aspx',
        detail: 'maintenance interstitial dismissed',
        durationMs: 3610,
        state: 'degraded',
      },
      {
        stepId: 'fill-member-number',
        title: 'fill → Member Number',
        detail: 'label-anchored table walk',
        durationMs: 260,
        state: 'degraded',
        resolvedByIndex: 1,
      },
      {
        stepId: 'click-search',
        title: 'click → Search',
        detail: 'postback settled',
        durationMs: 1290,
        state: 'passed',
        resolvedByIndex: 0,
      },
      {
        stepId: 'extract',
        title: 'extract → savingsBalance, asOf',
        detail: 'typed and masked at boundary',
        durationMs: 164,
        state: 'passed',
      },
      {
        stepId: 'checkpoint',
        title: 'checkpoint → all_of passed',
        detail: '3 of 3 asserts true',
        durationMs: 90,
        state: 'passed',
      },
    ],
    outcome: {
      classification: 'recovered',
      recoveredFrom: 'locator_not_found',
      attempts: 2,
      outputs: {
        savingsBalance: 4182.9,
        shareAccountNumber: '****1189',
        asOf: '2026-09-12T14:22:00Z',
      },
    },
  },
];

export const discoveryRun: DiscoveryRun = {
  runId: 'run_8c31d',
  goal: 'Look up member 12345 and read their current savings balance',
  target: 'meridian-core',
  tenant: 'riverbend-cu',
  policyId: 'servicing-readonly',
  perception: 'a11y tree + screenshot',
  state: 'running',
  stepsTaken: 7,
  maxSteps: 25,
  tokensUsed: 41200,
  stopConditions: [
    { name: 'max_steps', value: '25' },
    { name: 'wall_clock', value: '180s' },
    { name: 'token_budget', value: '120k' },
    { name: 'no_progress', value: '3 steps' },
    { name: 'on_policy_deny', value: 'escalate', escalates: true },
  ],
  steps: [
    {
      sequence: 5,
      actionClass: 'fill',
      observe:
        'Frameset with 3 frames. Content frame holds a table-based form; the a11y tree exposes one textbox named "Member Number" and a button named "Search".',
      decide:
        'The goal supplies a member number, so fill the one identifying field rather than exploring the menu tree. Recording the target by a11y name, not the generated id.',
      act: 'fill(role=textbox name="Member Number", "<redacted>")',
      policy: { decision: 'allow', reason: 'fill on allowlisted route, value redaction applied' },
      tokens: 1842,
      durationMs: 2100,
    },
    {
      sequence: 6,
      actionClass: 'click',
      observe:
        'Field now contains the member number. Two submit-like controls are present: "Search" and "Advanced Query".',
      decide:
        '"Search" is the narrower, reversible action. Avoiding "Advanced Query" because it opens a modal whose state I would have to model.',
      act: 'click(role=button name="Search")',
      policy: { decision: 'allow', reason: 'classified safe/reversible' },
      tokens: 1610,
      durationMs: 1800,
    },
    {
      sequence: 7,
      actionClass: 'extract',
      observe:
        'Share Summary grid rendered. Row 1 is type S-01 with a currency-formatted amount; a timestamp sits in the grid caption.',
      decide:
        'Goal is satisfied by reading, not acting. Capturing the as-of stamp too — a balance without a time is not an answer.',
      act: 'extract(savingsBalance, asOf) → checkpoint',
      inFlight: true,
    },
  ],
};

export const shapingSession: ShapingSession = {
  runId: 'run_8c31d',
  capabilityName: 'read_member_savings_balance',
  autoAcceptThreshold: 0.85,
  thresholdSource: 'from policy profile',
  values: [
    {
      valueId: 'share-type',
      contractName: 'shareType',
      contractType: 'string',
      value: '"Savings — Regular (S-01)"',
      source: 'selected in share-type dropdown, step 5',
      proposedRole: 'constant',
      confidence: 0.61,
      uncertaintyReason:
        'The dropdown had 14 options and the goal text did not name one, so this may be a caller choice rather than a fixed business rule.',
      alternatives: ['input', 'constant', 'discard'],
    },
    {
      valueId: 'member-number',
      contractName: 'memberNumber',
      contractType: 'string',
      value: '"12345"',
      source: 'typed into member search, step 5',
      proposedRole: 'input',
      confidence: 0.98,
    },
    {
      valueId: 'savings-balance',
      contractName: 'savingsBalance',
      contractType: 'money<USD>',
      value: '"$4,182.90"',
      source: 'read from share grid row 1, step 7',
      proposedRole: 'output',
      confidence: 0.95,
    },
    {
      valueId: 'as-of',
      contractName: 'asOf',
      contractType: 'datetime',
      value: '"09/12/2026 14:22"',
      source: 'grid caption timestamp, step 7',
      proposedRole: 'output',
      confidence: 0.91,
    },
    {
      valueId: 'entry-route',
      contractName: 'entryRoute',
      contractType: 'string',
      value: '"/servicing/default.aspx"',
      source: 'first navigation, step 1',
      proposedRole: 'constant',
      confidence: 0.89,
    },
  ],
};

export const policyProfile: PolicyProfile = {
  policyId: 'servicing-readonly',
  revision: 7,
  description:
    'The envelope every run inside this tenant executes in. Enforced in the executor, not the prompt — a jailbroken model still cannot act outside it.',
  allowedOrigins: [
    'https://meridian.{tenant}.internal/servicing/*',
    'https://meridian.{tenant}.internal/shares/*',
  ],
  deniedRoutes: [
    'https://meridian.{tenant}.internal/admin/*',
    '* — default for everything unlisted',
  ],
  rules: [
    { actionClass: 'navigate', note: 'within allowlist only', decision: 'safe' },
    { actionClass: 'read / extract', note: 'redaction applied at boundary', decision: 'safe' },
    { actionClass: 'fill', note: 'non-credential fields', decision: 'safe' },
    { actionClass: 'click', note: 'reversible navigation and search', decision: 'safe' },
    { actionClass: 'submit', note: 'anything that writes to the core', decision: 'confirm' },
    {
      actionClass: 'fill → credential field',
      note: 'detected by field type and name',
      decision: 'blocked',
    },
    { actionClass: 'file download / upload', note: 'exfiltration surface', decision: 'blocked' },
  ],
  redactedFieldNames: [
    'password',
    'ssn',
    'social security',
    'card number',
    'cvv',
    'date of birth',
    'token',
    'api key',
  ],
  screenshotPolicy:
    'Captured on failure only. Regions matching a redaction class are masked in-process before the image is written to disk.',
  artifactScrubbing:
    'Recorded values are replaced by type + redaction class at promote time. The artifact keeps shape, never content.',
  evidenceRetention: '30 days, then hard delete',
  riskyActionHandling: 'require_confirmation',
  autoAcceptThreshold: 0.85,
  // Mirrors ESCALATION_WORTHY_FAILURES in the session package.
  escalateOn: ['timeout', 'session_expired', 'assertion_failed', 'navigation_failed'],
  interventionSla: '8 min, then abandon',
  maxStepsPerRun: 25,
};
