/**
 * tests/unit/ui/select-menu.test.js
 * LiveSplit.SelectMenu: <select>s drawn as in-page dropdowns (OBS's Interact window can't open
 * native ones): the button follows the select, picking an option fires "change", the list's
 * placement, keyboard and closing, and the settings renderer's opt-in.
 */

(function () {
  "use strict";

  const SM = window.LiveSplit.SelectMenu;
  const { mountHtml } = window.TestUtils;

  function setup(extra = "") {
    const dom = mountHtml(`<div style="position: absolute; left: 20px; top: 200px;">
      <select id="sm-test" class="my-select" title="Pick one" ${extra}>
        <option value="a">Alpha</option><option value="b">Bravo</option><option value="c" disabled>Charlie</option><option value="d">Delta</option>
      </select></div>`);
    const select = dom.el("sm-test");
    const changes = [];
    select.addEventListener("change", () => changes.push(select.value));
    const menu = SM.enhanceSelect(select);
    const list = () => document.querySelector(".sm-list");
    return { dom, select, menu, changes, list, cleanup: () => { menu.close(); dom.remove(); } };
  }

  describe("Select menu (LiveSplit.SelectMenu)", () => {
    it("placeList puts the list below the button, or above it when there's more room there", () => {
      const rect = { top: 100, bottom: 130, left: 40, width: 120 };
      assertEqual(SM.placeList(rect, 90, 800), { top: 134, left: 40, minWidth: 120, maxHeight: SM.LIST_MAX_HEIGHT }, "room below");
      const low = { top: 700, bottom: 730, left: 40, width: 120 };
      assertEqual(SM.placeList(low, 200, 800), { top: 496, left: 40, minWidth: 120, maxHeight: SM.LIST_MAX_HEIGHT }, "flipped above");
      assertEqual(SM.placeList({ top: 100, bottom: 130, left: 0, width: 50 }, 900, 300).maxHeight, 166, "capped to the room below");
    });

    it("shows the select as a button with its classes, title and selected text", () => {
      const { select, menu, cleanup } = setup();
      try {
        assert(select.classList.contains("sm-native"), "the select stays, hidden");
        assertEqual(menu.button.className, "my-select sm-button");
        assertEqual([menu.button.title, menu.button.id], ["Pick one", "sm-test-menu"]);
        assertEqual(menu.button.textContent.replace("▾", "").trim(), "Alpha");
        assertEqual(SM.enhanceSelect(select), menu, "enhancing twice returns the same controls");
        assertEqual(SM.enhanceSelect(null), null);
        assertEqual(SM.enhanceSelect(document.createElement("div")), null, "only selects");
      } finally {
        cleanup();
      }
    });

    it("picking an option sets the select's value, fires change and closes the list", () => {
      const { select, menu, changes, list, cleanup } = setup();
      try {
        menu.button.click();
        assert(list(), "list open");
        assertEqual(menu.button.getAttribute("aria-expanded"), "true");
        const items = [...list().querySelectorAll(".sm-option")];
        assertEqual(items.map((i) => i.textContent), ["Alpha", "Bravo", "Charlie", "Delta"]);
        assert(items[0].classList.contains("sm-selected") && items[2].disabled, "selected and disabled options marked");
        items[3].click();
        assertEqual([select.value, changes], ["d", ["d"]]);
        assert(!list(), "closed");
        assert(menu.button.textContent.includes("Delta"), "button follows");

        menu.button.click();
        list().querySelectorAll(".sm-option")[3].click();
        assertEqual(changes, ["d"], "picking the current option changes nothing");
      } finally {
        cleanup();
      }
    });

    it("code that sets the value or index updates the button without firing change", () => {
      const { select, menu, changes, cleanup } = setup();
      try {
        select.value = "b";
        assert(menu.button.textContent.includes("Bravo"));
        select.selectedIndex = 3;
        assert(menu.button.textContent.includes("Delta"));
        assertEqual([select.value, select.selectedIndex, changes], ["d", 3, []]);
        select.disabled = true;
        menu.sync();
        assert(menu.button.disabled, "disabled with the select");
        menu.open();
        assert(!document.querySelector(".sm-list"), "a disabled dropdown doesn't open");
      } finally {
        cleanup();
      }
    });

    it("Up / Down step through the options; Escape, a click elsewhere or another dropdown close it", () => {
      const a = setup();
      const b = setup();
      try {
        const key = (k) => a.menu.button.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
        key("ArrowDown");
        key("ArrowDown");
        assertEqual(a.changes, ["b", "c"], "steps (even onto a disabled option, like a native select)");
        key("ArrowUp");
        key("ArrowUp");
        key("ArrowUp");
        assertEqual(a.select.value, "a", "stops at the first");
        key("Enter");

        a.menu.open();
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        assert(!document.querySelector(".sm-list"), "Escape closes");

        a.menu.open();
        document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        assert(!document.querySelector(".sm-list"), "a click elsewhere closes");

        a.menu.open();
        b.menu.button.click();
        assertEqual(document.querySelectorAll(".sm-list").length, 1, "one list at a time");
        b.menu.button.click();
        assert(!document.querySelector(".sm-list"), "the button toggles it");

        a.menu.open();
        window.dispatchEvent(new Event("scroll"));
        assert(!document.querySelector(".sm-list"), "scrolling the page closes it");
      } finally {
        a.cleanup();
        b.cleanup();
      }
    });

    it("the settings renderer hands each dropdown to the host's enhanceSelect", () => {
      const seen = [];
      const renderer = window.LiveSplit.SettingsRenderer.createSettingsRenderer({ set: () => {}, enhanceSelect: (s) => seen.push(s) });
      const row = renderer.row({ id: "pick", label: "Pick", type: "enum", optionLabels: { x: "A long option label" } }, ["x", "y"]);
      assertEqual(seen.length, 1, "one dropdown");
      assert(row.contains(seen[0]) && seen[0].tagName === "SELECT", "already in its row");
    });
  });
})();
