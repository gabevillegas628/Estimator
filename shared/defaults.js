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

// The award year is stored as the year it opens, not as a label. Everything
// dated follows from that one number, so there is no second field able to
// contradict it and nothing downstream has to parse what a human typed.
const DEFAULT_AWARD_YEAR_START = 2026;

export const DEFAULT_SETTINGS = {
  awardYearStart: DEFAULT_AWARD_YEAR_START,
  // Derived, and re-derived on every read and write in mergeSettings. It stays
  // on the object because the whole UI displays it; it is never what is edited.
  awardYearLabel: formatAwardYear(DEFAULT_AWARD_YEAR_START),
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

// Award years are one-year spans opening July 1, so the year one opens settles
// everything dated about it: the label staff read, the age-24 cutoff, and the
// window a homeless determination has to fall in. Two of the nine criteria
// below carry a date, and neither is an independent fact to keep up to date --
// both fall out of that single year.
//
// Deliberately NOT taken from the system clock. The award year in play is not
// the calendar year — staff package 2026-27 from early 2026 through mid-2027,
// so any clock rule is wrong for months at a stretch. Worse, awardYearMax and
// awardYearMin are figures only Congress sets and only a human can enter here.
// A clock that rolled these criteria into 2027-28 while the Pell maximum still
// held 2026-27's number would put two award years on one screen and be
// confidently wrong about both. Tied to the stored year, the whole screen moves
// together or not at all.
const MIN_AWARD_YEAR = 2000;
const MAX_AWARD_YEAR = 2099;

export function formatAwardYear(startYear) {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

// Null rather than a guess, so a caller can decide what to do about a year it
// cannot trust instead of quietly rendering one.
export function normalizeAwardYearStart(value) {
  const year = Math.trunc(Number(value));
  return Number.isFinite(year) && year >= MIN_AWARD_YEAR && year <= MAX_AWARD_YEAR ? year : null;
}

export function dependencyCriteria(awardYearStart = DEFAULT_SETTINGS.awardYearStart) {
  const start = normalizeAwardYearStart(awardYearStart);

  // A student is independent if they turn 24 before the award year ends, which
  // is to say born before Jan. 1 of the year 24 years before it closes. The
  // homeless determination counts from July 1 of the year before it opens.
  //
  // A year that cannot be trusted drops the date rather than printing a wrong
  // one: staff overriding an ISIR against a date this tool invented is exactly
  // the failure the note above this list warns about.
  const age24 = start
    ? `Born before Jan. 1, ${start + 1 - 24} (24 or older for ${formatAwardYear(start)})`
    : "24 or older by the end of the award year";
  const homeless = start
    ? `Determined an unaccompanied homeless or at-risk youth (on/after July 1, ${start - 1})`
    : "Determined an unaccompanied homeless or at-risk youth (on/after July 1 of the year before the award year)";

  return [
    { key: "age24", label: age24 },
    { key: "married", label: "Currently married" },
    { key: "gradSchool", label: "Starting a master's or doctorate program" },
    { key: "activeDuty", label: "Active-duty U.S. armed forces (other than training)" },
    { key: "veteran", label: "Veteran of the U.S. armed forces" },
    { key: "dependents", label: "Has dependents (not a spouse) who get more than half their support from the student" },
    { key: "orphanWard", label: "Orphan, in foster care, or a ward of the court at any time since age 13" },
    { key: "emancipated", label: "Legally emancipated minor, or in court-ordered legal guardianship" },
    { key: "homeless", label: homeless },
  ];
}

// Settings rows read from the database may predate a new field, so every load
// is folded over the defaults rather than trusted wholesale. Nested loanLimits
// tiers need their own merge — a shallow spread would drop year2/year3 if a
// stored blob only carried year1.
export function mergeSettings(saved) {
  if (!saved) return DEFAULT_SETTINGS;

  // Rows written before the award year became a number carry only the label, so
  // the year is read out of it once, here, at the edge. Nothing downstream ever
  // parses it again — and a row that predates the field entirely still lands on
  // the year it was actually set to rather than snapping back to the default.
  const awardYearStart =
    normalizeAwardYearStart(saved.awardYearStart) ??
    normalizeAwardYearStart(/(\d{4})/.exec(String(saved.awardYearLabel ?? ""))?.[1]) ??
    DEFAULT_SETTINGS.awardYearStart;

  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    awardYearStart,
    // Recomputed, never taken from the row: a stored label is at best a copy of
    // this and at worst a contradiction of it.
    awardYearLabel: formatAwardYear(awardYearStart),
    loanLimits: {
      ...DEFAULT_SETTINGS.loanLimits,
      ...(saved.loanLimits || {}),
      dependent: { ...DEFAULT_SETTINGS.loanLimits.dependent, ...((saved.loanLimits || {}).dependent || {}) },
      independent: { ...DEFAULT_SETTINGS.loanLimits.independent, ...((saved.loanLimits || {}).independent || {}) },
    },
  };
}
