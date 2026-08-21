import React from "react";

import { FONT_IMPORT, SHELL_CLASSES } from "../lib/theme.js";

// Skeletons rather than the word "Loading", because both of these resolve into
// a known layout: the shape is already decided before the data arrives, so the
// page can stop moving under the reader the moment it does.
//
// Two variants for two different waits. "gate" runs before the session check
// answers, when the only thing that can legitimately appear next is the
// password card -- an estimator skeleton there would promise numbers to someone
// who may not be signed in at all. "app" runs after, while programs and
// settings load into a screen the reader is entitled to see.
function Bar({ className = "" }) {
  return <div className={`rounded bg-[#E7E3D8] ${className}`} />;
}

function Card({ children }) {
  return <div className="bg-white rounded-lg border border-[#DDD8CA] p-5 space-y-3">{children}</div>;
}

export default function LoadingScreen({ variant = "app" }) {
  // One live region for the whole screen: the skeleton itself is decoration and
  // is hidden, so this sentence is the only thing a screen reader gets.
  const announcement = (
    <span role="status" aria-live="polite" className="sr-only">
      Loading…
    </span>
  );

  if (variant === "gate") {
    return (
      <div style={{ fontFamily: "'IBM Plex Sans', sans-serif" }} className={SHELL_CLASSES}>
        <style>{FONT_IMPORT}</style>
        {announcement}
        <div className="w-full max-w-sm px-5 animate-pulse" aria-hidden="true">
          <div className="bg-white rounded-lg border border-[#DDD8CA] p-6 space-y-3">
            <Bar className="h-3 w-24" />
            <Bar className="h-6 w-3/4" />
            <Bar className="h-9 w-full mt-4" />
            <Bar className="h-9 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', sans-serif" }} className="min-h-screen bg-[#F0EEE8] text-[#232530]">
      <style>{FONT_IMPORT}</style>
      {announcement}

      <div className="border-b border-[#C9C4B8]">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between animate-pulse" aria-hidden="true">
          <div className="space-y-2">
            <Bar className="h-6 w-56" />
            <Bar className="h-3 w-64" />
          </div>
          <div className="flex gap-2">
            <Bar className="h-8 w-20" />
            <Bar className="h-8 w-24" />
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 pt-6 space-y-5 animate-pulse" aria-hidden="true">
        <Card>
          <Bar className="h-3 w-20" />
          <Bar className="h-9 w-full" />
          <div className="grid grid-cols-2 gap-4 pt-1">
            <Bar className="h-9" />
            <Bar className="h-9" />
          </div>
        </Card>
        <Card>
          <Bar className="h-4 w-40" />
          <Bar className="h-2.5 w-full" />
          <div className="grid grid-cols-3 gap-2 pt-1">
            <Bar className="h-8" />
            <Bar className="h-8" />
            <Bar className="h-8" />
          </div>
        </Card>
      </div>
    </div>
  );
}
