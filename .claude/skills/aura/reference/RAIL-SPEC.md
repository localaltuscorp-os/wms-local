# Aura glass rail — handoff spec

A sidebar navigation component for the Altus/WMS home. Liquid-glass surface, numbered index rows,
one travelling glass indicator, and a red light wash that flows across a row on hover.

Files in this package:
- `aura-glass-rail.html` — standalone, runnable reference (open it in a browser). Copy the CSS block, the
  `<aside class="rail">` markup and the indicator script from here.
- `altus-home-heros.html` — the full home page the rail lives in, for context.
- `aura.css`, `SKILL.md`, `README.md` — the Aura design system it belongs to.

## Tokens it depends on

```css
--ink:#0a0f22;      /* row label, selected */
--ink-2:#39415f;    /* row label at rest, numbers, counts */
--accent:#d81f12;   /* selected number/count, the hover wash */
--font-display: Arimo / TeX Gyre Heros   /* the 01 02 03 numbers */
--font-body: Inter                        /* row labels */
```

The glass needs colour behind it. The page must carry soft blurred colour fields (see `.ground` in the
reference file) or `backdrop-filter` has nothing to refract and the pane reads flat grey.

## Anatomy

```
aside.rail                 sticky glass pane, 22px radius, blur(40px) saturate(190%), ~60-70% transparent
└ div.rail-inner           scroll container, position:relative (the indicator is positioned against this)
  ├ div.rail-lens          the ONE travelling indicator (no per-row backgrounds)
  ├ div.rail-label         PINNED / ALL WORKSPACES, 10px, .14em tracking
  └ div.rail-group > button.nav
        span.no            "01" — display font, accent red when selected
        span.roll > span   the label; nudges 4px right on hover
        span.count         optional badge, right aligned
```

## The three behaviours

1. **Travelling indicator.** One `.rail-lens` element, absolutely positioned inside `.rail-inner`, driven by
   custom properties `--lens-y` / `--lens-h` / `--lens-o`. It follows `mouseover` and rests on `.nav.active`
   on `mouseleave`. Easing is `cubic-bezier(.22,1.3,.32,1)` — the overshoot is the character of the thing.
2. **Red flow on hover.** `.nav::before` is a 220%-wide red gradient animated by `background-position`
   (`@keyframes railFlow`, 1.9s linear infinite). The selected row holds the wash steady at centre.
   `.nav` sets `isolation:isolate` so the `z-index:-1` wash sits behind the label but above the pane.
3. **Numbered index.** Rows are numbered continuously across groups; pinned rows are 01/02.

## Two traps we hit (keep these)

- **Do not transition the first placement.** `.rail-lens` ships with `transition:none`; the animated
  transition is added via `.is-ready`, 60ms after the first successful placement. Without this the lens
  can stay pinned at `height:0` in frames where the transition timeline isn't ticking.
- **Measure with a timer, not rAF.** `requestAnimationFrame` is paused in background/hidden frames, so the
  initial measurement retries on `setTimeout` (40 × 50ms) plus `load`, `document.fonts.ready` and a
  `ResizeObserver`. Also re-place after any sidebar collapse/expand toggle.
- Class names are page-specific on purpose (`.rail-lens`, `#railIndicator`). A generic `.lens` collided with
  another rule and silently blanked the component.

## Responsive

- ≥1081px: 252px column
- 821–1080px: 212px column
- ≤820px: rail hidden (pair with a toggle/off-canvas if you need it on small screens)

## What to improve next (open threads)

- The row `count` badges are static strings; wire them to real data.
- Keyboard: rows are buttons, so focus works, but arrow-key traversal and `aria-current="page"` on the
  selected row are not implemented.
- Section groups don't collapse; with more than ~15 workspaces the list wants collapsible groups or a filter.
