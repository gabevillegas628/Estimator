// The estimate as plain text, for pasting into an email or a CRM note.
//
// Deliberately not the printed worksheet: that document is for the student and
// carries their name and date of birth, while this is staff shorthand and
// carries neither. Nothing identifying goes on the clipboard -- the figures are
// meaningless without the file they get pasted into.
//
// Pure and text-only so it can be pinned by tests. No React, no clipboard API;
// the caller does the writing.

import { formatMoney } from "./aid-calc.js";

const LABEL_WIDTH = 20;

function line(label, value) {
  return `  ${label.padEnd(LABEL_WIDTH)}${value}`;
}

function longDate(value) {
  if (!value) return null;
  // Date-only strings parse as UTC, which lands on the previous evening in any
  // western timezone and prints the wrong day. The explicit time makes it local.
  const date = typeof value === "string" ? new Date(`${value}T00:00:00`) : value;
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function pellBasis({ sai, maxFlag, minFlag }) {
  if (maxFlag) return "Max Pell indicator (ISIR)";
  if (minFlag) return `SAI ${sai}, Min Pell indicator (ISIR)`;
  return `SAI ${sai}`;
}

export function buildEstimateSummary({
  program,
  settings,
  sai,
  maxFlag = false,
  minFlag = false,
  isIndependent = false,
  parentPlusDenied = false,
  startDate = "",
  scholarshipAmount = 0,
  seogAmount = 0,
  aidPackage,
  crossoverBoundary = null,
  termMonths = 0,
  interestRate = 0,
  monthlyPayment = 0,
  totalPaid = 0,
  generatedAt = new Date(),
} = {}) {
  if (!program || !aidPackage) return "";

  const dependency = isIndependent ? "Independent" : parentPlusDenied ? "Dependent (PLUS denied)" : "Dependent";
  const started = longDate(startDate);
  const out = [];

  out.push(`FINANCIAL AID ESTIMATE — ${program.name}`);
  out.push(`${settings.awardYearLabel} award year · prepared ${longDate(generatedAt)}`);
  out.push("");
  out.push(line("Basis", pellBasis({ sai, maxFlag, minFlag })));
  out.push(line("Dependency", dependency));
  if (started) out.push(line("Enrollment starts", started));
  out.push(line("Program cost", formatMoney(program.totalCost)));
  if (Number(program.downPayment) > 0) out.push(line("Down payment", formatMoney(program.downPayment)));
  if (scholarshipAmount > 0) out.push(line("Scholarship", formatMoney(scholarshipAmount)));
  if (seogAmount > 0) out.push(line("SEOG", formatMoney(seogAmount)));

  for (const row of aidPackage.rows) {
    out.push("");
    out.push(`AY${row.index + 1} · Grade ${row.gradeLevel} · ${Math.round(row.hours)}h (${Math.round(row.fraction * 100)}% of an academic year)`);
    out.push(line("Charge", formatMoney(row.tuitionSlice)));
    out.push(line("Pell", formatMoney(row.pell)));
    if (row.grants > 0) out.push(line("Grant aid", formatMoney(row.grants)));
    out.push(line("Subsidized (net)", formatMoney(row.subNet)));
    out.push(line("Unsubsidized (net)", formatMoney(row.unsubNet)));
    out.push(line("Still due", formatMoney(row.remainingBalance)));
  }

  out.push("");
  out.push("TOTALS");
  out.push(line("Pell", formatMoney(aidPackage.totals.pell)));
  out.push(line("Subsidized (net)", formatMoney(aidPackage.totals.subNet)));
  out.push(line("Unsubsidized (net)", formatMoney(aidPackage.totals.unsubNet)));
  out.push(line("Balance to finance", formatMoney(aidPackage.totals.remainingBalance)));

  if (aidPackage.totals.remainingBalance > 0 && termMonths > 0) {
    const rate = Number(interestRate) > 0 ? `${interestRate}% APR` : "0% interest";
    out.push("");
    out.push("PAYMENT PLAN");
    out.push(line("Monthly payment", formatMoney(monthlyPayment)));
    out.push(line("Term", `${termMonths} payments, ${rate}`));
    out.push(line("Total paid", formatMoney(totalPaid)));
  }

  if (crossoverBoundary) {
    out.push("");
    out.push(`NOTE: this enrollment crosses the Pell award year boundary around ${longDate(crossoverBoundary)}. Which award year's figures apply is a policy call.`);
  }

  out.push("");
  out.push("Estimate only — not an official award or financial aid offer. Loans are");
  out.push("shown net of the origination fee; prior borrowing is not tracked here.");

  return out.join("\n");
}
