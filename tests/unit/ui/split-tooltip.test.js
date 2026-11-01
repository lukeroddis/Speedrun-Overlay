/**
 * tests/unit/ui/split-tooltip.test.js
 * LiveSplit.SplitTooltip: which split a pointer is over in Network and Minimalist views, and
 * the controller (shows on hover, ticks the current split's live segment, hides when leaving,
 * in Layout Mode and while switched off). The card itself: split-card.test.js.
 */

(function () {
  "use strict";

  const { mountHtml } = window.TestUtils;
  const T = window.LiveSplit.SplitTooltip;
  const KEYS = window.LiveSplit.Storage.KEYS;

  // Three 100px split items in a row (no layout styles: sized inline)
  const TRACK_HTML = `
    <div id="tip-track" data-track-view="network" style="display: flex; position: fixed; left: 0; top: 0;">
      <div class="split-item" id="node-start" style="width: 100px; height: 40px;"></div>
      <div class="split-item" id="item-0" style="width: 100px; height: 40px;"></div>
      <div class="split-item is-omitted" id="item-1" style="display: none;"></div>
      <div class="split-item" id="item-2" style="width: 100px; height: 40px;"></div>
    </div>`;

  function withStorage(fn) {
    const saved = localStorage.getItem(KEYS.SPLIT_TOOLTIP);
    try {
      return fn();
    } finally {
      if (saved === null) localStorage.removeItem(KEYS.SPLIT_TOOLTIP);
      else localStorage.setItem(KEYS.SPLIT_TOOLTIP, saved);
    }
  }

  describe("Split Tooltip (LiveSplit.SplitTooltip)", () => {
    it("splitIndexAt: the item under the pointer, or the next visible bar's split in Minimalist", () => {
      const dom = mountHtml(TRACK_HTML);
      try {
        const item0 = dom.el("item-0");
        const r = item0.getBoundingClientRect();
        assertEqual(T.splitIndexAt(item0, r.left + 10, r.top + 5), 0);
        assertEqual(T.splitIndexAt(item0, r.right - 10, r.top + 5), 0, "Network: the whole node box");
        assertEqual(T.splitIndexAt(dom.el("node-start"), 5, 5), -1, "the Start node is no split");
        assertEqual(T.splitIndexAt(dom.el("tip-track"), 5, 5), -1);

        dom.el("tip-track").dataset.trackView = "minimalist";
        assertEqual(T.splitIndexAt(item0, r.left + 10, r.top + 5), 0, "left half: its own bar");
        assertEqual(T.splitIndexAt(item0, r.right - 10, r.top + 5), 2, "right half: the next visible split's bar");
        const start = dom.el("node-start").getBoundingClientRect();
        assertEqual(T.splitIndexAt(dom.el("node-start"), start.right - 10, start.top + 5), 0, "right of Start is the first bar");
      } finally {
        dom.remove();
      }
    });

    it("shows on hover, hides on leaving, in Layout Mode and when switched off", () => withStorage(() => {
      const dom = mountHtml(TRACK_HTML);
      const state = { splitsList: ["A", "B", "C"], currentIndex: -1, comparisonTimes: [10, 20, 30], comparisonsDataGT: {} };
      const tip = T.createSplitTooltip({ getState: () => state });
      const move = (x, y) => dom.el("item-0").dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: x, clientY: y }));
      try {
        localStorage.removeItem(KEYS.SPLIT_TOOLTIP);
        assert(tip.bind(dom.el("tip-track")));
        const r = dom.el("item-0").getBoundingClientRect();
        move(r.left + 10, r.top + 5);
        const el = document.getElementById("split-tooltip");
        assert(tip.isShown() && !el.hidden && el.textContent.includes("A"), "shown for item-0");

        dom.el("tip-track").dispatchEvent(new PointerEvent("pointerleave"));
        assert(!tip.isShown() && el.hidden, "hidden on leaving the track");

        document.body.classList.add("edit-mode");
        move(r.left + 10, r.top + 5);
        assert(!tip.isShown(), "never in Layout Mode");
        document.body.classList.remove("edit-mode");

        move(r.left + 10, r.top + 5);
        tip.setEnabled(false);
        assertEqual(localStorage.getItem(KEYS.SPLIT_TOOLTIP), "false");
        assert(!tip.isShown() && !T.isEnabled(), "switching off closes it");
        move(r.left + 10, r.top + 5);
        assert(!tip.isShown(), "stays off");
        tip.setEnabled(true);
        assert(T.isEnabled());
        assertEqual(tip.bind(null), false, "no track to bind");
      } finally {
        document.body.classList.remove("edit-mode");
        tip.hide();
        document.getElementById("split-tooltip")?.remove();
        dom.remove();
      }
    }));
  });
})();
