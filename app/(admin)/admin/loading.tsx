import { LoadingRecovery } from "@/components/layout/loading-recovery";
import { BufferingState } from "@/components/ui/spinner";

/** Cheap navigation feedback plus a manual escape for a genuinely stalled request. */
export default function Loading() {
  return (
    <div className="flex min-h-[70vh] w-full items-center justify-center">
      <div className="flex flex-col items-center">
        <BufferingState label="Loading…" />
        <LoadingRecovery />
      </div>
    </div>
  );
}
