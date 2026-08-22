import { describe, it, expect } from "vitest";

import { dependencyCriteria, DEFAULT_SETTINGS } from "../shared/defaults.js";

const labelFor = (criteria, key) => criteria.find((c) => c.key === key).label;

describe("dependencyCriteria", () => {
  it("reproduces the dates the list used to hardcode", () => {
    // 2026-27 was the award year these nine were written against, so it is the
    // one case where the derived text can be checked against a known-good
    // answer rather than against itself.
    const criteria = dependencyCriteria(2026);
    expect(labelFor(criteria, "age24")).toBe("Born before Jan. 1, 2003 (24 or older for 2026-27)");
    expect(labelFor(criteria, "homeless")).toContain("on/after July 1, 2025");
  });

  it("moves both dates when the award year moves", () => {
    const next = dependencyCriteria(2027);
    expect(labelFor(next, "age24")).toBe("Born before Jan. 1, 2004 (24 or older for 2027-28)");
    expect(labelFor(next, "homeless")).toContain("on/after July 1, 2026");

    const later = dependencyCriteria(2030);
    expect(labelFor(later, "age24")).toContain("Jan. 1, 2007");
    expect(labelFor(later, "homeless")).toContain("July 1, 2029");
  });

  it("drops the date rather than inventing one it cannot trust", () => {
    // Staff overriding an ISIR against a date this tool made up is precisely
    // the failure the note above this list exists to prevent. undefined is not
    // in this list on purpose: it is "no argument", which takes the default
    // award year, and the last test in this file pins that.
    for (const year of ["abc", "", null, 42, 20260, 1999, NaN]) {
      const criteria = dependencyCriteria(year);
      expect(labelFor(criteria, "age24")).toBe("24 or older by the end of the award year");
      expect(labelFor(criteria, "homeless")).not.toMatch(/July 1, \d/);
    }
  });

  it("keeps all nine criteria, whatever the year", () => {
    // The common shorthand ("24 or older unless married or has kids") misses
    // several of these; losing one to a formatting branch would be silent.
    const keys = ["age24", "married", "gradSchool", "activeDuty", "veteran", "dependents", "orphanWard", "emancipated", "homeless"];
    for (const year of [2026, "nonsense"]) {
      expect(dependencyCriteria(year).map((c) => c.key)).toEqual(keys);
    }
  });

  it("falls back to the default award year when called with nothing", () => {
    expect(dependencyCriteria()).toEqual(dependencyCriteria(DEFAULT_SETTINGS.awardYearStart));
  });
});
