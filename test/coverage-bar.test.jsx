import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import CoverageBar from "../src/components/CoverageBar.jsx";
import { buildAidPackage, computeAcademicYearPeriods, calculateScheduledPell } from "../src/lib/aid-calc.js";
import { DEFAULT_SETTINGS } from "../shared/defaults.js";

function rowsFor(otherGrantAid) {
  return buildAidPackage({
    periods: computeAcademicYearPeriods(1200, 900),
    totalProgramHours: 1200,
    totalCost: 20112,
    downPayment: 3129,
    scheduledPell: calculateScheduledPell({ sai: 784, maxFlag: false, minFlag: false, awardMax: 7395, awardMin: 740 }),
    otherGrantAid,
    startingGradeLevel: 1,
    useIndependentTable: false,
    loanLimits: DEFAULT_SETTINGS.loanLimits,
    originationFeePct: DEFAULT_SETTINGS.originationFeePct,
  }).rows;
}

// Only the bar segments carry an inline width; the legend swatches are sized by
// class, so this picks up the drawn proportions and nothing else.
function drawnWidths(markup) {
  return [...markup.matchAll(/width:([\d.]+)%/g)].map((m) => Number(m[1]));
}

describe("CoverageBar", () => {
  it("always draws exactly one full bar", () => {
    for (const grant of [0, 1500, 12000]) {
      for (const row of rowsFor(grant)) {
        const widths = drawnWidths(renderToStaticMarkup(<CoverageBar row={row} />));
        expect(widths.length).toBeGreaterThan(0);
        expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 4);
      }
    }
  });

  it("names which grant is doing the work when both are present", () => {
    const [period1] = rowsFor(2000);
    const both = renderToStaticMarkup(
      <CoverageBar row={period1} scholarshipAmount={1500} seogAmount={500} />
    );
    expect(both).toContain("Scholarship + SEOG");

    const seogOnly = renderToStaticMarkup(<CoverageBar row={period1} scholarshipAmount={0} seogAmount={2000} />);
    expect(seogOnly).toContain("SEOG");
    expect(seogOnly).not.toContain("Scholarship +");
  });

  it("says where gift aid past the charge actually goes", () => {
    const rows = rowsFor(12000);
    const middle = renderToStaticMarkup(<CoverageBar row={rows[0]} isLastPeriod={false} />);
    expect(middle).toContain("carries into the next period");

    // The same overflow in the final period has nothing to carry into, and
    // saying otherwise would promise the student money the tool never modeled.
    const last = renderToStaticMarkup(<CoverageBar row={rows[0]} isLastPeriod />);
    expect(last).toContain("no period after it");
    expect(last).not.toContain("carries into the next period");
  });

  it("stays silent when aid lands inside the charge", () => {
    const markup = renderToStaticMarkup(<CoverageBar row={rowsFor(0)[0]} />);
    expect(markup).not.toContain("past this period's charge");
  });

  it("renders nothing for a period with no charge", () => {
    expect(renderToStaticMarkup(<CoverageBar row={{ tuitionSlice: 0 }} />)).toBe("");
  });
});
