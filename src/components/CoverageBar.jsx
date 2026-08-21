import React from "react";

import { coverageSegments, formatMoney } from "../lib/aid-calc.js";
import { COVERAGE_COLORS } from "../lib/theme.js";

// One period's charge, drawn as the sources that cover it. The three number
// columns beside it say how much each source gave; this says how far that got
// against the bill, which is the question staff are actually answering out loud
// when a student asks what they will owe.
//
// coverageSegments guarantees the parts sum to the charge, so the bar is always
// exactly full and its widths are a real proportion rather than a gauge.
export default function CoverageBar({ row, isLastPeriod = false, scholarshipAmount = 0, seogAmount = 0 }) {
  const segments = coverageSegments(row);
  if (segments.length === 0) return null;

  const charge = row.tuitionSlice;
  const applied = Object.fromEntries(segments.map((s) => [s.key, s.amount]));

  // Gift aid the charge could not absorb. Pell and grants are clamped into the
  // bar, so the difference between what the row awarded and what the bar drew
  // is what spills past this period.
  const spilled =
    Math.max((Number(row.pell) || 0) - (applied.pell || 0), 0) +
    Math.max((Number(row.grants) || 0) - (applied.grants || 0), 0);

  // The generic label is right until both grants are present at once, at which
  // point staff want to know which one is doing the work.
  const labelFor = (segment) => {
    if (segment.key !== "grants") return segment.label;
    if (scholarshipAmount > 0 && seogAmount > 0) return "Scholarship + SEOG";
    if (seogAmount > 0) return "SEOG";
    if (scholarshipAmount > 0) return "Scholarship";
    return segment.label;
  };

  return (
    <div className="mb-3">
      {/* aria-hidden: every figure in it is repeated as text in the legend
          below, so announcing the bar too would just read the period twice. */}
      <div
        aria-hidden="true"
        className="h-2.5 w-full rounded-full overflow-hidden flex bg-[#F0EEE8] border border-[#DDD8CA]"
      >
        {segments.map((s) => (
          <div
            key={s.key}
            className="h-full transition-all duration-300"
            style={{ width: `${(s.amount / charge) * 100}%`, backgroundColor: COVERAGE_COLORS[s.key] }}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {segments.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-[#6B6656]">
            <span
              aria-hidden="true"
              className="w-2 h-2 rounded-[2px] shrink-0"
              style={{ backgroundColor: COVERAGE_COLORS[s.key] }}
            />
            {labelFor(s)} <span className="mono text-[#232530]">{formatMoney(s.amount)}</span>
          </span>
        ))}
      </div>

      {spilled > 0.5 && (
        <p className="text-[11px] text-[#9A9584] mt-1.5">
          {isLastPeriod
            ? `Gift aid runs ${formatMoney(spilled)} past this period's charge, and there is no period after it to absorb the credit. This estimate doesn't model a refund.`
            : `Gift aid runs ${formatMoney(spilled)} past this period's charge. That credit carries into the next period rather than being lost.`}
        </p>
      )}
    </div>
  );
}
