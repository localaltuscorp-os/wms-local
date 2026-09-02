"use client";
import { useEffect, useState } from "react";
import { formatTime } from "@/lib/format";

export function UpdatedTimestamp({ initial }: { initial: Date }) {
  const [now, setNow] = useState(initial);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="text-mono text-ink-subtle text-sm">
      Updated {formatTime(now)}
    </span>
  );
}
