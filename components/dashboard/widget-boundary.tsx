"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RotateCw } from "lucide-react";
import { DASHBOARD_CARD } from "./section-chrome";

/**
 * WIDGET ERROR BOUNDARY — keeps one broken card from taking the dashboard.
 *
 * The page already has a try/catch around its data load and an app-level
 * error.tsx behind that. Neither helps here: the try/catch only covers the
 * FETCH, so anything that throws while RENDERING escapes it, and error.tsx
 * replaces the whole page with a digest ref. That is the failure this exists
 * to contain — a single widget reading a field that is not there should cost
 * you that widget, not the dashboard.
 *
 * It must be a class: React has no hook equivalent of componentDidCatch.
 */
interface Props {
  children: React.ReactNode;
  /** Names the widget in the fallback, e.g. "the aging heatmap". */
  label: string;
}

interface State {
  error: Error | null;
}

class WidgetBoundaryInner extends React.Component<Props & { onRetry: () => void }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Logged with the label so a server-side digest can be matched to a widget
    // instead of just to the page.
    console.error(`[dashboard widget] ${this.props.label} failed:`, error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className={`${DASHBOARD_CARD} p-6`}>
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)",
              color: "var(--color-altus-red)",
            }}
          >
            <AlertTriangle size={18} strokeWidth={2.4} />
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-slate-900">
              Unable to load {this.props.label}.
            </p>
            <p className="mt-0.5 text-[12.5px] font-semibold text-slate-500">
              The rest of the dashboard is unaffected.
            </p>
            <button
              type="button"
              onClick={() => {
                // Clear the caught error FIRST, then refresh: leaving it set
                // would keep the fallback up even after fresh data arrived.
                this.setState({ error: null });
                this.props.onRetry();
              }}
              className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[12.5px] font-bold text-white transition-colors hover:bg-slate-800"
            >
              <RotateCw size={13} strokeWidth={2.6} />
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}

/** Wrapper supplying `router.refresh()`, which a class component cannot hook. */
export function WidgetBoundary({ children, label }: Props) {
  const router = useRouter();
  return (
    <WidgetBoundaryInner label={label} onRetry={() => router.refresh()}>
      {children}
    </WidgetBoundaryInner>
  );
}
