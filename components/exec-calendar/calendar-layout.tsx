"use client";

import * as React from "react";

const CalendarMaximizeContext = React.createContext<{ maximized: boolean; toggle: () => void } | null>(null);

export function useCalendarMaximize() {
  const value = React.useContext(CalendarMaximizeContext);
  if (!value) throw new Error("Calendar layout context is missing");
  return value;
}

export function ExecCalendarLayout({ calendar, sidebar }: { calendar: React.ReactNode; sidebar: React.ReactNode }) {
  const [maximized, setMaximized] = React.useState(false);
  React.useEffect(() => {
    if (!maximized) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMaximized(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [maximized]);

  return (
    <CalendarMaximizeContext.Provider value={{ maximized, toggle: () => setMaximized((value) => !value) }}>
      <div className={`grid gap-4 ${maximized ? "grid-cols-1" : "lg:grid-cols-[minmax(0,1fr)_300px]"}`}>
        <div className={`min-w-0 ${maximized ? "h-[calc(100vh-220px)] overflow-auto" : ""}`}>{calendar}</div>
        {!maximized && <aside className="space-y-4">{sidebar}</aside>}
      </div>
    </CalendarMaximizeContext.Provider>
  );
}
