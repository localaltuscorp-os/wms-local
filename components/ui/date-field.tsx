"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";
import { formatDMonY } from "@/lib/format";

/**
 * A date input that DISPLAYS dd-MMM-yyyy (02-Dec-2026).
 *
 * `<input type="date">` renders in the browser's own locale — dd/mm/yyyy here,
 * mm/dd/yyyy in the US — and that chrome cannot be styled or overridden. So the
 * visible control is a text box we format ourselves, with a real (offscreen)
 * date input kept alongside purely to drive the native calendar picker.
 *
 * Drop-in for `<input type="date">`: `value` is still an ISO `yyyy-MM-dd`
 * string and `onChange` still receives an event whose `target.value` is ISO, so
 * existing call sites need no change beyond the tag name.
 *
 * Typing is forgiving — 02-Dec-2026, 02/12/2026, 2-12-2026 and 2026-12-02 all
 * land on the same day — and the box re-formats on blur.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Read whatever has been typed so far into its parts.
 *
 * Deliberately tolerant, because this runs on EVERY keystroke: a half-finished
 * date has to survive being re-read, or the field fights the person typing.
 * `monRaw` is what they have typed toward the month so far, so a single digit
 * can be shown back before it resolves to a month name.
 */
interface Parts {
  day: string;
  /** Two-digit month, only once it is unambiguous. */
  mon: string;
  monRaw: string;
  year: string;
}

function parts(raw: string): Parts {
  const v = raw.trim();

  // ISO in, pasted from elsewhere.
  const isoMatch = v.match(/^(\d{4})-(\d{1,2})-(\d{0,2})$/);
  if (isoMatch) {
    const mon = String(+isoMatch[2]!).padStart(2, "0");
    return { day: isoMatch[3] ?? "", mon, monRaw: mon, year: isoMatch[1]! };
  }

  // Otherwise read left to right BY POSITION, not by regex alternation — an
  // alternation happily matches an empty month and swallows it into the year.
  const t = v.replace(/[^0-9A-Za-z]/g, "");
  const at = t.search(/[A-Za-z]/);

  if (at >= 0) {
    // Month typed by name: 05aug2026.
    const day = t.slice(0, Math.min(at, 2));
    const rest = t.slice(at);
    const name = rest.replace(/[^A-Za-z]/g, "").slice(0, 3);
    const year = rest.replace(/[^0-9]/g, "").slice(0, 4);
    const idx = name ? MONTHS.findIndex((x) => x.toLowerCase().startsWith(name.toLowerCase())) : -1;
    return { day, mon: idx < 0 ? "" : String(idx + 1).padStart(2, "0"), monRaw: name, year };
  }

  // All digits: ddmmyyyy.
  const day = t.slice(0, 2);
  const monRaw = t.slice(2, 4);
  const year = t.slice(4, 8);
  const valid = monRaw.length === 2 && +monRaw >= 1 && +monRaw <= 12;
  return { day, mon: valid ? monRaw : "", monRaw, year };
}

/**
 * Render the parts back as dd-MMM-yyyy, hyphens appearing as they are earned.
 *
 * `growing` is false while the user is DELETING, and it matters: when growing we
 * auto-complete the month and add the separator that invites the next part, but
 * doing that on a backspace makes the field un-clearable — "28-De" would expand
 * straight back to "28-Dec" and the caret could never get past it.
 */
export function mask(raw: string, growing = true): string {
  const { day, mon, monRaw, year } = parts(raw);
  if (!day) return "";

  if (!growing) {
    // Shrinking: show exactly what is left, no completion, no trailing hyphen.
    let out = day;
    if (monRaw) out += `-${monRaw}`;
    if (year) out += `-${year}`;
    return out;
  }

  let out = day;
  // The day is done at two digits, so invite the month.
  if (day.length < 2 && !monRaw) return out;
  out += "-";

  if (mon) out += MONTHS[+mon - 1];
  else if (monRaw) return out + monRaw; // still mid-month, show it verbatim
  else return out;

  // The month resolved, so invite the year.
  if (year || raw.replace(/[^0-9A-Za-z]/g, "").length > day.length + monRaw.length) out += "-";
  return out + year;
}

/** The ISO value, but only once all three parts are actually complete. */
export function toIso(raw: string): string {
  const { day, mon, year } = parts(raw);
  if (day.length === 0 || mon.length !== 2 || year.length !== 4) return "";
  return iso(+year, +mon, +day);
}

/** Drop the character before `caret` — used when a delete lands on a hyphen. */
function cutAt(s: string, caret: number): string {
  return s.slice(0, Math.max(0, caret - 1)) + s.slice(caret);
}

const countAlnum = (s: string) => (s.match(/[0-9A-Za-z]/g) ?? []).length;

/**
 * Index in `s` just past its `n`th alphanumeric, then past any separators that
 * follow it.
 *
 * That final skip is the whole trick: the mask adds a hyphen the moment a part
 * completes, and a caret left sitting before it means the next digit lands on
 * the wrong side — which is how "28-Dec-" + "2026" became "28-Dec-0262".
 */
function posAfterAlnum(s: string, n: number): number {
  let pos = 0;
  if (n > 0) {
    let seen = 0;
    pos = s.length;
    for (let i = 0; i < s.length; i++) {
      if (/[0-9A-Za-z]/.test(s[i]!)) {
        seen++;
        if (seen === n) {
          pos = i + 1;
          break;
        }
      }
    }
  }
  while (pos < s.length && !/[0-9A-Za-z]/.test(s[pos]!)) pos++;
  return pos;
}

/** Build an ISO string, rejecting impossible days (31 Feb and friends). */
function iso(y: number, mo: number, d: number): string {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return "";
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export interface DateFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> {
  /** ISO `yyyy-MM-dd`, exactly as `<input type="date">` takes it. */
  value?: string | null;
  /** Receives an event whose `target.value` is ISO `yyyy-MM-dd` (or ""). */
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function DateField({ value, onChange, className, disabled, ...rest }: DateFieldProps) {
  const iso0 = value ?? "";
  const [text, setText] = React.useState(() => (iso0 ? formatDMonY(iso0) : ""));
  const [focused, setFocused] = React.useState(false);
  const pickerRef = React.useRef<HTMLInputElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  /** Where the caret should sit once React has painted the masked text. */
  const caretRef = React.useRef<number | null>(null);

  React.useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el || caretRef.current === null) return;
    const pos = caretRef.current;
    caretRef.current = null;
    if (document.activeElement === el) el.setSelectionRange(pos, pos);
  });

  // Follow the value from outside — but never fight the user mid-keystroke.
  // Derived-state-during-render, the sanctioned pattern: state, not a ref, so
  // React sees the update rather than it happening behind its back.
  const [lastIso, setLastIso] = React.useState(iso0);
  if (iso0 !== lastIso && !focused) {
    setLastIso(iso0);
    setText(iso0 ? formatDMonY(iso0) : "");
  }

  /** Report an ISO value upward in the shape a native date input would. */
  function emit(nextIso: string) {
    setLastIso(nextIso);
    onChange?.({ target: { value: nextIso } } as React.ChangeEvent<HTMLInputElement>);
  }

  return (
    <span className="relative block">
      <input
        {...rest}
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        className={className}
        value={text}
        placeholder={rest.placeholder ?? "dd-mmm-yyyy"}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onChange={(e) => {
          const typed = e.target.value;
          const caret = e.target.selectionStart ?? typed.length;
          const deleting = typed.length < text.length;

          // Deleting "through" a separator must eat the character before it too,
          // or the mask puts the hyphen straight back and the caret never moves.
          const onSeparator = deleting && /[^0-9A-Za-z]$/.test(typed.slice(0, caret));
          const seed = onSeparator ? cutAt(typed, caret) : typed;
          const next = mask(seed, !deleting);

          // Typing at the END — the overwhelmingly common case — simply keeps the
          // caret at the end. Counting characters cannot work here: the mask
          // rewrites a two-digit month into a three-letter name, so "2812" (4
          // characters) becomes "28-Dec" (5), and any index mapping drifts.
          const atEnd = caret >= typed.length;
          const upto = onSeparator ? Math.max(0, caret - 1) : caret;
          caretRef.current = atEnd ? next.length : posAfterAlnum(next, countAlnum(seed.slice(0, upto)));

          setText(next);
          const parsed = toIso(seed);
          // Emit as soon as it is a real date; clearing the box clears the value.
          if (parsed || seed.trim() === "") emit(parsed);
        }}
        onBlur={(e) => {
          setFocused(false);
          const parsed = toIso(text);
          // A complete date snaps to canonical form. An INCOMPLETE one is left
          // exactly as typed — wiping it is what makes a field feel unusable.
          if (parsed) setText(formatDMonY(parsed));
          rest.onBlur?.(e);
        }}
      />

      {/* The native picker, driven by the button. Offscreen rather than
          display:none — a hidden input cannot open its picker. */}
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        value={iso0}
        onChange={(e) => {
          const v = e.target.value;
          setText(v ? formatDMonY(v) : "");
          emit(v);
        }}
        className="pointer-events-none absolute bottom-0 right-8 h-0 w-0 opacity-0"
      />

      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label="Open calendar"
        onClick={() => {
          const el = pickerRef.current;
          if (!el) return;
          // showPicker is the only way to open the native calendar on demand;
          // where it is unavailable, focusing at least reveals it.
          if (typeof el.showPicker === "function") el.showPicker();
          else el.focus();
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-subtle transition-colors hover:bg-black/5 hover:text-ink-strong disabled:opacity-40"
      >
        <CalendarDays size={15} />
      </button>
    </span>
  );
}
