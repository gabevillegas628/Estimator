import { describe, it, expect } from "vitest";
import {
  buildAidPackage,
  computeAcademicYearPeriods,
  calculateScheduledPell,
  calculateMonthlyPayment,
  explainScheduledPell,
  explainAcademicYearPeriods,
  explainMonthlyPayment,
  formatMoneyExact,
} from "../src/lib/aid-calc.js";
import { DEFAULT_SETTINGS } from "../shared/defaults.js";

const { loanLimits } = DEFAULT_SETTINGS;
const AWARD_MAX = 7395;
const AWARD_MIN = 740;

// The whole risk of a "show the work" feature is that the explanation drifts
// from the arithmetic it claims to explain — a panel confidently narrating
// numbers the estimate never used would be worse than no panel at all. These
// tests pin every step to the value it explains.

function stepValue(steps, label) {
  const step = steps.find((s) => s.label === label);
  if (!step) throw new Error(`no step labelled "${label}" — found: ${steps.map((s) => s.label).join(", ")}`);
  return step.value;
}

describe("buildAidPackage step trace", () => {
  const scenarios = {
    "two periods, grants, down payment": {
      periods: computeAcademicYearPeriods(1200, 900),
      totalProgramHours: 1200,
      totalCost: 20112,
      downPayment: 3129,
      scheduledPell: calculateScheduledPell({ sai: 784, maxFlag: false, minFlag: false, awardMax: AWARD_MAX, awardMin: AWARD_MIN }),
      otherGrantAid: 1500,
      startingGradeLevel: 1,
      useIndependentTable: false,
      loanLimits,
      originationFeePct: 1.057,
    },
    "single period, independent, no grants": {
      periods: computeAcademicYearPeriods(900, 900),
      totalProgramHours: 900,
      totalCost: 12000,
      downPayment: 0,
      scheduledPell: AWARD_MAX,
      otherGrantAid: 0,
      startingGradeLevel: 1,
      useIndependentTable: true,
      loanLimits,
      originationFeePct: 1.057,
    },
    "grant aid larger than period 1's charge": {
      periods: computeAcademicYearPeriods(1200, 900),
      totalProgramHours: 1200,
      totalCost: 6000,
      downPayment: 0,
      scheduledPell: AWARD_MAX,
      otherGrantAid: 9000,
      startingGradeLevel: 1,
      useIndependentTable: false,
      loanLimits,
      originationFeePct: 1.057,
    },
    "no origination fee, starting at grade 3": {
      periods: computeAcademicYearPeriods(2000, 900),
      totalProgramHours: 2000,
      totalCost: 30000,
      downPayment: 500,
      scheduledPell: 3000,
      otherGrantAid: 0,
      startingGradeLevel: 3,
      useIndependentTable: true,
      loanLimits,
      originationFeePct: 0,
    },
    "no Pell scheduled": {
      periods: computeAcademicYearPeriods(600, 900),
      totalProgramHours: 600,
      totalCost: 8500,
      downPayment: 800,
      scheduledPell: null,
      otherGrantAid: 0,
      startingGradeLevel: 1,
      useIndependentTable: false,
      loanLimits,
      originationFeePct: 1.057,
    },
  };

  for (const [name, args] of Object.entries(scenarios)) {
    describe(name, () => {
      const { rows, totals, totalSteps } = buildAidPackage(args);

      it("gives every period a step for every figure it reports", () => {
        expect(rows.length).toBeGreaterThan(0);
        rows.forEach((row) => {
          expect(stepValue(row.steps, "Grade level for this period")).toBe(row.gradeLevel);
          expect(stepValue(row.steps, "Subsidized ceiling for this period")).toBe(row.subCeiling);
          expect(stepValue(row.steps, "Unsubsidized ceiling for this period")).toBe(row.unsubCeiling);
          expect(stepValue(row.steps, "Pell for this period")).toBe(row.pell);
          expect(stepValue(row.steps, "Charge for this period")).toBe(row.tuitionSlice);
          expect(stepValue(row.steps, "Subsidized loan")).toBe(row.subNet);
          expect(stepValue(row.steps, "Unsubsidized loan")).toBe(row.unsubNet);
          expect(stepValue(row.steps, "Still due for this period")).toBe(row.remainingBalance);
        });
      });

      it("explains the totals with the totals it actually produced", () => {
        expect(stepValue(totalSteps, "Total Pell")).toBe(totals.pell);
        expect(stepValue(totalSteps, "Total subsidized (net of fees)")).toBe(totals.subNet);
        expect(stepValue(totalSteps, "Total unsubsidized (net of fees)")).toBe(totals.unsubNet);
        expect(stepValue(totalSteps, "Balance left to finance")).toBe(totals.remainingBalance);
      });

      it("writes a readable formula for every step", () => {
        [...rows.flatMap((r) => r.steps), ...totalSteps].forEach((step) => {
          expect(typeof step.label).toBe("string");
          expect(step.label.length).toBeGreaterThan(0);
          expect(typeof step.formula).toBe("string");
          expect(step.formula.length).toBeGreaterThan(0);
          // A formula with an unresolved placeholder or a NaN would read as
          // gibberish to staff quoting these numbers to a student.
          expect(step.formula).not.toMatch(/NaN|undefined|\$\{/);
        });
      });
    });
  }

  it("shows the need step arriving at zero, not negative, when grants overshoot", () => {
    // The credit is carried forward rather than shown as negative need; the
    // note has to say so or the step looks like money vanished.
    const { rows } = buildAidPackage(scenarios["grant aid larger than period 1's charge"]);
    const needStep = rows[0].steps.find((s) => s.label === "Need after grant aid");
    expect(needStep.value).toBe(0);
    expect(needStep.note).toMatch(/carries forward/);

    // ...and the next period's need step has to account for where it went.
    expect(rows[1].steps.find((s) => s.label === "Need after grant aid").formula).toMatch(/credit carried from period 1/);
  });

  it("flags the two different proration ratios where they diverge", () => {
    // REGRESSION-adjacent: conflating these was a real bug. Period 2 of a
    // 1200h program is 25% of tuition but 33.3% of an academic year, and the
    // step trace is the place staff would catch it recurring.
    const { rows } = buildAidPackage(scenarios["two periods, grants, down payment"]);
    expect(rows[1].steps.find((s) => s.label === "Charge for this period").note).toMatch(/25%.*33\.3%/);

    // One academic year exactly: the ratios agree, so there is nothing to warn about.
    const single = buildAidPackage(scenarios["single period, independent, no grants"]);
    expect(single.rows[0].steps.find((s) => s.label === "Charge for this period").note).toBeNull();
  });

  it("still returns the rows and totals its callers already depend on", () => {
    // The trace was added to an existing return shape; nothing may have shifted.
    const { rows, totals } = buildAidPackage(scenarios["two periods, grants, down payment"]);
    expect(totals.pell).toBe(rows.reduce((a, r) => a + r.pell, 0));
    expect(Object.keys(rows[0])).toEqual(
      expect.arrayContaining([
        "index", "gradeLevel", "hours", "fraction", "pell", "grants", "subCeiling",
        "unsubCeiling", "subGross", "subNet", "unsubGross", "unsubNet", "tuitionSlice",
        "downPaymentCharge", "remainingBalance",
      ])
    );
  });
});

describe("explainScheduledPell", () => {
  // The explainer narrates rather than recomputes, so the one thing that must
  // hold for every input is that it reports the real function's answer.
  const flagCombos = [
    { maxFlag: false, minFlag: false },
    { maxFlag: false, minFlag: true },
    { maxFlag: true, minFlag: false },
  ];
  const saiValues = ["", -1500, -1, 0, 1, 784, 1002, 6655, 7000, 14790, "not a number"];

  it("always reports what calculateScheduledPell returns", () => {
    for (const flags of flagCombos) {
      for (const sai of saiValues) {
        const args = { sai, ...flags, awardMax: AWARD_MAX, awardMin: AWARD_MIN };
        expect(explainScheduledPell(args).value).toBe(calculateScheduledPell(args));
      }
    }
  });

  it("shows the statutory cap when a negative SAI would exceed the maximum", () => {
    const { value, steps } = explainScheduledPell({ sai: -1500, maxFlag: false, minFlag: false, awardMax: AWARD_MAX, awardMin: AWARD_MIN });
    expect(value).toBe(AWARD_MAX);
    expect(stepValue(steps, "Subtract the SAI from the scheduled maximum")).toBe(8895);
    // A subtracted negative must not render as "− -$1,500".
    expect(steps.find((s) => s.label === "Subtract the SAI from the scheduled maximum").formula).toMatch(
      /a negative SAI adds to the award/
    );
    expect(stepValue(steps, "Cap at the scheduled maximum")).toBe(AWARD_MAX);
  });

  it("does not invent a cap step when none was applied", () => {
    const { steps } = explainScheduledPell({ sai: 1002, maxFlag: false, minFlag: false, awardMax: AWARD_MAX, awardMin: AWARD_MIN });
    expect(steps.some((s) => s.label === "Cap at the scheduled maximum")).toBe(false);
    expect(stepValue(steps, "Round to the nearest $5")).toBe(6395);
  });

  it("distinguishes the two below-minimum outcomes", () => {
    const belowMin = { sai: 7000, maxFlag: false, awardMax: AWARD_MAX, awardMin: AWARD_MIN };
    expect(stepValue(explainScheduledPell({ ...belowMin, minFlag: true }).steps, "Floor at minimum Pell")).toBe(AWARD_MIN);
    expect(
      stepValue(explainScheduledPell({ ...belowMin, minFlag: false }).steps, "Below minimum Pell, with no Min Pell flag")
    ).toBe(0);
  });

  it("says nothing has been calculated when there is no SAI", () => {
    const { value, steps } = explainScheduledPell({ sai: "", maxFlag: false, minFlag: false, awardMax: AWARD_MAX, awardMin: AWARD_MIN });
    expect(value).toBeNull();
    expect(steps).toHaveLength(1);
    expect(steps[0].unit).toBe("none");
  });
});

describe("explainAcademicYearPeriods", () => {
  it("returns exactly what computeAcademicYearPeriods returns", () => {
    for (const [hours, ay] of [[1200, 900], [900, 900], [300, 900], [2000, 900], [0, 900], [1200, 0]]) {
      expect(explainAcademicYearPeriods(hours, ay).periods).toEqual(computeAcademicYearPeriods(hours, ay));
    }
  });

  it("gives one share step per period", () => {
    const { steps } = explainAcademicYearPeriods(1200, 900);
    expect(stepValue(steps, "Number of payment periods")).toBe(2);
    expect(stepValue(steps, "Period 1 share of an academic year")).toBe(1);
    expect(stepValue(steps, "Period 2 share of an academic year")).toBeCloseTo(1 / 3, 10);
  });

  it("explains itself rather than throwing when the program cannot be split", () => {
    const { periods, steps } = explainAcademicYearPeriods(0, 900);
    expect(periods).toEqual([]);
    expect(steps).toHaveLength(1);
    expect(steps[0].label).toBe("No payment periods");
  });
});

describe("explainMonthlyPayment", () => {
  it("always reports what calculateMonthlyPayment returns", () => {
    const cases = [[5000, 0, 18], [5000, 7.5, 24], [12000, 12, 60], [0, 5, 12], [5000, 0, 0], [-100, 5, 12]];
    for (const [principal, rate, months] of cases) {
      const real = calculateMonthlyPayment(principal, rate, months);
      const explained = explainMonthlyPayment(principal, rate, months);
      expect(explained.payment).toBe(real.payment);
      expect(explained.totalPaid).toBe(real.totalPaid);
      expect(explained.totalInterest).toBe(real.totalInterest);
    }
  });

  it("divides evenly and skips the interest step at 0%", () => {
    const { steps } = explainMonthlyPayment(5400, 0, 18);
    expect(stepValue(steps, "Monthly payment")).toBe(300);
    expect(steps.some((s) => s.label === "Interest paid")).toBe(false);
  });

  it("shows the amortization intermediates when there is a rate", () => {
    const { steps, payment, totalInterest } = explainMonthlyPayment(5000, 6, 24);
    expect(stepValue(steps, "Monthly interest rate")).toBeCloseTo(0.5, 10);
    expect(stepValue(steps, "Monthly payment")).toBe(payment);
    expect(stepValue(steps, "Interest paid")).toBe(totalInterest);
  });

  it("says so plainly when aid covers everything", () => {
    const { steps } = explainMonthlyPayment(0, 0, 18);
    expect(steps[0].formula).toMatch(/no balance/);
  });
});

describe("formatMoneyExact", () => {
  it("shows cents only when the arithmetic produced them", () => {
    expect(formatMoneyExact(3465)).toBe("$3,465");
    expect(formatMoneyExact(3428.375)).toBe("$3,428.38");
    expect(formatMoneyExact(-250.5)).toBe("-$250.50");
    expect(formatMoneyExact(null)).toBe("—");
    expect(formatMoneyExact(NaN)).toBe("—");
  });
});
