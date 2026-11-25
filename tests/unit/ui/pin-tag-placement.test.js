/**
 * tests/unit/ui/pin-tag-placement.test.js
 * LiveSplit.PinTagPlacement: the side a pin's hover tag goes on so the track viewport doesn't
 * cut it off, and the hover listener that sets it.
 */

(function () {
  "use strict";

  const P = window.LiveSplit.PinTagPlacement;
  const box = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height });
  // A 400 x 100 track viewport; a 26px head; a 60 x 16 tag
  const CLIP = box(0, 0, 400, 100);
  const choose = (head, pinSide, clip = CLIP) => P.choosePinTagSide(head, 60, 16, clip, pinSide);

  describe("Pin tag placement (LiveSplit.PinTagPlacement)", () => {
    it("keeps the preferred side when it has room", () => {
      assertEqual(choose(box(180, 40, 26, 26), "top"), "above");
      assertEqual(choose(box(180, 20, 26, 26), "bottom"), "below");
      assertEqual(choose(box(180, 40, 26, 26), "right"), "right");
      assertEqual(choose(box(180, 40, 26, 26), "left"), "left");
    });

    it("moves the tag beside the head when there's no room above (a compact track)", () => {
      assertEqual(choose(box(180, 6, 26, 26), "top"), "right");
      assertEqual(choose(box(360, 6, 26, 26), "top"), "left", "near the right edge: the left side");
    });

    it("moves a vertical track's tag to the other side, or above, when its side is too narrow", () => {
      const narrow = box(0, 0, 120, 300);
      assertEqual(choose(box(80, 100, 26, 26), "right", narrow), "left", "no room on the right");
      assertEqual(choose(box(47, 100, 26, 26), "right", narrow), "above", "no room either side");
    });

    it("with no side that fits, picks the one cut off least", () => {
      const tiny = box(0, 0, 50, 30);
      const side = choose(box(12, 2, 26, 26), "top", tiny);
      const over = (s) => {
        const t = P.tagBox(box(12, 2, 26, 26), 60, 16, s);
        return Math.max(0, tiny.left - t.left) + Math.max(0, t.right - tiny.right) + Math.max(0, tiny.top - t.top) + Math.max(0, t.bottom - tiny.bottom);
      };
      assert(P.SIDES.every((s) => over(side) <= over(s)), `least cut off (got ${side})`);
    });

    it("sets the tag side as the pointer enters a pin, including pins added later", () => {
      const dom = window.TestUtils.mountHtml(`
        <div id="track-viewport" style="position: absolute; left: 0; top: 0; width: 400px; height: 100px; overflow: hidden;">
          <div id="track" class="track pins-top" style="position: relative; height: 100px;"></div></div>`);
      const unbind = P.bindPinTagPlacement(dom.el("track-viewport"));
      try {
        const marker = document.createElement("div");
        marker.className = "ghost-marker";
        marker.style.cssText = "position: absolute; left: 180px; top: 4px; width: 26px; height: 26px;";
        marker.innerHTML = `<div class="ghost-icon-wrap" style="width: 26px; height: 26px;"></div>
          <div class="racer-tag" style="position: absolute; white-space: nowrap;">Personal Best</div>`;
        dom.el("track").appendChild(marker);
        marker.querySelector(".ghost-icon-wrap").dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
        assertEqual(marker.dataset.tagSide, "right", "no room above: beside the head");

        marker.style.top = "60px";
        marker.querySelector(".ghost-icon-wrap").dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
        assertEqual(marker.dataset.tagSide, "above", "room above again");
      } finally {
        unbind();
        dom.remove();
      }
      assertEqual(typeof P.bindPinTagPlacement(null), "function", "no viewport: a no-op unbind");
    });
  });
})();
