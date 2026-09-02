"use client";
import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "start", sideOffset = 8, collisionPadding = 12, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(
        // z-[200] so popovers always sit above the sticky z-50 app header, any
        // Dialog content AND the app's drawers/modals (WeeklyGoalDrawer z-120,
        // event editor z-150, goal-edit dialog z-200 — at equal z the popover's
        // later-mounted portal paints on top). A popover is transient (closes on
        // any outside pointer-down), so it can never permanently cover chrome —
        // but it MUST never be buried under the surface that owns its trigger
        // (that was the "Select opens behind the drawer" bug on the Goals board).
        // available-height + overflow-y-auto keeps tall popovers (DayPicker,
        // MultiSelect with long lists) inside the viewport instead of clipping.
        "z-[200] rounded-chip border border-hairline-strong bg-surface-card p-2",
        "max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overflow-x-hidden",
        "data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className,
      )}
      style={{ boxShadow: "0 12px 32px rgba(15, 23, 42, 0.10)" }}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = "PopoverContent";
