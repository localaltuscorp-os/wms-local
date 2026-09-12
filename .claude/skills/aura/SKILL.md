---
name: aura
description: The Aura liquid-glass design language — translucent panes over a drifting colour field, TeX Gyre Heros display type over Inter body. Use when building or restyling a screen in Altus OS that should match the hub front door, or when the ask mentions Aura, liquid glass, glassmorphism, or "the new design".
---

# Aura — liquid glass

Aura is a translucent interface system. Surfaces are thin sheets of glass floating over a
slow-moving colour field; type is dark and crisp so it survives the transparency. Nothing is
opaque, nothing is flat, and nothing is decorated beyond what light would actually do.

**In this repo the language already exists as CSS — do not re-derive it by eye.** Every token,
material and component below is in [`app/aura.css`](../../../app/aura.css), imported from
`app/globals.css` and therefore available on any page. The reference implementation of the
whole language is `reference/altus-home-heros.html` in this folder; the shipped screen built
from it is [`app/(app)/hub/page.tsx`](<../../../app/(app)/hub/page.tsx>).

## Using it here

Three rules specific to this codebase:

1. **Every class is `aura-`-prefixed.** `globals.css` already owns `.nav` (46 rules) and
   `.topbar` (7), and this design language's own names collide with both. Write
   `.aura-glass`, never `.glass`.
2. **Tokens are scoped to `.aura-app`, not `:root`.** The rest of Altus OS is a warm-paper
   pastel system (`--color-canvas-base`, the four-stop tonal families) and must not inherit a
   cool glass one. An Aura screen starts with a `<div className="aura-app">` wrapper; nothing
   outside it changes.
3. **Tailwind utilities still work inside an Aura screen** and are the right tool for
   one-off layout (`flex`, `ml-auto`, `truncate`). Use the `aura-` classes for anything the
   language names — material, type, status, controls.

## 1. The three layers

Every Aura screen is exactly three layers, back to front:

| Layer | What it is | Class |
| --- | --- | --- |
| **Field** | Three slowly drifting colour blobs on a light ground. The thing the glass refracts. | `.aura-field` + `.aura-blob.aura-b1/b2/b3` |
| **Grain** | Fine noise at 32% overlay, so the glass reads as material rather than white plastic. | `.aura-grain` |
| **Glass** | Panes, bars and rails. Translucent, blurred, edge-lit. | `.aura-glass`, `.aura-topbar`, `.aura-rail` |

```tsx
<div className="aura-app">
  <div className="aura-field" aria-hidden>
    <div className="aura-blob aura-b1" />
    <div className="aura-blob aura-b2" />
    <div className="aura-blob aura-b3" />
  </div>
  <div className="aura-grain" aria-hidden />
  <AuraSheen />
  <header className="aura-topbar">…</header>
  <main className="aura-main">
    <article className="aura-glass aura-interactive aura-pane">…</article>
  </main>
</div>
```

Glass over a flat white page is just a border. **If there is no field, there is no system.**

## 2. The material

A pane is `.aura-glass`; a pane you can click is `.aura-glass.aura-interactive`.

- **Fill** is 42% → 16% white on a 145° diagonal — thin enough that the field colour reads through.
- **Blur** is 40px with 200% saturation and a 1.08 brightness lift, so what shows through is richer than the source.
- **Edge** is a 1px 55% white border plus three inset lights: a bright top specular, a dim bottom bounce, and a 0.5px blue-violet chromatic rim.
- **Lift** on hover is 3px up, fill to 58%/26%, shadow deepens. Press settles to 1px and 0.996 scale.
- **Sheen** — a soft highlight tracks the pointer across the pane via `--mx` / `--my`. Mount
  `<AuraSheen />` from [`components/hub/aura-chrome.tsx`](../../../components/hub/aura-chrome.tsx)
  once per screen; it delegates one `pointermove` listener from `document` and writes the two
  custom properties straight onto the hovered pane. It renders nothing and never re-renders
  the tree — re-rendering a twelve-card grid on every pointer move is exactly what it avoids.

Chrome (top bar, side rail) is **more** transparent than panes and never lifts — it is the
window, not the content.

## 3. Contrast is the counterweight

Transparency costs legibility, so Aura pays it back in ink:

- `--aura-ink` #0a0f22 for primary text, `--aura-ink-2` #39415f for secondary, `--aura-ink-3` only for the quietest metadata.
- Secondary text runs at **500–600 weight**, not 400 — light type dissolves into a blurred background.
- Labels, badges, table headers and counts are **700**.
- Every status colour is a deep ramp step on a light tint (`.aura-state-ok` is #1c6b45 on 18% green), never a pastel on pastel.

Rule of thumb: if you can't read it with the field blobs directly behind it, it fails.

## 4. Type

| Role | Face | Notes |
| --- | --- | --- |
| Display / load-bearing | **TeX Gyre Heros** 700 | Headings, big numbers, card titles, table headers, badges, key caps, counts. Tight tracking: −.02em at heading size, −.015em on numerals. |
| Body / reading | **Inter** 400–600 | Paragraphs, descriptions, table cells, nav labels. |

Both are **self-hosted** — `app/fonts/texgyreheros-{regular,bold}.woff2` (21 KB each, latin +
₹ + arrows, subset from the CTAN OTFs) and `app/fonts/inter-latin.woff2` (48 KB, variable
100–900) — and registered in `app/layout.tsx` via `next/font/local` as `--font-heros` and
`--font-inter`. **Do not reintroduce `next/font/google` for these.** A deploy must not depend
on fonts.gstatic.com being reachable from the build machine; that is what took commit b50e9e2
down. Reach the faces through `var(--aura-display)` / `var(--aura-body)`, never by name.

Numbers are the loudest thing on an Aura screen. A stat is 22–38px Heros 700 (`.aura-big`,
`.aura-num`) with its unit or label at 11–13px **beside** it, never above it.

## 5. Colour

Mostly ink on light glass. One warm red accent carries action and urgency; everything else
is data colour.

- `--aura-accent` #d81f12 — primary action, overdue, the one thing that matters now.
- `--aura-accent-warm` #ff6a3d — gradient partner on buttons and the brand mark only.
- `--aura-accent-2` #164a8f — the second voice in a two-donut comparison.
- `--aura-ok` #2fa36b, plus #4f7cf7 info / #5ce0cf teal / #e8a11a warn — charts and status.

Never more than one red element per pane. A screen with red everywhere has no urgency at all.

**Module identity survives.** Altus OS gives every workspace its own colour
(`MODULE_THEME[id].accent` / `.accentDeep` in `lib/module-theme.ts`) and that is load-bearing
— it is how someone knows which room they are in. Aura does not delete it; it *redistributes*
it, exactly like the pastel system did. The fill goes to glass and the module colour goes to
the **mark**: a hub tile is a plain glass pane with its lucide glyph stroked in that module's
`accentDeep`, and a rail row carries a 9px dot in its `accent`.

## 6. Shape and motion

- Radii: panes 20px (`--aura-r-pane`), controls 12px (`--aura-r-control`), pills 999px. Nothing sharp, nothing fully round except avatars and pills.
- One easing curve everywhere: `--aura-ease`, `cubic-bezier(.2,.8,.3,1)`.
- Durations: 160ms for tint changes, 220–240ms for lift and layout, 260ms for the rail collapse, 26–32s for the field drift.
- All field motion stops under `prefers-reduced-motion`; the glass stays.

## 7. Components in `app/aura.css`

`.aura-glass` `.aura-interactive` · `.aura-topbar` `.aura-rail` `.aura-layout` `.aura-main`
· `.aura-h1` `.aura-h2` `.aura-date` `.aura-sub` `.aura-num` `.aura-brand`
· `.aura-icon-btn` `.aura-nav` `.aura-nav-dot` `.aura-nav-key` `.aura-rail-label` `.aura-chip` `.aura-kbd`
· `.aura-pill` `.aura-state` + `-ok/-warn/-hot/-idle`
· `.aura-panes` `.aura-pane` `.aura-pane-head` `.aura-big` `.aura-bigrow` `.aura-tasks` `.aura-task` `.aura-dot` `.aura-bar` `.aura-stats`
· `.aura-grid` `.aura-grid-head` `.aura-tile` `.aura-tile-icon` `.aura-tile-badge` `.aura-tile-name` `.aura-tile-desc` `.aura-go`

### Data visuals (specified, not yet built here)

Charts are drawn as inline SVG on the same palette, never in a chart library's default
colours. `reference/altus-home-heros.html` has working implementations of all three:

1. **Donut** — 60px radius, 17px stroke, 0.035rad gap between slices, centre holds the total.
   Hovering the donut fades all slices to 45%; the hovered slice returns to full and gains a drop shadow.
2. **Bloom** — a radial signature built from real behaviour: one rounded petal per day, length
   proportional to hours, hot days in the red gradient and quiet days in blue→teal.
3. **Intensity strip** — one cell per hour, opacity by load, used as a footnote under a bloom or stat.

Pad SVG viewBoxes past the drawn extents; rotated labels overflow further than the shapes do.

## 8. Layout

- Sticky `.aura-topbar`: rail toggle, brand, then controls pushed right with `ml-auto`.
- Optional `.aura-rail` sidebar inside `.aura-layout`, collapsible via `AuraRailToggle` (state in `localStorage`, `\` toggles it, and it never steals a keystroke while you are typing).
- Content grids use `repeat(auto-fit, minmax(260px, 1fr))` — or a fixed column count that steps down cleanly — so cards rebalance instead of orphaning.
- Panes carry 18–22px padding and 16px gaps. Whitespace is the only separator — no dividers between panes.

## 9. Do / Don't

**Do** put something worth blurring behind every pane · raise weight before raising size ·
let one red thing dominate · size a chart from real behaviour · keep the field moving slowly ·
keep the screen a Server Component and push browser-only behaviour into leaf client islands.

**Don't** stack glass on glass more than two deep · use 400-weight grey secondary text ·
add borders inside a pane · centre body copy · animate anything faster than 160ms ·
use the accent as a chart colour and an action colour on the same pane ·
**ship a pane whose numbers are invented.**

That last one is a rule, not a preference. The reference mock carries an attendance block,
two donuts, a bloom and a cross-workspace table that the hub does **not** ship, because the
queries behind them do not exist: nothing in this codebase tags a record with a
`WorkspaceId`, the task-time rollup has no module dimension, and there is no "unmarked today"
count. If a pane's data is not there, either write the query or leave the pane out and say so
— a front door showing invented numbers is worse than one showing fewer.

## 10. Reference

| File | What it is |
| --- | --- |
| `reference/altus-home-heros.html` | The full workspace dashboard in this language, self-contained: top nav, collapsible rail, status panes, attendance block, two donuts, a work-shape bloom, a status table. Copy patterns from it rather than inventing parallel ones. |
| `reference/aura.css` | The upstream single stylesheet, unprefixed. `app/aura.css` is this file ported: same values, `aura-`-prefixed, scoped to `.aura-app`. |
| `reference/SKILL-original.md` | The language as delivered, before it was adapted to this repo. |
