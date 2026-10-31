/**
 * tests/unit/ui/track-views.test.js
 * LiveSplit.TrackViews: the view list, lookup with fallback, and the per-view split
 * text (names / deltas / times) defaults and saved choices.
 */

(function () {
  "use strict";

  const V = window.LiveSplit.TrackViews;

  describe("Track Views (LiveSplit.TrackViews)", () => {
    it("lists Network (the default) and Minimalist with unique ids and short labels", () => {
      assertEqual(V.TRACK_VIEW_IDS, ["network", "minimalist"]);
      assertEqual(V.DEFAULT_TRACK_VIEW, "network");
      assertEqual(V.TRACK_VIEW_LABELS, { network: "Network", minimalist: "Minimalist" });
      assert(Object.values(V.TRACK_VIEW_LABELS).every((l) => l.length <= 10), "labels fit view picker buttons");
      assertEqual(V.TEXT_PARTS, ["names", "deltas", "times"]);
      assertEqual(V.VIEW_CLASSES, ["view-network", "view-minimalist"]);
      assert(Object.isFrozen(V.TRACK_VIEWS) && V.TRACK_VIEWS.every((v) => Object.isFrozen(v)));
    });

    it("getTrackView falls back to the default view for unknown or missing ids", () => {
      assertEqual(V.getTrackView("minimalist").id, "minimalist");
      assertEqual(V.getTrackView("nope").id, "network");
      assertEqual(V.getTrackView(undefined).id, "network");
      assert(V.getTrackView("minimalist").segmentsAreSplits);
      assert(!V.getTrackView("network").segmentsAreSplits);
    });

    it("resolveTrackText uses the view's defaults until the user picks", () => {
      assertEqual(V.resolveTrackText({}), { names: true, deltas: true, times: true }, "Network shows all");
      assertEqual(V.resolveTrackText({ trackView: "minimalist" }), { names: false, deltas: false, times: false }, "Minimalist shows none");
      assertEqual(V.resolveTrackText(null), { names: true, deltas: true, times: true });
      const style = { trackView: "minimalist", viewText: { minimalist: { deltas: true }, network: { names: false } } };
      assertEqual(V.resolveTrackText(style), { names: false, deltas: true, times: false }, "a saved part wins, a missing one defaults");
      assertEqual(V.resolveTrackText(Object.assign({}, style, { trackView: "network" })), { names: false, deltas: true, times: true });
    });

    it("withTrackText returns a new map for the current view and never mutates the style's", () => {
      const viewText = Object.freeze({ network: Object.freeze({ names: false, deltas: true, times: true }) });
      const style = { trackView: "minimalist", viewText };
      const next = V.withTrackText(style, "names", true);
      assertEqual(next, { network: { names: false, deltas: true, times: true }, minimalist: { names: true, deltas: false, times: false } });
      assert(next !== viewText && !("minimalist" in viewText));
      assertEqual(V.withTrackText({}, "times", 0), { network: { names: true, deltas: true, times: false } }, "values are booleans");
      assertEqual(V.withTrackText({}, "bogus", true), {}, "unknown parts are ignored");
    });
  });
})();
