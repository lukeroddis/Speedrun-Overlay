/**
 * src/ui/pin-tag-placement.js - Ghost / Race Pin Hover Tag Placement
 *
 * A pin's name tag (.racer-tag) shows on hover beside its head: above it (pins on top), below it
 * (pins below the bar) or on its outer side (vertical track). The track viewport clips it, so on a
 * narrow or compact track the tag could be cut off. When the pointer enters a pin, the tag goes on
 * the first side with room (preferred side first, then the sides, then the opposite side), as the
 * pin's `data-tag-side` (an attribute: the ghost runner rewrites pin classes every tick).
 * Measured on hover only, never in the render tick.
 */

(function () {
  "use strict";

  const SIDES = Object.freeze(["above", "below", "left", "right"]);
  // Gap between the head and its tag (matches the hovered tag's offset in race-pins.css)
  const TAG_GAP = 6;

  // Sides to try, best first, for the side the pins stand on
  const ORDER = Object.freeze({
    top: Object.freeze(["above", "right", "left", "below"]),
    bottom: Object.freeze(["below", "right", "left", "above"]),
    right: Object.freeze(["right", "left", "above", "below"]),
    left: Object.freeze(["left", "right", "above", "below"])
  });

  /** Pure: the tag's box (screen px) on `side` of the head. */
  function tagBox(head, tagW, tagH, side) {
    const cx = (head.left + head.right) / 2;
    const cy = (head.top + head.bottom) / 2;
    if (side === "above") return { left: cx - tagW / 2, right: cx + tagW / 2, top: head.top - TAG_GAP - tagH, bottom: head.top - TAG_GAP };
    if (side === "below") return { left: cx - tagW / 2, right: cx + tagW / 2, top: head.bottom + TAG_GAP, bottom: head.bottom + TAG_GAP + tagH };
    if (side === "left") return { left: head.left - TAG_GAP - tagW, right: head.left - TAG_GAP, top: cy - tagH / 2, bottom: cy + tagH / 2 };
    return { left: head.right + TAG_GAP, right: head.right + TAG_GAP + tagW, top: cy - tagH / 2, bottom: cy + tagH / 2 };
  }

  // How far (px, summed over the edges) a box pokes out of the clip
  function overflow(box, clip) {
    return Math.max(0, clip.left - box.left) + Math.max(0, box.right - clip.right)
      + Math.max(0, clip.top - box.top) + Math.max(0, box.bottom - clip.bottom);
  }

  /**
   * Pure: the side a pin's tag goes on: the first in the pin side's order that fits inside `clip`,
   * else the one cut off least.
   * @param {{left:number,top:number,right:number,bottom:number}} head - The pin head (screen px)
   * @param {number} tagW - The tag's width
   * @param {number} tagH - The tag's height
   * @param {{left:number,top:number,right:number,bottom:number}} clip - What the tag must stay inside
   * @param {string} pinSide - "top" | "bottom" | "left" | "right" (the track's pins-<side>)
   * @returns {string} "above" | "below" | "left" | "right"
   */
  function choosePinTagSide(head, tagW, tagH, clip, pinSide) {
    const order = ORDER[pinSide] || ORDER.top;
    let best = order[0];
    let bestOverflow = Infinity;
    for (const side of order) {
      const over = overflow(tagBox(head, tagW, tagH, side), clip);
      if (over === 0) return side;
      if (over < bestOverflow) {
        best = side;
        bestOverflow = over;
      }
    }
    return best;
  }

  function pinSideOf(track) {
    for (const side of ["top", "bottom", "left", "right"]) {
      if (track.classList.contains(`pins-${side}`)) return side;
    }
    return track.classList.contains("vertical") ? "right" : "top";
  }

  /** Places the tag of the pin `marker` for the track's current clip. */
  function placeTag(marker, viewport, track) {
    const tag = marker.querySelector(".racer-tag");
    const head = marker.querySelector(".ghost-icon-wrap");
    if (!tag || !head || !tag.textContent.trim()) return;
    const v = viewport.getBoundingClientRect();
    const clip = {
      left: Math.max(0, v.left),
      top: Math.max(0, v.top),
      right: Math.min(window.innerWidth || v.right, v.right),
      bottom: Math.min(window.innerHeight || v.bottom, v.bottom)
    };
    const t = tag.getBoundingClientRect();
    const side = choosePinTagSide(head.getBoundingClientRect(), t.width, t.height, clip, pinSideOf(track));
    marker.dataset.tagSide = side;
  }

  /**
   * Places each pin's tag as the pointer enters it (one delegated listener on the viewport, so
   * pins created later are covered). Returns an unbind function.
   */
  function bindPinTagPlacement(viewport = document.getElementById("track-viewport")) {
    if (!viewport) return () => {};
    const onOver = (e) => {
      const marker = e.target && e.target.closest ? e.target.closest(".ghost-marker") : null;
      if (!marker || !viewport.contains(marker)) return;
      // Entering from inside the same pin: already placed
      if (e.relatedTarget && marker.contains(e.relatedTarget)) return;
      const track = marker.closest(".track") || document.getElementById("track");
      if (track) placeTag(marker, viewport, track);
    };
    viewport.addEventListener("pointerover", onOver);
    return () => viewport.removeEventListener("pointerover", onOver);
  }

  window.LiveSplit = window.LiveSplit || {};
  window.LiveSplit.PinTagPlacement = {
    SIDES,
    TAG_GAP,
    tagBox,
    choosePinTagSide,
    bindPinTagPlacement
  };
})();
