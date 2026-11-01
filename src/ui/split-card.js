/**
 * src/ui/split-card.js - Shared Split Card
 *
 * The card the track's hover tooltip (src/ui/split-tooltip.js) and the Current Split widget
 * (src/ui/current-split.js) both show:
 * - renderSplitInfoHtml: one split (view model: LiveSplit.SplitInfo.buildSplitInfo): icon, name,
 *   position, delta and split time once done, the expected segment (and split time) before, and
 *   its segment times (this run, PB, best, average, WR) with the possible time save
 * - renderRunSummaryHtml: a finished run (view model: LiveSplit.RunSummary.buildRunSummary)
 * - createSplitCard(el): fills an element with either, rebuilding its markup only when that
 *   changes. The current split's live segment is a slot `tick(elapsedSec)` writes as text, so a
 *   card can follow the run every poll without allocating DOM. `flash(type, ms)` plays the
 *   leaderboard's split glow (src/styles/split-flash.css) on the element.
 */

(function () {
  "use strict";

  const FLASH_CLASSES = ["split-flash-gold", "split-flash-green", "split-flash-red"];
  const SPARK_W = 240;
  const SPARK_H = 36;

  const isTime = (v) => typeof v === "number" && isFinite(v) && v >= 0;
  const escapeHtml = (str) => window.LiveSplit.DOMUtils.escapeHtml(str);
  const fmtTime = (sec) => window.LiveSplit.Time.formatSegmentTime(sec);
  const fmtDelta = (sec) => window.LiveSplit.Time.formatDeltaSeconds(sec);

  function row(id, label, value) {
    return `<div class="split-card-row split-card-${escapeHtml(id)}"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;
  }

  /** Pure: the card's inner HTML for a SplitInfo view model (the current split's live segment is an empty slot). */
  function renderSplitInfoHtml(info) {
    if (!info) return "";
    const icon = info.icon ? `<img class="split-card-icon" src="${escapeHtml(info.icon)}" alt="">` : "";
    let status = "";
    if (info.status === "done") {
      status = `<div class="split-card-status">
        <span class="split-card-delta delta-${escapeHtml(info.stateClass || "uncoloured")}">${escapeHtml(info.delta || "-")}</span>
        <span class="split-card-time">${escapeHtml(info.splitTime !== null ? fmtTime(info.splitTime) : "")}</span></div>`;
    } else if (info.status === "skipped") {
      status = `<div class="split-card-status"><span class="split-card-muted">Skipped</span></div>`;
    } else if (info.expectedSegment !== null || info.expectedTime !== null) {
      const segment = info.expectedSegment !== null
        ? `<span class="split-card-time">${escapeHtml(fmtTime(info.expectedSegment))}</span>` : "";
      const at = info.expectedTime !== null
        ? `<span class="split-card-muted">at ${escapeHtml(fmtTime(info.expectedTime))}</span>` : "";
      status = `<div class="split-card-status"><span class="split-card-muted">Expected</span>${segment}${at}</div>`;
    }
    const rows = info.segments.map((r) => (r.id === "run" && info.status === "current"
      ? `<div class="split-card-row split-card-run"><span>${escapeHtml(r.label)}</span><span data-live></span></div>`
      : row(r.id, r.label, fmtTime(r.seconds)))).join("");
    const save = info.possibleSave !== null ? row("save", "Possible save", fmtTime(info.possibleSave)) : "";
    const table = rows || save ? `<div class="split-card-segments"><div class="split-card-caption">Segment</div>${rows}${save}</div>` : "";
    return `<div class="split-card-head">${icon}<div class="split-card-title">
        <div class="split-card-name">${escapeHtml(info.name)}</div>
        <div class="split-card-pos">Split ${escapeHtml(info.position)}</div></div></div>${status}${table}`;
  }

  /** Pure: an SVG line of the delta at each split, like LiveSplit's run graph ("" with under two points). */
  function renderDeltaSparkline(deltas, splitsCount) {
    if (!deltas || deltas.length < 2 || !(splitsCount > 0)) return "";
    const maxAbs = Math.max(0.1, ...deltas.map((d) => Math.abs(d.seconds)));
    const mid = SPARK_H / 2;
    const scale = (mid - 2) / maxAbs;
    // Ahead (negative) is drawn above the zero line, behind below, starting level at the Start
    const pts = [[0, mid], ...deltas.map((d) => [((d.index + 1) / splitsCount) * SPARK_W, mid + d.seconds * scale])];
    const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const end = deltas[deltas.length - 1].seconds < 0 ? "ahead" : "behind";
    return `<svg class="split-card-spark spark-${end}" viewBox="0 0 ${SPARK_W} ${SPARK_H}" preserveAspectRatio="none" aria-hidden="true">
        <line class="split-card-spark-zero" x1="0" y1="${mid}" x2="${SPARK_W}" y2="${mid}"></line>
        <polyline class="split-card-spark-line" points="${line}"></polyline></svg>`;
  }

  /** Pure: the card's inner HTML for a finished run (RunSummary view model). */
  function renderRunSummaryHtml(summary) {
    if (!summary) return "";
    const badge = summary.isNewPb
      ? `<span class="split-card-badge">New PB</span>`
      : "";
    const delta = summary.delta
      ? `<span class="split-card-delta delta-${escapeHtml(summary.stateClass || "uncoloured")}">${escapeHtml(summary.delta)}</span>` : "";
    const vs = summary.comparison ? `<span class="split-card-muted">vs ${escapeHtml(summary.comparison)}</span>` : "";
    const rows = [];
    // The PB result, unless the delta above already is it
    if (summary.pbDelta !== null && summary.comparison !== "Personal Best") rows.push(row("pb", "vs PB", fmtDelta(summary.pbDelta)));
    if (summary.golds.count > 0) {
      const saved = summary.golds.saved >= 0.05 ? ` (${fmtDelta(-summary.golds.saved)})` : "";
      rows.push(row("best", summary.golds.count === 1 ? "Gold" : "Golds", `${summary.golds.count}${saved}`));
    }
    if (summary.biggestGain) rows.push(row("gain", `Best: ${summary.biggestGain.name}`, fmtDelta(-summary.biggestGain.seconds)));
    if (summary.biggestLoss) rows.push(row("loss", `Worst: ${summary.biggestLoss.name}`, fmtDelta(summary.biggestLoss.seconds)));
    if (summary.ahead.total > 0) rows.push(row("ahead", "Splits ahead", `${summary.ahead.count} / ${summary.ahead.total}`));
    if (summary.sobDelta !== null) rows.push(row("sob", "vs Sum of Best", fmtDelta(summary.sobDelta)));
    if (summary.wrDelta !== null) rows.push(row("wr", "vs WR", fmtDelta(summary.wrDelta)));
    const table = rows.length > 0 ? `<div class="split-card-segments"><div class="split-card-caption">This run</div>${rows.join("")}</div>` : "";
    return `<div class="split-card-head"><div class="split-card-title">
        <div class="split-card-name">Run complete</div>
        <div class="split-card-pos">${escapeHtml(summary.splitsCount)} splits</div></div>${badge}</div>
      <div class="split-card-status"><span class="split-card-time split-card-final">${escapeHtml(fmtTime(summary.finalTime))}</span>${delta}${vs}</div>
      ${renderDeltaSparkline(summary.deltas, summary.splitsCount)}${table}`;
  }

  /** Pure: a muted title and line (no splits loaded yet). */
  function renderMessageHtml(title, text) {
    return `<div class="split-card-head"><div class="split-card-title">
        <div class="split-card-name">${escapeHtml(title)}</div>
        <div class="split-card-pos">${escapeHtml(text || "")}</div></div></div>`;
  }

  /**
   * @param {HTMLElement} el - The element the card fills (its flash plays on it too)
   */
  function createSplitCard(el) {
    let lastHtml = "";
    let liveEl = null;
    let liveText = "";
    let liveFrom = null;
    let expectedSegment = null;
    let overdue = false;

    function setHtml(html) {
      if (html === lastHtml) return;
      el.innerHTML = html;
      lastHtml = html;
      liveEl = el.querySelector("[data-live]");
      liveText = "";
    }

    function setOverdue(value) {
      if (value === overdue) return;
      overdue = value;
      el.classList.toggle("is-overdue", value);
    }

    /** Writes the current split's live segment (and overdue state) from the run time. */
    function tick(elapsedSec) {
      if (!liveEl || liveFrom === null || !isTime(elapsedSec)) return;
      const seg = Math.max(0, elapsedSec - liveFrom);
      const text = fmtTime(seg);
      if (text !== liveText) {
        liveEl.textContent = text;
        liveText = text;
      }
      setOverdue(expectedSegment !== null && seg > expectedSegment);
    }

    function showSplit(info, elapsedSec) {
      setHtml(renderSplitInfoHtml(info));
      liveFrom = info && info.status === "current" ? info.liveFrom : null;
      expectedSegment = info ? info.expectedSegment : null;
      if (liveFrom === null) setOverdue(false);
      tick(elapsedSec);
    }

    function showSummary(summary) {
      setHtml(renderRunSummaryHtml(summary));
      liveFrom = null;
      setOverdue(false);
    }

    function showMessage(title, text) {
      setHtml(renderMessageHtml(title, text));
      liveFrom = null;
      setOverdue(false);
    }

    function clearFlash() {
      el.classList.remove(...FLASH_CLASSES);
    }

    /** Plays the split glow ("gold" | "green" | "red") over `ms`; no type just clears it. */
    function flash(type, ms) {
      clearFlash();
      const cls = `split-flash-${type}`;
      if (!FLASH_CLASSES.includes(cls)) return;
      el.style.setProperty("--split-flash-duration", `${Math.max(300, ms || 0)}ms`);
      void el.offsetWidth; // restart the animation when the same colour plays twice in a row
      el.classList.add(cls);
    }

    function clear() {
      setHtml("");
      liveFrom = null;
      setOverdue(false);
      clearFlash();
    }

    return { showSplit, showSummary, showMessage, tick, flash, clearFlash, clear, getHtml: () => lastHtml };
  }

  window.LiveSplit = window.LiveSplit || {};
  window.LiveSplit.SplitCard = {
    FLASH_CLASSES,
    renderSplitInfoHtml,
    renderRunSummaryHtml,
    renderDeltaSparkline,
    renderMessageHtml,
    createSplitCard
  };
})();
