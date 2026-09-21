import { BufferingState } from "@/components/ui/spinner";

/**
 * One loading state for the Archive index and every module section beneath it.
 * Each of those pages counts across a dozen tables before it can draw a row, so
 * without this a click on "Archive Incentives" sits on the previous screen.
 */
export default function Loading() {
  return (
    <div className="flex min-h-[70vh] w-full items-center justify-center">
      <BufferingState label="Opening the archive…" />
    </div>
  );
}
