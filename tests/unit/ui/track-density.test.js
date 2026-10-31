/**
 * tests/unit/ui/track-density.test.js
 * LiveSplit.TrackDensity: Fit All spacing per track view, and no 40° angle while split
 * names are switched off.
 */

(function () {
  "use strict";

  const KEYS = window.LiveSplit.Storage.KEYS;

  describe("Track Density (LiveSplit.TrackDensity)", () => {
    it("Fit All counts the Start node, unless the view's bars are the splits", () => {
      const density = window.LiveSplit.TrackDensity.createTrackDensityController();
      // 1048px wide: 1000px of room after the 24px side paddings
      assertEqual(density.computeSpacing(false, "all", true, 1048, 800, 9), 100, "9 splits + Start");
      assertEqual(density.computeSpacing(false, "all", true, 1048, 800, 9, true), 111, "9 bars only");
      // 1040px tall: 1000px of room after the 16 / 24px paddings
      assertEqual(density.computeSpacing(true, "all", true, 800, 1040, 9), 100);
      assertEqual(density.computeSpacing(true, "all", true, 800, 1040, 9, true), 111);
      assertEqual(density.computeSpacing(false, "all", true, 1048, 800, 0, true), 1000, "no splits: one slot");
    });

    it("never tilts split names that are switched off", () => {
      const track = document.getElementById("track");
      const origClass = track.className;
      const origAngle = localStorage.getItem(KEYS.SPLIT_ANGLE);
      const origSpacing = document.documentElement.style.getPropertyValue("--node-spacing");
      try {
        localStorage.setItem(KEYS.SPLIT_ANGLE, "angled");
        track.classList.remove("vertical");
        const density = window.LiveSplit.TrackDensity.createTrackDensityController();
        density.update();
        assert(track.classList.contains("angled-text"), "an explicit 40° angle tilts names");
        track.classList.add("hide-split-names");
        density.update();
        assert(!track.classList.contains("angled-text"), "hidden names stay flat");
      } finally {
        track.className = origClass;
        if (origAngle === null) localStorage.removeItem(KEYS.SPLIT_ANGLE);
        else localStorage.setItem(KEYS.SPLIT_ANGLE, origAngle);
        document.documentElement.style.setProperty("--node-spacing", origSpacing);
      }
    });
  });
})();
