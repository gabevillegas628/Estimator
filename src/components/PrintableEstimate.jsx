import React from "react";
import { formatMoney } from "../lib/aid-calc.js";

// The printable worksheet, modelled on the school's paper "Estimated Financial
// Aid Worksheet" so staff can read the two side by side.
//
// Two deliberate departures from that sheet:
//
//   1. No school branding. This tool is not endorsed by the school and its
//      figures differ slightly from the official worksheet's, so the printout
//      must not look like something the school issued.
//
//   2. Scholarship and SEOG are printed with Pell, above the adjusted total,
//      rather than at the foot of the page. That is where they are applied —
//      see the note in aid-calc.js — and printing them elsewhere would
//      misrepresent the arithmetic.

const money = (n) => (n ? formatMoney(n) : "—");

// Figures are set in the sans face with tabular numerals rather than in the
// monospace one. Tabular figures align in a column just as well, but read as a
// document rather than as terminal output — this sheet goes to a student.
const FIGURE = "text-right tabular-nums whitespace-nowrap";

function Row({ label, values, bold, shaded, indent, note }) {
  return (
    <tr className={shaded ? "bg-[#F0EEE8]" : undefined}>
      <td
        className={`py-[3px] pl-2 pr-3 align-top ${bold ? "font-semibold" : ""} ${
          indent ? "pl-5 text-[10.5px] text-[#555]" : ""
        }`}
      >
        {label}
        {note && <span className="text-[10px] text-[#777] font-normal"> {note}</span>}
      </td>
      {values.map((v, i) => (
        <td
          key={i}
          className={`py-[3px] pl-3 pr-2 ${FIGURE} ${bold ? "font-semibold" : ""} ${
            indent ? "text-[10.5px] text-[#555]" : ""
          }`}
        >
          {v}
        </td>
      ))}
    </tr>
  );
}

// One label/value pair in the header block. Keeping the value hard against its
// label is the whole point — the previous full-width layout left them at
// opposite ends of the page.
function Field({ label, children }) {
  return (
    <div className="flex gap-3 py-[3px]">
      <span className="font-semibold w-32 shrink-0">{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  );
}

export default function PrintableEstimate({
  studentName,
  dateOfBirth,
  sai,
  maxFlag,
  startDate,
  program,
  isIndependent,
  parentPlusDenied,
  aidPackage,
  settings,
  scholarshipAmount,
  seogAmount,
  termMonths,
  monthlyPayment,
  interestRate,
}) {
  if (!aidPackage || !program) return null;

  const rows = aidPackage.rows;
  const cols = rows.map((r) => `AY${r.index + 1}`);
  const dependency = isIndependent ? "Independent" : parentPlusDenied ? "Dependent (PLUS denied)" : "Dependent";
  const fee = settings.originationFeePct;

  const per = (fn) => rows.map((r) => fn(r));
  const totalBalance = aidPackage.totals.remainingBalance;
  const totalLoans = aidPackage.totals.subGross + aidPackage.totals.unsubGross;

  const fmtDate = (s) => {
    if (!s) return "—";
    const d = new Date(s + "T00:00:00");
    return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  };

  return (
    // max-w + auto margins rather than relying on @page alone: if the browser's
    // print dialog is set to Margins: None, @page is overridden and the sheet
    // prints edge to edge. A capped measure stays readable either way, and a
    // ~6.5in column is a comfortable line length for this much small text.
    <div
      className="print-only text-[#111] mx-auto max-w-[6.5in]"
      style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
    >
      {/* Placeholder in lieu of a school logo — see the note at the top of this file. */}
      <div className="text-center mb-6">
        <div className="inline-block border border-dashed border-[#AAA] rounded px-10 py-3 text-[10px] uppercase tracking-widest text-[#999]">
          Logo placeholder
        </div>
        <h1 className="serif text-[22px] font-semibold mt-3 tracking-tight">Estimated Financial Aid Worksheet</h1>
        <p className="text-[11px] text-[#666] mt-1">Unofficial estimate prepared by staff — not an award notice</p>
      </div>

      <div className="grid grid-cols-2 gap-x-8 text-[11.5px] mb-6 pb-4 border-b border-[#CCC]">
        <Field label="NAME">{studentName || "—"}</Field>
        <Field label="PROGRAM">{program.name}</Field>
        <Field label="DATE OF BIRTH">{dateOfBirth ? fmtDate(dateOfBirth) : "—"}</Field>
        <Field label="DEPENDENCY">{dependency}</Field>
        <Field label="SAI">{maxFlag ? "Max Pell indicator" : sai === "" ? "—" : sai}</Field>
        <Field label="AWARD YEAR">{settings.awardYearLabel}</Field>
        <Field label="CLASS START">{fmtDate(startDate)}</Field>
        <Field label="PREPARED">
          {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </Field>
      </div>

      <table className="w-full table-fixed text-[11.5px] border-collapse avoid-break">
        <colgroup>
          <col />
          {cols.map((c) => (
            <col key={c} className="w-[1.25in]" />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-[#999]">
            <th />
            {cols.map((c) => (
              <th key={c} className="py-1 pl-3 pr-2 text-right font-semibold text-[10px] uppercase tracking-wider text-[#666]">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <Row label={`${dependency.toUpperCase()} ${program.name.toUpperCase()} TUITION`}
               values={per((r) => money(r.tuitionSlice - r.downPaymentCharge))} />
          <Row label="BOOK & KIT" values={per((r) => money(r.downPaymentCharge))} />
          <Row label="TOTAL" bold shaded values={per((r) => money(r.tuitionSlice))} />

          <tr><td className="pt-2" /></tr>

          <Row label="PELL" values={per((r) => money(r.pell))} />
          {scholarshipAmount > 0 && (
            <Row label="SCHOLARSHIP" values={rows.map((r, i) => (i === 0 ? money(scholarshipAmount) : "—"))} />
          )}
          {seogAmount > 0 && (
            <Row label="SEOG" values={rows.map((r, i) => (i === 0 ? money(seogAmount) : "—"))} />
          )}
          <Row label="ADJUSTED TOTAL" bold shaded
               values={per((r) => money(Math.max(r.tuitionSlice - r.pell - r.grants, 0)))} />

          <tr><td className="pt-2" /></tr>

          <Row label="SUBSIDIZED LOAN" bold values={per((r) => money(r.subNet))} />
          <Row indent label="Subsidized loan origination fee" note="(fixed)" values={per(() => `${fee}%`)} />
          <Row indent label="Total subsidized loan" values={per((r) => money(r.subGross))} />

          <tr><td className="pt-1" /></tr>

          <Row label="UNSUBSIDIZED LOAN" bold values={per((r) => money(r.unsubNet))} />
          <Row indent label="Unsubsidized loan origination fee" note="(fixed)" values={per(() => `${fee}%`)} />
          <Row indent label="Total unsubsidized loan" values={per((r) => money(r.unsubGross))} />

          <tr><td className="pt-2" /></tr>

          <Row label="TUITION BALANCE" bold shaded values={per((r) => money(r.remainingBalance))} />
        </tbody>
      </table>

      {/* Same column geometry as the table above, so the figures stay in one
          continuous right-hand column down the whole sheet rather than the
          totals drifting to a different position. */}
      <table className="w-full table-fixed text-[11.5px] mt-6 border-t-2 border-[#333] avoid-break">
        <colgroup>
          <col />
          <col className="w-[1.25in]" />
        </colgroup>
        <tbody>
          <Row label="TOTAL TUITION BALANCE" bold values={[money(totalBalance)]} />
          <Row label="Number of payments" values={[termMonths]} />
          {Number(interestRate) > 0 && <Row label="Interest rate" values={[`${interestRate}%`]} />}
          <Row label="MONTHLY PAYMENT" bold shaded values={[money(monthlyPayment)]} />
          <tr><td className="pt-2" /></tr>
          <Row label="TOTAL STUDENT LOAN(S)" values={[money(totalLoans)]}
               note="— gross, before origination fees" />
        </tbody>
      </table>

      <div className="mt-8 pt-4 border-t border-[#CCC] text-[9.5px] leading-relaxed text-[#444] avoid-break">
        <p className="font-semibold text-[10px] uppercase tracking-wider text-[#666] mb-1.5">Please read</p>
        <ul className="space-y-1 list-disc pl-4 marker:text-[#AAA]">
          <li>
            This is an <strong>estimate only</strong>, produced by an internal staff tool. It is not an award notice and
            it is not issued by the school. Your official award letter is the authoritative figure.
          </li>
          <li>
            Loan amounts shown are <strong>net of the {fee}% origination fee</strong>. The gross amounts borrowed, and
            the amounts that appear on your loan paperwork, are the "total" lines above.
          </li>
          <li>
            Subsidized loan eligibility is shown against tuition only. It does not account for full cost of attendance
            or for any aid not listed here, so it is a ceiling rather than a guaranteed award.
          </li>
          <li>
            Prior borrowing is not counted against lifetime aggregate limits. If you have borrowed before, your actual
            eligibility may be lower.
          </li>
          <li>Additional financing options may be available. Ask a financial aid representative for details.</li>
        </ul>
      </div>
    </div>
  );
}
