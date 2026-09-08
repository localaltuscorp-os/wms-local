---
name: altus-ui
description: The Altus OS UI design language — tokens, type scale, component recipes and traps. Load before writing, restyling or reviewing any page, component or CSS in this repo.
---

# Altus OS — UI language

Light-only (no dark mode). Warm paper ground → white cards → hairline borders → one red accent.

Everything below is a token or a recipe. **Never invent a hex, radius or font size.** If something
you need is not here, copy the nearest recipe rather than inventing a new look.

---

## 1. The two rules

**1 · Colour moves from fill to glyph.** Anything that *fills* takes the pastel container stop;
anything that is *text or icon* takes the `-deep` stop. So a "green badge" is a `--color-green` fill
with `--color-green-deep` text — never white on saturated green.

**2 · Red is for actions and identity only.** Buttons, the selected state, the brand mark, focus
rings. Never a surface, never body text.

---

## 2. Tokens

Red is **user-overridable** — every employee can pick their own accent, and `lib/appearance.ts`
rewrites the whole `--color-altus-red*` family inline on `<html>` per request. Hardcoding `#E10600`
or reaching for Tailwind's `red-600` breaks that. Always `var(--color-altus-red)`.

### Accent

| Token | Default | Use |
| --- | --- | --- |
| `--color-altus-red` | `#E10600` | action fills, CTA gradients, active states |
| `--color-altus-red-deep` | `#A80400` | ink on a red-tinted fill; gradient's second stop |
| `--color-altus-red-soft` | `#F8C8C7` | pastel tint |
| `--color-altus-red-wash` | `#FDF0F0` | page-level wash |

### Surfaces & ink

| Token | Value | Use |
| --- | --- | --- |
| `--color-canvas-base` | `#faf8f7` | page ground |
| `--color-surface-card` | `#ffffff` | cards, inputs, popovers |
| `--color-surface-soft` | `#f8f6f4` | inset wells, hover, segmented-group track |
| `--color-ink-strong` | `#0f172a` | headings, primary values |
| `--color-ink` | `#1f2937` | body (the `html` default) |
| `--color-ink-soft` | `#334155` | button labels, secondary |
| `--color-ink-muted` | `#475569` | supporting copy |
| `--color-ink-subtle` | `#5b6675` | placeholders, eyebrows, icons at rest |
| `--color-hairline` | `rgba(60,44,40,0.07)` | default border |
| `--color-hairline-strong` | `rgba(60,44,40,0.12)` | a border that must be seen |

### Status families

Each hue has four stops: `-bg` (wash) · *bare* (container/fill) · `-edge` (outline) · `-deep` (ink).

| Family | fill | ink | Typical meaning |
| --- | --- | --- | --- |
| `green` | `#c3ebcd` | `#0f5b2e` | done, approved, healthy |
| `blue` | `#d3e3fd` | `#174ea6` | in progress, informational |
| `yellow` | `#f5eda4` | `#7a5c00` | mid progress |
| `amber` | `#fbe0a6` | `#8a3d06` | needs attention |
| `orange` | `#ffd9c2` | `#973108` | low progress |
| `red` | `#f8c8c7` | `#A80400` | behind, failing |
| `slate` | `#dce2ea` | `#334155` | neutral, not started, total |

Also available with the same four-stop shape: `rose` `purple` `brown` `stone` `teal` `indigo`.

Compose with `color-mix` when you need it lighter:
`color-mix(in srgb, var(--color-green) 15%, transparent)`.

### Radii

| Token | Value | Use |
| --- | --- | --- |
| `rounded-section` | `16px` | toolbars, feature cards |
| `rounded-chip` | `12px` | small buttons, chips |
| `rounded-pill` | **`8px`** | toolbar controls — *see traps* |
| `rounded-2xl` | `16px` | cards, banners, icon tiles |
| `rounded-[20px]` | `20px` | the page header card |
| `rounded-full` | `999px` | actual pills, dots, avatars |

### Layout

`PageShell` is the only page container — `width="narrow|standard|wide|full"`
(`1120 / 1280 / 1400 / 1760px`) with a fluid `--page-gutter: clamp(1rem, 4vw, 2rem)`.
The sticky top bar publishes `--app-topbar-h` (56px on desktop); page-level sticky headers read it
so they pin beneath the bar rather than under it.

---

## 3. Type

Two families, both self-hosted variable fonts. Never add a font.

| Role | Stack | Weights |
| --- | --- | --- |
| Body / UI | `var(--font-sans)` → Roboto | 300–900 |
| Display | `var(--font-display), system-ui, sans-serif` → Bricolage Grotesque | **300–800** |

Display goes on headings, KPI numerals and brand marks only, applied inline:
`style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}`.

### Scale

| Role | Size · weight · tracking |
| --- | --- |
| Page title | `clamp(22px, 2vw, 32px)` · 800 · `-0.03em` · lh `1.02` · display |
| Card heading | `22px` · 700 · `-0.01em` |
| Section heading | `16px` · 800 · display |
| Body | `13.5px` · 500 |
| Secondary | `12.5px` · 400–500 · `--color-ink-muted` |
| Control label | `13px` · 700 |
| Small control | `12.5px` · 700 |
| Chip / badge | `11px` · 700 |
| Table header | `10.5px` · 700 · `uppercase` · `tracking-[0.1em]` · `--color-ink-subtle` |
| Eyebrow | `10–11px` · 900 · `uppercase` · `tracking-[0.08em]–[0.12em]` |

Numbers that sit in a column or update live get `tabular-nums`.

### Icons

`lucide-react` only. `size={13–16}` with `strokeWidth={2.2–2.4}` for UI chrome, `2.6–2.8` inside a
filled button or brand tile. Never set `fill` — icons inherit `currentColor`.

---

## 4. Recipes

Copy these. Do not re-derive them.

### Page header

```tsx
<PageCommandBar title="Page name" hint="One line of orientation, optional." actions={…} />
```

`rounded-[20px]` · white · `1px var(--color-hairline)` ·
`box-shadow: 0 1px 2px rgba(15,23,42,0.05), 0 18px 44px -30px rgba(15,23,42,0.22)` ·
header row `min-h-[56px] px-5 py-2.5`. The hint sits **inline right of the title on the same
baseline**, not underneath.

Never add an eyebrow pill ("MODULE · PAGE") or a paragraph under the title. The sidebar says which
room you are in; the title says which page.

### Toolbar strip

The container for search, filters and view toggles — anything that is chrome for the content below.

```tsx
<div
  className="mb-3 flex flex-wrap items-center gap-2 rounded-section border border-hairline px-3 py-2"
  style={{
    background: "linear-gradient(180deg, rgba(255,255,255,0.82), rgba(250,251,252,0.72))",
    backdropFilter: "blur(14px) saturate(140%)",
    WebkitBackdropFilter: "blur(14px) saturate(140%)",
    boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 10px 26px -20px rgba(15,23,42,0.18)",
  }}
>
```

Stack a second one below it on a busy page; give the second `animationDelay: "30ms"`.

### Buttons

All three share `h-9 rounded-pill px-3.5 text-[13px] font-bold` with `gap-1.5` to their icon.

**Primary — pastel CTA.** The default for every text-labelled action.

```tsx
<button className="pastel-cta wg-btn inline-flex h-9 items-center gap-1.5 rounded-pill px-3.5 text-[13px] font-bold">
  <Plus size={14} strokeWidth={2.8} /> New thing
</button>
```

That class gives `12%` accent fill on white, `--color-altus-red-deep` ink, and a `1.5px` `30%`
accent border. (`.brand-btn` is an alias of the same thing — prefer `.pastel-cta`.)

**Neutral — secondary.**

```tsx
className="inline-flex h-9 items-center gap-1.5 rounded-pill border border-hairline bg-surface-card px-3.5 text-[13px] font-bold text-ink-soft transition-all hover:border-hairline-strong hover:text-ink-strong disabled:opacity-50 disabled:cursor-not-allowed"
```

**Solid red.** Only when the action must carry white text — a first-run prompt, a destructive
confirm. Rare.

```tsx
style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
className="… text-white"
```

Icon-only: `size-9 rounded-lg border border-hairline-strong bg-surface-card text-ink-muted`.

### Segmented toggle

Group — `inline-flex h-9 items-center overflow-hidden rounded-pill border border-hairline-strong bg-surface-soft`
Segment — `h-full px-3 text-[12.5px] font-bold gap-1.5`

- rest — `background: transparent`, `color: var(--color-ink-subtle)`
- active — `linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))`,
  `color: #fff`, `box-shadow: 0 6px 14px -8px var(--color-altus-red-deep)`

### Filter pill (dropdown)

`inline-flex h-9 items-center gap-1.5 rounded-pill border px-3.5 text-[13px] font-bold` plus
`<ChevronDown size={14} strokeWidth={2.4} className="opacity-60" />`, `rotate-180` when open.

- rest — `border-hairline` · `bg-surface-card` · `text-ink-soft`
- active — border `color-mix(… accent 45%, transparent)`, fill `color-mix(… accent 7%, transparent)`,
  ink `--color-altus-red-deep`

Label: nothing selected → `All {things}` · one → the value itself · many → `{n} {things}`.

### Stat chip (a filterable KPI)

`rounded-xl`, `padding: 5px 10px`, `gap-2`, three children — a `size-2 rounded-full` dot in
`var(--color-<tone>)`, the number in display/900/16px/`tabular-nums`, then the label at `11.5px`/600.

- rest — `bg-surface-card`, `box-shadow: inset 0 0 0 1px var(--color-hairline)`
- active — `color-mix(in srgb, var(--color-<tone>) 8%, var(--color-surface-card))`,
  `box-shadow: inset 0 0 0 1.5px var(--color-<tone>-deep)`

### Status badge

```tsx
<span className="inline-flex items-center whitespace-nowrap rounded-pill px-2 py-0.5 text-[11px] font-bold"
      style={{ color: "var(--color-green-deep)", background: "color-mix(in srgb, var(--color-green) 15%, transparent)" }}>
```

Pick the family from the status table. **Always** the `-deep` stop for the text.

### Input

```tsx
className="h-9 w-full rounded-pill border border-hairline bg-surface-card pl-9 pr-9 text-[13.5px] font-medium text-ink-strong outline-none transition-colors focus:border-altus-red"
```

with a leading
`<Search size={15} strokeWidth={2.4} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle" />`.

Select shells reuse the same geometry with `focus-within:border-altus-red hover:border-hairline-strong`.

**Naming convention:** the one global field says `Global search`; every page-level field says
`Local search — <what it filters>` and carries
`title="Local search — filters only the list on this page"`. Two identical magnifying glasses with
different scopes is a bug.

### Table

```tsx
<th className="py-2 pr-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
<td className="py-2.5 pr-3 text-[12.5px] text-ink-subtle">
```

Name cell `text-[13.5px] font-bold text-ink-strong`; numeric cell
`text-right text-[13px] tabular-nums text-ink-strong`. Rows `border-b border-hairline last:border-0`,
hover `bg-surface-soft`.

Header and body cell must carry **identical horizontal padding**, or the column reads misaligned. A
badge with its own padding (a status pill) needs that padding added to its header to line the text
up. When a gap looks wrong, tune it per *boundary* (`pl-4 pr-5`), not per column.

### Empty state

```tsx
<div className="rounded-2xl border border-hairline bg-surface-card px-8 py-14 text-center"
     style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
  <span className="mx-auto mb-4 inline-flex size-16 items-center justify-center rounded-2xl"
        style={{ background: "color-mix(in srgb, var(--color-altus-red) 9%, transparent)", color: "var(--color-altus-red)" }}>
    <Icon size={30} strokeWidth={2.2} />
  </span>
  <h3 className="font-bold text-ink-strong" style={{ fontSize: 22, letterSpacing: "-0.01em" }}>…</h3>
  <p className="mx-auto mt-2 max-w-[46ch] font-medium"
     style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--color-ink-muted)" }}>…</p>
</div>
```

Copy pattern: the heading names the empty thing (`No goals in Sep 2026 yet`); the body says what to
do next, not that the list is empty.

### Feature banner

`rounded-2xl border p-5`, an accent-tinted gradient, a `size-11 rounded-2xl` gradient icon tile,
heading `text-[16px] font-black` in display, body `text-[13.5px] font-medium text-ink-muted`, CTA on
the right, `size-8 rounded-full` dismiss at the far right.

```
background:  linear-gradient(135deg, color-mix(in srgb, var(--color-altus-red) 7%, var(--color-surface-card)), var(--color-surface-card) 72%)
borderColor: color-mix(in srgb, var(--color-altus-red) 34%, transparent)
boxShadow:   0 10px 30px -18px color-mix(in srgb, var(--color-altus-red) 45%, transparent)
```

---

## 5. Motion

| Class | What it does |
| --- | --- |
| `.wg-rise` | entrance — `fadeUp 0.55s cubic-bezier(0.22,1,0.36,1) both`. Put it on cards and toolbars; stagger siblings with `animationDelay`. |
| `.wg-btn` | hover `translateY(-2px)`, active `translateY(0) scale(0.985)` |

Focus ring, on every interactive element:

```
outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60
focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]
```

Transform and opacity only. Anything decorative must switch off under
`@media (prefers-reduced-motion: reduce)`.

---

## 6. Traps

Each of these has already caused a real bug in this codebase.

- **`rounded-pill` is 8px, not a pill.** For an actual pill use `rounded-full`.
- **Never Tailwind palette colours** (`bg-red-600`, `text-slate-600`). They ignore the user's accent
  and the ink ramp. Use the tokens.
- **Never hardcode `#E10600`** — same reason.
- A new status colour goes into `globals.css` **twice**: in `@theme inline` *and* in the `:root`
  mirror. Tailwind v4 only emits theme vars referenced by a utility class, so a token used only as
  `var()` inside a `style` prop renders transparent without the mirror.
- **`width: 100%` on one table column squeezes every sibling to its minimum content width** — one
  word — which wraps names and badges onto three lines. If you use it, every other column needs
  `whitespace-nowrap`. Better: leave the table content-sized and make the wrapper
  `w-fit max-w-full overflow-x-auto`.
- **No `zoom` or `transform` on any ancestor of page content.** It double-applies to Radix and
  floating-ui portals and throws every dropdown off-screen. Density scaling uses `font-size` for
  exactly this reason.
- **The display font stops at weight 800.** Asking for 900 silently clamps — it is not bolder.
- **An inline `<script>` never runs in a client component.** Use `onClick` in a `"use client"`
  component.
- A React key must be unique — never key a list by a field id that can legitimately repeat within
  the list. Use the index.
