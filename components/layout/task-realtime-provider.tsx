"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { clientEnv } from "@/lib/env-client";

type TaskRealtimeState = {
  connected: boolean;
};

const TaskRealtimeContext = createContext<TaskRealtimeState>({
  connected: false,
});

// One provider owns one channel and folds a burst of task changes into one
// server refresh per browser tab. The old indicator-owned channels multiplied
// subscriptions and refreshes when desktop + mobile chrome were both mounted.
export const TASK_REFRESH_WINDOW_MS = 20_000;

export function TaskRealtimeProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [connected, setConnected] = useState(false);
  const realtimeDisabled = process.env.NEXT_PUBLIC_DISABLE_REALTIME !== "false";

  useEffect(() => {
    if (realtimeDisabled) return;

    const supabase = createBrowserClient(
      clientEnv.NEXT_PUBLIC_SUPABASE_URL,
      clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const channel = supabase
      .channel("tasks-changes-app")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        () => {
          if (refreshTimer) return;
          refreshTimer = setTimeout(() => {
            startTransition(() => router.refresh());
            refreshTimer = null;
          }, TASK_REFRESH_WINDOW_MS);
        },
      )
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [realtimeDisabled, router]);

  const value = useMemo(() => ({ connected }), [connected]);

  return (
    <TaskRealtimeContext.Provider value={value}>
      {children}
    </TaskRealtimeContext.Provider>
  );
}

export function useTaskRealtime(): TaskRealtimeState {
  return useContext(TaskRealtimeContext);
}
