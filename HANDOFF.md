# Down Payment Estimator — Handoff Doc

Internal staff tool for a cosmetology school's merged admissions/financial aid
department. Given a student's SAI, program, and dependency status, it estimates
Pell Grant, federal loan eligibility, down payment gap, and a monthly payment
plan for whatever's left. **Estimate only — not a system of record.**

React + Tailwind on Vite, with a small Express + Postgres backend. See
[README.md](README.md) for setup, environment variables, and deployment; this
document covers the domain reasoning behind the math.

---

## Status: the artifact-era caveats are resolved

This tool began as a Claude.ai artifact using `window.storage`, with no build
toolchain. Both are now dealt with, and the notes that used to head this file
are superseded:

- **Persistence** is Postgres, behind an Express API. The four
  `window.storage.*` calls are gone; the client now talks to `src/lib/api.js`
  and nothing else. `programs` is a real table written per row; `settings` is a
  singleton JSONB row. Data shapes below are unchanged.
- **Build toolchain** is Vite + Tailwind v4 + `lucide-react`, one Railway
  service serving both API and static build.
- **Access control** is a shared staff password over the whole tool. It did not
  exist before and is not optional on a public URL.
- **The aid math now has tests.** It moved out of the component into
  `src/lib/aid-calc.js`, and the two bugs described below — the Pell cap and
  the conflated proration ratios — have named regression tests in
  `test/aid-calc.test.js`. The "worth a regression test if this logic ever
  moves" note below has been acted on.

The original single-file version is preserved as `down-payment-estimator.jsx`
for reference. It is no longer the source of truth and is not built or served.

---

## Data model

```js
// One entry per program, in the `programs` array
{
  id: string,
  name: string,          // e.g. "Cosmetology"
  totalCost: number,     // TUITION ONLY — excludes down payment/kit fee.
                          // Prorates across periods by each period's SHARE
                          // OF TOTAL PROGRAM HOURS (see proration note below).
  downPayment: number,   // Books/kit or similar upfront CHARGE. Added
                          // entirely to Period 1's total — see "down payment
                          // is a charge, not a credit" below. This is the
                          // single most important non-obvious decision in
                          // the whole file; re-read that section before
                          // changing anything related to it.
  clockHours: number,    // Total program length in clock hours
  lengthWeeks: number,   // Total program length in weeks (used only for
                          // the Pell crossover date check, unrelated to
                          // the academic-year period math)
}

// Settings (school-wide, shared)
{
  awardYearLabel: "2026-27",
  awardYearMax: 7395,          // Update annually — see Pell section below
  awardYearMin: 740,
  academicYearHours: 900,      // School's defined academic year (hours).
                                // Drives BOTH Pell proration AND loan-period
                                // progression. Get this from the school's
                                // actual Title IV program definitions, not
                                // a guess.
  crossoverNote: "",           // Free text — school's Pell crossover policy
  defaultTermMonths: 18,
  defaultInterestRate: 0,
  originationFeePct: 1.057,    // Direct Loan origination fee — set by ED
                                // per award year
  loanLimits: {
    dependent:   { year1: {sub, total}, year2: {...}, year3: {...} },
    independent: { year1: {...}, year2: {...}, year3: {...} },
    aggregateDependentSub, aggregateDependentTotal,
    aggregateIndependentSub, aggregateIndependentTotal,
  },
}
```

---

## Core functions (all in `src/lib/aid-calc.js`)

- **`calculateScheduledPell`** — `Max Pell − SAI`, rounded to nearest $5,
  **capped at Max Pell** (SAI can go to −$1,500, which without the cap
  produces a number above the legal maximum — this was a real bug, fixed
  mid-build). Floors at Min Pell via the Min Pell Indicator flag, or $0 if
  neither flag applies and the calculated amount is below the minimum.

- **`computeAcademicYearPeriods(programHours, academicYearHours)`** — Splits
  a program into academic-year-length chunks: full periods until less than
  one academic year remains, then one final partial period. A 1200-hour
  program with a 900-hour academic year becomes `[{hours:900, fraction:1},
  {hours:300, fraction:0.333}]`.

- **`buildAidPackage(...)`** — The core packaging logic. For each period, in
  order: **Pell → Subsidized loan → Unsubsidized loan**, each capped at
  *whichever is lower*: that period's federal limit, or whatever's still
  needed after the previous step. **Not** automatically maxed to the
  ceiling — a period can leave loan headroom unused if the need is smaller
  than the limit. Any Pell/loan overage beyond a period's need carries
  forward (`creditPool`) to reduce the next period's need.

- **`findCrossoverBoundary`** — Unrelated to the above. Flags when a
  student's enrollment date + program length crosses a **Pell award year**
  boundary (July 1). This is a school policy decision (see Domain Notes),
  not something the tool resolves automatically.

- **`calculateMonthlyPayment`** — Standard amortization on whatever balance
  is left after the aid package. Handles 0% as plain division.

---

## The down payment fix (read this if the numbers look wrong)

Down payment used to be modeled as a **credit**, subtracted separately from
a period's need. There was also a separate `oneTimeFee` field modeled as a
**charge**, added to Period 1's tuition slice. These looked like two
different things but turned out to be the same real-world line item (a
books/kit-style fee) — which meant the same dollar amount was being both
added and subtracted, silently cancelling part of itself out and distorting
every downstream loan calculation.

**Current (correct) model:** down payment is a charge, folded entirely into
Period 1's total alongside prorated tuition. Pell reduces that *combined*
total in one shot — there's no special "down payment first" sequencing.
This matches how the real school worksheet computes its own "Adjusted
Total" row (Total − Pell, nothing fancier), and reproduces that worksheet's
numbers almost exactly (see Validation below). The down-payment progress
bar in the UI is informational only now — it doesn't drive a separate
calculation path, and the comment in the code says so explicitly.

**Two different proration ratios, don't conflate them:**
- Tuition prorates by a period's **share of total program hours**
  (`period.hours / totalProgramHours`).
- Pell and loan limits prorate by a period's **share of one academic year**
  (`period.fraction`, i.e. `period.hours / academicYearHours`).

These are only equal when the program is exactly one academic year long.
Conflating them was a second bug caught mid-build. It is now pinned by the
`"prorates tuition by program-hours share, NOT by academic-year fraction"`
test, which asserts both the correct figure and the specific wrong one the
bug produced.

---

## Domain research findings (don't rediscover these)

- **Award year ≠ academic year.** Award year is ED's July 1–June 30 cycle,
  used for Pell and for a loan's interest rate/origination fee (fixed at
  first disbursement). Academic year is the *school-defined* period (hours
  + weeks) used for loan annual limits and progression. A loan period can
  straddle July 1 with zero special handling — no "crossover" concept
  exists for loans the way it does for Pell.

- **Pell crossover payment periods** (a period straddling July 1) require a
  *school policy decision* about which award year to draw from — not
  something derivable from FAFSA data alone. Encoded as a free-text
  settings field (`crossoverNote`) rather than automated.

- **Direct Sub/Unsub annual and aggregate limits are set by statute**
  (34 CFR §685.203), unchanged since 2008 — unlike Pell's max/min, ED
  doesn't recalculate these yearly. Confirmed unchanged for 2026-27
  (OBBBA changed grad loans and Parent PLUS, not undergrad sub/unsub).
  Source of truth: FSA Handbook Vol. 8 (fsapartners.ed.gov), Ch. 4 for the
  limits, Ch. 6 for progression mechanics ("Annual Loan Limit Progression").

- **Loan packaging order is Pell → Sub → Unsub, need-capped per period**,
  confirmed against a real student worksheet — this is *not* the same as
  "assume everyone borrows the max," which was the tool's first (wrong)
  approximation and overstated aid by a meaningful margin in the validation
  case.

- **Origination fee** (1.057% at time of writing, editable in settings)
  reduces the *net* proceeds actually credited toward a balance — the loan
  limit ceiling is a gross/face figure.

- **FAFSA dependency status** is nine yes/no triggers (age 24+, married,
  grad school, active duty/veteran, has dependents, orphan/foster/ward
  since 13, emancipated minor/guardianship, homeless), any one of which
  makes a student independent — not just the common shorthand of
  "24-and-under unless married or has kids."

- **Truth-in-Lending Act / Regulation Z** can apply to an institutional
  payment plan if it carries a finance charge or more than 4 installments,
  when offered regularly (>25 times/year). Flagged inline in the UI when
  the term/rate would trigger it; not legal advice, just a nudge to check.

- **Naming collision:** "Independent Cosmetology" (a program/license name
  seen on a real worksheet) and FAFSA "Independent" dependency status are
  unrelated concepts that happen to share a word. Worth confirming actual
  program names with financial aid before they render next to a
  "Dependency status: Independent" label in the UI.

---

## Validated against real data

A real (redacted) student worksheet was used to check the math: SAI −1500,
independent, 1200-hour program, 900-hour academic year, down payment
(kit fee) unknown exact value.

**Matches almost exactly:** AY1 grade-1 loan limits ($3,500 sub / $6,000
unsub ceiling), AY2 grade-2 limits prorated by the 300/900 remainder
($1,500 / $2,000), Pell proration ($7,395 full + $2,465 for the 1/3
remainder), AY1 net loan amounts after origination fee (~$3,463 sub /
~$5,937 unsub vs. worksheet's $3,464 / $5,936), and the AY1-only balance
($1,857, matching exactly).

**Off by ~$13 (out of $1,857, on the AY2 remainder only):** most likely
explained by not knowing the real down payment figure precisely (assumed
$0 down payment gap in the reconstruction) or a rounding-direction
difference on the school's last increment — plausibly they round the final
draw up to zero out the balance exactly rather than truncating. Worth
resolving with real (non-redacted) numbers if exactness matters, but the
mechanism itself is confirmed correct.

---

## Known limitations / not modeled

- Subsidized loan eligibility isn't checked against full financial need
  (Cost of Attendance − SAI − other aid) — only against tuition, since the
  tool doesn't track non-tuition COA components (room/board, transportation,
  etc.). The number shown is a ceiling, not a guaranteed award.
- Doesn't track a student's prior borrowing against aggregate limits — that
  requires actual student records / NSLDS, not something a stateless
  estimator can know.
- Doesn't model the new 2026-27 less-than-full-time proration rule for
  loans (cosmetology programs are typically full-time, so lower priority).
- Grade-level progression assumes clean sequential periods from a staff-set
  starting grade; doesn't handle a student changing dependency status or
  transferring mid-program.
- Everything here is Title IV / federal only — no state grant programs, NJ
  Class Loan (visible in the real worksheet at $0 for this student), or
  institutional scholarships.

## Open questions for financial aid

- Exact down payment (kit fee) amounts per program, to replace placeholders.
- Whether a written Pell crossover policy already exists, or needs writing.
- Real program list: names, tuition, clock hours, lengths.
- Confirm the school's defined academic year (hours) per program — may not
  be uniform across programs.
