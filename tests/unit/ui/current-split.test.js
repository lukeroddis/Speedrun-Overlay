/**
 * tests/unit/ui/current-split.test.js
 * LiveSplit.CurrentSplit: the widget over a hand-driven state and clock: the first split before
 * a run, the live split, holding a finished split with its glow, the run summary after the
 * last split (kept through LiveSplit's reset until the next start), undo / skip / new splits,
 * the hold and after-run settings, a reload after finishing and a hidden widget.
 */

(function () {
  "use strict";

  const { mountHtml } = window.TestUtils;
  const CS = window.LiveSplit.CurrentSplit;
  const KEYS = window.LiveSplit.Storage.KEYS;
  const FLASHES = window.LiveSplit.SplitCard.FLASH_CLASSES;

  const locked = (signedSeconds, stateClass, splitTimeSec) => ({
    deltaInfo: { text: window.LiveSplit.Time.formatDeltaSeconds(signedSeconds), isAhead: signedSeconds < 0, signedSeconds },
    stateClass,
    splitTimeSec
  });

  function makeState() {
    return {
      splitsList: ["Alpha", "Bravo", "Charlie"],
      splitIcons: [],
      currentTimingMethod: "GameTime",
      currentComparison: "Personal Best",
      comparisonsDataGT: { "Personal Best": [10, 25, 45] },
      comparisonsDataRT: {},
      comparisonTimes: [10, 25, 45],
      comparisonTimesGT: [10, 25, 45],
      comparisonTimesRT: [],
      bestSegmentTimesGT: [9, 13, 18],
      bestSegmentTimesRT: [],
      currentIndex: -1,
      lockedDeltas: {},
      completedSplitTimes: {},
      lastElapsedSec: 0,
      runBaseline: null
    };
  }

  // Splits split `i` (0-based) at cumulative `time`, coloured `stateClass`
  function split(state, i, time, stateClass, delta = -1) {
    state.completedSplitTimes[i] = time;
    state.lockedDeltas[i] = locked(delta, stateClass, time);
    state.currentIndex = i + 1;
    state.lastElapsedSec = time;
  }

  function withSettings(fn) {
    const saved = [KEYS.CURRENT_SPLIT_HOLD, KEYS.CURRENT_SPLIT_AFTER_RUN, KEYS.CURRENT_SPLIT_ROWS].map((k) => [k, localStorage.getItem(k)]);
    try {
      saved.forEach(([k]) => localStorage.removeItem(k));
      return fn();
    } finally {
      saved.forEach(([k, v]) => (v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v)));
    }
  }

  function setup() {
    const dom = mountHtml(`<div id="cs-root"><div id="cs-card"></div></div>`);
    const state = makeState();
    const clock = { t: 1000 };
    const widget = CS.createCurrentSplitWidget({
      el: dom.el("cs-card"), root: dom.el("cs-root"), getState: () => state, now: () => clock.t
    });
    const card = dom.el("cs-card");
    const step = (ms = 33) => { clock.t += ms; widget.update(); };
    const glow = () => FLASHES.find((c) => card.classList.contains(c)) || null;
    return { dom, state, clock, widget, card, step, glow };
  }

  describe("Current Split widget (LiveSplit.CurrentSplit)", () => {
    it("settings: hold seconds (default 3) and what follows a run (default the summary), validated", () => withSettings(() => {
      assertEqual([CS.getHoldSeconds(), CS.getAfterRun()], [3, "summary"]);
      localStorage.setItem(KEYS.CURRENT_SPLIT_HOLD, "42");
      localStorage.setItem(KEYS.CURRENT_SPLIT_AFTER_RUN, "confetti");
      assertEqual([CS.getHoldSeconds(), CS.getAfterRun()], [3, "summary"], "out of range falls back");
      const { dom, widget } = setup();
      try {
        widget.setHoldSeconds(5);
        widget.setAfterRun("lastSplit");
        assertEqual([CS.getHoldSeconds(), CS.getAfterRun()], [5, "lastSplit"]);
        widget.setHoldSeconds("x");
        widget.setAfterRun("x");
        assertEqual([CS.getHoldSeconds(), CS.getAfterRun()], [3, "summary"]);
      } finally {
        dom.remove();
      }
    }));

    it("rows: chosen segment rows and the possible save, stored in a fixed order", () => withSettings(() => {
      assertEqual(CS.getRows(), [...CS.ROW_OPTIONS], "all by default");
      localStorage.setItem(KEYS.CURRENT_SPLIT_ROWS, "{broken");
      assertEqual(CS.getRows(), [...CS.ROW_OPTIONS], "unreadable: all");
      const info = { segments: [{ id: "run", seconds: 1 }, { id: "pb", seconds: 2 }, { id: "wr", seconds: 3 }], possibleSave: 1.5 };
      assert(CS.withRows(info, [...CS.ROW_OPTIONS]) === info, "all rows: unchanged");
      const some = CS.withRows(info, ["wr", "run"]);
      assertEqual([some.segments.map((r) => r.id), some.possibleSave], [["run", "wr"], null]);
      assertEqual(CS.withRows(null, []), null);

      const { dom, state, widget, card, step } = setup();
      try {
        state.currentIndex = 0;
        state.lastElapsedSec = 4;
        widget.update();
        assert(card.textContent.includes("PB") && card.textContent.includes("Possible save"));
        widget.setRows(["best", "nope", "pb"]);
        assertEqual(localStorage.getItem(KEYS.CURRENT_SPLIT_ROWS), JSON.stringify(["pb", "best"]));
        assert(card.textContent.includes("PB") && card.textContent.includes("Best"), "applied straight away");
        assert(!card.textContent.includes("This run") && !card.textContent.includes("Possible save"));
        widget.setRows("x");
        step();
        assert(!card.textContent.includes("Segment"), "no rows: no table");
        split(state, 0, 9, "gold");
        step();
        assert(!card.textContent.includes("Segment"), "a held split too");
      } finally {
        dom.remove();
      }
    }));

    it("flashTypeFor: the leaderboard's glow colour, none for skipped or uncompared splits", () => {
      assertEqual(CS.flashTypeFor(locked(-1, "gold", 10)), "gold");
      assertEqual(CS.flashTypeFor(locked(-1, "ahead-gaining", 10)), "green");
      assertEqual(CS.flashTypeFor(locked(1, "behind-losing", 10)), "red");
      assertEqual(CS.flashTypeFor(locked(0, "uncoloured", 10)), null);
      assertEqual(CS.flashTypeFor(locked(0, "gold", null)), null);
      assertEqual(CS.flashTypeFor(undefined), null);
    });

    it("follows a run: first split, live split, held split with its glow, then the next", () => withSettings(() => {
      const { dom, state, widget, card, step, glow } = setup();
      try {
        widget.update();
        assertEqual(widget.getMode(), "live");
        assert(card.textContent.includes("Alpha") && card.textContent.includes("Expected"), "the first split, upcoming");

        state.currentIndex = 0;
        state.lastElapsedSec = 4;
        step();
        const live = card.querySelector("[data-live]");
        assert(live && live.textContent === "4.0", "the live segment");
        state.lastElapsedSec = 5;
        step();
        assert(card.querySelector("[data-live]") === live && live.textContent === "5.0", "ticked as text, not rebuilt");

        split(state, 0, 8.5, "gold", -1.5);
        step();
        assertEqual([widget.getMode(), glow()], ["hold", "split-flash-gold"]);
        assertEqual(card.style.getPropertyValue("--split-flash-duration"), "3000ms", "the glow lasts the hold");
        assert(card.textContent.includes("Alpha") && card.textContent.includes("-1.5"), "the split just finished");
        assert(!card.querySelector("[data-live]"));

        state.lastElapsedSec = 11;
        step(2900);
        assertEqual(widget.getMode(), "hold", "still within the hold");
        step(200);
        assertEqual([widget.getMode(), glow()], ["live", null], "on to the next split, glow over");
        assert(card.textContent.includes("Bravo") && card.querySelector("[data-live]").textContent === "2.5");
      } finally {
        dom.remove();
      }
    }));

    it("a finished run: held last split, then the summary, kept through a reset until the next start", () => withSettings(() => {
      const { dom, state, card, widget, step, glow } = setup();
      try {
        widget.update();
        state.currentIndex = 0;
        step();
        state.runBaseline = window.LiveSplit.RunSummary.captureRunBaseline(state);
        split(state, 0, 9, "ahead-gaining");
        step();
        split(state, 1, 22, "gold");
        state.bestSegmentTimesGT[1] = 13; // the run's gold, committed
        step(4000);
        split(state, 2, 50, "behind-losing", 5);
        state.comparisonTimesGT = [9, 22, 50]; // even a PB commit leaves the summary on the copy
        step();
        assertEqual([widget.getMode(), glow()], ["hold", "split-flash-red"]);
        assert(card.textContent.includes("Charlie"));
        step(3100);
        assertEqual(widget.getMode(), "summary");
        assert(card.textContent.includes("Run complete") && card.textContent.includes("+5.0") && !card.textContent.includes("New PB"));

        // LiveSplit's reset (where it asks to save times) clears the run; the summary stays
        state.currentIndex = -1;
        state.lockedDeltas = {};
        state.completedSplitTimes = {};
        step();
        assertEqual(widget.getMode(), "summary");
        assert(card.textContent.includes("Run complete"));

        state.currentIndex = 0;
        step();
        assertEqual(widget.getMode(), "live");
        assert(card.textContent.includes("Alpha"), "the next run starts fresh");
      } finally {
        dom.remove();
      }
    }));

    it("after-run 'last split', no hold (glow on the next card), undo, skips and a reset mid-run", () => withSettings(() => {
      const { dom, state, card, widget, step, glow } = setup();
      try {
        widget.setHoldSeconds(0);
        widget.setAfterRun("lastSplit");
        state.currentIndex = 0;
        step();
        split(state, 0, 9, "ahead-gaining");
        step();
        assertEqual([widget.getMode(), glow()], ["live", "split-flash-green"], "straight to the next split, still glowing");
        assertEqual(card.style.getPropertyValue("--split-flash-duration"), "2000ms");
        assert(card.textContent.includes("Bravo"));

        // Undo: back to the first split, no glow
        state.currentIndex = 0;
        delete state.lockedDeltas[0];
        step();
        assertEqual(glow(), null);
        assert(card.textContent.includes("Alpha"));

        // A skipped split: no glow
        state.currentIndex = 1;
        state.lockedDeltas[0] = locked(0, "uncoloured", null);
        step();
        assertEqual(glow(), null);

        split(state, 1, 22, "behind-gaining");
        step();
        split(state, 2, 41, "ahead-gaining");
        step();
        assertEqual(widget.getMode(), "finished");
        assert(card.textContent.includes("Charlie") && card.textContent.includes("Split 3 / 3"), "the last split stays up");

        widget.setAfterRun("summary");
        assertEqual(widget.getMode(), "summary", "switching applies straight away");

        // Restarting from the finished run without a reset to -1 (straight to split 0) starts fresh
        state.currentIndex = 0;
        state.lockedDeltas = {};
        state.completedSplitTimes = {};
        step();
        assertEqual(widget.getMode(), "live");

        // A reset mid-run drops a held split
        widget.setHoldSeconds(3);
        split(state, 0, 9, "gold");
        step();
        assertEqual(widget.getMode(), "hold");
        state.currentIndex = -1;
        state.lockedDeltas = {};
        step();
        assertEqual([widget.getMode(), glow()], ["live", null]);
      } finally {
        dom.remove();
      }
    }));

    it("other splits, no splits, a reload after finishing, and nothing while hidden", () => withSettings(() => {
      const { dom, state, card, widget, step } = setup();
      try {
        state.currentIndex = 0;
        widget.update();
        split(state, 0, 9, "gold");
        step();
        state.splitsList = ["Only"];
        state.currentIndex = -1;
        step();
        assertEqual(widget.getMode(), "live", "a held split from other splits is dropped");
        assert(card.textContent.includes("Only"));

        state.splitsList = [];
        step();
        assertEqual(widget.getMode(), "empty");
        assert(card.textContent.includes("Load splits"));

        dom.el("cs-root").classList.add("is-hidden");
        state.splitsList = ["Only"];
        step();
        assert(card.textContent.includes("Load splits"), "hidden: not redrawn");
        dom.el("cs-root").classList.remove("is-hidden");
        widget.refresh();
        assert(card.textContent.includes("Only"), "shown again: redrawn");
      } finally {
        dom.remove();
      }

      const reload = setup();
      try {
        const s = reload.state;
        split(s, 0, 9, "ahead-gaining");
        split(s, 1, 22, "ahead-gaining");
        split(s, 2, 41, "ahead-gaining", -4);
        reload.widget.update();
        assertEqual(reload.widget.getMode(), "summary", "restored in-run state of a finished run");
        assert(reload.card.textContent.includes("New PB"));
      } finally {
        reload.dom.remove();
      }

      const noCard = CS.createCurrentSplitWidget({ el: null });
      noCard.update();
      noCard.refresh();
      assertEqual(noCard.getMode(), "", "no element: does nothing");
    }));
  });
})();
