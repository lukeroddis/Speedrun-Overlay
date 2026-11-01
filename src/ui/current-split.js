/**
 * src/ui/current-split.js - Current Split Widget
 *
 * The HUD widget `hud-comp-currentSplit`: the shared split card (src/ui/split-card.js) for the
 * split being run, following LiveSplit as the run goes.
 * - Before a run: the first split, upcoming. During one: the current split, its live segment
 *   ticking every poll (text only) and the full card rebuilt at most a few times a second.
 * - A completed split stays up for the hold time (setting, 0 = off) with the leaderboard's split
 *   glow (gold / gained / lost; none for skipped or uncompared splits), then the next one shows.
 *   With no hold, the glow plays on the next split's card.
 * - A finished run: after the hold, the run summary (LiveSplit.RunSummary) or the last split
 *   (setting). Saving times in LiveSplit means resetting, so the finished card stays up through
 *   a reset until the next run starts. Held and finished cards compare against the PB and golds
 *   from before the run (state.runBaseline).
 * - Undo, a reset mid-run or new splits drop any held or finished card.
 * - Which segment rows (this run, PB, best, average, WR) and the possible save it shows is a
 *   setting (the track's hover card always shows them all).
 * Driven by `update()` from the poll loop (run-tracker.js) and track refreshes; does nothing
 * while the widget is hidden.
 */

(function () {
  "use strict";

  const STORAGE_KEYS = window.LiveSplit.Storage.KEYS;
  const HOLD_SECONDS = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const DEFAULT_HOLD_SECONDS = 3;
  const AFTER_RUN_OPTIONS = Object.freeze(["summary", "lastSplit"]);
  // SplitInfo segment row ids, plus the possible save
  const ROW_OPTIONS = Object.freeze(["run", "pb", "best", "average", "wr", "save"]);
  const FULL_REFRESH_MS = 250;
  // Glow length on the next split's card when there is no hold
  const NO_HOLD_FLASH_MS = 2000;

  function readStorage(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      // Storage unavailable: the choice lasts until reload
    }
  }

  /** Seconds a completed split stays up (0 to 10, default 3). */
  function getHoldSeconds() {
    const raw = readStorage(STORAGE_KEYS.CURRENT_SPLIT_HOLD);
    const num = raw === null ? NaN : parseInt(raw, 10);
    return HOLD_SECONDS.includes(num) ? num : DEFAULT_HOLD_SECONDS;
  }

  /** What a finished run shows: "summary" (default) or "lastSplit". */
  function getAfterRun() {
    const raw = readStorage(STORAGE_KEYS.CURRENT_SPLIT_AFTER_RUN);
    return AFTER_RUN_OPTIONS.includes(raw) ? raw : AFTER_RUN_OPTIONS[0];
  }

  /** The card rows shown, in ROW_OPTIONS order (default all; [] = none). */
  function getRows() {
    try {
      const parsed = JSON.parse(readStorage(STORAGE_KEYS.CURRENT_SPLIT_ROWS));
      if (Array.isArray(parsed)) return ROW_OPTIONS.filter((id) => parsed.includes(id));
    } catch (e) {
      // Unset or unreadable: all rows
    }
    return [...ROW_OPTIONS];
  }

  /** Pure: a SplitInfo view model with only the chosen rows (the same object when all are shown). */
  function withRows(info, rows) {
    if (!info || ROW_OPTIONS.every((id) => rows.includes(id))) return info;
    return Object.assign({}, info, {
      segments: info.segments.filter((row) => rows.includes(row.id)),
      possibleSave: rows.includes("save") ? info.possibleSave : null
    });
  }

  /** Pure: the glow for a completed split's locked delta, or null (skipped / nothing compared). */
  function flashTypeFor(locked) {
    if (!locked || locked.splitTimeSec === null || !locked.stateClass || locked.stateClass === "uncoloured") return null;
    return window.LiveSplit.SplitEvaluation.getSplitFlashType(locked.stateClass);
  }

  /**
   * @param {Object} options
   * @param {HTMLElement} options.el - The card element
   * @param {HTMLElement} [options.root] - The widget (nothing renders while it has .is-hidden)
   * @param {Function} options.getState - The overlay state
   * @param {Function} [options.now] - Clock in ms
   */
  function createCurrentSplitWidget(options = {}) {
    const { el, root = null, getState = () => null, now = () => Date.now() } = options;
    if (!el) {
      const noop = () => {};
      return { update: noop, refresh: noop, setHoldSeconds: noop, setAfterRun: noop, setRows: noop, getMode: () => "" };
    }
    const card = window.LiveSplit.SplitCard.createSplitCard(el);
    const SplitInfo = window.LiveSplit.SplitInfo;
    const RunSummary = window.LiveSplit.RunSummary;

    let holdSeconds = getHoldSeconds();
    let afterRun = getAfterRun();
    let rows = getRows();
    let lastIndex = null;
    let lastSplitCount = null;
    let hold = null; // { info, until }
    let finished = null; // { info, summary }
    let pendingFlash = null; // { type, ms }
    let mode = "";
    let lastFullAt = -Infinity;

    function freezeFinish(state) {
      const n = state.splitsList.length;
      return {
        info: SplitInfo.buildSplitInfo(RunSummary.withRunBaseline(state, state.runBaseline), n - 1),
        summary: RunSummary.buildRunSummary(state, state.runBaseline)
      };
    }

    function onIndexChange(prev, idx, state, t) {
      const n = state.splitsList.length;
      if (mode === "hold") card.clearFlash();
      mode = ""; // whatever shows next is built now
      if (prev >= 0 && idx > prev) {
        // Split(s) completed: hold the one just left, with its glow
        const done = idx - 1;
        if (idx >= n) finished = freezeFinish(state);
        const info = SplitInfo.buildSplitInfo(RunSummary.withRunBaseline(state, state.runBaseline), done);
        hold = holdSeconds > 0 && info ? { info, until: t + holdSeconds * 1000 } : null;
        const type = flashTypeFor((state.lockedDeltas || {})[done]);
        pendingFlash = type ? { type, ms: hold ? holdSeconds * 1000 : NO_HOLD_FLASH_MS } : null;
        if (!type) card.clearFlash();
      } else if (idx === -1 && prev >= n && finished) {
        // Reset after finishing (how LiveSplit saves times): the finished card stays up
        hold = null;
      } else {
        // A new run, undo, or a reset mid-run
        hold = null;
        finished = null;
        pendingFlash = null;
        card.clearFlash();
      }
    }

    function render(state, t) {
      const n = state.splitsList.length;
      let nextMode;
      if (hold) nextMode = "hold";
      else if (finished) nextMode = afterRun === "summary" && finished.summary ? "summary" : "finished";
      else if (n === 0) nextMode = "empty";
      else nextMode = "live";
      const changed = nextMode !== mode;
      // Leaving a held card: its glow is over
      if (changed && mode === "hold") card.clearFlash();
      mode = nextMode;

      // Held, finished and empty cards are fixed: built once when they show
      if (mode === "hold") {
        if (changed) card.showSplit(withRows(hold.info, rows), null);
      } else if (mode === "summary") {
        if (changed) card.showSummary(finished.summary);
      } else if (mode === "finished") {
        if (changed) card.showSplit(withRows(finished.info, rows), null);
      } else if (mode === "empty") {
        if (changed) card.showMessage("Current Split", "Load splits or connect LiveSplit");
      } else if (changed || t - lastFullAt >= FULL_REFRESH_MS) {
        lastFullAt = t;
        const info = SplitInfo.buildSplitInfo(state, Math.max(0, Math.min(state.currentIndex, n - 1)));
        card.showSplit(withRows(info, rows), state.lastElapsedSec);
      } else {
        card.tick(state.lastElapsedSec);
      }

      if (pendingFlash) {
        card.flash(pendingFlash.type, pendingFlash.ms);
        pendingFlash = null;
      }
    }

    /** Follows the overlay state: call every poll and after the splits or comparison change. */
    function update() {
      const state = getState();
      if (!state || !Array.isArray(state.splitsList)) return;
      const t = now();
      const n = state.splitsList.length;
      const idx = typeof state.currentIndex === "number" ? state.currentIndex : -1;

      if (n !== lastSplitCount) {
        // Other splits: nothing held or finished carries over
        if (lastSplitCount !== null) {
          hold = null;
          finished = null;
          pendingFlash = null;
          mode = "";
          card.clearFlash();
        }
        lastSplitCount = n;
      } else if (lastIndex !== null && idx !== lastIndex) {
        onIndexChange(lastIndex, idx, state, t);
      }
      // Reloaded after finishing: show the finished run
      if (lastIndex === null && n > 0 && idx >= n) finished = freezeFinish(state);
      lastIndex = idx;

      if (hold && t >= hold.until) hold = null;
      if (root && root.classList.contains("is-hidden")) return;
      render(state, t);
    }

    /** Rebuilds the card now (settings changed, widget shown). */
    function refresh() {
      holdSeconds = getHoldSeconds();
      afterRun = getAfterRun();
      rows = getRows();
      mode = "";
      update();
    }

    function setHoldSeconds(value) {
      const num = parseInt(value, 10);
      writeStorage(STORAGE_KEYS.CURRENT_SPLIT_HOLD, String(HOLD_SECONDS.includes(num) ? num : DEFAULT_HOLD_SECONDS));
      refresh();
    }

    function setAfterRun(value) {
      writeStorage(STORAGE_KEYS.CURRENT_SPLIT_AFTER_RUN, AFTER_RUN_OPTIONS.includes(value) ? value : AFTER_RUN_OPTIONS[0]);
      refresh();
    }

    function setRows(value) {
      const list = Array.isArray(value) ? value : [];
      writeStorage(STORAGE_KEYS.CURRENT_SPLIT_ROWS, JSON.stringify(ROW_OPTIONS.filter((id) => list.includes(id))));
      refresh();
    }

    return { update, refresh, setHoldSeconds, setAfterRun, setRows, getMode: () => mode };
  }

  window.LiveSplit = window.LiveSplit || {};
  window.LiveSplit.CurrentSplit = {
    HOLD_SECONDS,
    AFTER_RUN_OPTIONS,
    ROW_OPTIONS,
    getHoldSeconds,
    getAfterRun,
    getRows,
    withRows,
    flashTypeFor,
    createCurrentSplitWidget
  };
})();
