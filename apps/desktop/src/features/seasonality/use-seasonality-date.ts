import { useEffect, useState } from "react";

export function localSeasonalityDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Local calendar changes and returning from sleep invalidate date-bound scans. */
export function useSeasonalityDate() {
  const [today, setToday] = useState(localSeasonalityDate);
  useEffect(() => {
    const update = () => setToday(localSeasonalityDate());
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return today;
}
