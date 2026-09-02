import { BufferingState } from "@/components/ui/spinner";

/** Lightweight centered spinner — replaced the old skeleton placeholders, which
 *  rendered heavy animated DOM on every navigation. A plain spinner is cheap and
 *  gives instant loading feedback without the lag. */
export default function Loading() {
  return (
    <div className="flex min-h-[70vh] w-full items-center justify-center">
      <BufferingState label="Loading profile…" />
    </div>
  );
}
