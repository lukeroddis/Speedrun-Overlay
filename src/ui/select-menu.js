/**
 * src/ui/select-menu.js - In-Page Dropdowns for <select>s
 *
 * OBS's Interact window can't open a browser source's native <select> popup (the source renders
 * off-screen, and Chromium draws that popup as a separate window), so a dropdown there does
 * nothing. enhanceSelect(select) keeps the <select> (hidden) as the value holder, so the code
 * that reads its value, sets it or listens for "change" is unchanged, and shows in its place:
 * - a button with the selected option's text (it takes the select's classes, so it looks the same)
 * - on click, a list of the options drawn in the page (attached to <body>, fixed-positioned below
 *   the button or above it when there's no room, so a scrolling popover can't clip it); picking
 *   one sets the select's value and fires "change" on it
 * Setting the select's value or selectedIndex from code updates the button too. Escape, a click
 * elsewhere or scrolling closes the list; Up / Down on the button step through the options.
 */

(function () {
  "use strict";

  const LIST_GAP = 4;
  const LIST_MAX_HEIGHT = 280;
  const VALUE = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  const SELECTED_INDEX = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "selectedIndex");

  let openMenu = null; // { close } of the list that is open

  /**
   * Pure: where the list goes for a button `rect` in a `viewportHeight` px window: below it, or
   * above it when there's more room there; `maxHeight` is what fits on that side.
   */
  function placeList(rect, listHeight, viewportHeight) {
    const below = viewportHeight - rect.bottom - LIST_GAP;
    const above = rect.top - LIST_GAP;
    const showBelow = listHeight <= below || below >= above;
    const room = Math.max(0, showBelow ? below : above);
    const maxHeight = Math.min(LIST_MAX_HEIGHT, room);
    const height = Math.min(listHeight, maxHeight);
    return {
      top: showBelow ? rect.bottom + LIST_GAP : rect.top - LIST_GAP - height,
      left: rect.left,
      minWidth: rect.width,
      maxHeight
    };
  }

  /**
   * Shows `select` as an in-page dropdown (once; later calls return the same controls).
   * @param {HTMLSelectElement} select
   * @returns {{ button: HTMLButtonElement, sync: Function, open: Function, close: Function } | null}
   */
  function enhanceSelect(select) {
    if (!select || select.tagName !== "SELECT") return null;
    if (select._selectMenu) return select._selectMenu;

    const button = document.createElement("button");
    button.type = "button";
    button.className = `${select.className} sm-button`.trim();
    if (select.id) button.id = `${select.id}-menu`;
    if (select.title) button.title = select.title;
    button.setAttribute("aria-haspopup", "listbox");
    button.setAttribute("aria-expanded", "false");
    const label = document.createElement("span");
    label.className = "sm-label";
    const arrow = document.createElement("span");
    arrow.className = "sm-arrow";
    arrow.textContent = "▾";
    button.append(label, arrow);
    select.after(button);
    select.classList.add("sm-native");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");

    let list = null;

    function sync() {
      const opt = select.options[SELECTED_INDEX.get.call(select)];
      label.textContent = opt ? opt.textContent : "";
      button.disabled = select.disabled;
    }

    function choose(index) {
      if (index < 0 || index >= select.options.length || index === SELECTED_INDEX.get.call(select)) return;
      SELECTED_INDEX.set.call(select, index);
      sync();
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function onOutside(e) {
      if (list && !list.contains(e.target) && !button.contains(e.target)) close();
    }

    // Scrolling anything but the list itself moves the button away from it
    function onScroll(e) {
      if (list && !(e.target instanceof Node && list.contains(e.target))) close();
    }

    function onKey(e) {
      if (e.key === "Escape") {
        close();
        button.focus();
      }
    }

    function close() {
      if (!list) return;
      list.remove();
      list = null;
      button.setAttribute("aria-expanded", "false");
      document.removeEventListener("pointerdown", onOutside, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
      if (openMenu && openMenu.close === close) openMenu = null;
    }

    function open() {
      if (list || select.disabled) return;
      if (openMenu) openMenu.close();
      list = document.createElement("div");
      list.className = "sm-list";
      list.setAttribute("role", "listbox");
      const current = SELECTED_INDEX.get.call(select);
      Array.from(select.options).forEach((opt, i) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "sm-option";
        item.setAttribute("role", "option");
        item.textContent = opt.textContent;
        item.disabled = opt.disabled;
        if (i === current) {
          item.classList.add("sm-selected");
          item.setAttribute("aria-selected", "true");
        }
        item.addEventListener("click", () => {
          choose(i);
          close();
          button.focus();
        });
        list.appendChild(item);
      });
      document.body.appendChild(list);
      const pos = placeList(button.getBoundingClientRect(), list.scrollHeight, window.innerHeight || 0);
      Object.assign(list.style, {
        top: `${pos.top}px`, left: `${pos.left}px`, minWidth: `${pos.minWidth}px`, maxHeight: `${pos.maxHeight}px`
      });
      list.querySelector(".sm-selected")?.scrollIntoView({ block: "nearest" });
      button.setAttribute("aria-expanded", "true");
      document.addEventListener("pointerdown", onOutside, true);
      document.addEventListener("keydown", onKey, true);
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", close);
      openMenu = { close };
    }

    button.addEventListener("click", () => (list ? close() : open()));
    button.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      choose(SELECTED_INDEX.get.call(select) + (e.key === "ArrowDown" ? 1 : -1));
    });
    select.addEventListener("change", sync);

    // Code that sets the value directly (no "change" event) still updates the button
    Object.defineProperty(select, "value", {
      configurable: true,
      get() { return VALUE.get.call(this); },
      set(v) { VALUE.set.call(this, v); sync(); }
    });
    Object.defineProperty(select, "selectedIndex", {
      configurable: true,
      get() { return SELECTED_INDEX.get.call(this); },
      set(v) { SELECTED_INDEX.set.call(this, v); sync(); }
    });

    sync();
    select._selectMenu = { button, sync, open, close };
    return select._selectMenu;
  }

  window.LiveSplit = window.LiveSplit || {};
  window.LiveSplit.SelectMenu = {
    LIST_MAX_HEIGHT,
    placeList,
    enhanceSelect
  };
})();
