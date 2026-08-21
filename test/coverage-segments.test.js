import { describe, it, expect } from "vitest";
import {
  coverageSegments,
  buildAidPackage,
  computeAcademicYearPeriods,
  calculateScheduledPell,
} from "../src/lib/aid-calc.js";
import { DEFAULT_SETTINGS } from "../shared/defaults.js";

const { loanLimits } = DEFAULT_SETTINGS;

// The redacted worksheet program: 1200 clock hours against a 900-hour academic
// year, so it packages as two periods and exercises the carry-forward path.
function packageWith({ sai = 784, otherGrantAid = 0 } = {}) {
  return buildAidPackage({
    periods: computeAcademicYearPeriods(1200, 900),
    totalProgramHours: 1200,
    totalCost: 20112,
    downPayment: 3129,
    scheduledPell: calculateScheduledPell({ sai, maxFlag: false, minFlag: false, awardMax: 7395, awardMin: 740 }),
    otherGrantAid,
    startingGradeLevel: 1,
    useIndependentTable: false,
    loanLimits,
    originationFeePct: 1.057,
  });
}

const sum = (segments) => segments.reduce((t, s) => t + s.amount, 0);

describe("coverageSegments", () => {
  it("accounts for every dollar of the charge, in every period", () => {
    // The invariant the bar rests on: if these did not sum to the charge, a
    // period would render as more or less than fully accounted for.
    for (const grant of [0, 1500, 12000, 40000]) {
      for (const row of packageWith({ otherGrantAid: grant }).rows) {
        expect(sum(coverageSegments(row))).toBeCloseTo(row.tuitionSlice, 6);
      }
    }
  });

  it("clamps gift aid to the charge instead of overdrawing the bar", () => {
    // A $12,000 scholarship is larger than period 1's charge once Pell is on
    // it. Drawing both at face value would run the bar past 100%.
    const [period1] = packageWith({ otherGrantAid: 12000 }).rows;
    const segments = coverageSegments(period1);

    expect(sum(segments)).toBeCloseTo(period1.tuitionSlice, 6);
    expect(segments.find((s) => s.key === "grants").amount).toBeLessThan(12000);
    expect(segments.every((s) => s.amount <= period1.tuitionSlice + 1e-6)).toBe(true);
  });

  it("recovers the credit the next period carries in", () => {
    const rows = packageWith({ otherGrantAid: 12000 }).rows;
    const carried = coverageSegments(rows[1]).find((s) => s.key === "credit");

    // What period 1 could not absorb is exactly what period 2 carries in.
    const period1 = rows[0];
    const spilled = period1.pell + period1.grants - period1.tuitionSlice;
    expect(spilled).toBeGreaterThan(0);
    expect(carried.amount).toBeCloseTo(spilled, 6);
  });

  it("shows the shortfall as the still-due segment", () => {
    const [period1] = packageWith().rows;
    expect(period1.remainingBalance).toBeGreaterThan(0);
    expect(coverageSegments(period1).find((s) => s.key === "due").amount).toBeCloseTo(period1.remainingBalance, 6);
  });

  it("omits sources that contributed nothing", () => {
    // No scholarship and no SEOG: a zero-width grant segment would still draw a
    // legend entry claiming aid the student did not get.
    const [period1] = packageWith({ otherGrantAid: 0 }).rows;
    const keys = coverageSegments(period1).map((s) => s.key);
    expect(keys).not.toContain("grants");
    expect(keys).not.toContain("credit");
    expect(keys).toContain("pell");
  });

  it("orders gift aid ahead of anything borrowed", () => {
    const keys = coverageSegments(packageWith({ otherGrantAid: 1500 }).rows[0]).map((s) => s.key);
    expect(keys.indexOf("pell")).toBeLessThan(keys.indexOf("grants"));
    expect(keys.indexOf("grants")).toBeLessThan(keys.indexOf("sub"));
    expect(keys.indexOf("sub")).toBeLessThan(keys.indexOf("unsub"));
    expect(keys.indexOf("unsub")).toBeLessThan(keys.indexOf("due"));
  });

  it("returns nothing for a period with no charge", () => {
    expect(coverageSegments({ tuitionSlice: 0, pell: 500, remainingBalance: 0 })).toEqual([]);
    expect(coverageSegments(null)).toEqual([]);
  });
});
