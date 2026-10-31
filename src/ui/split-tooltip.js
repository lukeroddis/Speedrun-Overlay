/**
 * src/ui/split-tooltip.js - Split Info Tooltip
 *
 * Hovering a split on the track shows a card beside the pointer with that split's info
 * (view model: LiveSplit.SplitInfo.buildSplitInfo): icon, name, position, delta and split
 * time once done, the expected segment (and split time) before, and its segment times (this run, PB, best,
 * average, WR) with the possible time save. Handy on a Minimalist track with no text.
 *
 * - Which split: the bar under the pointer belongs to the split it leads into; elsewhere in
 *   Network views, the node (and its text) under it. In views whose bars are the splits
 *   (Minimalist) a split item's right half is the next visible split's bar.
 * - Hidden in Layout Mode and while switched off (settings registry "splitTooltip")
 * - Hover handling only: nothing runs in the render tick. While the current split is shown,
 *   its live segment refreshes a few times a second.
 */

(function () {
  "use strict";

  const STORAGE_KEYS = window.LiveSplit.Storage.KEYS;
  const LIVE_REFRESH_MS = 250;
  const POINTER_GAP = 16;

  const escapeHtml = (str) => window.LiveSplit.DOMUtils.escapeHtml(str);
  const fmtTime = (sec) => window.LiveSplit.Time.formatSegmentTime(sec);

  function isEnabled() {
    try {
      return localStorage.getItem(STORAGE_KEYS.SPLIT_TOOLTIP) !== "false";
    } catch (e) {
      return true;
    }
  }

  /** Pure: the card's inner HTML for a SplitInfo view model. */
  function renderSplitInfoHtml(info) {
    if (!info) return "";
    const icon = info.icon ? `<img class="split-tip-icon" src="${escapeHtml(info.icon)}" alt="">` : "";
    let status = "";
    if (info.status === "done") {
      status = `<div class="split-tip-status">
        <span class="split-tip-delta delta-${escapeHtml(info.stateClass || "uncoloured")}">${escapeHtml(info.delta || "-")}</span>
        <span class="split-tip-time">${escapeHtml(info.splitTime !== null ? fmtTime(info.splitTime) : "")}</span></div>`;
    } else if (info.status === "skipped") {
      status = `<div class="split-tip-status"><span class="split-tip-muted">Skipped</span></div>`;
    } else if (info.expectedSegment !== null || info.expectedTime !== null) {
      const segment = info.expectedSegment !== null
        ? `<span class="split-tip-time">${escapeHtml(fmtTime(info.expectedSegment))}</span>` : "";
      const at = info.expectedTime !== null
        ? `<span class="split-tip-muted">at ${escapeHtml(fmtTime(info.expectedTime))}</span>` : "";
      status = `<div class="split-tip-status"><span class="split-tip-muted">Expected</span>${segment}${at}</div>`;
    }
    const rows = info.segments.map((row) => `<div class="split-tip-row split-tip-${escapeHtml(row.id)}">
        <span>${escapeHtml(row.label)}</span><span>${escapeHtml(fmtTime(row.seconds))}</span></div>`).join("");
    const save = info.possibleSave !== null
      ? `<div class="split-tip-row split-tip-save"><span>Possible save</span><span>${escapeHtml(fmtTime(info.possibleSave))}</span></div>`
      : "";
    const table = rows || save ? `<div class="split-tip-segments"><div class="split-tip-caption">Segment</div>${rows}${save}</div>` : "";
    return `<div class="split-tip-head">${icon}<div class="split-tip-title">
        <div class="split-tip-name">${escapeHtml(info.name)}</div>
        <div class="split-tip-pos">Split ${escapeHtml(info.position)}</div></div></div>${status}${table}`;
  }

  /** The visible split item after `item` (skipping ones the sliding window hides), or null. */
  function nextVisibleItem(item) {
    let el = item.nextElementSibling;
    while (el && !(el.classList.contains("split-item") && !el.classList.contains("is-omitted"))) {
      el = el.nextElementSibling;
    }
    return el;
  }

  /**
   * The split index under a pointer over the track, or -1 (Start node, gaps, no item).
   * @param {Element} target - Event target
   * @param {number} clientX
   * @param {number} clientY
   */
  function splitIndexAt(target, clientX, clientY) {
    const item = target && typeof target.closest === "function" ? target.closest(".split-item") : null;
    const track = item && item.parentElement;
    if (!item || !track) return -1;
    let hit = item;
    if (window.LiveSplit.TrackViews.getTrackView(track.dataset.trackView).segmentsAreSplits) {
      const r = item.getBoundingClientRect();
      const vertical = track.classList.contains("vertical");
      const pastHalf = vertical ? clientY > r.top + r.height / 2 : clientX > r.left + r.width / 2;
      if (pastHalf) hit = nextVisibleItem(item);
    }
    const m = hit && /^item-(\d+)$/.exec(hit.id);
    return m ? parseInt(m[1], 10) : -1;
  }

  /**
   * @param {Object} options
   * @param {Function} options.getState - The overlay state
   * @param {Function} [options.isEnabled] - Whether hovering shows the card
   */
  function createSplitTooltip(options = {}) {
    const { getState = () => null, isEnabled: enabled = isEnabled } = options;
    let el = null;
    let shownIndex = -1;
    let lastHtml = "";
    let lastPointer = { x: 0, y: 0 };
    let liveTimer = null;

    function ensureEl() {
      if (!el) {
        el = document.createElement("div");
        el.className = "split-tooltip";
        el.id = "split-tooltip";
        el.setAttribute("role", "tooltip");
        el.hidden = true;
        document.body.appendChild(el);
      }
      return el;
    }

    function place() {
      if (!el || el.hidden) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Above-right of the pointer, flipping to whichever side has room
      let left = lastPointer.x + POINTER_GAP;
      if (left + w > vw - 8) left = lastPointer.x - POINTER_GAP - w;
      let top = lastPointer.y - POINTER_GAP - h;
      if (top < 8) top = lastPointer.y + POINTER_GAP;
      el.style.left = `${Math.max(8, Math.min(left, vw - w - 8))}px`;
      el.style.top = `${Math.max(8, Math.min(top, vh - h - 8))}px`;
    }

    function render() {
      const info = window.LiveSplit.SplitInfo.buildSplitInfo(getState(), shownIndex);
      if (!info) {
        hide();
        return;
      }
      const html = renderSplitInfoHtml(info);
      if (html !== lastHtml) {
        el.innerHTML = html;
        lastHtml = html;
      }
      // Only the current split changes while it is shown (its live segment)
      if (info.status === "current" && !liveTimer) {
        liveTimer = setInterval(() => { render(); place(); }, LIVE_REFRESH_MS);
      } else if (info.status !== "current" && liveTimer) {
        clearInterval(liveTimer);
        liveTimer = null;
      }
    }

    function show(index) {
      ensureEl();
      if (index !== shownIndex || el.hidden) {
        shownIndex = index;
        el.hidden = false;
        render();
      }
      place();
    }

    function hide() {
      if (liveTimer) {
        clearInterval(liveTimer);
        liveTimer = null;
      }
      shownIndex = -1;
      lastHtml = "";
      if (el) el.hidden = true;
    }

    function onPointerMove(e) {
      lastPointer = { x: e.clientX, y: e.clientY };
      if (!enabled() || document.body.classList.contains("edit-mode")) {
        hide();
        return;
      }
      const index = splitIndexAt(e.target, e.clientX, e.clientY);
      if (index < 0) hide();
      else show(index);
    }

    function bind(track = document.getElementById("track")) {
      if (!track) return false;
      track.addEventListener("pointermove", onPointerMove);
      track.addEventListener("pointerleave", hide);
      return true;
    }

    // Switched off: remembered, and any open card closes
    function setEnabled(value) {
      try {
        localStorage.setItem(STORAGE_KEYS.SPLIT_TOOLTIP, value ? "true" : "false");
      } catch (e) {
        // Storage unavailable: the choice lasts until reload
      }
      if (!value) hide();
    }

    return { bind, show, hide, setEnabled, isShown: () => shownIndex >= 0 };
  }

  window.LiveSplit = window.LiveSplit || {};
  window.LiveSplit.SplitTooltip = {
    createSplitTooltip,
    renderSplitInfoHtml,
    splitIndexAt,
    isEnabled
  };
})();
