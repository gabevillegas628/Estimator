// The handful of style constants that more than one entry point needs. The rest
// of the palette lives inline in the components, Tailwind-style; these are here
// because the loading skeletons render INSTEAD of the app shell and so cannot
// inherit the font faces or the page background from it.

export const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');`;

export const SHELL_CLASSES = "min-h-screen flex items-center justify-center bg-[#F0EEE8] text-[#232530]";

// One color per coverageSegments() key. The grouping is the message: greens are
// gift aid the student keeps, wines are borrowed and repaid, amber is the part
// still owed — the same amber the down-payment bar already uses for its gap, so
// the two bars mean the same thing by the same color.
export const COVERAGE_COLORS = {
  pell: "#6B8F71",
  grants: "#4A7C59",
  credit: "#9CB79F",
  sub: "#7A3B54",
  unsub: "#A9738A",
  due: "#D9A15B",
};
