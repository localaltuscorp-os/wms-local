"use client";
import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

export const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 6, align = "end", collisionPadding = 12, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      align={align}
      collisionPadding={collisionPadding}
      className={cn(
        // z-[100] — above the sticky public-app header (z-50) and the admin
        // sidebar's stacking context.  Dropdowns must always overlay chrome.
        // overflow-y-auto + Radix's available-height CSS var keeps long menus
        // (e.g. the task row-action menu with 10+ items) inside the viewport
        // instead of clipping off the top when they open upward.
        "z-[100] min-w-[14rem] rounded-chip border border-hairline-strong bg-surface-card p-1",
        "max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto overflow-x-hidden",
        "data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className,
      )}
      style={{ boxShadow: "0 16px 40px rgba(15, 23, 42, 0.12)" }}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";

export const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    danger?: boolean;
  }
>(({ className, danger, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex items-center gap-2.5 px-3.5 py-2.5 rounded-pill text-[15px] font-medium cursor-pointer outline-none",
      "data-[highlighted]:bg-surface-soft",
      "data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed",
      danger
        ? "text-red-deep data-[highlighted]:bg-red-bg"
        : "text-ink-strong",
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = "DropdownMenuItem";

export const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("h-px my-1 bg-hairline", className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

export const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn(
      "px-3 py-1.5 text-table-head",
      className,
    )}
    {...props}
  />
));
DropdownMenuLabel.displayName = "DropdownMenuLabel";

export const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      "flex items-center gap-2.5 px-3.5 py-2.5 rounded-pill text-[15px] font-medium cursor-pointer outline-none",
      "data-[highlighted]:bg-surface-soft data-[state=open]:bg-surface-soft",
      "text-ink-strong",
      className,
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto size-4 text-ink-subtle" />
  </DropdownMenuPrimitive.SubTrigger>
));
DropdownMenuSubTrigger.displayName = "DropdownMenuSubTrigger";

export const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, collisionPadding = 12, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    ref={ref}
    collisionPadding={collisionPadding}
    className={cn(
      // z-[100] to match the parent Content (must stay above the sticky
      // z-50 header). Same available-height + scroll fallback so long
      // submenus (e.g. Reassign Doer with the full employee list) never
      // overflow the viewport.
      "z-[100] min-w-[12rem] rounded-chip border border-hairline-strong bg-surface-card p-1",
      "max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto overflow-x-hidden",
      "data-[state=open]:animate-in data-[state=open]:fade-in-0",
      className,
    )}
    style={{ boxShadow: "0 16px 40px rgba(15, 23, 42, 0.12)" }}
    {...props}
  />
));
DropdownMenuSubContent.displayName = "DropdownMenuSubContent";

export { Check };
