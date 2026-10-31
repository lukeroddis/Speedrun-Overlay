/**
 * tests/unit/core/split-info.test.js
 * LiveSplit.SplitInfo: segment durations from cumulative curves, the splits' own World
 * Record comparison, and the per-split view model (status, delta, expected time, segment
 * rows, possible save) over hand-made state and a real .lss (Final Fantasy X has a WR).
 */

(function () {
  "use strict";

  const SI = window.LiveSplit.SplitInfo;
  const fixture = (prefix) => window.TestFixtures[Object.keys(window.TestFixtures).find((n) => n.startsWith(prefix))];

  function makeState(overrides = {}) {
    return Object.assign({
      splitsList: ["A", "B", "C"],
      splitIcons: ["data:image/png;base64,AAAA", null, null],
      currentTimingMethod: "GameTime",
      comparisonsDataGT: {
        "Personal Best": [10, 25, 45],
        "Average Segments": [11, 27, 48],
        "Best Segments": [9, 22, 40]
      },
      comparisonsDataRT: {},
      bestSegmentTimesGT: [9, 13, 18],
      comparisonTimes: [10, 25, 45],
      currentComparison: "Personal Best",
      currentIndex: -1,
      lockedDeltas: {},
      completedSplitTimes: {},
      lastElapsedSec: 0
    }, overrides);
  }

  const segIds = (info) => info.segments.map((r) => [r.id, Math.round(r.seconds * 10) / 10]);

  describe("Split Info (LiveSplit.SplitInfo)", () => {
    it("segmentFromCurve diffs neighbours and gives null where either end is unknown", () => {
      assertEqual(SI.segmentFromCurve([10, 25, null, 60], 0), 10);
      assertEqual(SI.segmentFromCurve([10, 25, null, 60], 1), 15);
      assertEqual(SI.segmentFromCurve([10, 25, null, 60], 2), null);
      assertEqual(SI.segmentFromCurve([10, 25, null, 60], 3), null, "previous split unknown");
      assertEqual(SI.segmentFromCurve([10, 8], 1), null, "never negative");
      assertEqual(SI.segmentFromCurve(null, 0), null);
    });

    it("findWorldRecordCurve only takes a real World Record comparison", () => {
      assertEqual(SI.findWorldRecordCurve({ "World Record": [5, 9] }), [5, 9]);
      assertEqual(SI.findWorldRecordCurve({ wr: [5, 9] }), [5, 9]);
      assertEqual(SI.findWorldRecordCurve({ "World Record": [null, 0] }), null, "empty WR");
      assertEqual(SI.findWorldRecordCurve({ "Best Segments": [5, 9] }), null, "no Best Segments fallback");
    });

    it("an upcoming split shows the expected time and its segment rows", () => {
      const info = SI.buildSplitInfo(makeState(), 1);
      assertEqual([info.name, info.position, info.status, info.expectedSegment, info.expectedTime], ["B", "2 / 3", "upcoming", 15, 25]);
      assertEqual(info.icon, null);
      assertEqual(segIds(info), [["pb", 15], ["best", 13], ["average", 16]]);
      assertEqual(info.possibleSave, 2, "PB segment minus gold");
      assertEqual(SI.buildSplitInfo(makeState(), 0).icon, "data:image/png;base64,AAAA");
    });

    it("a done split shows its delta, colour, split time and this run's segment", () => {
      const state = makeState({
        currentIndex: 2,
        completedSplitTimes: { 0: 9.5, 1: 23 },
        lockedDeltas: { 1: { deltaInfo: { text: "-2.0" }, stateClass: "ahead-gaining", splitTimeSec: 23 } }
      });
      const info = SI.buildSplitInfo(state, 1);
      assertEqual([info.status, info.delta, info.stateClass, info.splitTime, info.expectedSegment, info.expectedTime], ["done", "-2.0", "ahead-gaining", 23, null, null]);
      assertEqual(segIds(info)[0], ["run", 13.5]);
    });

    it("the current split shows a live segment; skipped splits and bad indexes are handled", () => {
      const state = makeState({
        currentIndex: 2,
        completedSplitTimes: { 0: 10 },
        lockedDeltas: { 1: { deltaInfo: { text: "-" }, stateClass: "uncoloured", splitTimeSec: null } },
        lastElapsedSec: 37
      });
      const current = SI.buildSplitInfo(state, 2);
      assertEqual([current.status, current.expectedSegment, current.expectedTime], ["current", 20, 45]);
      assertEqual(current.segments.find((r) => r.id === "run"), undefined, "no live segment after a skipped split");
      assertEqual(SI.buildSplitInfo(state, 1).status, "skipped");
      const live = SI.buildSplitInfo(Object.assign(state, { completedSplitTimes: { 0: 10, 1: 30 } }), 2).segments[0];
      assertEqual([live.label, live.seconds], ["This run (live)", 7]);
      assertEqual(SI.buildSplitInfo(state, 3), null);
      assertEqual(SI.buildSplitInfo(state, -1), null);
      assertEqual(SI.buildSplitInfo(null, 0), null);
    });

    it("reads the active timing method and the splits' WR comparison from a real file", () => {
      const parsed = window.LiveSplit.SplitEngine.parseLssXml(fixture("Final Fantasy X"));
      const state = makeState({
        splitsList: parsed.splitsList,
        splitIcons: parsed.splitIcons,
        comparisonsDataGT: parsed.comparisonsDataGT,
        comparisonsDataRT: parsed.comparisonsDataRT,
        bestSegmentTimesGT: parsed.bestSegmentTimesGT,
        bestSegmentTimesRT: parsed.bestSegmentTimesRT,
        comparisonTimes: parsed.comparisonsDataGT["Personal Best"]
      });
      const ids = SI.buildSplitInfo(state, 3).segments.map((r) => r.id);
      assertEqual(ids, ["pb", "best", "average", "wr"]);
      const rt = SI.buildSplitInfo(Object.assign({}, state, { currentTimingMethod: "RealTime" }), 3);
      const gt = SI.buildSplitInfo(state, 3);
      assert(rt.segments[0].seconds !== gt.segments[0].seconds, "RealTime curves are used for RealTime");
    });
  });
})();
