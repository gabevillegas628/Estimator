import React, { useEffect, useRef } from "react";
import { X, Info } from "lucide-react";

import { formatMoney, formatMoneyExact } from "../lib/aid-calc.js";

// Renders the step traces produced in src/lib/aid-calc.js. This component is
// deliberately dumb: it does no arithmetic of its own, because a "show the
// work" panel that computed its own numbers could disagree with the estimate it
// claims to explain. Everything here is either a step emitted by the calc or an
// input echoed straight back.

function formatStepValue(step) {
  const { value, unit = "money" } = step;
  if (unit === "none" || value === null || value === undefined) return null;
  if (unit === "number") return String(Math.round(value * 1e6) / 1e6);
  if (unit === "fraction") return `${Math.round(value * 1000) / 10}%`;
  if (unit === "rate") return `${Math.round(value * 1e4) / 1e4}%`;
  return formatMoneyExact(value);
}

function Step({ step }) {
  const shown = formatStepValue(step);
  return (
    <li className="py-2.5 first:pt-0 last:pb-0 border-b border-dashed border-[#DDD8CA] last:border-b-0">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm text-[#232530]">{step.label}</span>
        {shown !== null && <span className="mono text-sm text-[#232530] shrink-0">{shown}</span>}
      </div>
      <div className="text-xs text-[#6B6656] mt-0.5 leading-relaxed">{step.formula}</div>
      {step.note && (
        <div className="flex gap-1.5 mt-1.5 text-[11px] leading-relaxed text-[#7A3B54] bg-[#F4E6EA] border border-[#7A3B54]/25 rounded px-2 py-1.5">
          <Info size={12} className="shrink-0 mt-[2px]" />
          <span>{step.note}</span>
        </div>
      )}
    </li>
  );
}

function Section({ number, title, subtitle, result, children }) {
  return (
    <section className="bg-white rounded-lg border border-[#DDD8CA] p-4">
      <div className="flex items-baseline justify-between gap-4 dotted-rule pb-2.5 mb-2.5">
        <div>
          <h3 className="serif text-base text-[#232530]">
            <span className="text-[#9A9584] mono text-xs mr-1.5">{number}</span>
            {title}
          </h3>
          {subtitle && <p className="text-[11px] text-[#9A9584] mt-0.5">{subtitle}</p>}
        </div>
        {result && (
          <div className="text-right shrink-0">
            <div className="text-[10px] text-[#9A9584] uppercase tracking-wide">{result.label}</div>
            <div className="mono text-base text-[#7A3B54]">{result.value}</div>
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

function StepList({ steps }) {
  return (
    <ul>
      {steps.map((step, i) => (
        <Step key={`${step.label}-${i}`} step={step} />
      ))}
    </ul>
  );
}

export default function ShowWorkModal({
  program,
  settings,
  sai,
  maxFlag,
  minFlag,
  isIndependent,
  parentPlusDenied,
  useIndependentTable,
  startingGradeLevel,
  scholarshipAmount,
  seogAmount,
  pellExplanation,
  periodExplanation,
  aidPackage,
  paymentExplanation,
  termMonths,
  interestRate,
  onClose,
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    panelRef.current?.focus();
    return () => {
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);

  const dependencyLabel = isIndependent
    ? "Independent"
    : parentPlusDenied
    ? "Dependent, parent denied PLUS"
    : "Dependent";

  // Echoed back rather than recomputed — this is the audit trail for the steps
  // below, so it has to be exactly what went in.
  const inputs = [
    { label: "Program", value: program.name },
    { label: "Total cost", value: formatMoney(program.totalCost) },
    { label: "Down payment", value: formatMoney(program.downPayment) },
    { label: "Clock hours", value: `${program.clockHours}h` },
    { label: "Academic year", value: `${settings.academicYearHours}h` },
    { label: "SAI", value: maxFlag ? "Max Pell flag" : sai === "" ? "—" : String(sai) },
    { label: "Award year", value: settings.awardYearLabel },
    { label: "Scheduled max / min", value: `${formatMoney(settings.awardYearMax)} / ${formatMoney(settings.awardYearMin)}` },
    { label: "Dependency", value: dependencyLabel },
    { label: "Loan table used", value: useIndependentTable ? "Independent" : "Dependent" },
    { label: "Starting grade level", value: `Year ${startingGradeLevel}` },
    { label: "Origination fee", value: `${settings.originationFeePct}%` },
    { label: "Scholarship", value: formatMoney(scholarshipAmount) },
    { label: "SEOG", value: formatMoney(seogAmount) },
  ];

  if (minFlag && !maxFlag) inputs.push({ label: "Min Pell flag", value: "Set" });

  // .screen-only so the panel never lands on the printout, matching PrintDialog.
  return (
    <div
      className="screen-only fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 bg-[#232530]/40 backdrop-blur-[2px] overflow-y-auto"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="show-work-title"
        tabIndex={-1}
        className="fade-in bg-[#F0EEE8] w-full max-w-3xl rounded-lg border border-[#DDD8CA] shadow-xl focus:outline-none my-auto"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#DDD8CA] bg-white rounded-t-lg sticky top-0 z-10">
          <div>
            <h2 id="show-work-title" className="serif text-xl text-[#232530]">
              How this estimate was calculated
            </h2>
            <p className="text-xs text-[#6B6656] mt-0.5">
              {program.name} · every figure on the estimate, traced back to its inputs
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-md text-[#9A9584] hover:text-[#232530] hover:bg-[#E7E3D8] transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <section className="bg-white rounded-lg border border-[#DDD8CA] p-4">
            <div className="dotted-rule pb-2.5 mb-3">
              <h3 className="serif text-base text-[#232530]">
                <span className="text-[#9A9584] mono text-xs mr-1.5">0</span>
                What went in
              </h3>
              <p className="text-[11px] text-[#9A9584] mt-0.5">
                Change any of these on the estimate and every step below changes with it.
              </p>
            </div>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
              {inputs.map((item) => (
                <div key={item.label}>
                  <dt className="text-[10px] text-[#9A9584] uppercase tracking-wide">{item.label}</dt>
                  <dd className="mono text-sm text-[#232530]">{item.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <Section
            number="1"
            title="Scheduled Pell award"
            subtitle="Before any proration across payment periods"
            result={{ label: "Scheduled Pell", value: formatMoney(pellExplanation.value) }}
          >
            <StepList steps={pellExplanation.steps} />
          </Section>

          <Section
            number="2"
            title="Splitting the program into payment periods"
            subtitle="Pell and the loan ceilings are prorated by these shares"
            result={{
              label: "Periods",
              value: String(periodExplanation.periods.length),
            }}
          >
            <StepList steps={periodExplanation.steps} />
          </Section>

          <Section
            number="3"
            title="Packaging aid, period by period"
            subtitle="Grants first, then subsidized, then unsubsidized — each capped at the lesser of its ceiling or that period's remaining need"
          >
            <div className="space-y-3">
              {aidPackage.rows.map((row) => (
                <div key={row.index} className="border border-[#DDD8CA] rounded-md p-3 bg-[#F0EEE8]/60">
                  <div className="flex items-baseline justify-between gap-3 mb-2">
                    <span className="text-sm font-medium text-[#232530]">
                      Period {row.index + 1} · Grade {row.gradeLevel}
                    </span>
                    <span className="text-xs text-[#9A9584] mono">
                      {Math.round(row.hours)}h · {Math.round(row.fraction * 1000) / 10}% of an academic year
                    </span>
                  </div>
                  <StepList steps={row.steps} />
                </div>
              ))}
            </div>
          </Section>

          <Section
            number="4"
            title="Totals"
            result={{ label: "Left to finance", value: formatMoney(aidPackage.totals.remainingBalance) }}
          >
            <StepList steps={aidPackage.totalSteps} />
          </Section>

          <Section
            number="5"
            title="Monthly payment plan"
            subtitle={`${termMonths || 0} payments at ${interestRate || 0}% APR`}
            result={{ label: "Per month", value: formatMoney(paymentExplanation.payment) }}
          >
            <StepList steps={paymentExplanation.steps} />
          </Section>

          <p className="text-xs text-[#9A9584] leading-relaxed">
            Cents appear here where the arithmetic produces them; the estimate itself rounds to whole dollars, so a
            step and its matching figure on the estimate can differ by up to a dollar. This tool does not track prior
            borrowing against lifetime aggregate limits — check NSLDS for that — and it does not resolve Pell
            award-year crossovers, which are a school policy call.
          </p>
        </div>

        <div className="border-t border-[#DDD8CA] bg-white rounded-b-lg px-5 py-3 flex items-center">
          <p className="text-xs text-[#9A9584]">Estimate only — not an official award notice.</p>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-md border border-[#C9C4B8] text-sm px-3 py-2 text-[#6B6656] hover:bg-[#E7E3D8] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
