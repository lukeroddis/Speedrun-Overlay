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

    it("angledNameRise is the height of a name tilted 40°, with room for the current split's 8% zoom", () => {
      const rise = window.LiveSplit.TrackDensity.angledNameRise;
      // (100 * sin 40° + 20 * cos 40°) * 1.08 = 85.97...
      assertEqual(rise(100, 20), 86);
      assert(rise(160, 23) > rise(60, 23), "longer names need more room");
    });

    it("sizes the tilted names' room to the longest name, capped with an ellipsis", () => {
      // A visible track of our own (the runner page's is hidden, so nothing would measure)
      const dom = window.TestUtils.mountHtml(`
        <div id="track-viewport" style="width: 1200px;"><div id="track" class="track">
          <span class="split-name" style="position: absolute; white-space: nowrap; font-size: 17px;">Short</span>
          <span class="split-name" style="position: absolute; white-space: nowrap; font-size: 17px;">A much longer split name</span>
        </div></div>`);
      const track = dom.el("track");
      const names = [...track.querySelectorAll(".split-name")];
      const origAngle = localStorage.getItem(KEYS.SPLIT_ANGLE);
      const origSpacing = document.documentElement.style.getPropertyValue("--node-spacing");
      const { MAX_ANGLED_NAME_WIDTH, angledNameRise } = window.LiveSplit.TrackDensity;
      try {
        localStorage.setItem(KEYS.SPLIT_ANGLE, "angled");
        const density = window.LiveSplit.TrackDensity.createTrackDensityController();
        density.update();
        const widest = Math.min(MAX_ANGLED_NAME_WIDTH, Math.max(...names.map((n) => n.scrollWidth)));
        const lineHeight = Math.max(...names.map((n) => n.offsetHeight));
        assert(widest > 0 && lineHeight > 0, "names were measured");
        assertEqual(track.style.getPropertyValue("--angled-rise"), `${angledNameRise(widest, lineHeight)}px`);
        assertEqual(track.style.getPropertyValue("--angled-name-max"), `${MAX_ANGLED_NAME_WIDTH}px`);

        names[1].textContent = "x".repeat(200);
        density.update();
        assertEqual(track.style.getPropertyValue("--angled-rise"), `${angledNameRise(MAX_ANGLED_NAME_WIDTH, lineHeight)}px`, "a very long name is capped");

        localStorage.setItem(KEYS.SPLIT_ANGLE, "flat");
        density.update();
        assertEqual(track.style.getPropertyValue("--angled-rise"), "", "flat names drop it");
      } finally {
        dom.remove();
        if (origAngle === null) localStorage.removeItem(KEYS.SPLIT_ANGLE);
        else localStorage.setItem(KEYS.SPLIT_ANGLE, origAngle);
        document.documentElement.style.setProperty("--node-spacing", origSpacing);
      }
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
