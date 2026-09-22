import { formatRs, formatRsCompact } from "@/lib/format";

/**
 * A rupee amount in the HR display format — "Rs. 10.12 Cr" / "Rs. 4.50 L" /
 * "Rs. 25,000" — with the exact "Rs. 10,12,11,999" on hover.
 */
export function RsAmount({ value, className }: { value: number; className?: string }) {
  return (
    <span className={className} title={formatRs(value)}>
      {formatRsCompact(value)}
    </span>
  );
}

export default RsAmount;
