import React, { useEffect, useRef, useState } from "react";
import { X, Plus, Trash2, RotateCcw, Info, Check } from "lucide-react";

import { formatMoney, parseMoneyInput } from "../lib/aid-calc.js";
import { dependencyCriteria, formatAwardYear, normalizeAwardYearStart } from "../../shared/defaults.js";

// A dollar field. <input type="number"> can only ever hold a bare numeric
// string -- "$23,000" is not a value it accepts -- so money is a text input
// that shows the formatted figure when idle and the raw number while focused.
// That is the spreadsheet behaviour: read as currency, edit as digits.
//
// Reformatting only on blur is the point. A formatter that runs on every
// keystroke has to re-place the caret afterwards, and gets it wrong the moment
// inserting a comma shifts the text under it.
function MoneyInput({ value, onChange, className = "", ...rest }) {
  // Non-null only while focused, holding exactly what was typed, so a
  // part-finished entry is never rewritten underneath the caret.
  const [draft, setDraft] = useState(null);

  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      className={className}
      value={draft === null ? formatMoney(value) : draft}
      onFocus={(e) => {
        // A zero reads as a placeholder here, not a figure worth keeping.
        setDraft(Number(value) === 0 ? "" : String(value));
        e.target.select();
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        // Reported live so the estimate behind the modal still reacts to these
        // as they are typed, which is why this component does not own state.
        onChange(parseMoneyInput(e.target.value));
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

// The award year, entered as the year it opens. The same draft trick as
// MoneyInput -- a half-typed year must not be rewritten under the caret -- with
// one addition: nothing is reported until all four digits are there. Reporting
// "20" would date the whole tool to the year 20 for as long as it took to type
// the rest, since the label and both dependency dates follow from this field.
function YearInput({ value, onChange, className = "", ...rest }) {
  const [draft, setDraft] = useState(null);

  return (
    <input
      {...rest}
      type="number"
      min={2000}
      max={2099}
      step={1}
      className={className}
      value={draft === null ? String(value) : draft}
      onFocus={(e) => {
        setDraft(String(value));
        e.target.select();
      }}
      onChange={(e) => {
        const typed = e.target.value.replace(/[^0-9]/g, "").slice(0, 4);
        setDraft(typed);
        if (typed.length === 4) onChange(Number(typed));
      }}
      // Dropping the draft restores the last good year, so a field left holding
      // "20" reverts instead of persisting a year nobody meant.
      onBlur={() => setDraft(null)}
    />
  );
}

// School-wide configuration, lifted out of the page and into a modal. It used to
// be an accordion that opened at the bottom of a long page while its own trigger
// sat in the header, so opening it appeared to do nothing until you scrolled.
//
// State still lives in the estimator — this component renders and reports, it
// does not own the settings. That keeps the estimate behind the modal reactive
// to edits as they are typed.
export default function SettingsModal({
  settings,
  updateSetting,
  programs,
  updateProgramField,
  addProgram,
  removeProgram,
  resetPrograms,
  settingsDirty,
  settingsSavedAt,
  savingSettings,
  onSave,
  onDiscard,
  onClose,
}) {
  const panelRef = useRef(null);
  // Shown instead of closing when there are unsaved edits.
  const [confirmingClose, setConfirmingClose] = useState(false);

  const requestClose = () => {
    if (settingsDirty) {
      setConfirmingClose(true);
      return;
    }
    onClose();
  };

  // Escape closes, subject to the same unsaved-changes check as the X button.
  // Depends on both flags so the handler never closes over a stale value.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      if (confirmingClose) {
        setConfirmingClose(false);
      } else if (settingsDirty) {
        setConfirmingClose(true);
      } else {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmingClose, settingsDirty, onClose]);

  // Stop the page behind the modal from scrolling with it.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Take focus on open and hand it back to whatever opened the modal on close,
  // so a keyboard user is not dropped at the top of the document.
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    panelRef.current?.focus();
    return () => {
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);

  const saveAndClose = async () => {
    await onSave();
    onClose();
  };

  const discardAndClose = () => {
    onDiscard();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-6 bg-[#232530]/40 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        // Only a click that both starts and ends on the backdrop closes, so
        // dragging a text selection out of an input does not dismiss the modal.
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        tabIndex={-1}
        className="fade-in bg-white w-full sm:max-w-3xl sm:rounded-lg border border-[#DDD8CA] shadow-xl flex flex-col max-h-screen sm:max-h-[88vh] focus:outline-none"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#DDD8CA] shrink-0">
          <h2 id="settings-modal-title" className="serif text-xl text-[#232530]">
            Settings
          </h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close settings"
            className="p-1.5 rounded-md text-[#9A9584] hover:text-[#232530] hover:bg-[#E7E3D8] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5 space-y-6 grow">
            <div>
              <h2 className="serif text-lg mb-1">Programs</h2>
              <p className="text-xs text-[#9A9584] mb-3">Shared with everyone who opens this tool. Student SAI entries above are never saved. "Tuition" prorates across periods by each period's share of total program hours. "Down payment" (books/kit or similar) is a charge added entirely to Period 1 — Pell reduces the combined Period-1 total in one shot, no special sequencing. Pell and loan limits prorate separately, by each period's share of one academic year.</p>
              {/* Each program is a filled card with a wine border. The previous
                  version drew a 1px border around the card AND around all five
                  inputs inside it, at near-identical weights, so four programs
                  read as one undifferentiated field of lines.

                  Two things fix that. The card border is now the accent colour
                  rather than another neutral, so it reads as a deliberate edge
                  instead of one more grey line. And the inputs dropped their
                  borders entirely — white on the warm tint is boundary enough,
                  which removes five competing lines per program. */}
              <div className="space-y-2.5">
                {programs.map((p) => (
                  <div key={p.id} className="bg-[#F0EEE8] border-2 border-[#7A3B54] rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <input
                        aria-label={`Program name: ${p.name}`}
                        className="serif flex-1 bg-white rounded-md px-2.5 py-1.5 text-base text-[#232530] border border-transparent focus:outline-none focus:border-[#7A3B54]/40 focus:ring-2 focus:ring-[#7A3B54]/15"
                        value={p.name}
                        onChange={(e) => updateProgramField(p.id, "name", e.target.value)}
                      />
                      <button
                        onClick={() => removeProgram(p.id)}
                        aria-label={`Delete ${p.name}`}
                        title={`Delete ${p.name}`}
                        className="p-2 rounded-md text-[#9A9584] hover:text-[#B8863B] hover:bg-[#E7E3D8] transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                      {/* The "($)" these money labels used to carry now lives
                          in the field itself. */}
                      {[
                        { field: "totalCost", label: "Tuition", money: true },
                        { field: "downPayment", label: "Down payment", money: true },
                        { field: "clockHours", label: "Clock hours" },
                        { field: "lengthWeeks", label: "Length (weeks)" },
                      ].map(({ field, label, money }) => (
                        <div key={field}>
                          <label className="text-[10px] text-[#9A9584]" htmlFor={`${p.id}-${field}`}>
                            {label}
                          </label>
                          {money ? (
                            <MoneyInput
                              id={`${p.id}-${field}`}
                              className="w-full bg-white rounded px-2 py-1.5 mono mt-1 border border-transparent focus:outline-none focus:border-[#7A3B54]/40 focus:ring-2 focus:ring-[#7A3B54]/15"
                              value={p[field]}
                              onChange={(n) => updateProgramField(p.id, field, n)}
                            />
                          ) : (
                            <input
                              id={`${p.id}-${field}`}
                              type="number"
                              className="w-full bg-white rounded px-2 py-1.5 mono mt-1 border border-transparent focus:outline-none focus:border-[#7A3B54]/40 focus:ring-2 focus:ring-[#7A3B54]/15"
                              value={p[field]}
                              onChange={(e) => updateProgramField(p.id, field, Number(e.target.value))}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-3">
                <button onClick={addProgram} className="flex items-center gap-1 text-sm text-[#7A3B54] hover:underline">
                  <Plus size={14} /> Add program
                </button>
                <button onClick={resetPrograms} className="flex items-center gap-1 text-sm text-[#9A9584] hover:underline">
                  <RotateCcw size={14} /> Restore sample list
                </button>
              </div>
            </div>

            <div className="dotted-rule pt-5">
              <h2 className="serif text-lg mb-3">Award year figures</h2>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <label className="text-xs text-[#9A9584]">Award year opens</label>
                  <YearInput className="mt-1 w-full border border-[#C9C4B8] rounded px-2 py-1.5 mono" value={settings.awardYearStart}
                    onChange={(year) => updateSetting({ ...settings, awardYearStart: year, awardYearLabel: formatAwardYear(year) })} />
                </div>
                <div>
                  <label className="text-xs text-[#9A9584]">Max Pell</label>
                  <MoneyInput className="mt-1 w-full border border-[#C9C4B8] rounded px-2 py-1.5 mono" value={settings.awardYearMax}
                    onChange={(n) => updateSetting({ ...settings, awardYearMax: n })} />
                </div>
                <div>
                  <label className="text-xs text-[#9A9584]">Min Pell</label>
                  <MoneyInput className="mt-1 w-full border border-[#C9C4B8] rounded px-2 py-1.5 mono" value={settings.awardYearMin}
                    onChange={(n) => updateSetting({ ...settings, awardYearMin: n })} />
                </div>
              </div>
              {/* The consequence of the year, quoted from the list it actually
                  feeds rather than recomputed here — a second copy of that
                  arithmetic is the drift this field was changed to remove. */}
              {normalizeAwardYearStart(settings.awardYearStart) && (
                <p className="text-xs text-[#6B6656] mt-2">
                  Everything dated follows from this. The tool reads{" "}
                  <span className="mono">{settings.awardYearLabel}</span>, and the dependency list says “
                  {dependencyCriteria(settings.awardYearStart).find((c) => c.key === "age24").label}”.
                </p>
              )}
              <p className="text-xs text-[#9A9584] mt-2">Max and min Pell change every award year via the Dept. of Education's Pell Grant payment letter — update them alongside the year.</p>
            </div>

            <div className="dotted-rule pt-5">
              <h2 className="serif text-lg mb-3">Academic year definition</h2>
              <div className="w-40">
                <label className="text-xs text-[#9A9584]">Clock hours</label>
                <input type="number" className="mt-1 w-full border border-[#C9C4B8] rounded px-2 py-1.5 mono" value={settings.academicYearHours}
                  onChange={(e) => updateSetting({ ...settings, academicYearHours: Number(e.target.value) })} />
              </div>
              <p className="text-xs text-[#9A9584] mt-2">
                Governs both Pell proration and loan-period progression (grade level bumps once a period completes this many hours).
                Pull this from your catalog / Title IV program definitions, not a guess.
              </p>
            </div>

            <div className="dotted-rule pt-5">
              <h2 className="serif text-lg mb-3">Financing defaults</h2>
              {/* Full width, matching Award year figures above. At w-96 these
                  three columns were ~120px, which only "Loan origination fee
                  (%)" failed to fit — it wrapped to two lines and dropped its
                  input below the other two.

                  Each cell is a flex column with a growing label so the inputs
                  bottom-align regardless: the grid stays three-up on a phone,
                  where any of these labels can still wrap. */}
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="flex flex-col">
                  <label className="text-xs text-[#9A9584] grow">Default term (months)</label>
                  <input type="number" className="mt-1 w-full border border-[#C9C4B8] rounded px-2 py-1.5 mono" value={settings.defaultTermMonths}
                    onChange={(e) => updateSetting({ ...settings, defaultTermMonths: Number(e.target.value) })} />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs text-[#9A9584] grow">Default rate (% APR)</label>
                  <input type="number" step={0.1} className="mt-1 w-full border border-[#C9C4B8] rounded px-2 py-1.5 mono" value={settings.defaultInterestRate}
                    onChange={(e) => updateSetting({ ...settings, defaultInterestRate: Number(e.target.value) })} />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs text-[#9A9584] grow">Origination fee (%)</label>
                  <input type="number" step={0.001} className="mt-1 w-full border border-[#C9C4B8] rounded px-2 py-1.5 mono" value={settings.originationFeePct}
                    onChange={(e) => updateSetting({ ...settings, originationFeePct: Number(e.target.value) })} />
                </div>
              </div>
              <p className="text-xs text-[#9A9584] mt-2">
                Term/rate are starting points staff can adjust live per student. Origination fee is set by ED per award year — check the current Dear Colleague Letter.
              </p>
            </div>

            <div className="dotted-rule pt-5">
              <h2 className="serif text-lg mb-1">Loan limits</h2>
              <p className="text-xs text-[#9A9584] mb-3">
                Federal Direct Subsidized/Unsubsidized annual limits — set by statute (34 CFR 685.203), unchanged
                since 2008, so these don't need annual updates the way Pell does. Source: FSA Handbook Vol. 8, Ch. 4.
              </p>
              <div className="space-y-3">
                {["dependent", "independent"].map((group) => (
                  <div key={group}>
                    <div className="text-xs font-medium text-[#232530] mb-1">
                      {group === "independent" ? "Independent / parent PLUS denied" : "Dependent"}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      {/* Same fill-not-stroke treatment as the program cards:
                          six of these sit in a tight grid, and bordering both
                          the card and its two inputs produced eighteen lines in
                          a space the width of a paragraph. */}
                      {["year1", "year2", "year3"].map((yr, i) => (
                        <div key={yr} className="bg-[#F0EEE8] border-2 border-[#7A3B54] rounded-md px-2.5 py-2">
                          <div className="text-[10px] text-[#9A9584] mb-1.5">{["Year 1", "Year 2", "Year 3+"][i]}</div>
                          {[
                            { key: "sub", label: "Sub" },
                            { key: "total", label: "Total" },
                          ].map(({ key, label }) => (
                            <div key={key} className="flex items-center gap-1.5 mb-1 last:mb-0">
                              <span className="text-[10px] text-[#9A9584] w-7 shrink-0">{label}</span>
                              <MoneyInput
                                aria-label={`${group} year ${i + 1} ${label} limit`}
                                className="w-full bg-white rounded px-1.5 py-1 mono text-xs border border-transparent focus:outline-none focus:border-[#7A3B54]/40 focus:ring-2 focus:ring-[#7A3B54]/15"
                                value={settings.loanLimits[group][yr][key]}
                                onChange={(n) => updateSetting({
                                  ...settings,
                                  loanLimits: { ...settings.loanLimits, [group]: { ...settings.loanLimits[group], [yr]: { ...settings.loanLimits[group][yr], [key]: n } } },
                                })} />
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {/* Lifetime aggregates. These were four unlabelled boxes under
                  "(sub / total)" in a w-80 grid, so each input was ~74px for a
                  five-digit figure and nothing said what "aggregate" meant or
                  that it is reference-only. Same card treatment as the annual
                  limits above, since they are the same kind of statutory
                  figure, with the Sub/Total rows labelled rather than implied
                  by the order they appear in. */}
              <div className="mt-4">
                <div className="text-xs font-medium text-[#232530] mb-1">Lifetime aggregate limits</div>
                <p className="text-xs text-[#9A9584] mb-2">
                  The most a student may borrow across their whole education, not per year. These are shown beside
                  the estimate for reference only — the tool has no record of what a student borrowed before, so it
                  never checks an estimate against them. Remaining eligibility comes from NSLDS.
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {[
                    { group: "Dependent", sub: "aggregateDependentSub", total: "aggregateDependentTotal" },
                    { group: "Independent / parent PLUS denied", sub: "aggregateIndependentSub", total: "aggregateIndependentTotal" },
                  ].map(({ group, sub, total }) => (
                    <div key={group} className="bg-[#F0EEE8] border-2 border-[#7A3B54] rounded-md px-2.5 py-2">
                      <div className="text-[10px] text-[#9A9584] mb-1.5">{group}</div>
                      {[
                        { key: sub, label: "Sub" },
                        { key: total, label: "Total" },
                      ].map(({ key, label }) => (
                        <div key={key} className="flex items-center gap-1.5 mb-1 last:mb-0">
                          <span className="text-[10px] text-[#9A9584] w-7 shrink-0">{label}</span>
                          <MoneyInput
                            aria-label={`${group} lifetime aggregate ${label} limit`}
                            className="w-full bg-white rounded px-1.5 py-1 mono text-xs border border-transparent focus:outline-none focus:border-[#7A3B54]/40 focus:ring-2 focus:ring-[#7A3B54]/15"
                            value={settings.loanLimits[key]}
                            onChange={(n) => updateSetting({
                              ...settings,
                              loanLimits: { ...settings.loanLimits, [key]: n },
                            })} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="dotted-rule pt-5">
              <h2 className="serif text-lg mb-2 flex items-center gap-2">
                Crossover policy note <Info size={14} className="text-[#9A9584]" />
              </h2>
              <textarea
                rows={3}
                placeholder="e.g. 'Assign crossover payment periods to the award year of the student's start date, unless remaining eligibility runs out confirm with financial aid on exceptions.'"
                className="w-full border border-[#C9C4B8] rounded px-3 py-2 text-sm"
                value={settings.crossoverNote}
                onChange={(e) => updateSetting({ ...settings, crossoverNote: e.target.value })}
              />
              <p className="text-xs text-[#9A9584] mt-2">
                This is a policy choice the school makes for Pell specifically — the banner above only flags <em>when</em> it applies. Loan periods (below) aren't affected by this since they follow the academic year, not the award year.
              </p>
            </div>
        </div>

        <div className="border-t border-[#DDD8CA] px-5 py-3 shrink-0">
          {confirmingClose ? (
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-[#232530]">Save your changes before closing?</span>
                <button
                  type="button"
                  onClick={saveAndClose}
                  disabled={savingSettings}
                  className="rounded-md bg-[#7A3B54] text-white text-sm font-medium px-3 py-1.5 hover:bg-[#633044] disabled:opacity-40 transition-colors"
                >
                  {savingSettings ? "Saving…" : "Save and close"}
                </button>
                <button
                  type="button"
                  onClick={discardAndClose}
                  className="rounded-md border border-[#C9C4B8] text-sm px-3 py-1.5 text-[#6B6656] hover:bg-[#E7E3D8] transition-colors"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingClose(false)}
                  className="text-sm text-[#9A9584] hover:underline"
                >
                  Keep editing
                </button>
              </div>
              {/* Discard reverts the award-year, academic-year, financing and
                  loan-limit fields. Program rows write as they are edited, so
                  they are already saved and are not affected — say so rather
                  than letting "Discard" imply more than it does. */}
              <p className="text-xs text-[#9A9584] mt-2">
                Applies to the fields below Programs. Program rows save as you edit them and are already stored.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onSave}
                disabled={savingSettings}
                className="rounded-md bg-[#7A3B54] text-white text-sm font-medium px-4 py-2 hover:bg-[#633044] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {savingSettings ? "Saving…" : "Save changes"}
              </button>

              {settingsDirty && !savingSettings && <span className="text-sm text-[#B8863B]">Unsaved changes</span>}
              {settingsSavedAt && !settingsDirty && (
                <span className="fade-in flex items-center gap-1.5 text-sm text-[#4A7C59]">
                  <Check size={15} />
                  Saved
                </span>
              )}
              {!settingsDirty && !settingsSavedAt && !savingSettings && (
                <span className="text-sm text-[#9A9584]">All changes saved</span>
              )}

              <button
                type="button"
                onClick={requestClose}
                className="ml-auto rounded-md border border-[#C9C4B8] text-sm px-3 py-2 text-[#6B6656] hover:bg-[#E7E3D8] transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
