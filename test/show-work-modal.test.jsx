import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import ShowWorkModal from "../src/components/ShowWorkModal.jsx";
import {
  buildAidPackage,
  formatMoney,
  computeAcademicYearPeriods,
  calculateScheduledPell,
  explainScheduledPell,
  explainAcademicYearPeriods,
  explainMonthlyPayment,
} from "../src/lib/aid-calc.js";
import { DEFAULT_SETTINGS } from "../shared/defaults.js";

// The same worksheet student the printout test uses, so the two views can be
// compared against one document.
function worksheetWork(overrides = {}) {
  const scholarshipAmount = overrides.scholarshipAmount ?? 1500;
  const seogAmount = overrides.seogAmount ?? 0;
  const pellArgs = { sai: 784, maxFlag: false, minFlag: false, awardMax: 7395, awardMin: 740 };
  const scheduledPell = calculateScheduledPell(pellArgs);
  const aidPackage = buildAidPackage({
    periods: computeAcademicYearPeriods(1200, 900),
    totalProgramHours: 1200,
    totalCost: 20112,
    downPayment: 3129,
    scheduledPell,
    otherGrantAid: scholarshipAmount + seogAmount,
    startingGradeLevel: 1,
    useIndependentTable: false,
    loanLimits: DEFAULT_SETTINGS.loanLimits,
    originationFeePct: 1.057,
  });

  return {
    program: { id: "cos", name: "Cosmetology", totalCost: 20112, downPayment: 3129, clockHours: 1200, lengthWeeks: 40 },
    settings: DEFAULT_SETTINGS,
    sai: 784,
    maxFlag: false,
    minFlag: false,
    isIndependent: false,
    parentPlusDenied: false,
    useIndependentTable: false,
    startingGradeLevel: 1,
    scholarshipAmount,
    seogAmount,
    pellExplanation: explainScheduledPell(pellArgs),
    periodExplanation: explainAcademicYearPeriods(1200, 900),
    aidPackage,
    paymentExplanation: explainMonthlyPayment(aidPackage.totals.remainingBalance, 0, 10),
    termMonths: 10,
    interestRate: 0,
    onClose: () => {},
    ...overrides,
  };
}

const render = (props) => renderToStaticMarkup(<ShowWorkModal {...props} />);
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("ShowWorkModal", () => {
  it("walks through every stage of the calculation", () => {
    const t = text(render(worksheetWork()));
    expect(t).toMatch(/What went in/);
    expect(t).toMatch(/Scheduled Pell award/);
    expect(t).toMatch(/Splitting the program into payment periods/);
    expect(t).toMatch(/Packaging aid, period by period/);
    expect(t).toMatch(/Totals/);
    expect(t).toMatch(/Monthly payment plan/);
  });

  it("echoes the inputs back so the steps can be checked against them", () => {
    const t = text(render(worksheetWork()));
    expect(t).toContain("Cosmetology");
    expect(t).toContain("784"); // SAI
    expect(t).toContain("$20,112"); // total cost
    expect(t).toContain("$3,129"); // down payment
    expect(t).toContain("1200h");
    expect(t).toContain("1.057%"); // origination fee
    expect(t).toMatch(/Dependent/);
  });

  it("shows a block for each payment period", () => {
    const t = text(render(worksheetWork()));
    expect(t).toMatch(/Period 1 · Grade 1/);
    expect(t).toMatch(/Period 2 · Grade 2/);
  });

  it("reports the same headline figures as the estimate itself", () => {
    const props = worksheetWork();
    const t = text(render(props));
    // Pell, balance to finance, and the monthly payment are the three numbers a
    // student is quoted; if the panel disagreed with the card, it would be
    // actively harmful.
    expect(t).toContain(formatMoney(props.pellExplanation.value)); // $6,610 scheduled Pell
    expect(t).toContain(formatMoney(props.aidPackage.totals.remainingBalance)); // $5,342 left to finance
    expect(t).toContain(formatMoney(props.paymentExplanation.payment)); // $534 a month
    expect(t).toMatch(/Left to finance/);
    expect(t).toMatch(/Per month/);
  });

  it("is marked screen-only so it never lands on the printout", () => {
    expect(render(worksheetWork())).toMatch(/screen-only/);
  });

  it("is a labelled modal dialog", () => {
    const html = render(worksheetWork());
    expect(html).toMatch(/role="dialog"/);
    expect(html).toMatch(/aria-modal="true"/);
    expect(html).toMatch(/aria-labelledby="show-work-title"/);
  });

  it("renders the max-Pell path without an SAI", () => {
    const pellArgs = { sai: "", maxFlag: true, minFlag: false, awardMax: 7395, awardMin: 740 };
    const t = text(
      render(worksheetWork({ sai: "", maxFlag: true, pellExplanation: explainScheduledPell(pellArgs) }))
    );
    expect(t).toMatch(/Max Pell Indicator is set on the ISIR/);
    expect(t).toMatch(/Max Pell flag/); // the SAI input row
  });

  it("carries the estimate-only disclaimer", () => {
    expect(text(render(worksheetWork()))).toMatch(/not an official award notice/i);
  });
});
