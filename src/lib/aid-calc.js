// Pure aid-packaging math. No React, no DOM, no network — every function here
// is deterministic on its arguments, which is what makes the regression tests
// in test/aid-calc.test.js possible. Two bugs have already been found and fixed
// in this logic (the Pell cap and the two proration ratios); both now have
// tests. Keep this file free of UI concerns.

export function formatMoney(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sign = n < 0 ? "-" : "";
  return sign + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
}

// The inverse of formatMoney, for the settings fields. A money input shows
// "$23,000" when it is not being edited, so whatever comes back out has to
// survive the dollar sign, the commas, and a half-typed entry. Anything that
// does not parse is 0 rather than NaN, which would otherwise reach the aid math
// and poison every figure downstream of it.
export function parseMoneyInput(raw) {
  const digits = String(raw ?? "").replace(/[^0-9.]/g, "");
  if (digits === "" || digits === ".") return 0;
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

// formatMoney rounds to whole dollars, which is right for the estimate itself
// but hides the cents that origination fees and amortization actually produce.
// A step reading "$3,465 × (1 − 1.057%) = $3,428" looks like an arithmetic
// error; showing the cents is what makes the work checkable by hand.
export function formatMoneyExact(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded)) return formatMoney(rounded);
  const sign = rounded < 0 ? "-" : "";
  return (
    sign +
    "$" +
    Math.abs(rounded).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

// ---------------------------------------------------------------------------
// Step traces ("show the work")
//
// Staff quote real money off these screens, so the tool has to be able to
// account for every number it prints. The trace inside buildAidPackage is
// emitted DURING the real computation, from the same variables the rows are
// built from — it is not a second derivation that happens to agree. That
// distinction is the whole point: an explanation reconstructed after the fact
// can drift from the arithmetic it claims to explain, and a confidently wrong
// explanation is worse than none.
//
// The explain* helpers cover the functions whose return shape could not carry a
// trace without breaking every caller. Each delegates its ACTUAL value to the
// real function and only narrates the intermediates, so the headline number a
// step block reports is always the one the estimate itself used.
//
// Steps are plain data: { label, formula, value, unit?, note? }. Rendering is
// entirely the component's business — no markup escapes this file.
// unit: "money" (default) | "number" | "fraction" | "rate" | "none"
// ---------------------------------------------------------------------------

function pctLabel(fraction) {
  return `${Math.round(fraction * 1000) / 10}%`;
}

function hoursLabel(hours) {
  return `${Math.round(hours * 10) / 10}`;
}

// SAI can legally go as low as -1500, which without the cap yields a Pell award
// above the statutory maximum. The Math.min against awardMax is that cap — do
// not remove it.
export function calculateScheduledPell({ sai, maxFlag, minFlag, awardMax, awardMin }) {
  if (maxFlag) return awardMax;
  const saiNum = Number(sai);
  if (sai === "" || Number.isNaN(saiNum)) return null;
  const calculated = Math.min(Math.round((awardMax - saiNum) / 5) * 5, awardMax);
  if (calculated < awardMin) return minFlag ? awardMin : 0;
  return Math.max(calculated, 0);
}

// Narrates calculateScheduledPell without reimplementing it: `value` comes
// straight from the real function, so a step list that ever fell out of step
// with the logic would still report the true award.
export function explainScheduledPell({ sai, maxFlag, minFlag, awardMax, awardMin }) {
  const value = calculateScheduledPell({ sai, maxFlag, minFlag, awardMax, awardMin });
  const steps = [];

  if (maxFlag) {
    steps.push({
      label: "Max Pell Indicator is set on the ISIR",
      formula: `The flag awards the full scheduled maximum outright — the SAI is not used`,
      value: awardMax,
    });
    return { value, steps };
  }

  const saiNum = Number(sai);
  if (sai === "" || Number.isNaN(saiNum)) {
    steps.push({
      label: "No SAI entered",
      formula: "Nothing to calculate until an SAI is entered or Max Pell is checked",
      value: null,
      unit: "none",
    });
    return { value, steps };
  }

  const raw = awardMax - saiNum;
  const roundedToFive = Math.round(raw / 5) * 5;
  const capped = Math.min(roundedToFive, awardMax);

  steps.push({
    label: "Subtract the SAI from the scheduled maximum",
    // A negative SAI is subtracted, so it ADDS to the award. Writing that as
    // "− -$1,500" is technically right and reads as a typo, so spell it out.
    formula:
      saiNum < 0
        ? `${formatMoney(awardMax)} maximum − (${formatMoney(saiNum)}) SAI — a negative SAI adds to the award`
        : `${formatMoney(awardMax)} maximum − ${formatMoney(saiNum)} SAI`,
    value: raw,
  });

  steps.push({
    label: "Round to the nearest $5",
    formula: `${formatMoneyExact(raw)} rounded to the nearest $5`,
    value: roundedToFive,
  });

  if (roundedToFive > awardMax) {
    steps.push({
      label: "Cap at the scheduled maximum",
      formula: `A negative SAI pushes this above the legal maximum, so it is capped at ${formatMoney(awardMax)}`,
      value: capped,
      note: "SAI can legally reach -1500. Without this cap the award comes out above the statutory maximum — this was a real bug once, and it has a regression test.",
    });
  }

  if (capped < awardMin) {
    steps.push(
      minFlag
        ? {
            label: "Floor at minimum Pell",
            formula: `${formatMoneyExact(capped)} is below the ${formatMoney(awardMin)} minimum, and the ISIR's Min Pell flag applies`,
            value: awardMin,
          }
        : {
            label: "Below minimum Pell, with no Min Pell flag",
            formula: `${formatMoneyExact(capped)} is below the ${formatMoney(awardMin)} minimum and the Min Pell flag is not set`,
            value: 0,
            note: "A student in this range gets Pell only if the ISIR carries the Min Pell Indicator.",
          }
    );
  }

  return { value, steps };
}

export function computeAcademicYearPeriods(programHours, academicYearHours) {
  if (!programHours || !academicYearHours || academicYearHours <= 0) return [];
  const periods = [];
  let remaining = programHours;
  let guard = 0;
  while (remaining > 0 && guard < 12) {
    const chunk = Math.min(remaining, academicYearHours);
    periods.push({ hours: chunk, fraction: chunk / academicYearHours });
    remaining -= chunk;
    guard += 1;
  }
  return periods;
}

// Narrates computeAcademicYearPeriods; `periods` is the real function's output.
export function explainAcademicYearPeriods(programHours, academicYearHours) {
  const periods = computeAcademicYearPeriods(programHours, academicYearHours);
  const steps = [];

  if (!periods.length) {
    steps.push({
      label: "No payment periods",
      formula: "The program needs both clock hours and a defined academic year before it can be split",
      value: null,
      unit: "none",
    });
    return { periods, steps };
  }

  steps.push({
    label: "Number of payment periods",
    formula: `${hoursLabel(programHours)} program hours against a ${hoursLabel(academicYearHours)}-hour academic year — full academic years first, then whatever remains`,
    value: periods.length,
    unit: "number",
    note:
      periods.length > 1
        ? "Pell and the loan ceilings are prorated per period, and each completed academic year advances the grade level."
        : "The program fits inside one academic year, so everything is packaged in a single period.",
  });

  periods.forEach((p, i) => {
    steps.push({
      label: `Period ${i + 1} share of an academic year`,
      formula: `${hoursLabel(p.hours)} hours ÷ ${hoursLabel(academicYearHours)} hours`,
      value: p.fraction,
      unit: "fraction",
    });
  });

  return { periods, steps };
}

// Builds the period-by-period aid package: grants first (Pell, then any
// scholarship/SEOG), then Subsidized, then Unsubsidized, each capped at the
// lesser of its own ceiling or remaining need for that specific period. Overage
// from one period (e.g. Pell exceeding a period's need) carries forward to
// reduce the next period's need. "downPayment" (books/kit or similar) is a
// CHARGE added to Period 1's total, same as tuition — Pell reduces the combined
// Period-1 charge in one shot, with no special sequencing for the down-payment
// portion, matching how these worksheets work.
//
// otherGrantAid covers institutional scholarships and SEOG. It is grant money,
// so it reduces need BEFORE any borrowing, alongside Pell. The school's paper
// worksheet lists scholarships at the bottom, after the loan rows, but that
// only produces the same answer when both loans hit their ceilings. When need
// is below the ceilings, subtracting a scholarship after the fact has the
// student borrow against money they already have and finish with a credit
// balance — so grants go first here regardless of where the sheet prints them.
//
// Every row also carries a `steps` array narrating how it was reached, and the
// package carries `totalSteps` for the summed figures. See the note at the top
// of this file on why those are emitted inline rather than reconstructed.
export function buildAidPackage({ periods, totalProgramHours, totalCost, downPayment, scheduledPell, otherGrantAid = 0, startingGradeLevel, useIndependentTable, loanLimits, originationFeePct }) {
  const feeRate = (Number(originationFeePct) || 0) / 100;
  const bucket = useIndependentTable ? loanLimits.independent : loanLimits.dependent;
  const tableLabel = useIndependentTable ? "independent" : "dependent";
  let creditPool = 0;

  const rows = periods.map((period, i) => {
    const steps = [];
    const gradeLevel = Math.min(startingGradeLevel + i, 3);
    const tier = bucket[`year${gradeLevel}`];
    const subCeiling = Math.round((tier.sub * period.fraction) / 5) * 5;
    const totalCeiling = Math.round((tier.total * period.fraction) / 5) * 5;
    const unsubCeiling = Math.max(totalCeiling - subCeiling, 0);

    steps.push({
      label: "Grade level for this period",
      formula:
        i === 0
          ? `Starting grade level ${startingGradeLevel}`
          : `Starting grade ${startingGradeLevel} + ${i} completed academic year${i === 1 ? "" : "s"}, capped at grade 3`,
      value: gradeLevel,
      unit: "number",
      note: i === 0 ? null : "Each completed academic year advances a grade level, which raises the loan ceilings.",
    });

    steps.push({
      label: "Subsidized ceiling for this period",
      formula: `${formatMoney(tier.sub)} year-${gradeLevel} ${tableLabel} subsidized limit × ${pctLabel(period.fraction)} of an academic year, rounded to the nearest $5`,
      value: subCeiling,
    });

    steps.push({
      label: "Unsubsidized ceiling for this period",
      formula: `${formatMoney(totalCeiling)} combined ceiling (${formatMoney(tier.total)} × ${pctLabel(period.fraction)}) − ${formatMoney(subCeiling)} subsidized`,
      value: unsubCeiling,
    });

    const pell = scheduledPell === null ? 0 : Math.round((scheduledPell * period.fraction) / 5) * 5;

    steps.push({
      label: "Pell for this period",
      formula:
        scheduledPell === null
          ? "No SAI entered, so no Pell is scheduled"
          : `${formatMoney(scheduledPell)} scheduled award × ${pctLabel(period.fraction)} of an academic year, rounded to the nearest $5`,
      value: pell,
    });

    // Tuition prorates by each period's share of the WHOLE program's hours —
    // a different ratio than the academic-year fraction used for Pell/loans above.
    const hoursShare = totalProgramHours > 0 ? period.hours / totalProgramHours : 0;
    const downPaymentCharge = i === 0 ? Number(downPayment) || 0 : 0;
    const tuitionSlice = totalCost * hoursShare + downPaymentCharge;

    steps.push({
      label: "Charge for this period",
      formula:
        `${formatMoney(totalCost)} tuition × ${pctLabel(hoursShare)} of program hours (${hoursLabel(period.hours)} of ${hoursLabel(totalProgramHours)})` +
        (downPaymentCharge > 0 ? ` + ${formatMoney(downPaymentCharge)} down payment` : ""),
      value: tuitionSlice,
      // Compared as rendered, not as raw fractions: two ratios that round to
      // the same displayed percentage would produce a note reading "75%, not
      // 75%", which teaches staff nothing and looks like a bug.
      note:
        pctLabel(hoursShare) === pctLabel(period.fraction)
          ? null
          : `Tuition prorates by share of the whole program (${pctLabel(hoursShare)}), not by the academic-year fraction (${pctLabel(period.fraction)}) used for Pell and the loan ceilings above. The two ratios only match when a program is exactly one academic year long.`,
    });

    // Scholarship/SEOG land wholly on the first period. Anything left over
    // rides the same creditPool that carries Pell overage, so a grant larger
    // than period 1's charge is not lost — it reduces period 2 instead.
    const grants = i === 0 ? Number(otherGrantAid) || 0 : 0;
    const carriedIn = creditPool;

    let need = tuitionSlice - pell - grants - creditPool;
    const rawNeed = need;
    creditPool = 0;
    if (need < 0) {
      creditPool = -need;
      need = 0;
    }

    steps.push({
      label: "Need after grant aid",
      formula:
        `${formatMoneyExact(tuitionSlice)} charge − ${formatMoney(pell)} Pell` +
        (grants > 0 ? ` − ${formatMoney(grants)} scholarship/SEOG` : "") +
        (carriedIn > 0 ? ` − ${formatMoneyExact(carriedIn)} credit carried from period ${i}` : ""),
      value: need,
      note:
        rawNeed < 0
          ? `Grant aid exceeds this period's charge by ${formatMoneyExact(-rawNeed)}. That credit carries forward to reduce the next period rather than being lost.`
          : "Grants apply before any borrowing, so a student whose need falls below the loan ceilings borrows less instead of finishing with a credit balance.",
    });

    const needBeforeSub = need;
    const subGross = Math.min(subCeiling, need);
    const subNet = subGross * (1 - feeRate);
    need = Math.max(need - subNet, 0);

    steps.push({
      label: "Subsidized loan",
      formula:
        `lesser of ${formatMoney(subCeiling)} ceiling and ${formatMoneyExact(needBeforeSub)} need = ${formatMoneyExact(subGross)} borrowed` +
        (feeRate > 0 ? `, less the ${originationFeePct}% origination fee` : ""),
      value: subNet,
      note:
        feeRate > 0 && subGross > 0
          ? `The student repays the full ${formatMoneyExact(subGross)}; only ${formatMoneyExact(subNet)} reaches the account after the fee.`
          : null,
    });

    const needBeforeUnsub = need;
    const unsubGross = Math.min(unsubCeiling, need);
    const unsubNet = unsubGross * (1 - feeRate);
    need = Math.max(need - unsubNet, 0);

    steps.push({
      label: "Unsubsidized loan",
      formula:
        `lesser of ${formatMoney(unsubCeiling)} ceiling and ${formatMoneyExact(needBeforeUnsub)} remaining need = ${formatMoneyExact(unsubGross)} borrowed` +
        (feeRate > 0 ? `, less the ${originationFeePct}% origination fee` : ""),
      value: unsubNet,
    });

    steps.push({
      label: "Still due for this period",
      formula: `${formatMoneyExact(needBeforeUnsub)} remaining need − ${formatMoneyExact(unsubNet)} unsubsidized`,
      value: need,
      note: need > 0 ? "This is what rolls into the payment plan." : "Aid covers this period in full.",
    });

    return {
      index: i, gradeLevel, hours: period.hours, fraction: period.fraction,
      pell, grants, subCeiling, unsubCeiling, subGross, subNet, unsubGross, unsubNet,
      tuitionSlice, downPaymentCharge, remainingBalance: need, steps,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      pell: acc.pell + r.pell,
      grants: acc.grants + r.grants,
      subNet: acc.subNet + r.subNet,
      unsubNet: acc.unsubNet + r.unsubNet,
      subGross: acc.subGross + r.subGross,
      unsubGross: acc.unsubGross + r.unsubGross,
      remainingBalance: acc.remainingBalance + r.remainingBalance,
    }),
    { pell: 0, grants: 0, subNet: 0, unsubNet: 0, subGross: 0, unsubGross: 0, remainingBalance: 0 }
  );

  const across = `across ${rows.length} period${rows.length === 1 ? "" : "s"}`;
  const totalSteps = [
    { label: "Total Pell", formula: `Each period's prorated award, summed ${across}`, value: totals.pell },
    {
      label: "Total subsidized (net of fees)",
      formula: `${formatMoneyExact(totals.subGross)} borrowed ${across}, less the ${originationFeePct}% origination fee`,
      value: totals.subNet,
    },
    {
      label: "Total unsubsidized (net of fees)",
      formula: `${formatMoneyExact(totals.unsubGross)} borrowed ${across}, less the ${originationFeePct}% origination fee`,
      value: totals.unsubNet,
    },
    {
      label: "Balance left to finance",
      formula: `Each period's shortfall, summed ${across}`,
      value: totals.remainingBalance,
      note:
        totals.remainingBalance > 0
          ? "Grants and loans do not cover the full program cost. The payment plan spreads this remainder."
          : "Aid covers the program in full — there is nothing left to finance.",
    },
  ];

  return { rows, totals, totalSteps };
}

// Pell-only concept: flags an enrollment that straddles a July 1 award-year
// boundary. Loans have no equivalent — a loan period crosses July 1 with no
// special handling. Resolving a crossover is a school policy decision, so this
// only detects it.
export function findCrossoverBoundary(startDateStr, lengthWeeks) {
  if (!startDateStr || !lengthWeeks) return null;
  const start = new Date(startDateStr + "T00:00:00");
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setDate(end.getDate() + Math.round(lengthWeeks * 7));
  const startYear = start.getFullYear();
  let boundary = new Date(startYear, 6, 1);
  if (start >= boundary) boundary = new Date(startYear + 1, 6, 1);
  if (start < boundary && end >= boundary) return boundary;
  return null;
}

export function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function calculateMonthlyPayment(principal, annualRatePct, months) {
  if (!principal || principal <= 0 || !months || months <= 0) {
    return { payment: 0, totalPaid: 0, totalInterest: 0 };
  }
  const monthlyRate = (Number(annualRatePct) || 0) / 100 / 12;
  let payment;
  if (monthlyRate === 0) {
    payment = principal / months;
  } else {
    const factor = Math.pow(1 + monthlyRate, months);
    payment = (principal * monthlyRate * factor) / (factor - 1);
  }
  const totalPaid = payment * months;
  return { payment, totalPaid, totalInterest: totalPaid - principal };
}

// Narrates calculateMonthlyPayment; the payment, total, and interest are the
// real function's, so the steps can only ever describe the true figures.
export function explainMonthlyPayment(principal, annualRatePct, months) {
  const result = calculateMonthlyPayment(principal, annualRatePct, months);
  const steps = [];

  if (!principal || principal <= 0 || !months || months <= 0) {
    steps.push({
      label: "Nothing to amortize",
      formula:
        !principal || principal <= 0
          ? "Aid covers the full cost — there is no balance to spread over a payment plan"
          : "Enter a term of at least one month to see a payment",
      value: 0,
    });
    return { ...result, steps };
  }

  const monthlyRate = (Number(annualRatePct) || 0) / 100 / 12;

  if (monthlyRate === 0) {
    steps.push({
      label: "Monthly payment",
      formula: `${formatMoneyExact(principal)} balance ÷ ${months} payments (0% interest, so the balance divides evenly)`,
      value: result.payment,
    });
  } else {
    const factor = Math.pow(1 + monthlyRate, months);
    steps.push({
      label: "Monthly interest rate",
      formula: `${annualRatePct}% APR ÷ 12 months`,
      value: monthlyRate * 100,
      unit: "rate",
    });
    steps.push({
      label: "Compounding factor",
      formula: `(1 + ${(Math.round(monthlyRate * 1e6) / 1e6).toString()}) ^ ${months} payments`,
      value: Math.round(factor * 1e6) / 1e6,
      unit: "number",
    });
    steps.push({
      label: "Monthly payment",
      formula: `${formatMoneyExact(principal)} × ${Math.round(monthlyRate * 1e6) / 1e6} × ${Math.round(factor * 1e6) / 1e6} ÷ (${Math.round(factor * 1e6) / 1e6} − 1)`,
      value: result.payment,
      note: "Standard amortization: principal × rate × (1+rate)^n ÷ ((1+rate)^n − 1).",
    });
  }

  steps.push({
    label: "Total paid over the plan",
    formula: `${formatMoneyExact(result.payment)} × ${months} payments`,
    value: result.totalPaid,
  });

  if (result.totalInterest > 0.005) {
    steps.push({
      label: "Interest paid",
      formula: `${formatMoneyExact(result.totalPaid)} total − ${formatMoneyExact(principal)} balance`,
      value: result.totalInterest,
    });
  }

  return { ...result, steps };
}
