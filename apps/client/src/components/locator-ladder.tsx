import type { Locator, LocatorLadder } from '@/types';

// Rung colour is health, not order: green is the durable path, amber is
// degraded-but-working, red means we are leaning on something expected to break.
const rungInks = ['text-green-deep', 'text-amber-deep', 'text-red-deep'];

function expressionOf(locator: Locator) {
  switch (locator.strategy) {
    case 'role':
      return locator.accessibleName
        ? `a11y: role=${locator.role} name="${locator.accessibleName}"`
        : `a11y: role=${locator.role}`;
    case 'text':
      return `text: "${locator.text}"${locator.matchExactly ? ' (exact)' : ''}`;
    case 'adjacent':
      return `label "${locator.labelText}" >> ${locator.direction} cell${
        locator.targetRole ? ` >> ${locator.targetRole}` : ''
      }`;
    case 'css':
      return `css: ${locator.selector}`;
  }
}

function rationaleOf(locator: Locator) {
  switch (locator.strategy) {
    case 'role':
      return 'Accessibility tree. Survives markup rewrites and works identically on a desktop surface.';
    case 'text':
      return 'Visible text match. Stable while the copy is, which on a vendor product is most of the time.';
    case 'adjacent':
      return 'Label-anchored table walk — the realistic fallback for a grid with no labels wired to its inputs.';
    case 'css':
      return 'Recorded but ranked last. Changes with any vendor patch, so resolving here is itself a drift signal.';
  }
}

export function LocatorLadderView({ ladder }: { ladder: LocatorLadder }) {
  return (
    <div className="min-w-0 flex flex-col gap-2.5">
      <div className="type-section-label">Target resolution ladder</div>
      {ladder.map((locator, index) => (
        <div key={index} className="grid grid-cols-[18px_1fr] gap-2.5 items-start">
          <div className={`font-mono text-[10px] font-semibold pt-0.5 ${rungInks[index]}`}>
            {index + 1}
          </div>
          <div className="min-w-0">
            <div className="font-mono text-[11px] leading-[1.5] text-ink break-words">
              {expressionOf(locator)}
            </div>
            <div className="text-[11px] leading-[1.45] text-ink-mute">{rationaleOf(locator)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
