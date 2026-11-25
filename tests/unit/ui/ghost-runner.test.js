/**
 * tests/unit/ui/ghost-runner.test.js
 * Off-screen edge pills (LiveSplit.GhostRunner.renderEdgePill) and the track's has-pins flag
 */

(function () {
  "use strict";

  describe("Ghost Runner: off-screen edge pills", () => {
    it("renders a race competitor's avatar URL as an image, not text", () => {
      const el = document.createElement("div");
      const url = "https://static-cdn.jtvnw.net/jtv_user_pictures/racer-profile_image-150x150.png";
      window.LiveSplit.GhostRunner.renderEdgePill(el, [
        { ghostInfo: { id: "racer", icon: url, color: "#f59e0b" }, deltaStr: "+3.2", isAhead: false }
      ], "❮", true);

      const img = el.querySelector("img.ghost-edge-avatar");
      assert(img !== null, "avatar rendered as an image");
      assertEqual(img.getAttribute("src"), url);
      assert(!el.textContent.includes("https://"), "URL is not shown as text");
    });

    it("keeps emoji ghost icons and escapes anything else", () => {
      const el = document.createElement("div");
      window.LiveSplit.GhostRunner.renderEdgePill(el, [
        { ghostInfo: { id: "wr", icon: "🏆" }, deltaStr: "-1.0", isAhead: true },
        { ghostInfo: { id: "bad", icon: "<b>x</b>" }, deltaStr: "+2.0", isAhead: false }
      ], "❯", false);

      assert(el.textContent.includes("🏆"), "emoji icon kept");
      assert(el.querySelector("b") === null, "icon text is escaped");
    });
  });

  describe("Ghost Runner: ghosts on / off", () => {
    it("off remembers the chosen ghosts and on brings them back, also across reloads", () => {
      const KEYS = window.LiveSplit.Storage.KEYS;
      const keys = [KEYS.ACTIVE_GHOSTS, KEYS.GHOST_COMPARISON, KEYS.LAST_GHOSTS];
      const saved = keys.map((k) => [k, localStorage.getItem(k)]);
      const runner = () => window.LiveSplit.GhostRunner.createGhostRunner({ getSplitsList: () => ["A", "B"], getLastElapsedSec: () => 0 });
      try {
        keys.forEach((k) => localStorage.removeItem(k));
        localStorage.setItem(KEYS.ACTIVE_GHOSTS, JSON.stringify(["wr", "best"]));
        const r = runner();
        assert(r.areGhostsEnabled());
        r.setGhostsEnabled(false);
        assertEqual(r.getActiveGhostComparisons(), ["off"]);
        r.setGhostsEnabled(true);
        assertEqual(r.getActiveGhostComparisons(), ["wr", "best"], "selection restored");

        r.setGhostsEnabled(false);
        const reloaded = runner();
        assert(!reloaded.areGhostsEnabled());
        reloaded.setGhostsEnabled(true);
        assertEqual(reloaded.getActiveGhostComparisons(), ["wr", "best"], "remembered in storage");

        localStorage.removeItem(KEYS.LAST_GHOSTS);
        localStorage.setItem(KEYS.ACTIVE_GHOSTS, JSON.stringify(["off"]));
        const fresh = runner();
        fresh.setGhostsEnabled(true);
        assertEqual(fresh.getActiveGhostComparisons(), ["pb"], "PB when nothing was ever chosen");
      } finally {
        saved.forEach(([k, v]) => (v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v)));
      }
    });
  });

  describe("Ghost Runner: off-screen pills with a sliding track window", () => {
    it("a ghost in the splits hidden before the window becomes a left edge pill", () => {
      const KEYS = window.LiveSplit.Storage.KEYS;
      const saved = localStorage.getItem(KEYS.ACTIVE_GHOSTS);
      // The test page has the track but not the edge pills
      const dom = window.TestUtils.mountHtml('<div id="ghost-edge-left" style="display: none;"></div><div id="ghost-edge-right" style="display: none;"></div>');
      const left = dom.el("ghost-edge-left");
      const splits = Array.from({ length: 10 }, (_, i) => `S${i}`);
      const times = splits.map((_, i) => (i + 1) * 10);
      const runner = (windowStart) => window.LiveSplit.GhostRunner.createGhostRunner({
        getSplitsList: () => splits,
        getComparisonTimes: () => times,
        getCurrentIndex: () => 6,
        getGhostInfo: () => ({ id: "wr", name: "World Record", icon: "🏆", color: "#facc15", times }),
        getTrackWindowStart: () => windowStart
      });
      try {
        localStorage.setItem(KEYS.ACTIVE_GHOSTS, JSON.stringify(["wr"]));
        runner(5).updateGhostRunner(25); // the ghost is in segment 2, the window starts at split 5
        assertEqual(left.style.display, "flex", "left pill shown");
        assert(left.textContent.includes("❮"), "pointing left");
      } finally {
        if (saved === null) localStorage.removeItem(KEYS.ACTIVE_GHOSTS); else localStorage.setItem(KEYS.ACTIVE_GHOSTS, saved);
        dom.remove();
        document.getElementById("ghost-marker-wr")?.style.setProperty("display", "none");
      }
    });
  });

  describe("Ghost Runner: pin lane flag", () => {
    it("marks the track has-pins only while ghost pins are switched on", () => {
      const KEYS = window.LiveSplit.Storage.KEYS;
      const track = document.getElementById("track");
      const savedGhosts = localStorage.getItem(KEYS.ACTIVE_GHOSTS);
      const hadFlag = track.classList.contains("has-pins");
      const runnerWith = (ghosts) => {
        localStorage.setItem(KEYS.ACTIVE_GHOSTS, JSON.stringify(ghosts));
        return window.LiveSplit.GhostRunner.createGhostRunner({ getSplitsList: () => ["A", "B"] });
      };
      try {
        runnerWith(["off"]).updateGhostRunner(null);
        assert(!track.classList.contains("has-pins"), "no lane with ghosts off");
        runnerWith(["wr"]).updateGhostRunner(null);
        assert(track.classList.contains("has-pins"), "lane reserved before the run starts, so text does not jump");
      } finally {
        if (savedGhosts === null) localStorage.removeItem(KEYS.ACTIVE_GHOSTS); else localStorage.setItem(KEYS.ACTIVE_GHOSTS, savedGhosts);
        track.classList.toggle("has-pins", hadFlag);
      }
    });
  });

  describe("Ghost Runner: pins outside a run", () => {
    const preview = window.LiveSplit.GhostRunner.pinPreviewTime;

    it("pinPreviewTime is halfway through the second split on screen", () => {
      assertEqual(preview([10, 30, 60], 0), 20, "split 1 runs 10s to 30s");
      assertEqual(preview([10, 30, 60, 100], 2), 80, "windowed: second split shown is split 3");
      assertEqual(preview([10, null, 60, 100], 0), 80, "skips splits without a usable time");
      assertEqual(preview([10], 0), 5, "a single split: halfway through it");
      assertEqual(preview([], 0), 0, "nothing to preview");
      assertEqual(preview([null, null], 0), 0);
      assertEqual(preview(undefined), 0);
    });

    // A small track of our own (ids win over the runner page's), the "test" ghost switched on
    function withIdleRunner(opts, fn) {
      const KEYS = window.LiveSplit.Storage.KEYS;
      const savedGhosts = localStorage.getItem(KEYS.ACTIVE_GHOSTS);
      const dom = window.TestUtils.mountHtml(`
        <div id="ghost-edge-left" style="display: none;"></div><div id="ghost-edge-right" style="display: none;"></div>
        <div id="track-viewport" style="width: 800px;"><div id="track" class="track" style="position: relative; display: flex;">
          <div id="node-start" style="width: 100px;"></div>
          <div id="item-0" class="split-item" style="width: 100px;"></div>
          <div id="item-1" class="split-item" style="width: 100px;"></div>
          <div id="item-2" class="split-item" style="width: 100px;"></div>
        </div></div>`);
      const times = [10, 30, 60];
      let editing = !!opts.editing;
      let elapsed = opts.elapsed || 0;
      localStorage.setItem(KEYS.ACTIVE_GHOSTS, JSON.stringify(opts.ghosts || ["test"]));
      const runner = window.LiveSplit.GhostRunner.createGhostRunner({
        getSplitsList: () => ["A", "B", "C"],
        getComparisonTimes: () => times,
        getLastElapsedSec: () => elapsed,
        getGhostInfo: (id) => (id === "test" ? { id: "test", name: "Test", icon: "T", color: "#fff", times } : null)
      });
      const marker = () => document.getElementById("ghost-marker-test");
      const shown = () => !!marker() && marker().style.display !== "none";
      try {
        return window.TestUtils.stubProps(window.hudLayout, { isEditMode: () => editing }, () => fn({
          runner, track: dom.el("track"), shown,
          setEditing: (v) => { editing = v; },
          setElapsed: (v) => { elapsed = v; }
        }));
      } finally {
        marker()?.remove();
        dom.remove();
        if (savedGhosts === null) localStorage.removeItem(KEYS.ACTIVE_GHOSTS); else localStorage.setItem(KEYS.ACTIVE_GHOSTS, savedGhosts);
      }
    }

    it("reserves the pin room before the run, so the track keeps its size when the timer starts", () => withIdleRunner({}, ({ runner, track, shown }) => {
      runner.refreshIdlePins();
      assert(track.classList.contains("has-pins"), "room reserved with no run");
      assert(!shown(), "no pins drawn outside Edit Layout Mode");
    }));

    it("draws preview pins in Edit Layout Mode and takes them away when locked", () => withIdleRunner({}, ({ runner, shown, setEditing }) => {
      setEditing(true);
      runner.refreshIdlePins();
      assert(shown(), "preview pin while editing");
      setEditing(false);
      runner.refreshIdlePins();
      assert(!shown(), "gone once the layout is locked");
    }));

    it("switching a ghost on while editing previews it straight away", () => withIdleRunner({ editing: true, ghosts: ["off"] }, ({ runner, track, shown }) => {
      runner.refreshIdlePins();
      assert(!shown() && !track.classList.contains("has-pins"), "nothing while ghosts are off");
      runner.setGhostComparison("test");
      assert(shown() && track.classList.contains("has-pins"), "previewed and room reserved");
    }));

    it("a run in progress shows its own pins, not the preview, even before LiveSplit ticks", () => withIdleRunner({ editing: true, elapsed: 50 }, ({ runner, shown, setEditing }) => {
      setEditing(false);
      runner.refreshIdlePins();
      assert(shown(), "a restored run's pins are drawn at its elapsed time");
    }));
  });
})();
