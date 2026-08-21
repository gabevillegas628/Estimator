import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import LoadingScreen from "../src/components/LoadingScreen.jsx";

describe("LoadingScreen", () => {
  it("announces the wait to a screen reader, in both variants", () => {
    // The skeleton itself is aria-hidden decoration, so this sentence is the
    // only thing announced — losing it would make the wait silent.
    for (const variant of ["gate", "app"]) {
      const markup = renderToStaticMarkup(<LoadingScreen variant={variant} />);
      expect(markup).toContain('role="status"');
      expect(markup).toContain("Loading");
      expect(markup).toContain('aria-hidden="true"');
    }
  });

  it("keeps the gate variant to the shape of the password card", () => {
    // Before the session check answers, the reader may not be signed in at all.
    // An estimator skeleton here would sketch out a screen they are not
    // entitled to and may never see.
    const gate = renderToStaticMarkup(<LoadingScreen variant="gate" />);
    const app = renderToStaticMarkup(<LoadingScreen variant="app" />);

    expect(gate).toContain("max-w-sm");
    expect(gate).not.toContain("max-w-3xl");
    expect(app).toContain("max-w-3xl");
  });

  it("defaults to the estimator skeleton", () => {
    expect(renderToStaticMarkup(<LoadingScreen />)).toContain("max-w-3xl");
  });
});
