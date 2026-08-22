import React, { useState, useEffect, useCallback, useRef } from "react";
import { Settings, TriangleAlert, Info, Lock, LogOut, Eye, EyeOff, Printer, Calculator, ClipboardCopy, Check } from "lucide-react";

import {
  formatMoney,
  calculateScheduledPell,
  computeAcademicYearPeriods,
  buildAidPackage,
  findCrossoverBoundary,
  calculateMonthlyPayment,
  explainScheduledPell,
  explainAcademicYearPeriods,
  explainMonthlyPayment,
  uid,
} from "./lib/aid-calc.js";
import { DEFAULT_PROGRAMS, DEFAULT_SETTINGS, dependencyCriteria } from "../shared/defaults.js";
import { api, AuthError } from "./lib/api.js";
import SettingsModal from "./components/SettingsModal.jsx";
import PrintDialog from "./components/PrintDialog.jsx";
import PrintableEstimate from "./components/PrintableEstimate.jsx";
import ShowWorkModal from "./components/ShowWorkModal.jsx";
import TermsModal from "./components/TermsModal.jsx";
import CoverageBar from "./components/CoverageBar.jsx";
import LoadingScreen from "./components/LoadingScreen.jsx";
import { buildEstimateSummary } from "./lib/summary.js";
import { FONT_IMPORT, SHELL_CLASSES } from "./lib/theme.js";

// navigator.clipboard needs a secure context, which an internal tool reached
// over plain http on a LAN is not. The textarea route is deprecated everywhere
// but is still the only thing that works there, so it stays as the fallback.
async function writeToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const scratch = document.createElement("textarea");
  scratch.value = text;
  scratch.setAttribute("readonly", "");
  scratch.style.position = "fixed";
  scratch.style.opacity = "0";
  document.body.appendChild(scratch);
  scratch.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(scratch);
  if (!copied) throw new Error("The browser refused the copy.");
}

// Shown until the shared staff password is accepted. The gate covers the whole
// tool rather than just the settings pane, so nothing about a student's numbers
// is reachable without it.
function LoginScreen({ onAuthenticated }) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await api.login(password);
      onAuthenticated();
    } catch (err) {
      setError(err.message || "Could not sign in.");
      setPassword("");
      setSubmitting(false);
    }
  };

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', sans-serif" }} className={SHELL_CLASSES}>
      <style>{`
        ${FONT_IMPORT}
        .serif { font-family: 'Newsreader', serif; }
      `}</style>
      <form onSubmit={submit} className="w-full max-w-sm px-5">
        <div className="bg-white rounded-lg border border-[#DDD8CA] p-6">
          <div className="flex items-center gap-2 text-[#7A3B54]">
            <Lock size={16} />
            <span className="text-xs uppercase tracking-wide font-medium">Staff only</span>
          </div>
          <h1 className="serif text-2xl font-medium tracking-tight mt-2">Financial Aid Estimator</h1>
          <p className="text-sm text-[#6B6656] mt-1">Enter the department password to continue.</p>

          <div className="relative mt-4">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
              aria-label="Department password"
              className="w-full border border-[#C9C4B8] rounded-md pl-3 pr-10 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#7A3B54]/40"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              // tabIndex -1 so tabbing from the field goes straight to Sign in,
              // rather than landing on a control most people will not use.
              tabIndex={-1}
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#9A9584] hover:text-[#6B6656] transition-colors"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && (
            <p role="alert" className="text-sm text-[#7A3B54] mt-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || password.length === 0}
            className="mt-4 w-full rounded-md bg-[#7A3B54] text-white text-sm font-medium px-3 py-2 hover:bg-[#633044] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Checking…" : "Sign in"}
          </button>
        </div>
        <p className="text-xs text-[#9A9584] mt-3 text-center">
          Estimates only — not an official award notice.
        </p>
      </form>
    </div>
  );
}

// Decides between the password screen and the estimator. Kept separate from the
// estimator itself so that component always mounts with a live session and can
// assume its API calls will not 401 on first load.
export default function App() {
  const [authenticated, setAuthenticated] = useState(null); // null = still checking

  // Stable identities: the estimator lists these in effect dependencies, and
  // inline arrows would give it a new function on every render of this component.
  const handleAuthenticated = useCallback(() => setAuthenticated(true), []);
  const handleSignedOut = useCallback(() => setAuthenticated(false), []);

  useEffect(() => {
    api
      .getSession()
      .then((s) => setAuthenticated(Boolean(s.authenticated)))
      .catch(() => setAuthenticated(false));
  }, []);

  // The gate skeleton, not the estimator one: until this resolves, the only
  // thing that can legitimately come next is the password card.
  if (authenticated === null) return <LoadingScreen variant="gate" />;

  if (!authenticated) return <LoginScreen onAuthenticated={handleAuthenticated} />;

  return <FinancialAidEstimator onSignedOut={handleSignedOut} />;
}

function FinancialAidEstimator({ onSignedOut }) {
  const [programs, setPrograms] = useState(DEFAULT_PROGRAMS);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const [selectedProgramId, setSelectedProgramId] = useState(DEFAULT_PROGRAMS[0].id);
  const [sai, setSai] = useState("");
  const [maxFlag, setMaxFlag] = useState(false);
  const [minFlag, setMinFlag] = useState(false);
  const [startDate, setStartDate] = useState("");
  // Per-student grant aid. Never persisted, same as SAI.
  const [scholarship, setScholarship] = useState("");
  const [seog, setSeog] = useState("");
  // Printout-only identity fields. Never sent anywhere; see PrintDialog.
  const [studentName, setStudentName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [printOpen, setPrintOpen] = useState(false);
  const [copiedAt, setCopiedAt] = useState(null);
  const [workOpen, setWorkOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [settingsSavedAt, setSettingsSavedAt] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [termMonths, setTermMonths] = useState(DEFAULT_SETTINGS.defaultTermMonths);
  const [interestRate, setInterestRate] = useState(DEFAULT_SETTINGS.defaultInterestRate);
  // Staff read dependency status straight off the ISIR, so this is a direct
  // choice rather than something re-derived from the nine FAFSA triggers. The
  // trigger list is still available as reference below the toggle.
  const [isIndependent, setIsIndependent] = useState(false);
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const [parentPlusDenied, setParentPlusDenied] = useState(false);
  const [startingGradeLevel, setStartingGradeLevel] = useState(1);

  // In-flight debounced program edits, keyed by "programId:field". Each entry
  // keeps its payload alongside the timer so the Save button can flush anything
  // still waiting instead of racing it.
  const pendingWrites = useRef(new Map());
  useEffect(() => {
    const pending = pendingWrites.current;
    return () => pending.forEach((p) => clearTimeout(p.timer));
  }, []);

  const flashError = useCallback((msg) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(""), 4000);
  }, []);

  // A 401 anywhere means the session expired mid-use. Hand control back to the
  // gate rather than leaving stale numbers on screen that can no longer save.
  const handleApiError = useCallback(
    (err, fallbackMsg) => {
      if (err instanceof AuthError) {
        onSignedOut();
        return;
      }
      flashError(fallbackMsg);
    },
    [flashError, onSignedOut]
  );

  useEffect(() => {
    (async () => {
      try {
        const [loadedPrograms, loadedSettings] = await Promise.all([api.getPrograms(), api.getSettings()]);
        if (loadedPrograms.length) {
          setPrograms(loadedPrograms);
          setSelectedProgramId(loadedPrograms[0].id);
        }
        setSettings(loadedSettings);
        lastSavedSettings.current = loadedSettings;
        setTermMonths(loadedSettings.defaultTermMonths);
        setInterestRate(loadedSettings.defaultInterestRate);
      } catch (err) {
        // Falling back to in-memory defaults keeps the estimator usable for a
        // one-off calculation even if the database is unreachable — but nothing
        // will persist, so say so rather than failing silently.
        if (err instanceof AuthError) {
          onSignedOut();
          return;
        }
        flashError("Couldn't load saved programs — showing defaults. Changes won't be saved.");
      }
      setLoaded(true);
    })();
  }, [flashError, onSignedOut]);

  // Programs are written per row, so two staff editing different programs no
  // longer overwrite each other. Local state updates first for responsiveness;
  // a failed write reloads from the server so the screen cannot drift from
  // what is actually stored.
  const revertPrograms = useCallback(async () => {
    try {
      setPrograms(await api.getPrograms());
    } catch {
      /* the flashed message already covers it */
    }
  }, []);

  // Settings edits stay local until explicitly saved. They used to write on
  // every keystroke, which meant typing "7395" saved four times — once per
  // partial number, each briefly storing a nonsense award maximum — and gave
  // no signal that anything had been stored at all.
  // Fires any debounced program edits immediately rather than waiting out their
  // timers, so pressing Save cannot return "Saved" while a write is still queued.
  const flushProgramWrites = useCallback(async () => {
    const pending = [...pendingWrites.current.values()];
    if (pending.length === 0) return;

    pendingWrites.current.clear();
    pending.forEach((p) => clearTimeout(p.timer));
    await Promise.all(pending.map((p) => api.updateProgram(p.id, { [p.field]: p.value })));
  }, []);

  const updateSetting = useCallback((next) => {
    setSettings(next);
    setSettingsDirty(true);
    setSettingsSavedAt(null);
  }, []);

  // Snapshot of what the server last confirmed, so closing the modal can offer
  // to throw away unsaved edits and put the real values back.
  const lastSavedSettings = useRef(DEFAULT_SETTINGS);

  const discardSettingChanges = useCallback(() => {
    setSettings(lastSavedSettings.current);
    setSettingsDirty(false);
    setSettingsSavedAt(null);
  }, []);

  // Saves everything in the settings panel, not just the settings half. Program
  // rows still write on their own so nothing is ever lost, but the button has to
  // account for them too or "Saved" would be a lie while a debounce is pending.
  const saveAllSettings = useCallback(async () => {
    setSavingSettings(true);
    try {
      await flushProgramWrites();
      // The server merges over defaults on write, so take back what it stored
      // rather than assuming local state matches.
      const saved = await api.saveSettings(settings);
      setSettings(saved);
      lastSavedSettings.current = saved;
      setSettingsDirty(false);
      setSettingsSavedAt(Date.now());
    } catch (err) {
      handleApiError(err, "Couldn't save — check connection and try again.");
    } finally {
      setSavingSettings(false);
    }
  }, [settings, handleApiError, flushProgramWrites]);

  // Unsaved settings survive closing the panel (they stay in state, and the
  // estimate above reflects them immediately) but not a reload, so warn on the
  // one case that actually loses work.
  useEffect(() => {
    if (!settingsDirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [settingsDirty]);

  useEffect(() => {
    if (!settingsSavedAt) return;
    const t = setTimeout(() => setSettingsSavedAt(null), 3000);
    return () => clearTimeout(t);
  }, [settingsSavedAt]);

  // The same shape as settingsSavedAt: the timestamp is the state and one
  // effect clears it, so a component that unmounts mid-timeout cannot leave a
  // button still claiming "Copied".
  useEffect(() => {
    if (!copiedAt) return;
    const t = setTimeout(() => setCopiedAt(null), 2000);
    return () => clearTimeout(t);
  }, [copiedAt]);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      onSignedOut();
    }
  }, [onSignedOut]);

  if (!loaded) return <LoadingScreen variant="app" />;

  const selectedProgram = programs.find((p) => p.id === selectedProgramId) || programs[0] || null;

  const scheduledPell = calculateScheduledPell({
    sai, maxFlag, minFlag, awardMax: settings.awardYearMax, awardMin: settings.awardYearMin,
  });
  const hasResult = scheduledPell !== null && selectedProgram;

  const useIndependentTable = isIndependent || parentPlusDenied;
  const aggregateSub = useIndependentTable ? settings.loanLimits.aggregateIndependentSub : settings.loanLimits.aggregateDependentSub;
  const aggregateTotal = useIndependentTable ? settings.loanLimits.aggregateIndependentTotal : settings.loanLimits.aggregateDependentTotal;

  const periods = selectedProgram ? computeAcademicYearPeriods(selectedProgram.clockHours, settings.academicYearHours) : [];

  const downPayment = selectedProgram ? Number(selectedProgram.downPayment) || 0 : 0;
  const totalCost = selectedProgram ? Number(selectedProgram.totalCost) || 0 : 0;

  const period0Pell = hasResult && periods[0] ? Math.round((scheduledPell * periods[0].fraction) / 5) * 5 : 0;
  // Informational only — down payment is a charge folded into Period 1's total
  // inside buildAidPackage, not a separate credit. This just shows how much of
  // it Pell alone would cover, for a quick read on out-of-pocket exposure.
  const downPaymentGap = Math.max(downPayment - period0Pell, 0);
  const downPaymentOverage = Math.max(period0Pell - downPayment, 0);
  const coveragePct = downPayment > 0 ? Math.min(100, (period0Pell / downPayment) * 100) : 0;

  const scholarshipAmount = Math.max(Number(scholarship) || 0, 0);
  const seogAmount = Math.max(Number(seog) || 0, 0);
  const otherGrantAid = scholarshipAmount + seogAmount;

  const aidPackage = hasResult
    ? buildAidPackage({
        periods, totalProgramHours: selectedProgram.clockHours, totalCost, downPayment, scheduledPell,
        otherGrantAid,
        startingGradeLevel, useIndependentTable, loanLimits: settings.loanLimits,
        originationFeePct: settings.originationFeePct,
      })
    : null;

  const financedBalance = aidPackage ? aidPackage.totals.remainingBalance : 0;
  const { payment: monthlyPayment, totalPaid: financedTotalPaid, totalInterest } = calculateMonthlyPayment(
    financedBalance, interestRate, termMonths
  );
  const triggersTila = (Number(interestRate) || 0) > 0 || (Number(termMonths) || 0) > 4;

  const crossoverBoundary = selectedProgram ? findCrossoverBoundary(startDate, selectedProgram.lengthWeeks) : null;

  // Only built while the panel is open. The per-period trace already rides
  // along inside aidPackage (it is emitted during the real computation, so it
  // cannot disagree with the numbers above), but the Pell and payment
  // narrations are extra work with no reason to run on every keystroke.
  const showWork =
    workOpen && aidPackage && selectedProgram
      ? {
          pell: explainScheduledPell({
            sai, maxFlag, minFlag, awardMax: settings.awardYearMax, awardMin: settings.awardYearMin,
          }),
          periods: explainAcademicYearPeriods(selectedProgram.clockHours, settings.academicYearHours),
          payment: explainMonthlyPayment(financedBalance, interestRate, termMonths),
        }
      : null;

  // These fire on every keystroke in the settings pane. Local state updates
  // immediately so typing stays responsive, while the PATCH is debounced per
  // program+field — otherwise editing a program name would be one request per
  // character.
  const updateProgramField = (id, field, value) => {
    setPrograms((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));

    const key = `${id}:${field}`;
    const existing = pendingWrites.current.get(key);
    if (existing) clearTimeout(existing.timer);

    const timer = setTimeout(async () => {
      pendingWrites.current.delete(key);
      try {
        await api.updateProgram(id, { [field]: value });
      } catch (err) {
        handleApiError(err, "Couldn't save that change — check connection and try again.");
        revertPrograms();
      }
    }, 600);

    pendingWrites.current.set(key, { timer, id, field, value });
  };

  const addProgram = async () => {
    const program = { id: uid(), name: "New program", totalCost: 0, downPayment: 0, clockHours: 600, lengthWeeks: 20 };
    setPrograms((prev) => [...prev, program]);
    try {
      await api.createProgram(program);
    } catch (err) {
      handleApiError(err, "Couldn't add that program — check connection and try again.");
      revertPrograms();
    }
  };

  const removeProgram = async (id) => {
    const next = programs.filter((p) => p.id !== id);
    setPrograms(next);
    if (selectedProgramId === id && next.length) setSelectedProgramId(next[0].id);
    try {
      await api.deleteProgram(id);
    } catch (err) {
      handleApiError(err, "Couldn't delete that program — check connection and try again.");
      revertPrograms();
    }
  };

  // Staff quote these figures into an email or a CRM note, and retyping them
  // off the screen is where transcription errors come from. Name and date of
  // birth are left out on purpose: those belong to the printed worksheet, which
  // is the student's own document, not to a clipboard headed somewhere unknown.
  const copyEstimate = async () => {
    const text = buildEstimateSummary({
      program: selectedProgram,
      settings,
      sai,
      maxFlag,
      minFlag,
      isIndependent,
      parentPlusDenied,
      startDate,
      scholarshipAmount,
      seogAmount,
      aidPackage,
      crossoverBoundary,
      termMonths,
      interestRate,
      monthlyPayment,
      totalPaid: financedTotalPaid,
    });
    if (!text) return;

    try {
      await writeToClipboard(text);
      setCopiedAt(Date.now());
    } catch {
      flashError("Couldn't copy to the clipboard — your browser blocked it.");
    }
  };

  const resetPrograms = async () => {
    try {
      const restored = await api.resetPrograms();
      setPrograms(restored);
      if (restored.length) setSelectedProgramId(restored[0].id);
    } catch (err) {
      handleApiError(err, "Couldn't reset programs — check connection and try again.");
    }
  };

  return (
    <>
    <div style={{ fontFamily: "'IBM Plex Sans', sans-serif" }} className="screen-only min-h-screen bg-[#F0EEE8] text-[#232530] pb-16">
      <style>{`
        ${FONT_IMPORT}
        .serif { font-family: 'Newsreader', serif; }
        .mono { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
        .dotted-rule { border-bottom: 1px dashed #C9C4B8; }
        input[type=number]::-webkit-inner-spin-button { opacity: 1; }
        .fade-in { animation: fadeIn 0.25s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(2px);} to { opacity: 1; transform: translateY(0);} }
      `}</style>

      {/* Header */}
      <div className="border-b border-[#C9C4B8] bg-[#F0EEE8]/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="serif text-2xl font-medium tracking-tight text-[#232530]">Financial Aid Estimator</h1>
            <p className="text-xs text-[#6B6656] mt-0.5">Staff tool — estimate only, not an official award</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copyEstimate}
              disabled={!hasResult}
              title={hasResult ? "Copy this estimate as text" : "Enter an SAI to produce an estimate first"}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-[#C9C4B8] hover:bg-[#E7E3D8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {copiedAt ? <Check size={15} className="text-[#4A7C59]" /> : <ClipboardCopy size={15} />}
              {copiedAt ? "Copied" : "Copy"}
            </button>
            <button
              onClick={() => setPrintOpen(true)}
              disabled={!hasResult}
              title={hasResult ? "Print estimate" : "Enter an SAI to produce an estimate first"}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-[#C9C4B8] hover:bg-[#E7E3D8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Printer size={15} />
              Print
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-[#C9C4B8] hover:bg-[#E7E3D8] transition-colors"
              aria-haspopup="dialog"
            >
              <Settings size={15} />
              Settings
            </button>
            <button
              onClick={signOut}
              title="Sign out"
              aria-label="Sign out"
              className="flex items-center text-sm px-2.5 py-1.5 rounded-md border border-[#C9C4B8] text-[#6B6656] hover:bg-[#E7E3D8] transition-colors"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* A live region has to be in the DOM already when its text changes, so
          this stays mounted and empty rather than arriving with the banner
          below — a region that appears alongside its message is a new node, not
          a change, and announces nothing. Kept outside the estimate column so
          an empty one cannot take a space-y margin. */}
      <span role="status" aria-live="polite" className="sr-only">{statusMsg}</span>

      <div className="max-w-3xl mx-auto px-5 pt-6 space-y-5">
        {statusMsg && (
          <div className="text-sm bg-[#F4D9C6] border border-[#B8863B] text-[#5C3E17] rounded-md px-3 py-2">{statusMsg}</div>
        )}

        {/* Input card */}
        <div className="bg-white rounded-lg border border-[#DDD8CA] p-5 space-y-5">
          <div>
            <label className="text-sm font-medium text-[#232530]">Program</label>
            <select
              value={selectedProgramId}
              onChange={(e) => setSelectedProgramId(e.target.value)}
              className="mt-1.5 w-full border border-[#C9C4B8] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#7A3B54]/40"
            >
              {programs.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {periods.length > 1 && (
              <p className="text-xs text-[#9A9584] mt-1">
                {periods.length} payment periods ({periods.map((p) => `${Math.round(p.hours)}h`).join(" + ")}) — this program runs longer than one defined academic year ({settings.academicYearHours}h).
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-[#232530]">SAI</label>
              <input
                type="number"
                disabled={maxFlag}
                value={sai}
                onChange={(e) => setSai(e.target.value)}
                placeholder="e.g. -1500 to 14790"
                className="mt-1.5 w-full border border-[#C9C4B8] rounded-md px-3 py-2 text-sm mono disabled:bg-[#F0EEE8] disabled:text-[#9A9584] focus:outline-none focus:ring-2 focus:ring-[#7A3B54]/40"
              />
              <p className="text-xs text-[#9A9584] mt-1">From the student's ISIR / FAFSA Submission Summary</p>
            </div>
            <div>
              <label className="text-sm font-medium text-[#232530]">Enrollment start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1.5 w-full border border-[#C9C4B8] rounded-md px-3 py-2 text-sm mono focus:outline-none focus:ring-2 focus:ring-[#7A3B54]/40"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={maxFlag} onChange={(e) => { setMaxFlag(e.target.checked); if (e.target.checked) setMinFlag(false); }} />
              Max Pell Indicator (ISIR)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={minFlag} disabled={maxFlag} onChange={(e) => setMinFlag(e.target.checked)} />
              Min Pell Indicator (ISIR)
            </label>
          </div>

          {/* Other grant aid. Like SAI, these are per-student and never saved —
              they exist only in this component's state. */}
          <div className="dotted-rule pt-4 -mt-1">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="scholarship" className="text-sm font-medium text-[#232530]">Scholarship</label>
                <div className="relative mt-1.5">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#9A9584] mono">$</span>
                  <input
                    id="scholarship"
                    type="number"
                    min="0"
                    value={scholarship}
                    onChange={(e) => setScholarship(e.target.value)}
                    placeholder="0"
                    className="w-full border border-[#C9C4B8] rounded-md pl-7 pr-3 py-2 text-sm mono focus:outline-none focus:ring-2 focus:ring-[#7A3B54]/40"
                  />
                </div>
                <p className="text-xs text-[#9A9584] mt-1">Institutional award, if any</p>
              </div>
              <div>
                <label htmlFor="seog" className="text-sm font-medium text-[#232530]">SEOG</label>
                <div className="relative mt-1.5">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#9A9584] mono">$</span>
                  <input
                    id="seog"
                    type="number"
                    min="0"
                    value={seog}
                    onChange={(e) => setSeog(e.target.value)}
                    placeholder="0"
                    className="w-full border border-[#C9C4B8] rounded-md pl-7 pr-3 py-2 text-sm mono focus:outline-none focus:ring-2 focus:ring-[#7A3B54]/40"
                  />
                </div>
                <p className="text-xs text-[#9A9584] mt-1">Supplemental Educational Opportunity Grant</p>
              </div>
            </div>
            <p className="text-xs text-[#9A9584] mt-2">
              Both are grant aid: they reduce the balance before any borrowing, so a student whose need falls below the
              loan ceilings borrows less rather than finishing with a credit.
            </p>
          </div>
        </div>

        {/* Crossover warning */}
        {crossoverBoundary && (
          <div className="fade-in flex gap-3 bg-[#F4E6EA] border border-[#7A3B54]/40 rounded-lg px-4 py-3">
            <TriangleAlert size={18} className="text-[#7A3B54] shrink-0 mt-0.5" />
            <div className="text-sm text-[#5A2540]">
              <span className="font-medium">This enrollment crosses a Pell award year boundary</span> (around{" "}
              {crossoverBoundary.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}).
              Which award year's Pell figures apply is a policy call, not something this tool decides.
              This is separate from the loan periods below, which follow the program's academic year,
              not the award year.

              {/* The policy note is authored in Settings but belongs here, at the
                  one moment it is relevant. Pointing staff at another screen to
                  go find it was advice they had to act on to use. */}
              {settings.crossoverNote?.trim() ? (
                <div className="mt-2.5 border-l-2 border-[#7A3B54]/40 pl-3">
                  <div className="text-[10px] uppercase tracking-wide font-medium text-[#7A3B54] mb-0.5">
                    Crossover policy
                  </div>
                  <div className="whitespace-pre-line">{settings.crossoverNote.trim()}</div>
                </div>
              ) : (
                <div className="mt-2.5 text-xs text-[#7A3B54]">
                  No crossover policy has been recorded yet —{" "}
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    className="underline underline-offset-2 hover:text-[#5A2540] transition-colors"
                  >
                    add one in Settings
                  </button>{" "}
                  and it will appear here.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Loan eligibility inputs */}
        {selectedProgram && (
          <div className="fade-in bg-white rounded-lg border border-[#DDD8CA] p-5">
            <div className="flex items-baseline justify-between dotted-rule pb-3 mb-4">
              <span className="serif text-lg text-[#232530]">Dependency & loan status</span>
              <span className="text-xs text-[#9A9584]">FAFSA dependency — not a program name</span>
            </div>

            <div className="mb-4">
              <div className="inline-flex rounded-md border border-[#C9C4B8] overflow-hidden" role="group" aria-label="Dependency status">
                {[
                  { label: "Dependent", value: false },
                  { label: "Independent", value: true },
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    aria-pressed={isIndependent === option.value}
                    onClick={() => {
                      setIsIndependent(option.value);
                      // The PLUS-denial question only applies to a dependent
                      // student, so it should not linger after switching.
                      if (option.value) setParentPlusDenied(false);
                    }}
                    className={`px-4 py-1.5 text-sm transition-colors ${
                      isIndependent === option.value
                        ? "bg-[#7A3B54] text-white"
                        : "bg-white text-[#6B6656] hover:bg-[#E7E3D8]"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setCriteriaOpen((o) => !o)}
                aria-expanded={criteriaOpen}
                className="block mt-2 text-xs text-[#7A3B54] hover:underline"
              >
                {criteriaOpen ? "Hide" : "What makes a student independent?"}
              </button>

              {/* Kept as reference rather than deleted: the common shorthand
                  ("24 or older unless married or has kids") misses several of
                  these, and staff overriding the ISIR on that basis would be a
                  quiet source of wrong estimates. */}
              {criteriaOpen && (
                <div className="fade-in mt-2 rounded-md bg-[#F0EEE8] border border-[#DDD8CA] p-3">
                  <p className="text-xs text-[#6B6656] mb-2">
                    Any single one of these makes a student independent for FAFSA purposes. The ISIR already reflects this —
                    use it rather than re-deriving.
                  </p>
                  <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-1">
                    {/* Built from the award year rather than stored, so the
                        two dated criteria cannot outlive the label above. Only
                        runs while this panel is open. */}
                    {dependencyCriteria(settings.awardYearStart).map((c) => (
                      <li key={c.key} className="text-xs text-[#6B6656] flex gap-1.5">
                        <span className="text-[#9A9584]">•</span>
                        <span>{c.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="text-xs text-[#9A9584]">Starting grade level: </label>
                <select
                  value={startingGradeLevel}
                  onChange={(e) => setStartingGradeLevel(Number(e.target.value))}
                  className="mt-1 border border-[#C9C4B8] rounded-md px-2 py-1.5 text-sm bg-white"
                >
                  <option value={1}>Year 1 (new student)</option>
                  <option value={2}>Year 2 (transfer/re-entry)</option>
                  <option value={3}>Year 3+ (transfer/re-entry)</option>
                </select>
                {!isIndependent && (
                <label className="flex items-center gap-2 text-sm mb-1.5">
                  <input type="checkbox" checked={parentPlusDenied} onChange={(e) => setParentPlusDenied(e.target.checked)} />
                  Parent denied a Direct PLUS Loan
                </label>
                )}
                <p className="text-[10px] text-[#9A9584] mt-1 max-w-55">Later periods auto-progress a grade level each time an academic year completes.</p>
              </div>
              <div className="text-sm ml-auto">
                <span className="text-[#9A9584]">Dependency status:</span>{" "}
                <span className="serif text-[#7A3B54]">{isIndependent ? "Independent" : parentPlusDenied ? "Dependent (PLUS denied)" : "Dependent"}</span>
              </div>
            </div>
          </div>
        )}

        {/* Result card */}
        {selectedProgram && (
          <div className="fade-in bg-white rounded-lg border border-[#DDD8CA] p-5">
            <div className="flex items-center justify-between gap-3 dotted-rule pb-3 mb-4">
              <span className="serif text-lg text-[#232530]">{selectedProgram.name}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-[#9A9584] mono">{settings.awardYearLabel}</span>
                {hasResult && (
                  <button
                    type="button"
                    onClick={() => setWorkOpen(true)}
                    aria-haspopup="dialog"
                    title="See every step behind these numbers"
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-[#C9C4B8] text-[#6B6656] hover:bg-[#E7E3D8] transition-colors"
                  >
                    <Calculator size={14} />
                    Show the work
                  </button>
                )}
              </div>
            </div>

            {!hasResult ? (
              <p className="text-sm text-[#9A9584] py-6 text-center">Enter an SAI (or check Max Pell) to see the estimate.</p>
            ) : (
              <>
                {/* Down payment context — informational only. The actual balance below
                    already includes the down payment as part of Period 1's total charge,
                    reduced by Period 1's Pell in one shot. This just shows how much of
                    that charge Pell alone accounts for. */}
                <div className="mb-2">
                  <div className="text-xs text-[#9A9584] mb-1.5">Down payment vs. Period 1 Pell (context only — not a separate calculation)</div>
                  <div className="h-9 w-full rounded-md bg-[#F0EEE8] overflow-hidden flex border border-[#DDD8CA]">
                    <div className="bg-[#6B8F71] h-full transition-all duration-300" style={{ width: `${coveragePct}%` }} />
                    {downPaymentGap > 0 && (
                      <div className="bg-[#D9A15B] h-full transition-all duration-300" style={{ width: `${100 - coveragePct}%` }} />
                    )}
                  </div>
                  <div className="flex justify-between text-xs mono text-[#6B6656] mt-1.5">
                    <span>Pell covers {formatMoney(period0Pell)}</span>
                    <span>Down payment {formatMoney(downPayment)}</span>
                  </div>
                  <p className="text-xs text-[#9A9584] mt-1.5">
                    {downPaymentGap > 0
                      ? `Pell alone falls ${formatMoney(downPaymentGap)} short of the down payment — the rest of Period 1's Pell and loans below still apply toward it, same as any other charge.`
                      : "Pell alone covers the full down payment; the remainder applies toward the rest of Period 1's charges below."}
                  </p>
                </div>

                {/* Period-by-period aid package */}
                <div className="space-y-3 mb-4">
                  {aidPackage.rows.map((r) => (
                    <div key={r.index} className="border border-[#DDD8CA] rounded-md p-3">
                      <div className="flex items-baseline justify-between mb-2">
                        <span className="text-sm font-medium text-[#232530]">
                          AY{r.index + 1} · Grade {r.gradeLevel}
                        </span>
                        <span className="text-xs text-[#9A9584] mono">{Math.round(r.hours)}h ({Math.round(r.fraction * 100)}% of AY)</span>
                      </div>
                      <div className="text-xs text-[#9A9584] mb-2">
                        Charge: {formatMoney(r.tuitionSlice)}
                        {r.downPaymentCharge > 0 && ` (includes ${formatMoney(r.downPaymentCharge)} down payment)`}
                      </div>
                      {/* Stands in for the two lines that used to sit here —
                          "Grant aid applied" and "Still due this period" — both
                          of which the legend now states, next to the sources
                          they were previously separated from. */}
                      <CoverageBar
                        row={r}
                        isLastPeriod={r.index === aidPackage.rows.length - 1}
                        scholarshipAmount={scholarshipAmount}
                        seogAmount={seogAmount}
                      />
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <div className="text-[10px] text-[#9A9584]">Pell</div>
                          <div className="mono">{formatMoney(r.pell)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[#9A9584]">Sub (net of {settings.originationFeePct}% fee)</div>
                          <div className="mono">{formatMoney(r.subNet)}</div>
                          {r.subGross < r.subCeiling && <div className="text-[9px] text-[#9A9584]">ceiling {formatMoney(r.subCeiling)}, not fully drawn</div>}
                        </div>
                        <div>
                          <div className="text-[10px] text-[#9A9584]">Unsub (net)</div>
                          <div className="mono">{formatMoney(r.unsubNet)}</div>
                          {r.unsubGross < r.unsubCeiling && <div className="text-[9px] text-[#9A9584]">ceiling {formatMoney(r.unsubCeiling)}, not fully drawn</div>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="dotted-rule pt-3 pb-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <div className="text-[10px] text-[#9A9584]">Total Pell</div>
                    <div className="mono">{formatMoney(aidPackage.totals.pell)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#9A9584]">Total Sub (net)</div>
                    <div className="mono">{formatMoney(aidPackage.totals.subNet)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#9A9584]">Total Unsub (net)</div>
                    <div className="mono">{formatMoney(aidPackage.totals.unsubNet)}</div>
                  </div>
                </div>

                <p className="text-xs text-[#9A9584]">
                  Lifetime aggregate: {formatMoney(aggregateTotal)} (up to {formatMoney(aggregateSub)} subsidized) —
                  this tool doesn't track prior borrowing; check NSLDS for that. Loans are drawn Pell → Sub → Unsub,
                  each capped at whichever is lower: that period's federal limit or its remaining need — not
                  automatically maxed out, matching how your worksheet actually packages aid.
                </p>
              </>
            )}
          </div>
        )}

        {/* Monthly payment plan */}
        {selectedProgram && hasResult && (
          <div className="fade-in bg-white rounded-lg border border-[#DDD8CA] p-5">
            <div className="flex items-center justify-between dotted-rule pb-3 mb-4 flex-wrap gap-2">
              <span className="serif text-lg text-[#232530]">Monthly payment plan</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-[#9A9584]">Balance after down payment, Pell, and loans</span>
                <button
                  type="button"
                  onClick={() => setWorkOpen(true)}
                  aria-haspopup="dialog"
                  title="See every step behind these numbers"
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-[#C9C4B8] text-[#6B6656] hover:bg-[#E7E3D8] transition-colors"
                >
                  <Calculator size={14} />
                  Show the work
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-4 mb-4">
              <div>
                <label className="text-xs text-[#9A9584]">Term (months)</label>
                <input
                  type="number" min={1} value={termMonths}
                  onChange={(e) => setTermMonths(Number(e.target.value))}
                  className="mt-1 w-24 border border-[#C9C4B8] rounded px-2 py-1.5 text-sm mono focus:outline-none focus:ring-2 focus:ring-[#7A3B54]/40"
                />
              </div>
              <div>
                <label className="text-xs text-[#9A9584]">Interest rate (% APR)</label>
                <input
                  type="number" min={0} step={0.1} value={interestRate}
                  onChange={(e) => setInterestRate(Number(e.target.value))}
                  className="mt-1 w-28 border border-[#C9C4B8] rounded px-2 py-1.5 text-sm mono focus:outline-none focus:ring-2 focus:ring-[#7A3B54]/40"
                />
              </div>
              <div className="text-xs text-[#9A9584]">
                Balance to finance: <span className="mono text-[#232530]">{formatMoney(financedBalance)}</span>
              </div>
            </div>

            <div className="bg-[#F0EEE8] rounded-md px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-medium text-[#232530]">Estimated monthly payment</span>
              <span className="mono text-2xl font-medium text-[#7A3B54]">{formatMoney(monthlyPayment)}</span>
            </div>
            <div className="text-xs text-[#9A9584] mt-1.5">
              {termMonths || 0} payments · {formatMoney(financedTotalPaid)} total
              {interestRate > 0 ? ` · ${formatMoney(totalInterest)} interest` : ""}
            </div>

            {triggersTila && (
              <p className="text-xs text-[#9A9584] mt-3 flex gap-1.5">
                <Info size={13} className="shrink-0 mt-0.5" />
                A plan with a finance charge, or more than 4 installments, can trigger Truth-in-Lending
                (Regulation Z) disclosure requirements if your school offers these regularly — worth a
                quick check with whoever handles compliance before this goes into enrollment agreements.
              </p>
            )}
          </div>
        )}

        <p className="text-xs text-[#9A9584] text-center pt-4">
          Estimate only — not an official award or financial aid offer. Verification, R2T4 refund calculations,
          and satisfactory-progress holds still go through financial aid staff.
        </p>

        <p className="text-xs text-[#9A9584] text-center pt-2 pb-1">
          © 2026 Wildtype Technologies LLC
          <span aria-hidden="true"> · </span>
          <button
            type="button"
            onClick={() => setTermsOpen(true)}
            className="underline underline-offset-2 hover:text-[#232530] transition-colors"
          >
            Terms
          </button>
        </p>
      </div>
    </div>

    {/* Settings lives in a modal rather than an accordion at the foot of the
        page: its trigger is in the header, and opening a panel 800px below the
        button looked like nothing had happened.

        Out here with the other overlays for the reason below. It used to render
        inside the estimate column, where space-y-5 gave its fixed inset-0
        backdrop a 20px top margin -- enough to push the blur down and leave a
        strip along the bottom of the screen unblurred. */}
    {settingsOpen && (
      <SettingsModal
        settings={settings}
        updateSetting={updateSetting}
        programs={programs}
        updateProgramField={updateProgramField}
        addProgram={addProgram}
        removeProgram={removeProgram}
        resetPrograms={resetPrograms}
        settingsDirty={settingsDirty}
        settingsSavedAt={settingsSavedAt}
        savingSettings={savingSettings}
        onSave={saveAllSettings}
        onDiscard={discardSettingChanges}
        onClose={() => setSettingsOpen(false)}
      />
    )}

    {/* Outside the estimate column, like PrintDialog: that column is a
        space-y stack, which puts a top margin on every child after the first
        and would shove a fixed inset-0 overlay down off the top of the screen. */}
    {showWork && (
      <ShowWorkModal
        program={selectedProgram}
        settings={settings}
        sai={sai}
        maxFlag={maxFlag}
        minFlag={minFlag}
        isIndependent={isIndependent}
        parentPlusDenied={parentPlusDenied}
        useIndependentTable={useIndependentTable}
        startingGradeLevel={startingGradeLevel}
        scholarshipAmount={scholarshipAmount}
        seogAmount={seogAmount}
        pellExplanation={showWork.pell}
        periodExplanation={showWork.periods}
        aidPackage={aidPackage}
        paymentExplanation={showWork.payment}
        termMonths={termMonths}
        interestRate={interestRate}
        onClose={() => setWorkOpen(false)}
      />
    )}

    {termsOpen && <TermsModal onClose={() => setTermsOpen(false)} />}

    {printOpen && (
      <PrintDialog
        studentName={studentName}
        setStudentName={setStudentName}
        dateOfBirth={dateOfBirth}
        setDateOfBirth={setDateOfBirth}
        onClose={() => setPrintOpen(false)}
      />
    )}

    {/* Sibling of the app shell, not a child: the shell is display:none when
        printing, which would take the worksheet down with it. */}
    <PrintableEstimate
      studentName={studentName}
      dateOfBirth={dateOfBirth}
      sai={sai}
      maxFlag={maxFlag}
      startDate={startDate}
      program={selectedProgram}
      isIndependent={isIndependent}
      parentPlusDenied={parentPlusDenied}
      aidPackage={aidPackage}
      settings={settings}
      scholarshipAmount={scholarshipAmount}
      seogAmount={seogAmount}
      termMonths={termMonths}
      monthlyPayment={monthlyPayment}
      interestRate={interestRate}
    />
    </>
  );
}
