import { describe, it, expect } from "vitest";

import {
  formatAwardYear,
  normalizeAwardYearStart,
  mergeSettings,
  DEFAULT_SETTINGS,
} from "../shared/defaults.js";

describe("formatAwardYear", () => {
  it("writes the span the way the payment letter does", () => {
    expect(formatAwardYear(2026)).toBe("2026-27");
    expect(formatAwardYear(2030)).toBe("2030-31");
  });

  it("keeps both digits of a year that ends in a single digit", () => {
    // 2009-1 would be nobody's idea of an award year.
    expect(formatAwardYear(2009)).toBe("2009-10");
    expect(formatAwardYear(2099)).toBe("2099-00");
  });
});

describe("normalizeAwardYearStart", () => {
  it("takes a plausible year, in whatever form it arrives", () => {
    expect(normalizeAwardYearStart(2026)).toBe(2026);
    expect(normalizeAwardYearStart("2026")).toBe(2026);
  });

  it("returns null rather than guessing at anything else", () => {
    for (const value of ["", "abc", null, undefined, NaN, 42, 1999, 20260, {}]) {
      expect(normalizeAwardYearStart(value)).toBeNull();
    }
  });
});

describe("mergeSettings award year", () => {
  it("reads the year out of a row that predates the field", () => {
    // The migration case that matters: a row where staff had already moved the
    // label on. Snapping it back to the default would silently re-age every
    // dependency date on the screen.
    expect(mergeSettings({ awardYearLabel: "2029-30" }).awardYearStart).toBe(2029);
    expect(mergeSettings({ awardYearLabel: "2029-30" }).awardYearLabel).toBe("2029-30");
  });

  it("reads a label staff typed loosely, since it was free text at the time", () => {
    expect(mergeSettings({ awardYearLabel: "AY 2028-29" }).awardYearStart).toBe(2028);
    expect(mergeSettings({ awardYearLabel: "2028-2029" }).awardYearStart).toBe(2028);
  });

  it("falls back to the default when a legacy label says nothing usable", () => {
    expect(mergeSettings({ awardYearLabel: "next year" }).awardYearStart).toBe(DEFAULT_SETTINGS.awardYearStart);
    expect(mergeSettings({}).awardYearStart).toBe(DEFAULT_SETTINGS.awardYearStart);
  });

  it("prefers the stored year over any label beside it", () => {
    // Once the number exists it is the only source. A label left over from the
    // free-text era must not be able to argue with it.
    const merged = mergeSettings({ awardYearStart: 2031, awardYearLabel: "1999-00" });
    expect(merged.awardYearStart).toBe(2031);
    expect(merged.awardYearLabel).toBe("2031-32");
  });

  it("recomputes the label rather than trusting a stored one", () => {
    expect(mergeSettings({ awardYearStart: 2027, awardYearLabel: "whatever" }).awardYearLabel).toBe("2027-28");
    expect(mergeSettings({ awardYearStart: "abc" }).awardYearLabel).toBe(formatAwardYear(DEFAULT_SETTINGS.awardYearStart));
  });

  it("leaves the rest of the settings alone", () => {
    // The award year handling sits inside the same merge that protects nested
    // loan tiers, so it is worth pinning that it did not disturb them.
    const merged = mergeSettings({ awardYearLabel: "2029-30", awardYearMax: 7500, loanLimits: { year1: undefined } });
    expect(merged.awardYearMax).toBe(7500);
    expect(merged.loanLimits.dependent.year2).toEqual(DEFAULT_SETTINGS.loanLimits.dependent.year2);
    expect(merged.academicYearHours).toBe(DEFAULT_SETTINGS.academicYearHours);
  });
});
