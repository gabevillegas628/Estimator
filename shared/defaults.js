// Seed data and school-wide defaults. Imported by BOTH the client (initial
// render before the API responds) and the server (seeding an empty database),
// which is why it lives outside src/ and stays free of any browser or React
// dependency.

export const DEFAULT_PROGRAMS = [
  { id: "cos", name: "Cosmetology", totalCost: 15500, downPayment: 3150, clockHours: 1200, lengthWeeks: 40 },
  { id: "bar", name: "Barbering", totalCost: 14000, downPayment: 2500, clockHours: 900, lengthWeeks: 30 },
  { id: "est", name: "Esthetics", totalCost: 8500, downPayment: 800, clockHours: 600, lengthWeeks: 20 },
  { id: "nail", name: "Nail Technology", totalCost: 4800, downPayment: 400, clockHours: 300, lengthWeeks: 12 },
];

export const DEFAULT_SETTINGS = {
  awardYearLabel: "2026-27",
  awardYearMax: 7395,
  awardYearMin: 740,
  academicYearHours: 900,
  crossoverNote: "",
  defaultTermMonths: 18,
  defaultInterestRate: 0,
  originationFeePct: 1.057,
  loanLimits: {
    dependent: {
      year1: { sub: 3500, total: 5500 },
      year2: { sub: 4500, total: 6500 },
      year3: { sub: 5500, total: 7500 },
    },
    independent: {
      year1: { sub: 3500, total: 9500 },
      year2: { sub: 4500, total: 10500 },
      year3: { sub: 5500, total: 12500 },
    },
    aggregateDependentSub: 23000,
    aggregateDependentTotal: 31000,
    aggregateIndependentSub: 23000,
    aggregateIndependentTotal: 57500,
  },
};

export const DEPENDENCY_CRITERIA = [
  { key: "age24", label: "Born before Jan. 1, 2003 (24 or older for 2026–27)" },
  { key: "married", label: "Currently married" },
  { key: "gradSchool", label: "Starting a master's or doctorate program" },
  { key: "activeDuty", label: "Active-duty U.S. armed forces (other than training)" },
  { key: "veteran", label: "Veteran of the U.S. armed forces" },
  { key: "dependents", label: "Has dependents (not a spouse) who get more than half their support from the student" },
  { key: "orphanWard", label: "Orphan, in foster care, or a ward of the court at any time since age 13" },
  { key: "emancipated", label: "Legally emancipated minor, or in court-ordered legal guardianship" },
  { key: "homeless", label: "Determined an unaccompanied homeless or at-risk youth (on/after July 1, 2025)" },
];

// Settings rows read from the database may predate a new field, so every load
// is folded over the defaults rather than trusted wholesale. Nested loanLimits
// tiers need their own merge — a shallow spread would drop year2/year3 if a
// stored blob only carried year1.
export function mergeSettings(saved) {
  if (!saved) return DEFAULT_SETTINGS;
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    loanLimits: {
      ...DEFAULT_SETTINGS.loanLimits,
      ...(saved.loanLimits || {}),
      dependent: { ...DEFAULT_SETTINGS.loanLimits.dependent, ...((saved.loanLimits || {}).dependent || {}) },
      independent: { ...DEFAULT_SETTINGS.loanLimits.independent, ...((saved.loanLimits || {}).independent || {}) },
    },
  };
}
