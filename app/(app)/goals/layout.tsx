import { notFound } from "next/navigation";
import { goalsCascadeEnabled } from "@/lib/goals/flag";

/**
 * Goals Cascade module gate. The whole `/goals` surface ships behind the
 * `GOALS_CASCADE_OFF` kill-switch — when disabled, every route 404s. Access is
 * re-asserted inside each page (`requireGoalsAccess`) because layout gates are
 * unreliable on prod, so this layout only enforces the module flag.
 */
export default function GoalsLayout({ children }: { children: React.ReactNode }) {
  if (!goalsCascadeEnabled()) notFound();
  return <>{children}</>;
}
