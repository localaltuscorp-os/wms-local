---
name: Aura (liquid glass)
description: Design language for translucent, high-contrast product UI — glass panes over a living gradient field, TeX Gyre Heros display type over Inter body. Use for dashboards, launchers, consoles and internal tools.
---

# Aura — liquid glass design language

Aura is a translucent interface system. Surfaces are thin sheets of glass floating over a
slow-moving colour field; type is dark and crisp so it survives the transparency. Nothing is
opaque, nothing is flat, and nothing is decorated beyond what light would actually do.

Pair this file with `aura.css`, which carries every token and component described here.
Link the stylesheet and build with its classes — do not re-derive values by eye.

```html
<link rel="stylesheet" href="aura.css">
```

---

## 1. The three layers

Every Aura screen is exactly three layers, back to front:

| Layer | What it is | Class |
| --- | --- | --- |
| **Field** | Three slowly drifting colour blobs on a light ground. The thing the glass refracts. | `.field` + `.blob.b1/.b2/.b3` |
| **Grain** | Fine noise at 32% overlay, so the glass reads as material rather than white plastic. | `.grain` |
| **Glass** | Panes, bars and rails. Translucent, blurred, edge-lit. | `.glass`, `.chrome-bar`, `.chrome-rail` |

```html
<div class="app">
  <div class="field"><div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div></div>
  <div class="grain"></div>
  <!-- content -->
</div>
```

Glass over a flat white page is just a border. If there is no field, there is no system.

---

## 2. The material

A pane is `.glass`; a pane you can click is `.glass.interactive`.

- **Fill** is 42% → 16% white on a 145° diagonal — thin enough that the field colour reads through.
- **Blur** is 40px with 200% saturation and a 1.08 brightness lift, so what shows through is richer than the source.
- **Edge** is a 1px 55% white border plus three inset lights: a bright top specular, a dim bottom bounce, and a 0.5px blue-violet chromatic rim.
- **Lift** on hover is 3px up, fill to 58%/26%, shadow deepens. Press settles to 1px and 0.996 scale.
- **Sheen** — a soft highlight tracks the pointer across the pane via `--mx` / `--my`:

```js
document.addEventListener("pointermove", e => {
  const pane = e.target.closest(".glass.interactive"); if (!pane) return;
  const r = pane.getBoundingClientRect();
  pane.style.setProperty("--mx", ((e.clientX - r.left) / r.width * 100).toFixed(1) + "%");
  pane.style.setProperty("--my", ((e.clientY - r.top) / r.height * 100).toFixed(1) + "%");
}, {passive: true});
```

Chrome (top bar, side rail) is **more** transparent than panes and never lifts — it is the window, not the content.

---

## 3. Contrast is the counterweight

Transparency costs legibility, so Aura pays it back in ink:

- `--ink` #0a0f22 for primary text, `--ink-2` #39415f for secondary, `--ink-3` only for the quietest metadata.
- Secondary text runs at **500–600 weight**, not 400 — light type dissolves into a blurred background.
- Labels, badges, table headers and counts are **700**.
- Every status colour is a deep ramp step on a light tint (`.state.ok` is #1c6b45 on 18% green), never a pastel on pastel.

Rule of thumb: if you can't read it with the field blobs directly behind it, it fails.

---

## 4. Type

| Role | Face | Notes |
| --- | --- | --- |
| Display / load-bearing | **TeX Gyre Heros** 700 | Headings, big numbers, card titles, table headers, badges, key caps, counts. Tight tracking: −.02em at heading size, −.015em on numerals. |
| Body / reading | **Inter** 400–600 | Paragraphs, descriptions, table cells, nav labels. |

TeX Gyre Heros is free under the GUST Font License — self-host `texgyreheros-regular.woff2`
and `texgyreheros-bold.woff2` in `fonts/`; the stack falls back to Helvetica Neue → Arial.
Inter loads from Google Fonts.

Numbers are the loudest thing on an Aura screen. A stat is 22–38px Heros 700 with its unit
or label at 11–13px beside it, never above it.

---

## 5. Colour

Mostly ink on light glass. One warm red accent carries action and urgency; everything else
is data colour.

- `--accent` #d81f12 — primary action, overdue, the one thing that matters now.
- `--accent-warm` #ff6a3d — gradient partner on buttons and the brand mark only.
- `--info` #4f7cf7, `--teal` #5ce0cf, `--ok` #2fa36b, `--warn` #e8a11a — charts and status.
- `--accent-2` #164a8f — the second voice in a two-donut comparison.

Never more than one red element per pane. A screen with red everywhere has no urgency at all.

---

## 6. Shape and motion

- Radii: panes 20px, controls 12px, pills 999px. Nothing sharp, nothing fully round except avatars and pills.
- One easing curve everywhere: `cubic-bezier(.2,.8,.3,1)`.
- Durations: 160ms for tint changes, 220–240ms for lift and layout, 260ms for the rail collapse, 26–32s for the field drift.
- All field motion is disabled under `prefers-reduced-motion`.

---

## 7. Components

Provided by `aura.css`:

`.glass` `.glass.interactive` · `.chrome-bar` `.chrome-rail` · `.btn` `.btn-quiet` `.icon-btn`
`.nav-item` `.searchbox` `.kbd` · `.pill` `.state.ok/.warn/.hot/.idle` · `table`/`th`/`td`
`.meter` · `.avatar` (initials or `<img>`, with `.status` presence dot) · `.field` `.grain`

### Data visuals
Charts are drawn as inline SVG on the same palette, never in a chart library's default colours.
Three patterns carry most dashboards:

1. **Donut** — 60px radius, 17px stroke, 0.035rad gap between slices, centre holds the total.
   Hovering the donut fades all slices to 45%; the hovered slice returns to full and gains a drop shadow.
2. **Bloom** — a radial signature built from real behaviour: one rounded petal per day, length
   proportional to hours, hot days in the red gradient and quiet days in blue→teal. It says
   "this is your shape" in a way a bar chart can't.
3. **Intensity strip** — one cell per hour, opacity by load, used as a footnote under a bloom or stat.

Pad SVG viewBoxes past the drawn extents; rotated labels overflow further than the shapes do.

---

## 8. Layout

- Sticky `.chrome-bar` top nav: toggle, brand, tabs, global search, notifications, identity.
- Optional `.chrome-rail` sidebar, collapsible, state persisted in `localStorage`.
- Content grids use `repeat(auto-fit, minmax(260px, 1fr))` so cards rebalance instead of orphaning.
- Panes carry 18–22px padding and 16px gaps. Whitespace is the only separator — no dividers between panes.

---

## 9. Do / Don't

**Do** put something worth blurring behind every pane · raise weight before raising size ·
let one red thing dominate · size a chart from real behaviour · keep the field moving slowly.

**Don't** stack glass on glass more than two deep · use 400-weight grey secondary text ·
add borders inside a pane · centre body copy · animate anything faster than 160ms ·
use the accent as a chart colour and an action colour on the same pane.

---

## 10. Reference implementation

`altus-home-heros.html` — a full workspace dashboard in this language: top nav, collapsible
rail, status panes, attendance block, two donuts, a work-shape bloom, and a status table.
Copy patterns from it rather than inventing parallel ones.
