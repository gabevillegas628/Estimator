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

// Builds the period-by-period aid package: Pell first, then Subsidized, then
// Unsubsidized, each capped at the lesser of its own ceiling or remaining need
// for that specific period. Overage from one period (e.g. Pell exceeding a
// period's need) carries forward to reduce the next period's need. "downPayment"
// (books/kit or similar) is a CHARGE added to Period 1's total, same as tuition —
// Pell reduces the combined Period-1 charge in one shot, with no special
// sequencing for the down-payment portion, matching how these worksheets work.
export function buildAidPackage({ periods, totalProgramHours, totalCost, downPayment, scheduledPell, startingGradeLevel, useIndependentTable, loanLimits, originationFeePct }) {
  const feeRate = (Number(originationFeePct) || 0) / 100;
  const bucket = useIndependentTable ? loanLimits.independent : loanLimits.dependent;
  let creditPool = 0;

  const rows = periods.map((period, i) => {
    const gradeLevel = Math.min(startingGradeLevel + i, 3);
    const tier = bucket[`year${gradeLevel}`];
    const subCeiling = Math.round((tier.sub * period.fraction) / 5) * 5;
    const totalCeiling = Math.round((tier.total * period.fraction) / 5) * 5;
    const unsubCeiling = Math.max(totalCeiling - subCeiling, 0);

    const pell = scheduledPell === null ? 0 : Math.round((scheduledPell * period.fraction) / 5) * 5;

    // Tuition prorates by each period's share of the WHOLE program's hours —
    // a different ratio than the academic-year fraction used for Pell/loans above.
    const hoursShare = totalProgramHours > 0 ? period.hours / totalProgramHours : 0;
    const downPaymentCharge = i === 0 ? Number(downPayment) || 0 : 0;
    const tuitionSlice = totalCost * hoursShare + downPaymentCharge;

    let need = tuitionSlice - pell - creditPool;
    creditPool = 0;
    if (need < 0) {
      creditPool = -need;
      need = 0;
    }

    const subGross = Math.min(subCeiling, need);
    const subNet = subGross * (1 - feeRate);
    need = Math.max(need - subNet, 0);

    const unsubGross = Math.min(unsubCeiling, need);
    const unsubNet = unsubGross * (1 - feeRate);
    need = Math.max(need - unsubNet, 0);

    return {
      index: i, gradeLevel, hours: period.hours, fraction: period.fraction,
      pell, subCeiling, unsubCeiling, subGross, subNet, unsubGross, unsubNet,
      tuitionSlice, downPaymentCharge, remainingBalance: need,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      pell: acc.pell + r.pell,
      subNet: acc.subNet + r.subNet,
      unsubNet: acc.unsubNet + r.unsubNet,
      subGross: acc.subGross + r.subGross,
      unsubGross: acc.unsubGross + r.unsubGross,
      remainingBalance: acc.remainingBalance + r.remainingBalance,
    }),
    { pell: 0, subNet: 0, unsubNet: 0, subGross: 0, unsubGross: 0, remainingBalance: 0 }
  );

  return { rows, totals };
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
