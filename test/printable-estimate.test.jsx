import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import PrintableEstimate from "../src/components/PrintableEstimate.jsx";
import { buildAidPackage, computeAcademicYearPeriods, calculateScheduledPell, calculateMonthlyPayment } from "../src/lib/aid-calc.js";
import { DEFAULT_SETTINGS } from "../shared/defaults.js";

// Rebuilds the redacted worksheet the school supplied, so the printout can be
// diffed against a real document rather than against itself.
function worksheetStudent(overrides = {}) {
  const scholarshipAmount = overrides.scholarshipAmount ?? 1500;
  const seogAmount = overrides.seogAmount ?? 0;
  const scheduledPell = calculateScheduledPell({
    sai: 784, maxFlag: false, minFlag: false, awardMax: 7395, awardMin: 740,
  });
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
  const { payment } = calculateMonthlyPayment(aidPackage.totals.remainingBalance, 0, 10);

  return {
    studentName: "Jane Q. Student",
    dateOfBirth: "2008-04-15",
    sai: 784,
    maxFlag: false,
    startDate: "2026-09-08",
    program: { id: "cos", name: "Cosmetology", totalCost: 20112, downPayment: 3129, clockHours: 1200, lengthWeeks: 40 },
    isIndependent: false,
    parentPlusDenied: false,
    aidPackage,
    settings: DEFAULT_SETTINGS,
    scholarshipAmount,
    seogAmount,
    termMonths: 10,
    monthlyPayment: payment,
    interestRate: 0,
    ...overrides,
  };
}

const render = (props) => renderToStaticMarkup(<PrintableEstimate {...props} />);
// Strip tags so assertions match visible text rather than markup.
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("PrintableEstimate", () => {
  it("renders nothing without an aid package", () => {
    expect(render({ ...worksheetStudent(), aidPackage: null })).toBe("");
    expect(render({ ...worksheetStudent(), program: null })).toBe("");
  });

  it("carries no school branding, only a placeholder", () => {
    // The tool is not school-endorsed and its figures differ slightly from the
    // official worksheet, so the printout must not look school-issued.
    const t = text(render(worksheetStudent()));
    expect(t).toMatch(/Logo placeholder/i);
    expect(t).toMatch(/not an award notice/i);
    expect(t).not.toMatch(/Innovate|Salon Academy/i);
  });

  it("shows the student and program header fields", () => {
    const t = text(render(worksheetStudent()));
    expect(t).toContain("Jane Q. Student");
    expect(t).toContain("Cosmetology");
    expect(t).toContain("784");
    expect(t).toMatch(/April 15, 2008/);
    expect(t).toMatch(/September 8, 2026/);
    expect(t).toMatch(/Dependent/);
  });

  it("reproduces the worksheet's charge and Pell lines", () => {
    const t = text(render(worksheetStudent()));
    expect(t).toContain("$15,084"); // AY1 tuition
    expect(t).toContain("$3,129"); // book & kit
    expect(t).toContain("$18,213"); // AY1 total charge
    expect(t).toContain("$5,028"); // AY2 tuition, no book & kit
  });

  it("prints scholarship and SEOG above the adjusted total, where they are applied", () => {
    const t = text(render(worksheetStudent({ scholarshipAmount: 1500, seogAmount: 500 })));
    const scholarshipAt = t.indexOf("SCHOLARSHIP");
    const seogAt = t.indexOf("SEOG");
    const adjustedAt = t.indexOf("ADJUSTED TOTAL");
    expect(scholarshipAt).toBeGreaterThan(-1);
    expect(seogAt).toBeGreaterThan(-1);
    // Printing them at the foot of the sheet, as the paper version does, would
    // misrepresent where they enter the arithmetic.
    expect(scholarshipAt).toBeLessThan(adjustedAt);
    expect(seogAt).toBeLessThan(adjustedAt);
  });

  it("omits grant rows entirely when there are none", () => {
    const t = text(render(worksheetStudent({ scholarshipAmount: 0, seogAmount: 0 })));
    expect(t).not.toContain("SCHOLARSHIP");
    expect(t).not.toContain("SEOG");
  });

  it("shows loans net of fee, with the gross beneath and the rate named", () => {
    const t = text(render(worksheetStudent()));
    expect(t).toContain("$3,500"); // sub gross
    expect(t).toContain("$2,000"); // unsub gross
    expect(t).toContain("1.057%");
    expect(t).toMatch(/net of the 1\.057% origination fee/i);
  });

  it("prints one column per academic year", () => {
    const t = text(render(worksheetStudent()));
    expect(t).toContain("AY1");
    expect(t).toContain("AY2");
    expect(t).not.toContain("AY3");
  });

  it("prints the payment plan and gross loan total", () => {
    const t = text(render(worksheetStudent()));
    expect(t).toMatch(/MONTHLY PAYMENT/);
    expect(t).toContain("$534"); // worksheet's monthly figure
    expect(t).toMatch(/TOTAL STUDENT LOAN\(S\)/);
    // 3500 + 2000 + 1500 + 665. The school's sheet totals $7,667, because its
    // AY2 unsubsidized ceiling is $667 to our $665 — we round Pell and loan
    // ceilings to the nearest $5 and they round to the dollar. Pinned to our
    // figure so this test fails loudly if that rounding is ever changed.
    expect(t).toContain("$7,665");
  });

  it("hides the interest row for a 0% plan and shows it otherwise", () => {
    expect(text(render(worksheetStudent({ interestRate: 0 })))).not.toMatch(/Interest rate/);
    expect(text(render(worksheetStudent({ interestRate: 6 })))).toMatch(/Interest rate/);
  });

  it("labels an independent student correctly", () => {
    const t = text(render(worksheetStudent({ isIndependent: true })));
    expect(t).toMatch(/INDEPENDENT COSMETOLOGY TUITION/);
  });

  it("notes a Max Pell indicator instead of printing a blank SAI", () => {
    const t = text(render(worksheetStudent({ sai: "", maxFlag: true })));
    expect(t).toMatch(/Max Pell indicator/);
  });

  it("carries the disclaimers that keep it from reading as an award letter", () => {
    const t = text(render(worksheetStudent()));
    expect(t).toMatch(/estimate only/i);
    expect(t).toMatch(/award letter is the authoritative/i);
    expect(t).toMatch(/aggregate limits/i);
  });

  it("is marked print-only so it never shows in the app", () => {
    expect(render(worksheetStudent())).toContain("print-only");
  });
});
