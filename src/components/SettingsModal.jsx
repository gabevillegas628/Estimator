import React, { useEffect, useRef, useState } from "react";
import { X, Plus, Trash2, RotateCcw, Info, Check } from "lucide-react";

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
              <div className="space-y-3">
                {programs.map((p) => (
                  <div key={p.id} className="border border-[#DDD8CA] rounded-md p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        className="flex-1 border border-[#C9C4B8] rounded px-2 py-1.5 text-sm font-medium"
                        value={p.name}
                        onChange={(e) => updateProgramField(p.id, "name", e.target.value)}
                      />
                      <button onClick={() => removeProgram(p.id)} className="text-[#9A9584] hover:text-[#B8863B]">
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div>
                        <label className="text-[10px] text-[#9A9584]">Tuition ($)</label>
                        <input type="number" className="w-full border border-[#C9C4B8] rounded px-1.5 py-1 mono mt-0.5"
                          value={p.totalCost} onChange={(e) => updateProgramField(p.id, "totalCost", Number(e.target.value))} />
                      </div>
                      <div>
                        <label className="text-[10px] text-[#9A9584]">Down payment ($)</label>
                        <input type="number" className="w-full border border-[#C9C4B8] rounded px-1.5 py-1 mono mt-0.5"
                          value={p.downPayment} onChange={(e) => updateProgramField(p.id, "downPayment", Number(e.target.value))} />
                      </div>
                      <div>
                        <label className="text-[10px] text-[#9A9584]">Clock hours</label>
                        <input type="number" className="w-full border border-[#C9C4B8] rounded px-1.5 py-1 mono mt-0.5"
                          value={p.clockHours} onChange={(e) => updateProgramField(p.id, "clockHours", Number(e.target.value))} />
                      </div>
                      <div>
                        <label className="text-[10px] text-[#9A9584]">Length (weeks)</label>
                        <input type="number" className="w-full border border-[#C9C4B8] rounded px-1.5 py-1 mono mt-0.5"
                          value={p.lengthWeeks} onChange={(e) => updateProgramField(p.id, "lengthWeeks", Number(e.target.value))} />
                      </div>
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
                  <label className="text-xs text-[#9A9584]">Award year label</label>
                  <input className="mt-1 w-full border border-[#C9C4B8] rounded px-2 py-1.5" value={settings.awardYearLabel}
                    onChange={(e) => updateSetting({ ...settings, awardYearLabel: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-[#9A9584]">Max Pell</label>
                  <input type="number" className="mt-1 w-full border border-[#C9C4B8] rounded px-2 py-1.5 mono" value={settings.awardYearMax}
                    onChange={(e) => updateSetting({ ...settings, awardYearMax: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-[#9A9584]">Min Pell</label>
                  <input type="number" className="mt-1 w-full border border-[#C9C4B8] rounded px-2 py-1.5 mono" value={settings.awardYearMin}
                    onChange={(e) => updateSetting({ ...settings, awardYearMin: Number(e.target.value) })} />
                </div>
              </div>
              <p className="text-xs text-[#9A9584] mt-2">These change every award year via the Dept. of Education's Pell Grant payment letter — update at the start of each award year.</p>
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
              <div className="grid grid-cols-3 gap-3 text-sm w-96">
                <div>
                  <label className="text-xs text-[#9A9584]">Default term (months)</label>
                  <input type="number" className="mt-1 w-full border border-[#C9C4B8] rounded px-2 py-1.5 mono" value={settings.defaultTermMonths}
                    onChange={(e) => updateSetting({ ...settings, defaultTermMonths: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-[#9A9584]">Default rate (% APR)</label>
                  <input type="number" step={0.1} className="mt-1 w-full border border-[#C9C4B8] rounded px-2 py-1.5 mono" value={settings.defaultInterestRate}
                    onChange={(e) => updateSetting({ ...settings, defaultInterestRate: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-[#9A9584]">Loan origination fee (%)</label>
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
                      {["year1", "year2", "year3"].map((yr, i) => (
                        <div key={yr} className="border border-[#DDD8CA] rounded px-2 py-1.5">
                          <div className="text-[10px] text-[#9A9584] mb-1">{["Year 1", "Year 2", "Year 3+"][i]}</div>
                          <div className="flex items-center gap-1 mb-1">
                            <span className="text-[10px] text-[#9A9584]">Sub</span>
                            <input type="number" className="w-full border border-[#C9C4B8] rounded px-1.5 py-1 mono text-xs"
                              value={settings.loanLimits[group][yr].sub}
                              onChange={(e) => updateSetting({
                                ...settings,
                                loanLimits: { ...settings.loanLimits, [group]: { ...settings.loanLimits[group], [yr]: { ...settings.loanLimits[group][yr], sub: Number(e.target.value) } } },
                              })} />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-[#9A9584]">Total</span>
                            <input type="number" className="w-full border border-[#C9C4B8] rounded px-1.5 py-1 mono text-xs"
                              value={settings.loanLimits[group][yr].total}
                              onChange={(e) => updateSetting({
                                ...settings,
                                loanLimits: { ...settings.loanLimits, [group]: { ...settings.loanLimits[group], [yr]: { ...settings.loanLimits[group][yr], total: Number(e.target.value) } } },
                              })} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4 mt-3 text-sm w-80">
                <div>
                  <label className="text-xs text-[#9A9584]">Dependent aggregate (sub / total)</label>
                  <div className="flex gap-1 mt-1">
                    <input type="number" className="w-full border border-[#C9C4B8] rounded px-2 py-1.5 mono" value={settings.loanLimits.aggregateDependentSub} onChange={(e) => updateSetting({ ...settings, loanLimits: { ...settings.loanLimits, aggregateDependentSub: Number(e.target.value) } })} />
                    <input type="number" className="w-full border border-[#C9C4B8] rounded px-2 py-1.5 mono" value={settings.loanLimits.aggregateDependentTotal} onChange={(e) => updateSetting({ ...settings, loanLimits: { ...settings.loanLimits, aggregateDependentTotal: Number(e.target.value) } })} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-[#9A9584]">Independent aggregate (sub / total)</label>
                  <div className="flex gap-1 mt-1">
                    <input type="number" className="w-full border border-[#C9C4B8] rounded px-2 py-1.5 mono" value={settings.loanLimits.aggregateIndependentSub} onChange={(e) => updateSetting({ ...settings, loanLimits: { ...settings.loanLimits, aggregateIndependentSub: Number(e.target.value) } })} />
                    <input type="number" className="w-full border border-[#C9C4B8] rounded px-2 py-1.5 mono" value={settings.loanLimits.aggregateIndependentTotal} onChange={(e) => updateSetting({ ...settings, loanLimits: { ...settings.loanLimits, aggregateIndependentTotal: Number(e.target.value) } })} />
                  </div>
                </div>
              </div>
            </div>

            <div className="dotted-rule pt-5">
              <h2 className="serif text-lg mb-2 flex items-center gap-2">
                Crossover policy note <Info size={14} className="text-[#9A9584]" />
              </h2>
              <textarea
                rows={3}
                placeholder="e.g. 'Assign crossover payment periods to the award year of the student's start date, unless remaining eligibility runs out — confirm with [financial aid director] on exceptions.'"
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
