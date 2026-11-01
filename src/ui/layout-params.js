/**
 * Speedrun Overlay - URL Query Parameter Parser & View Router
 *
 * Encapsulates URL parameter parsing for layout styling, component views,
 * track orientation, split preferences, timer anchoring, ghost comparison,
 * custom logos, and edit mode triggering.
 */

(function () {
  "use strict";

  const STORAGE_KEYS = window.LiveSplit.Storage.KEYS;

  /**
   * Pure: which widgets the URL shows or hides, by component id, for only the widgets it names
   * (?view=<id> shows only that widget, e.g. ?view=currentsplit for a browser source of its own;
   * ?hide=a,b hides those). Ids match in any case. The layout applies these over the saved
   * visibility and never saves them, so one OBS source showing a single widget leaves the
   * others alone.
   * @param {string} search - location.search
   * @param {string[]} ids - Component ids (LayoutEngine.COMPONENTS)
   * @returns {Object<string, boolean>}
   */
  function getUrlVisibility(search, ids) {
    const params = new URLSearchParams(search || "");
    const idFor = (name) => ids.find((id) => id.toLowerCase() === name);
    const out = {};
    const view = params.get("view");
    const target = view ? idFor(view.toLowerCase().trim()) : null;
    if (target) ids.forEach((id) => { out[id] = id === target; });
    const hide = params.get("hide");
    if (hide) {
      hide.split(",").map((name) => idFor(name.trim().toLowerCase())).filter(Boolean).forEach((id) => { out[id] = false; });
    }
    return out;
  }

  // Everything but ?view= / ?hide= (getUrlVisibility): profile, splits, angle, timer anchor,
  // track style, ghosts, logo and edit mode
  function parseUrlParameters(options = {}) {
    const {
      getCurrentTrackStyle = () => null,
      loadProfileByName = () => {},
      setVisibleSplits = () => {},
      setTimerAnchor = () => {},
      setEditMode = () => {},
      applyGameLogo = () => {},
      removeGameLogo = () => {},
      search = (typeof window !== "undefined" && window.location ? window.location.search : "")
    } = options;

    const params = new URLSearchParams(search);

    const profileParam = params.get("profile") || params.get("layout");
    if (profileParam) {
      loadProfileByName(profileParam.trim());
    }

    const edit = params.get("edit"); // '1' | 'true'

    const splitsParam = params.get("splits");
    const angleParam = params.get("angle");

    if (splitsParam) {
      setVisibleSplits(splitsParam.toLowerCase().trim());
    }
    if (angleParam && typeof localStorage !== "undefined") {
      const a = angleParam.toLowerCase().trim();
      localStorage.setItem(STORAGE_KEYS.SPLIT_ANGLE, (a === "40" || a === "angled") ? "angled" : ((a === "flat" || a === "horizontal") ? "horizontal" : "auto"));
    }

    const timerAnchorParam = params.get("timeranchor") || params.get("anchor");
    if (timerAnchorParam) {
      const a = timerAnchorParam.toLowerCase().trim();
      if (a === "auto" || a === "right" || a === "left") {
        setTimerAnchor(a);
      }
    }

    const lastSplitParam = params.get("lastsplit") || params.get("showlastsplit");
    if (lastSplitParam) {
      const val = (lastSplitParam.toLowerCase().trim() !== "false" && lastSplitParam.trim() !== "0");
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEYS.ALWAYS_SHOW_LAST, val ? "true" : "false");
      }
      if (typeof document !== "undefined") {
        const cbLast = document.getElementById("cb-always-show-last-split");
        if (cbLast) cbLast.checked = val;
      }
    }

    // Track style URL parameters
    const orientParam = params.get("orient") || params.get("orientation");
    const namePosParam = params.get("namepos");
    const deltaPosParam = params.get("deltapos");
    const pinPosParam = params.get("pinpos");
    const barSizeParam = params.get("barsize");
    const dotSizeParam = params.get("dotsize");
    const nameFontParam = params.get("namefont");
    const deltaFontParam = params.get("deltafont");

    const currentTrackStyle = getCurrentTrackStyle();

    if (currentTrackStyle) {
      if (orientParam) {
        const o = orientParam.toLowerCase().trim();
        if (o === "vertical" || o === "vert" || o === "v") {
          currentTrackStyle.orientation = "vertical";
          if (currentTrackStyle.namePos === "top" || currentTrackStyle.namePos === "bottom") currentTrackStyle.namePos = "left";
          if (currentTrackStyle.deltaPos === "top" || currentTrackStyle.deltaPos === "bottom") currentTrackStyle.deltaPos = "right";
        } else if (o === "horizontal" || o === "horiz" || o === "h") {
          currentTrackStyle.orientation = "horizontal";
        }
      }
      if (namePosParam) {
        const np = namePosParam.toLowerCase().trim();
        if (["top", "bottom", "left", "right"].includes(np)) currentTrackStyle.namePos = np;
      }
      if (deltaPosParam) {
        const dp = deltaPosParam.toLowerCase().trim();
        if (["top", "bottom", "left", "right"].includes(dp)) currentTrackStyle.deltaPos = dp;
      }
      if (pinPosParam) {
        const pp = pinPosParam.toLowerCase().trim();
        if (["auto", "top", "bottom", "left", "right"].includes(pp)) currentTrackStyle.pinPos = pp;
      }
      if (barSizeParam) currentTrackStyle.barHeight = parseInt(barSizeParam, 10) || currentTrackStyle.barHeight;
      if (dotSizeParam) currentTrackStyle.dotSize = parseInt(dotSizeParam, 10) || currentTrackStyle.dotSize;
      if (nameFontParam) currentTrackStyle.nameFontSize = parseInt(nameFontParam, 10) || currentTrackStyle.nameFontSize;
      if (deltaFontParam) currentTrackStyle.deltaFontSize = parseInt(deltaFontParam, 10) || currentTrackStyle.deltaFontSize;

      const ghostLenParam = params.get("ghostlen") || params.get("ghostlength") || params.get("pinlen");
      if (ghostLenParam) {
        const num = parseInt(ghostLenParam, 10);
        if (!isNaN(num)) currentTrackStyle.ghostPinLength = Math.max(0, Math.min(60, num));
      }

      const ghostSizeParam = params.get("ghostsize") || params.get("pinsize") || params.get("pinheadsize");
      if (ghostSizeParam) {
        const num = parseInt(ghostSizeParam, 10);
        if (!isNaN(num)) currentTrackStyle.ghostPinSize = Math.max(16, Math.min(60, num));
      }

      const bgParam = params.get("bg");
      const bgBlurParam = params.get("bgblur");
      if (bgParam) {
        const b = bgParam.toLowerCase().trim();
        if (b === "0" || b === "off" || b === "none" || b === "false") currentTrackStyle.bgOpacity = 0;
        else if (b === "subtle" || b === "light") currentTrackStyle.bgOpacity = 35;
        else if (b === "glass" || b === "medium") currentTrackStyle.bgOpacity = 55;
        else if (b === "dark" || b === "solid") currentTrackStyle.bgOpacity = 80;
        else {
          const num = parseInt(b, 10);
          if (!isNaN(num)) currentTrackStyle.bgOpacity = Math.max(0, Math.min(95, num));
        }
      }
      if (bgBlurParam) {
        const num = parseInt(bgBlurParam, 10);
        if (!isNaN(num)) currentTrackStyle.bgBlur = Math.max(0, Math.min(25, num));
      }
    }

    const ghostParam = params.get("ghost");
    if (ghostParam) {
      const g = ghostParam.toLowerCase().trim();
      const setGhost = window.LiveSplit.Overlay.setGhostComparison;
      if (setGhost) {
        setGhost(g);
      } else if (typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEYS.GHOST_COMPARISON, g);
      }
    }

    const logoParam = params.get("logo");
    if (logoParam) {
      const l = logoParam.trim();
      if (l.toLowerCase() === "none" || l.toLowerCase() === "off" || l.toLowerCase() === "false" || l.toLowerCase() === "0") {
        removeGameLogo();
      } else {
        applyGameLogo(l);
      }
    }

    if (edit === "1" || edit === "true") {
      setTimeout(() => setEditMode(true), 100);
    }
  }

  // Global namespace export
  window.LiveSplit = window.LiveSplit || {};
  window.LiveSplit.LayoutParams = {
    getUrlVisibility,
    parseUrlParameters
  };
})();
