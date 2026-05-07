import { useEffect, useState } from "react";

// Augment Navigator with the Network Information API + Device Memory API
// types that are not yet in the standard lib.dom.d.ts.
interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
  addEventListener?: (type: "change", handler: () => void) => void;
  removeEventListener?: (type: "change", handler: () => void) => void;
}

interface NavigatorWithCapability extends Navigator {
  connection?: NetworkInformationLike;
  deviceMemory?: number;
}

/**
 * Returns `true` when we should drop heavy animations / shaders / blur
 * filters. Triggers on:
 *   - User preference: `prefers-reduced-motion: reduce`
 *   - Save-Data header (`navigator.connection.saveData`)
 *   - Slow connection (`2g`/`slow-2g`/`3g`)
 *   - Low memory device (< 4 GB via `navigator.deviceMemory`)
 *   - Few CPU cores (< 4 via `navigator.hardwareConcurrency`)
 *
 * Re-evaluates when the user toggles their motion preference.
 */
export function useReducedAnimations(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => evaluate());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(evaluate());

    if (mql.addEventListener) {
      mql.addEventListener("change", onChange);
    } else if (mql.addListener) {
      // Safari < 14 fallback.
      mql.addListener(onChange);
    }

    const conn = (navigator as NavigatorWithCapability).connection;
    conn?.addEventListener?.("change", onChange);

    return () => {
      if (mql.removeEventListener) {
        mql.removeEventListener("change", onChange);
      } else if (mql.removeListener) {
        mql.removeListener(onChange);
      }
      conn?.removeEventListener?.("change", onChange);
    };
  }, []);

  return reduced;
}

function evaluate(): boolean {
  if (typeof window === "undefined") return false;

  // Headless browsers (Playwright, Selenium, etc.) report navigator.webdriver
  // as true. The WebGL shader causes GPU stalls under CI Chromium that can
  // freeze the page mid-test, so always fall back to the static backdrop.
  if (typeof navigator !== "undefined" && navigator.webdriver) {
    return true;
  }

  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return true;
  }

  const nav = navigator as NavigatorWithCapability;
  const conn = nav.connection;
  if (conn?.saveData) return true;
  if (
    conn?.effectiveType &&
    ["slow-2g", "2g", "3g"].includes(conn.effectiveType)
  ) {
    return true;
  }

  if (typeof nav.deviceMemory === "number" && nav.deviceMemory < 4) {
    return true;
  }
  if (
    typeof nav.hardwareConcurrency === "number" &&
    nav.hardwareConcurrency > 0 &&
    nav.hardwareConcurrency < 4
  ) {
    return true;
  }

  return false;
}
