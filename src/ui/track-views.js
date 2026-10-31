/**
 * src/ui/track-views.js - Track Views (how the splits are drawn)
 *
 * Each view is one entry in TRACK_VIEWS. Every view shares the same track DOM, windowing,
 * colours, live segment fill and ghost pins; picking a view only puts a `view-<id>` class
 * on #track, and that view's stylesheet restyles the parts. Adding a view = one entry
 * here plus one stylesheet (linked in index.html after the track styles).
 *
 * View fields:
 * - id / label: stored in track style "trackView" / shown in settings (keep labels to 10
 *   characters so the view picker stays buttons rather than a dropdown)
 * - text: { names, deltas, times } shown by default; the user's choices are kept per view in
 *   track style "viewText" ({ [viewId]: { names, deltas, times } })
 * - segmentsAreSplits: the bar leading into a node stands for that split (no Start node or
 *   dots drawn), so the first visible split keeps its bar and text sits along it
 */

(function () {
  "use strict";

  const TRACK_VIEWS = Object.freeze([
    Object.freeze({
      id: "network",
      label: "Network",
      text: Object.freeze({ names: true, deltas: true, times: true }),
      segmentsAreSplits: false
    }),
    Object.freeze({
      id: "minimalist",
      label: "Minimalist",
      text: Object.freeze({ names: false, deltas: false, times: false }),
      segmentsAreSplits: true
    })
  ]);

  const DEFAULT_TRACK_VIEW = "network";
  const TRACK_VIEW_IDS = Object.freeze(TRACK_VIEWS.map((v) => v.id));
  const TRACK_VIEW_LABELS = Object.freeze(Object.fromEntries(TRACK_VIEWS.map((v) => [v.id, v.label])));
  const VIEW_CLASSES = Object.freeze(TRACK_VIEWS.map((v) => `view-${v.id}`));
  // names: split names; deltas: the +/- against the comparison; times: the split / target time
  const TEXT_PARTS = Object.freeze(["names", "deltas", "times"]);

  /** The view definition for an id, falling back to the default view. */
  function getTrackView(id) {
    return TRACK_VIEWS.find((v) => v.id === id) || TRACK_VIEWS.find((v) => v.id === DEFAULT_TRACK_VIEW);
  }

  /** Which split text a style shows for its view: the user's choice, else the view's default. */
  function resolveTrackText(style) {
    const s = style || {};
    const view = getTrackView(s.trackView);
    const saved = (s.viewText && s.viewText[view.id]) || {};
    return Object.fromEntries(TEXT_PARTS.map((part) =>
      [part, typeof saved[part] === "boolean" ? saved[part] : view.text[part]]));
  }

  /**
   * A new viewText map with one part (names / deltas / times) set for the style's current view.
   * Never mutates the style's map (the default style's map is frozen).
   */
  function withTrackText(style, part, value) {
    const s = style || {};
    const view = getTrackView(s.trackView);
    const next = Object.assign({}, s.viewText);
    if (TEXT_PARTS.includes(part)) {
      next[view.id] = Object.assign({}, resolveTrackText(s), { [part]: !!value });
    }
    return next;
  }

  window.LiveSplit = window.LiveSplit || {};
  window.LiveSplit.TrackViews = {
    TRACK_VIEWS,
    DEFAULT_TRACK_VIEW,
    TRACK_VIEW_IDS,
    TRACK_VIEW_LABELS,
    VIEW_CLASSES,
    TEXT_PARTS,
    getTrackView,
    resolveTrackText,
    withTrackText
  };
})();
