"use client";

import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from "react";

type AuthFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  type?: string;
  icon?: ReactNode;
  trailing?: ReactNode;
  value: string;
};

/**
 * Floating-label input.
 * - Label is the placeholder when empty + unfocused; lifts and shrinks when
 *   the field is focused OR has a value.
 * - A gradient underline animates left→right on focus.
 * - Optional `icon` slot on the left, optional `trailing` slot on the right
 *   (used for the password eye-toggle).
 */
export const AuthField = forwardRef<HTMLInputElement, AuthFieldProps>(
  function AuthField(
    { label, type = "text", icon, trailing, id: providedId, value, onFocus, onBlur, className, ...rest },
    ref,
  ) {
    const generatedId = useId();
    const id = providedId ?? generatedId;
    const [focused, setFocused] = useState(false);
    const filled = value.length > 0;
    const floating = focused || filled;

    return (
      <div className={`auth-field group relative ${className ?? ""}`}>
        {icon && (
          <div
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B] transition-colors duration-200 group-focus-within:text-[#0F172A]"
          >
            {icon}
          </div>
        )}

        <label
          htmlFor={id}
          className="pointer-events-none absolute font-medium select-none"
          style={{
            left: icon ? 44 : 16,
            top: floating ? 8 : "50%",
            transform: floating ? "translateY(0)" : "translateY(-50%)",
            fontSize: floating ? 12 : 15,
            color: floating
              ? focused
                ? "rgb(168, 4, 0)"
                : "#64748B"
              : "#64748B",
            letterSpacing: floating ? "0.08em" : "0",
            textTransform: floating ? "uppercase" : "none",
            fontWeight: floating ? 700 : 500,
            transition:
              "top 220ms cubic-bezier(0.2, 0.7, 0.3, 1), transform 220ms cubic-bezier(0.2, 0.7, 0.3, 1), font-size 220ms ease, color 220ms ease, letter-spacing 220ms ease",
          }}
        >
          {label}
        </label>

        <input
          ref={ref}
          id={id}
          type={type}
          value={value}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          className="block w-full bg-transparent text-[16px] text-[#0F172A] outline-none font-medium"
          style={{
            paddingLeft: icon ? 46 : 18,
            paddingRight: trailing ? 46 : 18,
            paddingTop: 24,
            paddingBottom: 12,
            caretColor: "rgb(168, 4, 0)",
          }}
        />

        {trailing && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {trailing}
          </div>
        )}

        <div
          aria-hidden
          className="auth-field-underline"
          style={{ transform: focused ? "scaleX(1)" : "scaleX(0)" }}
        />
      </div>
    );
  },
);
