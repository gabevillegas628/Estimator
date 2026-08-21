import React, { useEffect, useRef } from "react";
import { X, Printer } from "lucide-react";

// Collects the two identifying fields the printed worksheet wants but the
// estimator otherwise has no reason to know.
//
// These are deliberately NOT part of the estimator's own inputs and are never
// sent anywhere: they live in component state, go straight onto the printout,
// and are gone on reload. The database has no column that could hold them, and
// this keeps it that way.
export default function PrintDialog({
  studentName,
  setStudentName,
  dateOfBirth,
  setDateOfBirth,
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

  // The dialog itself carries .screen-only, so it disappears from the printout
  // without needing to be closed first.
  return (
    <div
      className="screen-only fixed inset-0 z-50 flex items-center justify-center p-6 bg-[#232530]/40 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="print-dialog-title"
        tabIndex={-1}
        className="fade-in bg-white w-full max-w-md rounded-lg border border-[#DDD8CA] shadow-xl focus:outline-none"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#DDD8CA]">
          <h2 id="print-dialog-title" className="serif text-xl text-[#232530]">
            Print estimate
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-md text-[#9A9584] hover:text-[#232530] hover:bg-[#E7E3D8] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div>
            <label htmlFor="print-name" className="text-sm font-medium text-[#232530]">
              Student name
            </label>
            <input
              id="print-name"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              autoFocus
              autoComplete="off"
              placeholder="Optional"
              className="mt-1.5 w-full border border-[#C9C4B8] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7A3B54]/40"
            />
          </div>

          <div>
            <label htmlFor="print-dob" className="text-sm font-medium text-[#232530]">
              Date of birth
            </label>
            <input
              id="print-dob"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className="mt-1.5 w-full border border-[#C9C4B8] rounded-md px-3 py-2 text-sm mono focus:outline-none focus:ring-2 focus:ring-[#7A3B54]/40"
            />
          </div>

          <p className="text-xs text-[#9A9584]">
            Both are optional and appear only on the printout. Nothing entered here is saved — it is gone when this page
            reloads, and the database has nowhere to store it.
          </p>

          <div className="rounded-md bg-[#F0EEE8] px-3 py-2.5 text-xs text-[#6B6656] space-y-1.5">
            <p>
              Choose <strong>Save as PDF</strong> as the destination in the print dialog to get a file.
            </p>
            <p>
              Under the browser's print options, turn off <strong>Headers and footers</strong> to keep the page URL and
              timestamp off the sheet, and leave <strong>Margins</strong> on <strong>Default</strong> — setting it to
              None overrides the page margins and prints edge to edge.
            </p>
          </div>
        </div>

        <div className="border-t border-[#DDD8CA] px-5 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-md bg-[#7A3B54] text-white text-sm font-medium px-4 py-2 hover:bg-[#633044] transition-colors"
          >
            <Printer size={15} />
            Print
          </button>
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
