import { useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

// Preserve both reading position and keyboard focus across list/detail navigation.
export function useListNavigation() {
  const listScroll = useRef(0);
  const listFocus = useRef<HTMLElement | null>(null);
  const pending = useRef<"enter" | "back" | null>(null);
  const location = useLocation();
  useLayoutEffect(() => {
    if (pending.current === "enter") {
      const target = document.querySelector<HTMLElement>("[data-detail-start]");
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "start" });
    } else if (pending.current === "back") {
      if (listFocus.current?.isConnected)
        listFocus.current.focus({ preventScroll: true });
      window.scrollTo({ top: listScroll.current, behavior: "instant" });
    }
    pending.current = null;
  }, [location.key]);
  function enter(navigate: () => void) {
    if (!document.querySelector("[data-detail-start]")) {
      listScroll.current = window.scrollY;
      listFocus.current = document.activeElement?.closest('[role="dialog"]')
        ? document.querySelector<HTMLElement>("[data-comparison-trigger]")
        : (document.activeElement as HTMLElement);
    }
    pending.current = "enter";
    navigate();
  }
  function back(navigate: () => void) {
    pending.current = "back";
    navigate();
  }
  return { enter, back };
}
