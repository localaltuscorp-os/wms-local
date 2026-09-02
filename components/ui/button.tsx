"use client";
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "outline";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  asChild?: boolean;
}

const variantClass: Record<Variant, string> = {
  primary:
    "bg-ink-strong text-white hover:opacity-90 transition-opacity duration-150",
  ghost:
    "bg-transparent text-ink-strong hover:bg-surface-soft transition-colors duration-150",
  outline:
    "border border-hairline-strong bg-surface-card text-ink-strong hover:bg-surface-soft transition-colors duration-150",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "outline", asChild, className, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 px-4 h-10 text-sm font-medium rounded-chip focus-visible:outline-2 disabled:opacity-50",
          variantClass[variant],
          className,
        )}
        style={{ outlineColor: "var(--color-altus-red)" }}
        {...props}
      >
        {children}
      </Comp>
    );
  },
);
Button.displayName = "Button";
