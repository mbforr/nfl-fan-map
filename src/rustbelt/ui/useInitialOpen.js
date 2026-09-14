import { useEffect, useState } from "react";

/** Panels start open on desktop, collapsed on mobile, and re-sync on resize. */
export default function useInitialOpen() {
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 768px)").matches;
  });
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const fn = (e) => setOpen(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return [open, setOpen];
}
