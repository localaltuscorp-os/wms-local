import type { SVGProps } from "react";

/**
 * The HR module mark: an ID badge, clip and all, sitting inside a rounded
 * square outline.
 *
 * DRAWN, NOT IMPORTED. No lucide glyph is this shape - the closest, IdCardLanyard
 * (what this replaced), is a bare card with no surrounding frame. A raster asset
 * was the other option and a worse one: the mark renders at 20px on a 2x display
 * and would need its own file per density, and it could not take the tile's
 * colour the way `currentColor` does here.
 *
 * THE PERSON IS A HOLE, NOT A RED SHAPE. The badge and the figure inside it are
 * ONE path with `fill-rule: evenodd`, so the figure is knocked out and whatever
 * sits behind the icon shows through. That matters because the tile behind it is
 * a gradient (--color-altus-red -> --color-altus-red-deep): painting the figure
 * in a flat red would match at exactly one point on that ramp and be visibly off
 * everywhere else, and it would break outright anywhere the mark is used on a
 * different background.
 *
 * The clip is part of the badge's own outline rather than a second rectangle
 * stacked on top - under evenodd, two overlapping shapes cancel where they meet
 * and would have punched a hole through the join.
 *
 * Geometry is in a 24x24 box so it drops into any `size`/`strokeWidth` call site
 * that previously held a lucide icon.
 */
export function HrMark({
  size = 20,
  strokeWidth = 2,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      {...props}
    >
      {/* Outer frame */}
      <rect
        x="2.1"
        y="2.1"
        width="19.8"
        height="19.8"
        rx="5.4"
        stroke="currentColor"
        strokeWidth={strokeWidth}
      />
      {/* Badge + clip as one outline; figure knocked out by evenodd. */}
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="
          M8.7 7.8 L10.9 7.8 L10.9 6.5
          A0.9 0.9 0 0 1 11.8 5.6 L12.2 5.6
          A0.9 0.9 0 0 1 13.1 6.5 L13.1 7.8 L15.3 7.8
          A1.8 1.8 0 0 1 17.1 9.6 L17.1 16.6
          A1.8 1.8 0 0 1 15.3 18.4 L8.7 18.4
          A1.8 1.8 0 0 1 6.9 16.6 L6.9 9.6
          A1.8 1.8 0 0 1 8.7 7.8 Z
          M12.05 10.35
          A1.55 1.55 0 1 0 12.05 13.45
          A1.55 1.55 0 1 0 12.05 10.35 Z
          M9.3 16.6
          A2.75 2.75 0 0 1 14.8 16.6 Z
        "
      />
    </svg>
  );
}
