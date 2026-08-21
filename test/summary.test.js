import { describe, it, expect } from "vitest";

import { buildEstimateSummary } from "../src/lib/summary.js";
import { buildAidPackage, computeAcademicYearPeriods, calculateScheduledPell, formatMoney } from "../src/lib/aid-calc.js";
import { DEFAULT_SETTINGS } from "../shared/defaults.js";

const PROGRAM = { id: "cos", name: "Cosmetology", totalCost: 20112, downPayment: 3129, clockHours: 1200, lengthWeeks: 40 };

function summaryFor(overrides = {}) {
  const scholarshipAmount = overrides.scholarshipAmount ?? 1500;
  const aidPackage = buildAidPackage({
    periods: computeAcademicYearPeriods(PROGRAM.clockHours, DEFAULT_SETTINGS.academicYearHours),
    totalProgramHours: PROGRAM.clockHours,
    totalCost: PROGRAM.totalCost,
    downPayment: PROGRAM.downPayment,
    scheduledPell: calculateScheduledPell({ sai: 784, maxFlag: false, minFlag: false, awardMax: 7395, awardMin: 740 }),
    otherGrantAid: scholarshipAmount,
    startingGradeLevel: 1,
    useIndependentTable: false,
    loanLimits: DEFAULT_SETTINGS.loanLimits,
    originationFeePct: DEFAULT_SETTINGS.originationFeePct,
  });

  return {
    aidPackage,
    text: buildEstimateSummary({
      program: PROGRAM,
      settings: DEFAULT_SETTINGS,
      sai: 784,
      startDate: "2026-09-08",
      scholarshipAmount,
      aidPackage,
      termMonths: 10,
      interestRate: 0,
      monthlyPayment: aidPackage.totals.remainingBalance / 10,
      totalPaid: aidPackage.totals.remainingBalance,
      generatedAt: new Date("2026-08-21T12:00:00"),
      ...overrides,
    }),
  };
}

describe("buildEstimateSummary", () => {
  it("never carries anything that identifies the student", () => {
    // The privacy line this tool draws: the printed worksheet is the student's
    // document and names them; the clipboard is staff shorthand and must not.
    // Passing the fields anyway is the case worth pinning, since a future
    // caller spreading its whole state in is exactly how that would break.
    const { text } = summaryFor({ studentName: "Jane Q. Student", dateOfBirth: "2008-04-15" });
    expect(text).not.toMatch(/Jane|Student,|2008-04-15/);
  });

  it("lists every period with the figures the screen shows", () => {
    const { text, aidPackage } = summaryFor();
    expect(aidPackage.rows).toHaveLength(2);
    for (const row of aidPackage.rows) {
      expect(text).toContain(`AY${row.index + 1} · Grade ${row.gradeLevel}`);
      expect(text).toContain(formatMoney(row.subNet));
    }
    expect(text).toContain(formatMoney(aidPackage.totals.remainingBalance));
  });

  it("reports the Pell basis rather than a bare SAI when a flag is set", () => {
    expect(summaryFor({ maxFlag: true }).text).toContain("Max Pell indicator (ISIR)");
    expect(summaryFor({ minFlag: true }).text).toContain("SAI 784, Min Pell indicator (ISIR)");
    expect(summaryFor().text).toContain("Basis               SAI 784");
  });

  it("names the dependency status the estimate was actually run under", () => {
    expect(summaryFor({ isIndependent: true }).text).toContain("Independent");
    expect(summaryFor({ parentPlusDenied: true }).text).toContain("Dependent (PLUS denied)");
  });

  it("omits the payment plan when there is no balance to finance", () => {
    const { text } = summaryFor({ scholarshipAmount: 40000 });
    expect(text).not.toContain("PAYMENT PLAN");
    expect(text).toContain("Balance to finance  $0");
  });

  it("carries the crossover warning, since it changes which figures apply", () => {
    const { text } = summaryFor({ crossoverBoundary: new Date(2027, 6, 1) });
    expect(text).toContain("crosses the Pell award year boundary around July 1, 2027");
  });

  it("prints the enrollment date in local time, not shifted back a day", () => {
    expect(summaryFor({ startDate: "2026-09-08" }).text).toContain("September 8, 2026");
  });

  it("returns nothing at all when there is no estimate yet", () => {
    expect(buildEstimateSummary({ program: PROGRAM })).toBe("");
    expect(buildEstimateSummary()).toBe("");
  });
});
