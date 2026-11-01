/**
 * src/core/run-summary.js - Run Baseline & Finished Run Summary
 *
 * Pure helpers for the Current Split widget (src/ui/current-split.js):
 * - captureRunBaseline: copies the PB curve and golds when a run starts. Finishing a run commits
 *   a PB and in-run golds onto the live state, and LiveSplit may still keep or discard them on
 *   reset, so comparisons against "before this run" read this copy instead.
 * - withRunBaseline: the overlay state with the baseline's PB and golds swapped in (shallow copy),
 *   so a split card built from it compares against the pre-run times
 * - buildRunSummary: what a finished run did: final time and delta, PB result, golds and time
 *   saved, biggest gain / loss vs PB, splits ahead, a delta line per split, vs Sum of Best and WR
 * Times use the active timing method.
 */

(function () {
  "use strict";

  const isTime = (v) => typeof v === "number" && isFinite(v) && v > 0;
  const copy = (arr) => (Array.isArray(arr) ? [...arr] : []);
  const { segmentFromCurve, findWorldRecordCurve } = window.LiveSplit.SplitInfo;

  /** The PB curve buildSplitInfo reads: the splits' own Personal Best, else the loaded targets. */
  function pbCurveOf(state, isRT) {
    const compData = (isRT ? state.comparisonsDataRT : state.comparisonsDataGT) || {};
    return compData["Personal Best"] || (isRT ? state.comparisonTimesRT : state.comparisonTimesGT);
  }

  /**
   * @param {Object} state - The overlay state (OverlayState)
   * @returns {RunBaseline}
   */
  function captureRunBaseline(state) {
    const s = state || {};
    return {
      splitsCount: (s.splitsList || []).length,
      pbGT: copy(pbCurveOf(s, false)),
      pbRT: copy(pbCurveOf(s, true)),
      goldsGT: copy(s.bestSegmentTimesGT),
      goldsRT: copy(s.bestSegmentTimesRT)
    };
  }

  function baselineFits(state, baseline) {
    return !!(baseline && baseline.splitsCount === (state.splitsList || []).length);
  }

  /** The state with the baseline's PB and golds in place (the state itself without a fitting baseline). */
  function withRunBaseline(state, baseline) {
    if (!state || !baselineFits(state, baseline)) return state;
    return Object.assign({}, state, {
      comparisonTimesGT: baseline.pbGT,
      comparisonTimesRT: baseline.pbRT,
      comparisonsDataGT: Object.assign({}, state.comparisonsDataGT, { "Personal Best": baseline.pbGT }),
      comparisonsDataRT: Object.assign({}, state.comparisonsDataRT, { "Personal Best": baseline.pbRT }),
      bestSegmentTimesGT: baseline.goldsGT,
      bestSegmentTimesRT: baseline.goldsRT
    });
  }

  /**
   * @param {Object} state - The overlay state (OverlayState)
   * @param {RunBaseline|null} baseline - Captured at run start (falls back to the current state)
   * @returns {Object|null} null until the last split has a recorded time
   */
  function buildRunSummary(state, baseline) {
    const s = state || {};
    const splits = s.splitsList || [];
    const n = splits.length;
    const completed = s.completedSplitTimes || {};
    if (n === 0 || !isTime(completed[n - 1])) return null;

    const isRT = s.currentTimingMethod === "RealTime";
    const base = baselineFits(s, baseline) ? baseline : captureRunBaseline(s);
    const pb = (isRT ? base.pbRT : base.pbGT) || [];
    const golds = (isRT ? base.goldsRT : base.goldsGT) || [];
    const locked = s.lockedDeltas || {};
    const finalTime = completed[n - 1];
    const goldBuffer = window.LiveSplit.SplitEvaluation.GOLD_BUFFER_SEC;

    let goldCount = 0;
    let goldSaved = 0;
    let biggestGain = null;
    let biggestLoss = null;
    let aheadCount = 0;
    let comparedCount = 0;
    const deltas = [];

    for (let i = 0; i < n; i++) {
      // A segment is only this run's when both its ends were recorded (not across a skip)
      const runSeg = isTime(completed[i]) && (i === 0 || isTime(completed[i - 1]))
        ? completed[i] - (i === 0 ? 0 : completed[i - 1]) : null;
      if (runSeg !== null && isTime(golds[i]) && runSeg < golds[i] - goldBuffer) {
        goldCount++;
        goldSaved += golds[i] - runSeg;
      }
      const pbSeg = segmentFromCurve(pb, i);
      if (runSeg !== null && pbSeg !== null) {
        const diff = runSeg - pbSeg;
        if (diff < 0 && (!biggestGain || -diff > biggestGain.seconds)) biggestGain = { index: i, name: splits[i], seconds: -diff };
        if (diff > 0 && (!biggestLoss || diff > biggestLoss.seconds)) biggestLoss = { index: i, name: splits[i], seconds: diff };
      }
      const d = locked[i];
      if (d && d.stateClass !== "uncoloured" && d.splitTimeSec !== null && d.deltaInfo && typeof d.deltaInfo.signedSeconds === "number") {
        comparedCount++;
        if (d.deltaInfo.signedSeconds < 0) aheadCount++;
        deltas.push({ index: i, seconds: d.deltaInfo.signedSeconds });
      }
    }

    const pbFinal = isTime(pb[n - 1]) ? pb[n - 1] : null;
    const sumOfBest = golds.length >= n && golds.slice(0, n).every(isTime)
      ? golds.slice(0, n).reduce((a, b) => a + b, 0) : null;
    const compData = (isRT ? s.comparisonsDataRT : s.comparisonsDataGT) || {};
    const wrCurve = findWorldRecordCurve(compData);
    const wrFinal = wrCurve && isTime(wrCurve[n - 1]) ? wrCurve[n - 1] : null;
    const last = locked[n - 1];

    return {
      splitsCount: n,
      finalTime,
      comparison: s.currentComparison || "",
      delta: last && last.deltaInfo && last.stateClass !== "uncoloured" ? last.deltaInfo.text || "" : "",
      stateClass: last ? last.stateClass || "" : "",
      isNewPb: pbFinal === null || finalTime < pbFinal,
      pbDelta: pbFinal !== null ? finalTime - pbFinal : null,
      golds: { count: goldCount, saved: goldSaved },
      biggestGain,
      biggestLoss,
      ahead: { count: aheadCount, total: comparedCount },
      deltas,
      sobDelta: sumOfBest !== null ? finalTime - sumOfBest : null,
      wrDelta: wrFinal !== null ? finalTime - wrFinal : null
    };
  }

  /**
   * PB curves and golds copied when a run started (OverlayState.runBaseline).
   * @typedef {Object} RunBaseline
   * @property {number} splitsCount - Split count it was taken for (ignored once the splits change)
   * @property {Array<number|null>} pbGT - Personal Best cumulative curve, GameTime
   * @property {Array<number|null>} pbRT
   * @property {Array<number|null>} goldsGT - Best segment durations, GameTime
   * @property {Array<number|null>} goldsRT
   */

  window.LiveSplit = window.LiveSplit || {};
  window.LiveSplit.RunSummary = {
    captureRunBaseline,
    withRunBaseline,
    buildRunSummary
  };
})();
