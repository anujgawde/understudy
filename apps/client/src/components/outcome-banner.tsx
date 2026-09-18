import type { Outcome, OutcomeClassification } from '@/types';

// Hue by meaning, not by severity: a business outcome is the app answering
// correctly, so it reads blue like any other answer — never as a warning.
const bannerHues: Record<OutcomeClassification, string> = {
  success: 'border-green-line border-l-green-ink bg-green-wash',
  business_outcome: 'border-blue-line border-l-blue-ink bg-blue-wash',
  recovered: 'border-amber-line border-l-amber-ink bg-amber-wash',
  failed: 'border-red-line border-l-red-ink bg-red-wash',
};

const deepInks: Record<OutcomeClassification, string> = {
  success: 'text-green-deep',
  business_outcome: 'text-blue-deep',
  recovered: 'text-amber-deep',
  failed: 'text-red-deep',
};

export function OutcomeBanner({
  outcome,
  eyebrow,
  verdict,
  detail,
  metadata,
}: {
  outcome: Outcome;
  eyebrow: string;
  verdict: string;
  detail: string;
  metadata: string[];
}) {
  const deepInk = deepInks[outcome.classification];

  return (
    <div
      className={`border border-l-4 px-[17px] py-[15px] flex gap-4 items-start ${bannerHues[outcome.classification]}`}
    >
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div
          className={`font-mono text-[10.5px] tracking-[0.08em] uppercase font-semibold ${deepInk}`}
        >
          {eyebrow}
        </div>
        <div className="type-banner-headline">{verdict}</div>
        <div className={`text-[13px] leading-[1.55] max-w-[78ch] ${deepInk}`}>{detail}</div>
      </div>
      <div className={`font-mono text-[11px] leading-[1.7] text-right flex-none ${deepInk}`}>
        {metadata.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
    </div>
  );
}
