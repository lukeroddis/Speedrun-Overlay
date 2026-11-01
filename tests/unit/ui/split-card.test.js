/**
 * tests/unit/ui/split-card.test.js
 * LiveSplit.SplitCard: the split and run summary markup (escaped), the delta sparkline, and the
 * card controller (rebuilds only when the markup changes, ticks the live segment as text,
 * overdue state, split glow).
 */

(function () {
  "use strict";

  const { mountHtml } = window.TestUtils;
  const C = window.LiveSplit.SplitCard;

  const INFO = {
    index: 1, name: "<b>Boss</b>", icon: null, position: "2 / 3", status: "done",
    delta: "-1.2", stateClass: "ahead-gaining", splitTime: 83.4, liveFrom: null,
    expectedSegment: null, expectedTime: null, segments: [{ id: "pb", label: "PB", seconds: 61.2 }], possibleSave: 1.5
  };
  const CURRENT = Object.assign({}, INFO, {
    status: "current", delta: "", stateClass: "", splitTime: null, liveFrom: 20, expectedSegment: 10, expectedTime: 30,
    segments: [{ id: "run", label: "This run (live)", seconds: 2 }, { id: "pb", label: "PB", seconds: 10 }], possibleSave: null
  });
  const SUMMARY = {
    splitsCount: 3, finalTime: 41, comparison: "Best Segments", delta: "+1.0", stateClass: "behind-losing",
    isNewPb: true, pbDelta: -4, golds: { count: 2, saved: 0.7 },
    biggestGain: { index: 1, name: "<i>Boss</i>", seconds: 2.5 }, biggestLoss: { index: 2, name: "End", seconds: 1 },
    ahead: { count: 2, total: 3 }, deltas: [{ index: 0, seconds: -0.5 }, { index: 1, seconds: -3 }, { index: 2, seconds: 1 }],
    sobDelta: 1, wrDelta: null
  };

  describe("Split Card (LiveSplit.SplitCard)", () => {
    it("renders a split with escaped text, the delta colour and segment rows", () => {
      const html = C.renderSplitInfoHtml(INFO);
      assert(html.includes("&lt;b&gt;Boss&lt;/b&gt;") && !html.includes("<b>Boss"), "names are escaped");
      assert(html.includes("delta-ahead-gaining") && html.includes("-1.2") && html.includes("1:23.4"));
      assert(html.includes("PB") && html.includes("1:01.2") && html.includes("Possible save"));
      assert(!html.includes("<img"), "no icon element without an icon");
      assert(C.renderSplitInfoHtml(Object.assign({}, INFO, { icon: "data:image/png;base64,AA" })).includes("<img"));
      const upcoming = C.renderSplitInfoHtml(Object.assign({}, INFO, { status: "upcoming", expectedSegment: 12.5, expectedTime: 90, segments: [], possibleSave: null }));
      assert(upcoming.includes("Expected") && upcoming.includes("12.5") && upcoming.includes("at 1:30.0"), "segment first, then where it lands");
      assert(!upcoming.includes("Personal Best") && !upcoming.includes("Segment"));
      const noSegment = C.renderSplitInfoHtml(Object.assign({}, INFO, { status: "upcoming", expectedSegment: null, expectedTime: 90, segments: [], possibleSave: null }));
      assert(noSegment.includes("at 1:30.0"), "the split time alone when the segment is unknown");
      assert(C.renderSplitInfoHtml(Object.assign({}, INFO, { status: "skipped" })).includes("Skipped"));
      assertEqual(C.renderSplitInfoHtml(null), "");
    });

    it("leaves the current split's live segment as an empty slot, so the markup stays put as it ticks", () => {
      const a = C.renderSplitInfoHtml(CURRENT);
      const b = C.renderSplitInfoHtml(Object.assign({}, CURRENT, { segments: [{ id: "run", label: "This run (live)", seconds: 7 }, CURRENT.segments[1]] }));
      assert(a.includes("data-live") && a === b, "same markup whatever the live seconds");
    });

    it("renders a finished run: final time, delta, PB badge, golds, gain / loss and the rows that apply", () => {
      const html = C.renderRunSummaryHtml(SUMMARY);
      assert(html.includes("Run complete") && html.includes("41.0") && html.includes("delta-behind-losing") && html.includes("+1.0"));
      assert(html.includes("vs Best Segments") && html.includes("New PB"));
      assert(html.includes("vs PB") && html.includes("-4.0"), "the PB result when the comparison is something else");
      assert(html.includes("Golds") && html.includes("2 (-0.7)"));
      assert(html.includes("&lt;i&gt;Boss&lt;/i&gt;") && html.includes("-2.5") && html.includes("Worst: End"), "escaped names");
      assert(html.includes("2 / 3") && html.includes("vs Sum of Best") && !html.includes("vs WR"));
      assert(html.includes("<svg"), "the delta line");

      const plain = C.renderRunSummaryHtml(Object.assign({}, SUMMARY, {
        comparison: "Personal Best", isNewPb: false, golds: { count: 1, saved: 0 }, biggestGain: null, biggestLoss: null,
        ahead: { count: 0, total: 0 }, deltas: [], sobDelta: null, wrDelta: 12, delta: ""
      }));
      assert(!plain.includes("New PB") && !plain.includes("vs PB"), "the delta already is the PB result");
      assert(plain.includes("Gold") && !plain.includes("Golds") && !plain.includes("(-"), "one gold, nothing saved worth showing");
      assert(plain.includes("vs WR") && !plain.includes("<svg") && !plain.includes("split-card-delta"));
      assertEqual(C.renderRunSummaryHtml(null), "");
    });

    it("renderDeltaSparkline: ahead above the zero line, behind below, coloured by where it ends", () => {
      const svg = C.renderDeltaSparkline([{ index: 0, seconds: -2 }, { index: 1, seconds: 2 }], 2);
      assert(svg.includes("spark-behind") && svg.includes("points=\"0.0,18.0 120.0,2.0 240.0,34.0\""), svg);
      assert(C.renderDeltaSparkline([{ index: 0, seconds: 1 }, { index: 1, seconds: -1 }], 2).includes("spark-ahead"));
      assertEqual(C.renderDeltaSparkline([{ index: 0, seconds: 1 }], 2), "", "a line needs two points");
      assertEqual(C.renderDeltaSparkline([], 0), "");
    });

    it("createSplitCard: rebuilds only on change, ticks the live segment as text and marks it overdue", () => {
      const dom = mountHtml(`<div id="card"></div>`);
      try {
        const el = dom.el("card");
        const card = C.createSplitCard(el);
        card.showSplit(CURRENT, 25);
        const live = el.querySelector("[data-live]");
        assertEqual(live.textContent, "5.0");
        card.tick(26.04);
        card.showSplit(CURRENT, 27);
        assert(el.querySelector("[data-live]") === live, "same element: no rebuild");
        assertEqual(live.textContent, "7.0");
        assert(!el.classList.contains("is-overdue"));
        card.tick(31);
        assert(el.classList.contains("is-overdue"), "past the expected segment");
        card.tick(null);
        assertEqual(live.textContent, "11.0", "no run time leaves it as it was");

        card.showSplit(INFO, 40);
        assert(!el.classList.contains("is-overdue") && !el.querySelector("[data-live]"), "a done split has no live slot");
        card.showSummary(SUMMARY);
        assert(el.textContent.includes("Run complete"));
        card.showMessage("Current Split", "<none>");
        assert(el.textContent.includes("<none>") && card.getHtml().includes("&lt;none&gt;"));
        card.clear();
        assertEqual(el.innerHTML, "");
      } finally {
        dom.remove();
      }
    });

    it("flash plays the split glow for its length; unknown types only clear it", () => {
      const dom = mountHtml(`<div id="card"></div>`);
      try {
        const el = dom.el("card");
        const card = C.createSplitCard(el);
        card.flash("gold", 3000);
        assert(el.classList.contains("split-flash-gold"));
        assertEqual(el.style.getPropertyValue("--split-flash-duration"), "3000ms");
        card.flash("red", 50);
        assert(el.classList.contains("split-flash-red") && !el.classList.contains("split-flash-gold"), "one glow at a time");
        assertEqual(el.style.getPropertyValue("--split-flash-duration"), "300ms", "never shorter than it can be seen");
        card.flash(null);
        assert(!C.FLASH_CLASSES.some((c) => el.classList.contains(c)));
      } finally {
        dom.remove();
      }
    });
  });
})();
