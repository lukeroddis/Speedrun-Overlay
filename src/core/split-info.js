/**
 * src/core/split-info.js - Split Info View Model
 *
 * Pure: everything worth knowing about one split, read from the overlay state, for the
 * track's hover tooltip (src/ui/split-tooltip.js):
 * - name, icon, position ("3 / 18")
 * - status: done (delta, colour class, split time), current (expected segment, live segment),
 *   upcoming (expected segment and split time against the active comparison) or skipped
 * - segment durations: this run, PB, best (gold), average and World Record (only when the
 *   splits carry a real World Record comparison), plus the possible time save vs the gold
 * Times use the active timing method.
 */

(function () {
  "use strict";

  const isTime = (v) => typeof v === "number" && isFinite(v) && v > 0;

  /** Duration of split i on a cumulative curve (null when either end is unknown). */
  function segmentFromCurve(curve, i) {
    if (!curve || !isTime(curve[i])) return null;
    if (i === 0) return curve[0];
    if (!isTime(curve[i - 1])) return null;
    const d = curve[i] - curve[i - 1];
    return d > 0 ? d : null;
  }

  /** The splits' own World Record comparison (never the Best Segments fallback ghosts use). */
  function findWorldRecordCurve(compData) {
    const key = Object.keys(compData || {}).find((k) => {
      const low = k.toLowerCase();
      return low.includes("world record") || low === "wr";
    });
    const curve = key ? compData[key] : null;
    return curve && curve.some(isTime) ? curve : null;
  }

  /**
   * @param {Object} state - The overlay state (OverlayState, src/core/overlay-state.js)
   * @param {number} index - Split index
   * @returns {Object|null} null for an index outside the splits
   */
  function buildSplitInfo(state, index) {
    const s = state || {};
    const splits = s.splitsList || [];
    if (!(index >= 0 && index < splits.length)) return null;

    const isRT = s.currentTimingMethod === "RealTime";
    const compData = (isRT ? s.comparisonsDataRT : s.comparisonsDataGT) || {};
    const golds = (isRT ? s.bestSegmentTimesRT : s.bestSegmentTimesGT) || [];
    const pbCurve = compData["Personal Best"] || (isRT ? s.comparisonTimesRT : s.comparisonTimesGT);
    const completed = s.completedSplitTimes || {};
    const locked = (s.lockedDeltas || {})[index];
    const current = typeof s.currentIndex === "number" ? s.currentIndex : -1;

    let status = "upcoming";
    if (current >= 0 && index < current) status = locked && locked.splitTimeSec === null ? "skipped" : "done";
    else if (current >= 0 && index === current) status = "current";

    const prevSplit = index === 0 ? 0 : completed[index - 1];
    const runSegment = status === "done" && isTime(completed[index]) && (index === 0 || isTime(prevSplit))
      ? completed[index] - prevSplit : null;
    const liveSegment = status === "current" && isTime(s.lastElapsedSec) && (index === 0 || isTime(prevSplit))
      ? Math.max(0, s.lastElapsedSec - prevSplit) : null;

    const pbSegment = segmentFromCurve(pbCurve, index);
    const bestSegment = isTime(golds[index]) ? golds[index] : null;
    const segments = [
      { id: "run", label: status === "current" ? "This run (live)" : "This run", seconds: runSegment ?? liveSegment },
      { id: "pb", label: "PB", seconds: pbSegment },
      { id: "best", label: "Best", seconds: bestSegment },
      { id: "average", label: "Average", seconds: segmentFromCurve(compData["Average Segments"], index) },
      { id: "wr", label: "WR", seconds: segmentFromCurve(findWorldRecordCurve(compData), index) }
    ].filter((row) => row.seconds !== null && row.seconds !== undefined);

    const expected = s.comparisonTimes ? s.comparisonTimes[index] : null;
    const notYet = status === "current" || status === "upcoming";
    const save = pbSegment !== null && bestSegment !== null ? pbSegment - bestSegment : null;

    return {
      index,
      name: splits[index],
      icon: (s.splitIcons || [])[index] || null,
      position: `${index + 1} / ${splits.length}`,
      status,
      delta: status === "done" && locked && locked.deltaInfo ? locked.deltaInfo.text || "" : "",
      stateClass: status === "done" && locked ? locked.stateClass || "" : "",
      splitTime: status === "done" && locked && isTime(locked.splitTimeSec) ? locked.splitTimeSec : null,
      // Against the active comparison: the segment to aim for, and where the split lands
      expectedSegment: notYet ? segmentFromCurve(s.comparisonTimes, index) : null,
      expectedTime: notYet && isTime(expected) ? expected : null,
      segments,
      possibleSave: save !== null && save >= 0.05 ? save : null
    };
  }

  window.LiveSplit = window.LiveSplit || {};
  window.LiveSplit.SplitInfo = {
    segmentFromCurve,
    findWorldRecordCurve,
    buildSplitInfo
  };
})();
