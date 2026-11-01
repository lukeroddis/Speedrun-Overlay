/**
 * tests/unit/core/run-summary.test.js
 * LiveSplit.RunSummary: the pre-run copy of PB and golds, swapping it into a split card's state,
 * and the finished run summary (PB result, golds, gain / loss, splits ahead, delta line,
 * Sum of Best and WR) against that copy rather than what the run committed.
 */

(function () {
  "use strict";

  const RS = window.LiveSplit.RunSummary;
  const SI = window.LiveSplit.SplitInfo;

  const locked = (signedSeconds, stateClass, splitTimeSec) => ({
    deltaInfo: { text: window.LiveSplit.Time.formatDeltaSeconds(signedSeconds), isAhead: signedSeconds < 0, signedSeconds },
    stateClass,
    splitTimeSec
  });

  function makeState(overrides = {}) {
    return Object.assign({
      splitsList: ["A", "B", "C"],
      currentTimingMethod: "GameTime",
      currentComparison: "Personal Best",
      comparisonsDataGT: { "Personal Best": [10, 25, 45], "World Record": [8, 20, 38] },
      comparisonsDataRT: {},
      comparisonTimesGT: [10, 25, 45],
      comparisonTimesRT: [11, 27, 48],
      bestSegmentTimesGT: [9, 13, 18],
      bestSegmentTimesRT: [10, 14, 19],
      currentIndex: 3,
      completedSplitTimes: { 0: 9.5, 1: 22, 2: 41 },
      lockedDeltas: { 0: locked(-0.5, "ahead-gaining", 9.5), 1: locked(-3, "gold", 22), 2: locked(-4, "ahead-gaining", 41) }
    }, overrides);
  }

  describe("Run Summary (LiveSplit.RunSummary)", () => {
    it("captureRunBaseline copies the PB curves and golds, so later changes do not reach it", () => {
      const state = makeState();
      const base = RS.captureRunBaseline(state);
      assertEqual(base, { splitsCount: 3, pbGT: [10, 25, 45], pbRT: [11, 27, 48], goldsGT: [9, 13, 18], goldsRT: [10, 14, 19] },
        "PB from the splits' own comparison, else the loaded targets");
      state.bestSegmentTimesGT[1] = 12.5;
      state.comparisonsDataGT["Personal Best"][2] = 41;
      assertEqual(base.goldsGT[1], 13);
      assertEqual(base.pbGT[2], 45);
      assertEqual(RS.captureRunBaseline(null), { splitsCount: 0, pbGT: [], pbRT: [], goldsGT: [], goldsRT: [] });
    });

    it("withRunBaseline: a split card built from it compares against the times before the run", () => {
      const state = makeState({ bestSegmentTimesGT: [9, 12.5, 18], comparisonTimesGT: [9.5, 22, 41] });
      const base = RS.captureRunBaseline(makeState());
      const info = SI.buildSplitInfo(RS.withRunBaseline(state, base), 1);
      const best = info.segments.find((r) => r.id === "best");
      assertEqual(best.seconds, 13, "the gold this split beat, not its own segment");
      assertEqual(state.bestSegmentTimesGT[1], 12.5, "the state itself is left alone");
      assert(RS.withRunBaseline(state, null) === state, "no baseline: the state as is");
      assert(RS.withRunBaseline(state, Object.assign({}, base, { splitsCount: 5 })) === state, "a baseline for other splits is ignored");
    });

    it("buildRunSummary: final time, PB result, golds and time saved, gain, splits ahead, delta line, SoB and WR", () => {
      const base = RS.captureRunBaseline(makeState());
      // The run committed its PB and gold onto the state; the summary still reads the copy
      const state = makeState({ bestSegmentTimesGT: [9, 12.5, 18], comparisonTimesGT: [9.5, 22, 41] });
      state.comparisonsDataGT["Personal Best"] = [9.5, 22, 41];
      const s = RS.buildRunSummary(state, base);
      assertEqual([s.splitsCount, s.finalTime, s.comparison, s.delta, s.stateClass], [3, 41, "Personal Best", "-4.0", "ahead-gaining"]);
      assertEqual([s.isNewPb, s.pbDelta], [true, -4]);
      assertEqual(s.golds.count, 1, "B: 12.5 beat 13 (A and C did not)");
      assert(Math.abs(s.golds.saved - 0.5) < 1e-9);
      assertEqual(s.biggestGain, { index: 1, name: "B", seconds: 2.5 });
      assertEqual(s.biggestLoss, null, "every segment beat its PB segment");
      assertEqual(s.ahead, { count: 3, total: 3 });
      assertEqual(s.deltas.map((d) => d.seconds), [-0.5, -3, -4]);
      assertEqual([s.sobDelta, s.wrDelta], [1, 3], "vs 9 + 13 + 18 = 40, and the WR's 38");
    });

    it("buildRunSummary: a slower run, skipped and uncompared splits, Real Time and missing data", () => {
      const slow = makeState({
        completedSplitTimes: { 1: 26, 2: 50 },
        lockedDeltas: { 0: locked(0, "uncoloured", null), 1: locked(1, "behind-losing", 26), 2: locked(5, "behind-losing", 50) }
      });
      const s = RS.buildRunSummary(slow, null);
      assertEqual([s.isNewPb, s.pbDelta, s.stateClass], [false, 5, "behind-losing"]);
      assertEqual(s.biggestLoss, { index: 2, name: "C", seconds: 4 }, "24 vs 20; B spans the skip, so it is no segment of this run");
      assertEqual([s.biggestGain, s.golds.count], [null, 0]);
      assertEqual(s.ahead, { count: 0, total: 2 }, "the skipped split is not compared");

      const rt = RS.buildRunSummary(makeState({ currentTimingMethod: "RealTime", completedSplitTimes: { 0: 9, 1: 22, 2: 45 } }), null);
      assertEqual([rt.pbDelta, rt.sobDelta, rt.wrDelta], [-3, 2, null], "Real Time curves: PB 48, SoB 43, no WR");
      assertEqual([rt.golds.count, rt.golds.saved], [2, 2], "A and B beat 10 and 14 by a second each");

      const bare = RS.buildRunSummary(makeState({
        comparisonsDataGT: {}, comparisonTimesGT: [], bestSegmentTimesGT: [9, null, 18], lockedDeltas: {}
      }), null);
      assertEqual([bare.isNewPb, bare.pbDelta, bare.sobDelta, bare.wrDelta, bare.delta], [true, null, null, null, ""], "a first run is a PB");

      assertEqual(RS.buildRunSummary(makeState({ completedSplitTimes: { 0: 9.5 } }), null), null, "not finished");
      assertEqual(RS.buildRunSummary(makeState({ splitsList: [] }), null), null);
      assertEqual(RS.buildRunSummary(null, null), null);
    });
  });
})();
