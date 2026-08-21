import { describe, it, expect } from "vitest";
import {
  calculateScheduledPell,
  computeAcademicYearPeriods,
  buildAidPackage,
  findCrossoverBoundary,
  calculateMonthlyPayment,
} from "../src/lib/aid-calc.js";
import { DEFAULT_SETTINGS } from "../shared/defaults.js";

const { loanLimits } = DEFAULT_SETTINGS;
const AWARD_MAX = 7395;
const AWARD_MIN = 740;

describe("calculateScheduledPell", () => {
  it("caps a negative SAI at the statutory maximum", () => {
    // REGRESSION: SAI can legally reach -1500. Max - SAI = 8895, which is above
    // the legal maximum. This shipped as a real bug once.
    expect(
      calculateScheduledPell({ sai: -1500, maxFlag: false, minFlag: false, awardMax: AWARD_MAX, awardMin: AWARD_MIN })
    ).toBe(AWARD_MAX);
  });

  it("subtracts SAI from max and rounds to the nearest $5", () => {
    expect(
      calculateScheduledPell({ sai: 1002, maxFlag: false, minFlag: false, awardMax: AWARD_MAX, awardMin: AWARD_MIN })
    ).toBe(6395); // 7395 - 1002 = 6393 -> 6395
  });

  it("floors at minimum Pell only when the min flag is set", () => {
    const belowMin = { sai: 7000, maxFlag: false, awardMax: AWARD_MAX, awardMin: AWARD_MIN };
    expect(calculateScheduledPell({ ...belowMin, minFlag: true })).toBe(AWARD_MIN);
    expect(calculateScheduledPell({ ...belowMin, minFlag: false })).toBe(0);
  });

  it("returns null for an unentered SAI so the UI can withhold a result", () => {
    expect(
      calculateScheduledPell({ sai: "", maxFlag: false, minFlag: false, awardMax: AWARD_MAX, awardMin: AWARD_MIN })
    ).toBeNull();
  });
});

describe("computeAcademicYearPeriods", () => {
  it("splits a 1200-hour program over a 900-hour academic year", () => {
    const periods = computeAcademicYearPeriods(1200, 900);
    expect(periods).toHaveLength(2);
    expect(periods[0]).toEqual({ hours: 900, fraction: 1 });
    expect(periods[1].hours).toBe(300);
    expect(periods[1].fraction).toBeCloseTo(1 / 3, 10);
  });

  it("returns a single full period when program length equals the academic year", () => {
    expect(computeAcademicYearPeriods(900, 900)).toEqual([{ hours: 900, fraction: 1 }]);
  });

  it("returns nothing for missing or nonsensical input", () => {
    expect(computeAcademicYearPeriods(0, 900)).toEqual([]);
    expect(computeAcademicYearPeriods(1200, 0)).toEqual([]);
  });
});

describe("buildAidPackage", () => {
  // The validated worksheet case: SAI -1500 (so Pell is capped at max),
  // independent, 1200 clock hours against a 900-hour academic year.
  const worksheet = {
    periods: computeAcademicYearPeriods(1200, 900),
    totalProgramHours: 1200,
    totalCost: 12000,
    downPayment: 0,
    scheduledPell: AWARD_MAX,
    startingGradeLevel: 1,
    useIndependentTable: true,
    loanLimits,
    originationFeePct: 1.057,
  };

  it("prorates tuition by program-hours share, NOT by academic-year fraction", () => {
    // REGRESSION: these two ratios are only equal when the program is exactly
    // one academic year long. Period 2 is 300/1200 = 25% of tuition, but
    // 300/900 = 33.3% of an academic year. Conflating them was a real bug.
    const { rows } = buildAidPackage(worksheet);
    expect(rows[0].tuitionSlice).toBeCloseTo(9000, 6); // 12000 * (900/1200)
    expect(rows[1].tuitionSlice).toBeCloseTo(3000, 6); // 12000 * (300/1200)
    // If the ratios were conflated, period 2 would be 12000 * (1/3) = 4000.
    expect(rows[1].tuitionSlice).not.toBeCloseTo(4000, 6);
    // Meanwhile Pell/loans on that same period DO use the 1/3 fraction:
    expect(rows[1].fraction).toBeCloseTo(1 / 3, 10);
  });

  it("prorates Pell by academic-year fraction", () => {
    const { rows } = buildAidPackage(worksheet);
    expect(rows[0].pell).toBe(7395); // full academic year
    expect(rows[1].pell).toBe(2465); // 7395 * 1/3
  });

  it("applies grade-level loan ceilings, prorated for a partial final period", () => {
    const { rows } = buildAidPackage(worksheet);
    expect(rows[0].gradeLevel).toBe(1);
    expect(rows[0].subCeiling).toBe(3500);
    expect(rows[0].unsubCeiling).toBe(6000); // independent year1 total 9500 - 3500 sub
    expect(rows[1].gradeLevel).toBe(2); // progresses on the next period
    expect(rows[1].subCeiling).toBe(1500); // 4500 * 1/3
    expect(rows[1].unsubCeiling).toBe(2000); // (10500 * 1/3) - 1500
  });

  it("reduces net proceeds by the origination fee while the ceiling stays gross", () => {
    // Tuition high enough that both ceilings actually bind, which is the case
    // the real worksheet documented: full 3500/6000 draws netting 3464/5936
    // after the 1.057% fee.
    const { rows } = buildAidPackage({ ...worksheet, totalCost: 25000 });
    expect(rows[0].subGross).toBe(3500);
    expect(rows[0].subNet).toBeCloseTo(3463.0, 1); // worksheet showed 3464
    expect(rows[0].unsubGross).toBe(6000);
    expect(rows[0].unsubNet).toBeCloseTo(5936.58, 2); // worksheet showed 5936
  });

  it("leaves the origination fee itself as residual need", () => {
    // Subtle but correct: a loan counts GROSS against its ceiling but only NET
    // against the balance, so the fee on one loan becomes a small slice of need
    // that the next loan type picks up. Borrowing 605 sub clears only 598.61.
    const { rows } = buildAidPackage({
      ...worksheet,
      periods: computeAcademicYearPeriods(900, 900),
      totalProgramHours: 900,
      totalCost: 8000,
    });
    expect(rows[0].subGross).toBeCloseTo(605, 6);
    expect(rows[0].subNet).toBeCloseTo(598.61, 2);
    expect(rows[0].unsubGross).toBeCloseTo(6.39, 2); // 605 * 1.057%
    expect(rows[0].remainingBalance).toBeLessThan(0.1);
  });

  it("caps each loan at need, not at the ceiling", () => {
    // A cheap program where Pell nearly covers everything should leave loan
    // headroom unused. "Assume everyone borrows the max" was the original
    // wrong approximation and overstated aid.
    const { rows } = buildAidPackage({
      ...worksheet,
      periods: computeAcademicYearPeriods(900, 900),
      totalProgramHours: 900,
      totalCost: 8000,
    });
    expect(rows[0].subCeiling).toBe(3500);
    expect(rows[0].subGross).toBeCloseTo(605, 6); // the 8000 - 7395 of need, not 3500
    expect(rows[0].subGross).toBeLessThan(rows[0].subCeiling); // headroom left unused
    expect(rows[0].remainingBalance).toBeLessThan(0.1);
  });

  it("adds the down payment to period 1 as a charge, never as a credit", () => {
    // REGRESSION: down payment was once modeled as both a charge and a credit,
    // silently cancelling itself out. It is a charge, and only on period 1.
    const withDp = buildAidPackage({ ...worksheet, downPayment: 3150 });
    const withoutDp = buildAidPackage({ ...worksheet, downPayment: 0 });
    expect(withDp.rows[0].tuitionSlice - withoutDp.rows[0].tuitionSlice).toBeCloseTo(3150, 6);
    expect(withDp.rows[1].tuitionSlice).toBeCloseTo(withoutDp.rows[1].tuitionSlice, 6);
    expect(withDp.rows[1].downPaymentCharge).toBe(0);
    // A charge can only ever increase what is owed.
    expect(withDp.totals.remainingBalance).toBeGreaterThanOrEqual(withoutDp.totals.remainingBalance);
  });

  it("carries Pell overage forward to reduce the next period's need", () => {
    // Period 1 tuition is small relative to a full Pell award, so the excess
    // should land on period 2 rather than evaporating.
    const { rows } = buildAidPackage({ ...worksheet, totalCost: 4000 });
    expect(rows[0].remainingBalance).toBe(0);
    expect(rows[1].remainingBalance).toBe(0);
    // Period 2 needed no loans at all, because carried Pell covered it.
    expect(rows[1].subGross).toBe(0);
    expect(rows[1].unsubGross).toBe(0);
  });

  it("applies scholarship/SEOG as grant aid, dollar for dollar off the balance", () => {
    // High tuition, so both loans are ceiling-capped and the grant has nowhere
    // to go but the balance.
    const expensive = { ...worksheet, totalCost: 25000 };
    const withGrant = buildAidPackage({ ...expensive, otherGrantAid: 1500 });
    const without = buildAidPackage(expensive);

    expect(withGrant.rows[0].grants).toBe(1500);
    expect(withGrant.totals.grants).toBe(1500);
    expect(withGrant.totals.remainingBalance).toBeCloseTo(without.totals.remainingBalance - 1500, 6);
    // Borrowing is untouched, because it was already at the ceiling.
    expect(withGrant.rows[0].subGross).toBe(3500);
    expect(withGrant.rows[0].unsubGross).toBe(6000);
  });

  it("reduces borrowing when a grant brings need below the loan ceilings", () => {
    // REGRESSION: the paper worksheet lists scholarships below the loan rows.
    // Doing that literally would have this student borrow the full ceiling and
    // finish with a credit balance, paying interest on money they already had.
    const cheap = {
      ...worksheet,
      periods: computeAcademicYearPeriods(900, 900),
      totalProgramHours: 900,
      totalCost: 12000,
      useIndependentTable: false,
    };
    const withGrant = buildAidPackage({ ...cheap, otherGrantAid: 3000 });
    const without = buildAidPackage({ ...cheap });

    // Roughly $1,100 less borrowed, rather than the same borrowing plus a
    // $3,000 credit balance that the worksheet's bottom-of-page layout implies.
    expect(withGrant.rows[0].subGross).toBeLessThan(without.rows[0].subGross);
    expect(without.rows[0].subGross - withGrant.rows[0].subGross).toBeGreaterThan(1000);
    // Settles at zero (bar the origination-fee residual), never a credit.
    expect(withGrant.totals.remainingBalance).toBeGreaterThanOrEqual(0);
    expect(withGrant.totals.remainingBalance).toBeLessThan(1);
  });

  it("carries a grant larger than period 1's charge forward instead of losing it", () => {
    const { rows } = buildAidPackage({ ...worksheet, totalCost: 4000, otherGrantAid: 5000 });
    expect(rows[0].remainingBalance).toBe(0);
    expect(rows[1].remainingBalance).toBe(0);
    expect(rows[1].subGross).toBe(0);
  });

  it("defaults to no grant aid when the argument is omitted", () => {
    const omitted = buildAidPackage({ ...worksheet });
    const explicitZero = buildAidPackage({ ...worksheet, otherGrantAid: 0 });
    expect(omitted.totals.remainingBalance).toBe(explicitZero.totals.remainingBalance);
    expect(omitted.totals.grants).toBe(0);
  });

  it("stops grade-level progression at year 3", () => {
    const { rows } = buildAidPackage({
      ...worksheet,
      periods: computeAcademicYearPeriods(4500, 900),
      totalProgramHours: 4500,
      totalCost: 60000,
      startingGradeLevel: 2,
    });
    expect(rows.map((r) => r.gradeLevel)).toEqual([2, 3, 3, 3, 3]);
  });

  it("uses the dependent limit table when the student is dependent", () => {
    const { rows } = buildAidPackage({ ...worksheet, useIndependentTable: false });
    expect(rows[0].subCeiling).toBe(3500);
    expect(rows[0].unsubCeiling).toBe(2000); // dependent year1 total 5500 - 3500
  });
});

describe("findCrossoverBoundary", () => {
  it("flags an enrollment that straddles July 1", () => {
    const boundary = findCrossoverBoundary("2026-05-01", 20); // ~140 days -> mid-Sept
    expect(boundary).toBeInstanceOf(Date);
    expect(boundary.getMonth()).toBe(6); // July
    expect(boundary.getFullYear()).toBe(2026);
  });

  it("does not flag an enrollment contained within one award year", () => {
    expect(findCrossoverBoundary("2026-08-01", 20)).toBeNull(); // Aug -> Dec
  });

  it("returns null on missing input", () => {
    expect(findCrossoverBoundary("", 20)).toBeNull();
    expect(findCrossoverBoundary("2026-05-01", 0)).toBeNull();
  });
});

describe("calculateMonthlyPayment", () => {
  it("divides evenly at 0% interest", () => {
    const { payment, totalInterest } = calculateMonthlyPayment(1857, 0, 18);
    expect(payment).toBeCloseTo(103.17, 2);
    expect(totalInterest).toBeCloseTo(0, 10);
  });

  it("amortizes when a rate is set", () => {
    const { payment, totalPaid, totalInterest } = calculateMonthlyPayment(1857, 6, 18);
    expect(payment).toBeGreaterThan(1857 / 18);
    expect(totalInterest).toBeGreaterThan(0);
    expect(totalPaid).toBeCloseTo(payment * 18, 6);
  });

  it("returns zeroes for a fully covered balance", () => {
    expect(calculateMonthlyPayment(0, 5, 18)).toEqual({ payment: 0, totalPaid: 0, totalInterest: 0 });
  });
});
