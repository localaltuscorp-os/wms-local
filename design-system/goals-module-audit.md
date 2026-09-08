# ALTUS OS — Design System

A running, evidence-based record of the design language, built up **one module at a time**.

**Ground rule:** every value here is copied from source or measured off a screenshot. Nothing is
estimated. Anything that could not be confirmed lives in that module's **Gaps / Not Found**.

**How to read the tables**

| Column | Meaning |
| --- | --- |
| **Element** | The thing being described |
| **Exact Value** | Verbatim from source — hex, px, class string, CSS declaration |
| **Source** | `path/to/file.ext:line` at the time of extraction |
| **Confirmed?** | `Y` = visible in that module's screenshots · `N` = in code, not proven by a screenshot · `Y*` = visible, see note |

Paths are relative to the Next.js app root (`Manan-Vasa/task-management/`).

**Modules processed:** Goals (2026-09-03)

---

# Global Foundations

Established while processing **Goals**. Later modules should reuse these and only add what is new.

## G1 · Typography

Fonts are **self-hosted** via `next/font/local` from `app/fonts/*.woff2`. `next/font/google` is
banned in this repo — a build-time fetch failure once took a whole deploy down (`app/layout.tsx:17-38`).
Each file is the **latin subset of the family's VARIABLE font**, which is why `weight` is a range.

| Family | CSS variable | File | Weight range | Loaded at | Confirmed? |
| --- | --- | --- | --- | --- | --- |
| Roboto | `--font-roboto` | `app/fonts/roboto-latin.woff2` (43,136 B) | `300 900` | `app/layout.tsx:41` | Y |
| Bricolage Grotesque | `--font-display` | `app/fonts/bricolage-grotesque-latin.woff2` (41,344 B) | `300 800` | `app/layout.tsx:52` | Y |
| JetBrains Mono | `--font-mono-display` | `app/fonts/jetbrains-mono-latin.woff2` (31,432 B) | `400 700` | `app/layout.tsx:64` | N |
| Fraunces | `--font-editorial` | `app/fonts/fraunces-latin.woff2` (36,620 B) | `400 900` | `app/layout.tsx:74` | N |

All four use `display: "swap"`. All four files exist in the repo (verified on disk).

### Font stacks

| Token | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| `--font-sans` | `var(--font-roboto), system-ui, -apple-system, "Segoe UI", sans-serif` | `app/globals.css:114` | Y |
| `--font-serif` | `var(--font-roboto), system-ui, -apple-system, "Segoe UI", sans-serif` | `app/globals.css:113` | N |
| `--font-mono` | `ui-monospace, "SF Mono", Menlo, Consolas, monospace` | `app/globals.css:115` | N |
| Display (applied inline) | `var(--font-display), system-ui, sans-serif` | per component, e.g. `components/goals/board/goals-level-board.tsx:1037` | Y |
| `html` base | `font-family: var(--font-sans), system-ui, sans-serif` | `app/globals.css:258-260` | Y |
| `html` numerics | `font-feature-settings: "tnum" 1, "ss01" 1` | `app/globals.css:261` | Y |

> `--font-serif` deliberately resolves to **Roboto**, not a serif. Only a module shell that
> re-points it on its own subtree gets Fraunces (`components/goals/canvas/goals-canvas.tsx:402`).

## G2 · Colour tokens

### Brand accent — **user-overridable, not a constant**

`lib/appearance.ts` runs on every request and writes the accent family **inline onto `<html>`**,
derived from the employee's `accent` column. The hexes below are the **default** (`DEFAULT_ACCENT`,
`lib/appearance.ts:78`), which reproduce `globals.css` exactly for a user who has not picked one.

| Token | Default | Derivation from seed | Source | Confirmed? |
| --- | --- | --- | --- | --- |
| `--color-altus-red-seed` | `#E10600` | the stored seed itself | `app/globals.css:66` | Y |
| `--color-altus-red` | `#E10600` | `= seed` — actions: buttons, CTA gradients | `app/globals.css:67` | Y |
| `--color-altus-red-deep` | `#A80400` | each channel `× 0.747` (`DEEP_FACTOR`) | `app/globals.css:68`, `lib/appearance.ts:14` | Y |
| `--color-altus-red-soft` | `#F8C8C7` | seed mixed **22%** into white | `app/globals.css:69` | Y |
| `--color-altus-red-edge` | `#D4706D` | `45%` deep + `55%` soft | `app/globals.css:70` | N |
| `--color-altus-red-wash` | `#FDF0F0` | seed mixed **6%** into white | `app/globals.css:71` | N |
| `--user-accent` | `#E10600` | `= seed` | `app/globals.css:213` | N |
| `--vp-cyan` | `225 6 0` (RGB triplet) | `= seed` — paints nav pills, hover rails, focus glows | `lib/appearance.ts:71` | Y |
| `--vp-cyan-deep` | `168 4 0` | `= deep` | `lib/appearance.ts:72` | Y |
| `--vp-cyan-glow` | `rgba(225, 6, 0, 0.25)` | seed @ 25% | `lib/appearance.ts:73` | N |
| `--vp-cyan-tint` | `rgba(225, 6, 0, 0.08)` | seed @ 8% | `lib/appearance.ts:74` | N |

> **Rule:** never hardcode `#E10600`. Read `var(--color-altus-red)` so a user's accent follows.
> Theme is **light-only** — there is no dark mode; the `employees.theme` column is kept but unused
> (`app/layout.tsx:107`).

### Surfaces, ink, hairlines

| Token | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| `--color-canvas-base` | `#faf8f7` | `app/globals.css:7` | Y |
| `--color-canvas-base-2` | `#f4f1ef` | `app/globals.css:8` | N |
| `--color-surface-card` | `#ffffff` | `app/globals.css:9` | Y |
| `--color-surface-soft` | `#f8f6f4` | `app/globals.css:10` | Y |
| `--color-surface-track` | `#efecea` | `app/globals.css:11` | N |
| `--color-surface-input` | `rgba(15, 23, 42, 0.025)` | `app/globals.css:145` | N |
| `--color-surface-stripe` | `rgba(15, 23, 42, 0.03)` | `app/globals.css:146` | N |
| `--color-ink-strong` | `#0f172a` | `app/globals.css:14` | Y |
| `--color-ink` | `#1f2937` | `app/globals.css:15` | Y |
| `--color-ink-soft` | `#334155` | `app/globals.css:16` | Y |
| `--color-ink-muted` | `#475569` | `app/globals.css:17` | Y |
| `--color-ink-subtle` | `#5b6675` | `app/globals.css:18` | Y |
| `--color-hairline` | `rgba(60, 44, 40, 0.07)` | `app/globals.css:21` | Y |
| `--color-hairline-strong` | `rgba(60, 44, 40, 0.12)` | `app/globals.css:22` | Y |
| `--color-card-hairline` | `rgba(40, 0, 0, 0.08)` | `app/globals.css:29` | N |
| `--color-card-hairline-hover` | `rgba(127, 29, 29, 0.20)` | `app/globals.css:30` | N |

### Status families — four stops per hue

The system's stated rule (`app/globals.css:33-58`): **colour is redistributed from the fill to the
glyph.** Anything that *fills* uses the container stop; anything that is *text* uses the `-deep` stop.

| Suffix | Role |
| --- | --- |
| `-bg` | page-level wash behind a section |
| *(none)* | **container** — the pastel that fills chips, buttons, bars, badges |
| `-edge` | outline — ≥3:1 on white, for borders / dots / strokes |
| `-deep` | **on-container ink** — text and icons only |

| Family | container | `-deep` | `-bg` | `-edge` | Source | Confirmed? |
| --- | --- | --- | --- | --- | --- | --- |
| blue | `#d3e3fd` | `#174ea6` | `#eef3fd` | `#4a7fd4` | `app/globals.css:74` | Y |
| green | `#c3ebcd` | `#0f5b2e` | `#eef7f0` | `#3e8f5a` | `app/globals.css:75` | Y |
| amber | `#fbe0a6` | `#8a3d06` | `#fdf6e8` | `#a8761f` | `app/globals.css:76` | N |
| red | `#f8c8c7` | `#A80400` | `#fdf0f0` | `#d4706d` | `app/globals.css:77` | Y |
| rose | `#f9ceda` | `#9f0f33` | `#fdeef1` | `#c0567f` | `app/globals.css:78` | N |
| purple | `#e9ddff` | `#5b21b6` | `#f4eefe` | `#8a6bd0` | `app/globals.css:79` | N |
| yellow | `#f5eda4` | `#7a5c00` | `#fbf8e6` | `#a88a2e` | `app/globals.css:81` | Y |
| orange | `#ffd9c2` | `#973108` | `#fdf1e9` | `#b25a22` | `app/globals.css:82` | Y |
| slate | `#dce2ea` | `#334155` | `#f0f3f6` | `#7c8595` | `app/globals.css:83` | Y |
| brown | `#e4d6c3` | `#6b4a2b` | `#f6f1e9` | `#a08556` | `app/globals.css:84` | N |
| stone | `#e4e7eb` | `#545a63` | `#f3f4f6` | `#8b929c` | `app/globals.css:85` | N |
| teal | `#b8e7e1` | `#0b5a54` | `#eaf7f5` | `#3f9a90` | `app/globals.css:87` | N |
| indigo | `#d6d9fb` | `#3a32a6` | `#eef0fd` | `#6f79dc` | `app/globals.css:88` | N |

> Every family is **declared twice** — once in `@theme inline` (`:4-147`) and once as real custom
> properties in `:root` (`:160-182`). Tailwind v4's `@theme inline` only emits vars referenced by a
> utility *class*, and these are consumed as raw `var(--color-…)` in `style` props, so the mirror
> block is required. The two must stay in sync; `:root` is declared later and wins.

### Chart series

`--color-chart-1` … `-8` = `#d3e3fd`, `#c3ebcd`, `#f8c8c7`, `#fbe0a6`, `#e9ddff`, `#b8e7e1`,
`#ffd9c2`, `#e4d6c3` — `app/globals.css:92-93`. Confirmed? N.

## G3 · Radii

| Token | Exact Value | Source |
| --- | --- | --- |
| `--radius-kpi` | `16px` | `app/globals.css:118` |
| `--radius-section` | `16px` | `app/globals.css:119` |
| `--radius-leader` | `14px` | `app/globals.css:120` |
| `--radius-chip` | `12px` | `app/globals.css:121` |
| `--radius-pill` | `8px` | `app/globals.css:122` |
| `--radius-cell` | `8px` | `app/globals.css:123` |
| `--radius-bar` | `8px` | `app/globals.css:124` |
| `--radius-brand` | `999px` | `app/globals.css:125` |

> Naming trap: **`rounded-pill` is 8px, not a pill.** A true pill is `rounded-full` / `999px`.
> `rounded-pill` is on most Goals toolbar controls (M-C2, M-D1, M-D3, M-E3, M-E4, M-F).

## G4 · Layout containers

| Token | Exact Value | Source |
| --- | --- | --- |
| `--max-content` | `1280px` | `app/globals.css:128` |
| `--content-narrow` | `1120px` | `app/globals.css:137` |
| `--content-standard` | `1280px` | `app/globals.css:138` |
| `--content-wide` | `1400px` (PageShell default) | `app/globals.css:139` |
| `--content-full` | `1760px` | `app/globals.css:140` |
| `--page-gutter` | `clamp(1rem, 4vw, 2rem)` | `app/globals.css:141` |
| `--app-topbar-h` | `0px`, → `56px` at `min-width: 768px` | `app/globals.css:191, 195` |

`PageShell` (`components/layout/page-shell.tsx`) is the single page container: max-width + fluid
gutter, **no `zoom`/`transform` on any ancestor** — an ancestor `zoom` double-applies to
Radix/floating-ui portals and throws every dropdown off-screen.

## G5 · Density scale

Set by `<html data-density>` from the user's pref; default `cozy`.

| Mode | Root font-size | `--density-pad-y` | `--density-line-height` | Source |
| --- | --- | --- | --- | --- |
| cozy (default) | *unchanged* | `1` | `1.55` | `app/globals.css:238-241` |
| compact | `93.75%` (15/16) | `0.82` | `1.5` | `app/globals.css:242-246` |
| dense | `87.5%` (14/16) | `0.7` | `1.42` | `app/globals.css:247-251` |

Font-size + line-height only — deliberately **not** `zoom`/`transform`, for the portal reason above.

## G6 · Icons

| Item | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| Library | `lucide-react` `^1.14.0` | `package.json` dependencies | Y |
| Custom SVG icon assets | none found | — | — |
| Typical size | `13`–`16` (`size={n}` prop, px) | throughout | Y |
| Typical stroke-width | `2.2`–`2.8` | throughout | Y |
| Fill | never set — all icons are stroke-only, inheriting `currentColor` | — | Y |

## G7 · Logos

| Asset | Path | Format · dimensions | Used by | Confirmed? |
| --- | --- | --- | --- | --- |
| Full lockup (mark + "ALTUS CORP") | `public/logo.png` | PNG 973×1074, 270,856 B | rail brand `h-[68px] w-auto`; mobile bar `h-8 w-auto`; collapsed rail `height: 3rem` | Y |
| **Byte-identical duplicate** | `public/altus-corp-logo.png` | PNG 973×1074, 270,856 B — same MD5 `13162fa1b54984bf7ade8866cabe5ac7` | HR module rail | Y* |
| Mark only | `public/logo-mark.png` | PNG 973×1074, 254,259 B | not referenced in Goals | N |
| PWA icons | `public/icon-192.png` (192×192), `icon-512.png`, `icon-badge.png` | PNG | `manifest.json` | N |

No SVG logo variant and no light/dark variants exist — the app is light-only.

---

# Module: Goals

**Screenshots:** `goals_module_screenshots.pdf`, 10 pages.
**Routes covered:** `/goals/yearly`, `/goals/quarterly`, `/goals/monthly`, `/goals/weekly`,
`/goals/weekly/team`, `/goals/review`, `/goals/approve`, `/goals/recycle-bin`, plus the Personal space.

**Module-level tokens** (`app/globals.css:98-99`): `--goals-accent: #E10600`,
`--goals-accent-deep: #A80400`. Consistent with the brand accent (G2) — in-module chrome is red
everywhere. See **M-Z2** for the conflicting `MODULE_THEME` value.

## M-A · Shell & chrome

### M-A1 · App top bar

| Element | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| Bar | `h-14` (56px) · `sticky top-0 z-40` · `border-b` · `px-6` (`max-lg:px-4`) · `max-md:hidden` | `components/layout/app-top-bar.tsx:45` | Y |
| Bar background | `rgba(255,255,255,0.86)` | `app-top-bar.tsx:49` | Y |
| Bar blur | `backdrop-filter: blur(18px) saturate(150%)` | `app-top-bar.tsx:50` | Y |
| Bar border | `1px var(--color-hairline)` | `app-top-bar.tsx:48` | Y |
| Search field width | `min-w-0 max-w-[520px] flex-1` | `app-top-bar.tsx:56` | Y |
| Search trigger | `h-9 w-full rounded-lg border border-hairline-strong bg-surface-soft px-3` | `app-top-bar.tsx:64` | Y |
| Search label | `text-[13.5px] font-semibold` on `text-ink-subtle` | `app-top-bar.tsx:68` | Y |
| Search copy | `Global search` + `— tasks, clients, people, documents…` | `app-top-bar.tsx:70-72` | Y |
| Search hover | `hover:border-[color:var(--color-altus-red)] hover:bg-surface-card` | `app-top-bar.tsx:64` | N |
| `⌘K` kbd | `rounded border border-hairline-strong bg-surface-card px-1.5 py-0.5 text-[10.5px] font-bold text-ink-subtle` | `app-top-bar.tsx:74` | Y |
| Search icon | lucide `Search`, `size={16} strokeWidth={2.3}` | `app-top-bar.tsx:67` | Y |
| **`+` quick action** | `h-8 w-8 rounded-md p-1.5` · **`bg-red-600`** · `text-white shadow-sm` · hover `bg-red-700` | `components/header/new-task-quick-action.tsx:38-39` | Y |
| `+` icon | lucide `Plus`, `size={16} strokeWidth={2.8}` | `new-task-quick-action.tsx:44` | Y |
| Focus-mode toggle | `size-9 rounded-lg text-slate-600` · hover `bg-slate-100 hover:text-slate-900` | `components/layout/focus-mode-toggle.tsx:49` | Y |
| Focus-mode icon | lucide `Maximize2` (off) / `Minimize2` (on, `text-red-600`), `size-5 strokeWidth={2.2}` | `focus-mode-toggle.tsx:52-54` | Y |
| Notification bell | `size-9 rounded-lg border border-hairline-strong bg-surface-card text-ink-soft` | `components/header/notification-bell.tsx:35` | Y |
| Bell icon | lucide `Bell`, `size={17} strokeWidth={2.3}` | `notification-bell.tsx:37` | Y |
| Bell badge | `height: 17` · `min-w-[17px]` · `rounded-full px-1` · `text-[10px] font-black tabular-nums text-white` | `notification-bell.tsx:41-43` | Y |
| Bell badge fill | `linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))` | `notification-bell.tsx:44` | Y |
| Bell badge ring | `box-shadow: 0 0 0 2px var(--color-surface-card)` | `notification-bell.tsx:45` | Y |
| Badge cap | `99+` | `notification-bell.tsx:48` | N (screenshot shows `97`) |

> `bg-red-600` / `bg-red-700` on the `+` are **Tailwind palette utilities, not brand tokens** — the
> only control in the top bar that will not follow a user's chosen accent. See M-Z1.

### M-A2 · Left rail (`.sidebar-rail`)

| Element | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| Rail width — Goals | `w-[228px]` expanded | `components/layout/sidebar-rail.tsx:38` | Y |
| Rail width — collapsed | `w-[74px]` | `sidebar-rail.tsx:83` | N |
| Rail frame | `sticky top-0 z-40 header-light flex h-dvh shrink-0 flex-col max-md:hidden` | `sidebar-rail.tsx:83` | Y |
| Logo link | `/logo.png`, `className="h-[68px] w-auto"`, `display: block` → `/hub` | `components/layout/sidebar-brand.tsx:57` | Y |
| Brand block | `mx-auto flex w-full flex-col items-center justify-center gap-3 text-center` | `sidebar-brand.tsx:41` | Y |
| Wordmark tile | `width: 40, height: 40` · `rounded-2xl` · `text-white` · `inline-grid place-items-center` | `sidebar-brand.tsx:68-76` | Y |
| Wordmark tile fill | `linear-gradient(135deg, var(--color-altus-red, #E10600), var(--color-altus-red-deep, #A80400))` | `sidebar-brand.tsx:71` | Y |
| Wordmark tile shadow | `0 8px 20px -8px var(--color-altus-red-deep, #A80400)` | `sidebar-brand.tsx:72` | Y |
| Wordmark icon | lucide `Target` (Goals), `size={20} strokeWidth={2.6}` | `sidebar-brand.tsx:77`, `lib/module-theme.ts:141` | Y |
| Wordmark text size | `clamp(18px, 1.5vw, 22px)` | `sidebar-brand.tsx:88` | Y |
| Wordmark text | `font-family: var(--font-display)` · `font-weight: 900` · `letter-spacing: -0.02em` · `text-transform: uppercase` | `app/globals.css:3088-3092` | Y |
| Wordmark text fill | `linear-gradient(100deg, var(--mw-a) 0%, var(--mw-b) 30%, #ffffff 48%, var(--mw-b) 66%, var(--mw-a) 100%)` · `background-size: 240% 100%` · clipped to text | `app/globals.css:3093-3101` | **Y\*** — the `#ffffff` 48% stop is caught mid-sweep in the PDF (page 1 renders `GOAL` + a pale `S`) |
| Wordmark sheen | `animation: mwSheen 5s linear infinite` | `app/globals.css:3102` | Y* |
| Gap (tile ↔ text) | `gap-2.5` | `sidebar-brand.tsx:64` | Y |
| Click targets | logo → `/hub`; wordmark → the module's `WORKSPACE_LANDING` (Goals → `/goals/yearly`) | `sidebar-brand.tsx:13-17` | — |

### M-A3 · Rail nav pills

Base `.nav-pill` is a dark-header pill; the rail **overrides it entirely** so items read as a plain list.

| State | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| Rest | `border-radius: 12px` · `padding: 9px 12px` · `background: transparent` · `border: none` · `color: var(--color-ink-soft)` · `box-shadow: none` | `app/globals.css:2874-2881` | Y |
| Hover | `background: color-mix(in srgb, var(--color-ink-strong) 5%, transparent)` · `color: var(--color-ink-strong)` · `transform: none` | `app/globals.css:2882-2888` | N |
| **Selected** | `background: color-mix(in srgb, var(--color-altus-red) 10%, transparent)` · `color: var(--color-altus-red-deep)` · **no border, no ring, no lift** | `app/globals.css:2889-2898` | Y |
| Count chip (rest) | `background: rgba(0, 0, 0, 0.06)` · `color: #1a1a1a` | `app/globals.css:2899-2902` | N |
| Count chip (selected) | `background: color-mix(in srgb, var(--color-altus-red) 22%, #ffffff)` · `color: var(--color-altus-red-deep)` | `app/globals.css:2903-2906` | N |
| Icon | `size={16} strokeWidth={2.2}` | `components/layout/main-nav-pill.tsx:41` | Y |
| Label (inherited) | `font-size: 14px` · `font-weight: 600` · `letter-spacing: 0.01em` · `gap: 6px` | `app/globals.css:1121, 1128-1130` | Y |

### M-A4 · Goals rail contents (Professional space)

| Label | Route | lucide icon | Source | Confirmed? |
| --- | --- | --- | --- | --- |
| Yearly Goals | `/goals/yearly` | `Trophy` | `components/layout/main-nav.tsx:390` | Y |
| Quarterly Goals | `/goals/quarterly` | `Target` | `main-nav.tsx:391` | Y |
| Monthly Goals | `/goals/monthly` | `CalendarRange` | `main-nav.tsx:392` | Y |
| Weekly Goals | `/goals/weekly` | `CalendarCheck` | `main-nav.tsx:395` | Y |
| Daily Goals | **`/my-day`** (WMS — see M-L) | `CalendarDays` | `main-nav.tsx:405` | Y |
| Team Productivity | `/goals/weekly/team` | `Gauge` | `main-nav.tsx:413` | Y |
| Review | `/goals/review` | `ClipboardList` | `main-nav.tsx:414` | Y |
| Approve | `/goals/approve` | `CalendarRange` | `main-nav.tsx:415` | Y |
| Recycle Bin | `/goals/recycle-bin` | `Trash2` — `adminOnly` | `main-nav.tsx:416` | Y |

**Personal space** drops Team Productivity / Review / Approve; keeps the five level pages + Recycle
Bin (`main-nav.tsx:452-462`). Confirmed in PDF page 10.

Section label above the list: `Modules`-style eyebrow is **not** used in Goals; the rail lists items
directly. (The HR rail does use one — deferred to that module's section.)

### M-A5 · Professional ⇄ Personal segmented toggle

| Element | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| Wrapper | `px-4 pb-2` → `flex items-center gap-1 rounded-xl p-1` | `components/goals/board/goals-space-toggle.tsx:75-79` | Y |
| Wrapper fill | `background: var(--color-surface-soft)` · `border: 1px solid var(--color-hairline)` | `goals-space-toggle.tsx:78` | Y |
| Segment | `flex-1 rounded-[9px] px-1.5 py-1.5 text-[12px] font-bold gap-1` | `goals-space-toggle.tsx:47` | Y |
| Segment — active | `linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))` · `color: #fff` · `box-shadow: 0 6px 14px -8px var(--color-altus-red-deep)` | `goals-space-toggle.tsx:51` | Y |
| Segment — rest | `color: var(--color-ink-muted)` | `goals-space-toggle.tsx:52` | Y |
| Icons | `Briefcase` (Professional) / `User` (Personal), `size={13} strokeWidth={2.5}` | `goals-space-toggle.tsx:56, 82-83` | Y |
| State | cookie `goals_space` = `professional` \| `personal`, `max-age` 1 year | `goals-space-toggle.tsx:68` | — |
| Visibility | admins only | `goals-space-toggle.tsx:20-24` | — |

### M-A6 · Bottom module dock

| Element | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| Band | `h-[52px]` centred row | `components/layout/module-footer.tsx:99` | Y |
| Dock | `rounded-[18px] px-2 py-2` · `max-w-[calc(100%-24px)]` · `overflow-x-auto` · `gap-x-0.5` | `module-footer.tsx:120` | Y |
| Dock fill | `rgba(255,255,255,0.88)` · `backdrop-filter: blur(14px)` | `module-footer.tsx:131-133` | Y |
| Dock border | `1px solid rgba(0,0,0,0.08)` | `module-footer.tsx:134` | Y |
| Dock shadow | `0 6px 24px -8px rgba(15,23,42,0.18), 0 1px 2px rgba(15,23,42,0.06)` | `module-footer.tsx:135` | Y |
| Item | `rounded-xl px-2.5 py-1.5 text-[12.5px] font-semibold gap-1.5` | `module-footer.tsx:189` | Y |
| Item — rest | `color: rgba(15,23,42,0.62)` | `module-footer.tsx:193` | Y |
| Item — active | `color: <module accent>` + `background: color-mix(in srgb, <accent> 10%, transparent)` — deliberately **not** a filled pill | `module-footer.tsx:194-197` | Y |
| Item — hover | `bg color-mix(in srgb, var(--mod-accent) 12%, transparent)` · `text var(--mod-accent)` | `module-footer.tsx:189` | N |
| Item — locked | `cursor-not-allowed` · `color: rgba(15,23,42,0.30)` · `sr-only` "(no access)" | `module-footer.tsx:171-175` | N |
| Icon | `size={15} strokeWidth={2.3}` | `module-footer.tsx:144` | Y |
| Shortcut hint | `⌃<digit>`, `tabular-nums opacity-55`, `aria-hidden` | `module-footer.tsx:156-158` | Y |
| Separator | `mx-1 h-5 w-px bg-[rgba(15,23,42,0.12)]` | `module-footer.tsx:211` | Y |
| Goals accent used here | **`#b45309`** (deep `#7C3D09`) | `lib/module-theme.ts:142-143` | **Y — see M-Z2** |
| Reveal motion | `transition-[opacity,transform] duration-200 ease-out`, `translateY(6px)` → `0` | `module-footer.tsx:120, 126` | N |

## M-B · Page titles — four named variants

All four recorded as variants per decision. Note `PageCommandBar`'s docstring claims its values were
copied from `goals-level-board.tsx` "so the two are the same object rather than two things that
merely look alike" — they are **not** currently identical.

| Variant | Exact Value | Where used | Source | Confirmed? |
| --- | --- | --- | --- | --- |
| **Command Bar Title** | `font-family: var(--font-display), system-ui, sans-serif` · `font-weight: 800` · `font-size: clamp(22px, 2vw, 32px)` · `letter-spacing: -0.03em` · `line-height: 1.02` · `color: var(--color-ink-strong)` | Approve, Recycle Bin | `components/layout/page-command-bar.tsx:69-77` | Y |
| **Board Title** | same family · `font-weight: 900` · `font-size: clamp(20px, 1.8vw, 25px)` · `letter-spacing: -0.028em` · `line-height: 1` | Yearly / Quarterly / Monthly / Weekly boards | `components/goals/board/goals-level-board.tsx:1034-1043` | Y |
| **Workbench Title** | same family · `font-weight: 900` · `font-size: 32px` (fixed) · *no letter-spacing set* | Review & Scores | `app/(app)/goals/review/page.tsx:44-47` | Y |
| **Section Title** | same family · `font-weight: 800` · `font-size: clamp(22px, 2vw, 32px)` · `letter-spacing: -0.03em` · `line-height: 1.05` | Team Performance | `app/(app)/goals/weekly/team/page.tsx:81-91` | Y |

**Subtitle / hint treatments**

| Variant | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| Command Bar hint (inline, right of title, baseline-aligned) | `text-[12.5px] font-medium leading-snug text-ink-muted` | `page-command-bar.tsx:80` | Y |
| Section subtitle (below title) | `mt-1 text-[13.5px] font-medium text-ink-muted` | `weekly/team/page.tsx:93` | Y |
| Workbench subtitle | `mt-1 text-[14.5px] text-ink-muted` | `review/page.tsx:50` | Y |

## M-C · Containers

### M-C1 · Page Command Bar

| Element | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| Card | `rounded-[20px] overflow-hidden mb-4` + `.wg-rise` | `components/layout/page-command-bar.tsx:55` | Y |
| Fill | `var(--color-surface-card)` | `page-command-bar.tsx:57` | Y |
| Border | `1px solid var(--color-hairline)` | `page-command-bar.tsx:58` | Y |
| Shadow | `0 1px 2px rgba(15,23,42,0.05), 0 18px 44px -30px rgba(15,23,42,0.22)` | `page-command-bar.tsx:59-60` | Y |
| Header row | `min-h-[56px]` · `px-5 py-2.5` (`max-md:px-4`) · `gap-3` · `items-center` | `page-command-bar.tsx:63` | Y |
| Title/hint group | `items-baseline gap-x-3 gap-y-0.5 min-w-[200px] flex-1` | `page-command-bar.tsx:67` | Y |
| Toolbar sub-row | `px-5 py-2 gap-2` · `border-top: 1px solid var(--color-hairline)` | `page-command-bar.tsx:93-95` | N |
| Page frame class | `relative flex flex-1 flex-col pt-6 pb-8 max-md:pt-5 max-md:pb-6` (`COMMAND_PAGE_CLASS`) | `page-command-bar.tsx:110-111` | Y |

Deliberate omissions, per its docstring (`page-command-bar.tsx:11-21`): **no eyebrow pill**,
**no paragraph under the title**.

### M-C2 · Glass Toolbar Strip

The level boards' recurring control container — the codebase calls it a "glass instrument strip".
Used **twice per board**: search/period row, then filter/view row. The second adds `animation-delay: 30ms`.

| Element | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| Frame | `rounded-section` (16px) · `border border-hairline` · `px-3 py-2` (`max-md:px-3`) · `mb-3` | `goals-level-board.tsx:1114`, `:1253` | Y |
| Fill | `linear-gradient(180deg, rgba(255,255,255,0.82), rgba(250,251,252,0.72))` | `goals-level-board.tsx:1116-1117`, `:1259-1260` | Y |
| Blur | `backdrop-filter: blur(14px) saturate(140%)` | `goals-level-board.tsx:1118-1119` | Y |
| Shadow | `0 1px 2px rgba(15, 23, 42, 0.04), 0 10px 26px -20px rgba(15, 23, 42, 0.18)` | `goals-level-board.tsx:1120-1121` | Y |
| Row 1 layout | `flex items-center gap-2 flex-wrap` | `goals-level-board.tsx:1114` | Y |
| Row 2 layout | `flex flex-wrap items-center gap-1.5` | `goals-level-board.tsx:1253` | Y |
| Entrance | `.wg-rise` → `fadeUp 0.55s cubic-bezier(0.22, 1, 0.36, 1) both` | `app/globals.css:2937` | N |

### M-C3 · Board page frame

| Element | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| Normal | `relative mx-auto w-full min-w-0 max-w-[1560px] px-7 pt-4 pb-16 max-md:px-4 max-md:pt-3` | `goals-level-board.tsx:1020` | Y |
| Full screen | `fixed inset-0 z-50 flex flex-col overflow-auto bg-surface-soft px-7 pt-4 pb-10 max-md:px-4 max-md:pt-3` | `goals-level-board.tsx:1019` | N |
| Text colour | `color: var(--color-ink-strong)` | `goals-level-board.tsx:1022` | Y |

> `max-w-[1560px]` is **not** one of the `--content-*` tokens (G4). Logged in M-Z1.

## M-D · Buttons

### M-D1 · Pastel CTA — `.brand-btn` / `.pastel-cta` (one token, two aliases)

Both class names carry **byte-identical declarations**. Recorded once; duplication flagged in M-Z3.

| State | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| Fill | `color-mix(in srgb, var(--module-accent, var(--color-altus-red)) 12%, #fff)` `!important` | `app/globals.css:3021` / `:3004` | Y |
| Ink | `var(--module-accent-deep, var(--color-altus-red-deep))` `!important` | `app/globals.css:3022` / `:3005` | Y |
| Border | `1.5px solid color-mix(in srgb, var(--module-accent, var(--color-altus-red)) 30%, transparent)` `!important` | `app/globals.css:3023` / `:3006` | Y |
| Shadow | `none` | `app/globals.css:3024` / `:3007` | Y |
| Hover | fill → `20%`, border-color → `45%` | `app/globals.css:3026-3029` | N |
| Disabled (`.brand-btn` only) | `opacity: 0.55` | `app/globals.css:3014` | N |
| Applied geometry — "New Goal" | `h-9 rounded-pill px-3.5 text-[13px] font-bold gap-1.5` + `.wg-btn` + `hover:-translate-y-px` | `goals-level-board.tsx:1228` | Y |
| Applied geometry — drawer "Add Goal" | `rounded-full px-6 py-2.5 text-[14px] font-bold gap-1.5` | `components/goals/board/board-quick-add.tsx:333` | N |
| Icon | lucide `Plus`, `size={14} strokeWidth={2.8}` | `goals-level-board.tsx:1230` | Y |
| Keyboard | `New Goal — press G`, `aria-keyshortcuts="G"` | `goals-level-board.tsx:1226-1227` | — |

> `--module-accent` is **not set globally by any module**; a module *shell* may set it on its own
> subtree. Goals does not, so it falls back to `--color-altus-red` (`app/globals.css:2995-3000`).

### M-D2 · Solid red gradient button

Not a class — applied inline. Used when a CTA must carry white text.

| Element | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| Fill | `linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))` | `components/goals/board/personal-start-prompt.tsx:60` | Y |
| Ink | `#fff` / `text-white` | same | Y |
| Geometry ("Copy from Professional") | `rounded-full px-5 py-2.5 text-[14px] font-bold gap-1.5` | `personal-start-prompt.tsx:59` | Y |
| Disabled | `disabled:opacity-60` | `personal-start-prompt.tsx:58` | N |
| Also used by | view-toggle active segment (M-E3), space-toggle active segment (M-A5), period-pill active (M-E2), bell badge (M-A1), capture "Keep" (`goal-capture-box.tsx:143`) | — | Y |

### M-D3 · Neutral outline button

| Element | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| Base | `h-9 px-3.5 rounded-pill text-[13px] font-bold gap-1.5` · `border border-hairline` · `bg-surface-card` · `text-ink-soft` | `goals-level-board.tsx:1105` (Full screen), `:1352` (Export) | Y |
| Hover | `hover:border-hairline-strong hover:text-ink-strong` | same | N |
| **Disabled** | `disabled:opacity-50 disabled:cursor-not-allowed` | `goals-level-board.tsx:1352` | **Y** — Export, PDF pages 1–3 |
| Icons | `Maximize2` / `Minimize2` / `Download`, `size={14} strokeWidth={2.4}` | `goals-level-board.tsx:1107, 1355` | Y |
| Copy | `Full screen` ⇄ `Exit`; title `Exit full screen (Esc)` | `goals-level-board.tsx:1104-1108` | Y |

### M-D4 · Ghost inset-outline button ("Show past")

| Element | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| Base | `rounded-lg px-2.5 py-1.5 text-[13px] font-bold text-ink-muted gap-1` | `goals-level-board.tsx:1176`, `:1192` | Y |
| Border | `box-shadow: inset 0 0 0 1px var(--color-hairline-strong)` (inset, not a real border) | `goals-level-board.tsx:1177`, `:1193` | Y |
| Hover | `hover:bg-surface-soft hover:text-ink-strong` | same | N |
| Monthly variant | adds `self-stretch` (matches the taller month bracket beside it) | `goals-level-board.tsx:1192` | Y |
| Copy | `Show past (n)` ⇄ `Hide past` (quarterly) · `Show past` ⇄ `Hide past` (monthly) | `goals-level-board.tsx:1180`, `:1196` | Y |

### M-D5 · Add Goal tile (`BoardQuickAdd`)

| Element | Exact Value (compact — board footer variant) | Source | Confirmed? |
| --- | --- | --- | --- |
| Frame | `rounded-xl border px-3 py-2 text-[13px] font-bold gap-1.5` + `.wg-btn` | `board-quick-add.tsx:268` | Y |
| Colours | `border-color: var(--color-hairline-strong)` · `color: var(--color-ink-soft)` · `background: var(--color-surface-soft)` | `board-quick-add.tsx:270` | Y |
| Icon badge | `size-5 rounded-full` · `background: color-mix(in srgb, var(--color-ink-strong) 8%, transparent)` · `color: var(--color-ink-muted)` | `board-quick-add.tsx:273-274` | Y |
| Icon | lucide `Plus`, `size={13} strokeWidth={2.8}` | `board-quick-add.tsx:276` | Y |
| Label | `Add Goal` | `board-quick-add.tsx:278` | Y |
| Non-compact variant | `rounded-full px-4 py-2.5 text-[13.5px]` · `size-6` badge · `Plus size={15}` · label `Add New Goal` + `· into {bucketLabel}` in `text-[12px] font-semibold` `var(--color-ink-subtle)` | `board-quick-add.tsx:269, 275-282` | Y (PDF page 4) |
| Hover | `hover:bg-surface-soft` | `board-quick-add.tsx:268` | N |

### M-D6 · AI capture trigger

| Element | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| Button | `h-9 rounded-pill border px-3.5 text-[13px] font-bold text-ink-soft gap-2` | `components/goals/capture/goal-capture-box.tsx:154` | Y |
| Border | `border-color: var(--color-hairline)` | `goal-capture-box.tsx:155` | Y |
| Hover | `hover:border-altus-red hover:text-altus-red` | `goal-capture-box.tsx:154` | N |
| Icon | lucide `Sparkles`, `size={15} strokeWidth={2.4}`, `className="text-altus-red"` | `goal-capture-box.tsx:156` | Y |
| Copy | `Capture goals with AI` + `— type it in plain words` (`text-[11px] font-semibold text-ink-subtle`, `sm:inline`) | `goal-capture-box.tsx:157-160` | Y |

### M-D7 · Restore button (Recycle Bin)

| Element | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| Frame | `h-9 rounded-chip` (12px) `border border-hairline bg-surface-card px-3 text-[13px] font-bold gap-1.5` | `components/goals/recycle-bin-list.tsx:121` | Y |
| Ink | inline `color: "#E10600"` (`THEME_ACCENT`) — **overrides the `text-ink-strong` class on the same element** | `recycle-bin-list.tsx:10, 122` | Y |
| Hover | `hover:border-hairline-strong`; `disabled:opacity-50` | `recycle-bin-list.tsx:121` | N |
| Icon | lucide `RotateCcw`, `size={14}` (no `strokeWidth`) | `recycle-bin-list.tsx:124` | Y |
| Delete icon button | `h-9 w-9 rounded-chip text-ink-muted`; hover `bg color-mix(in srgb, var(--color-altus-red) 10%, transparent)` + `color var(--color-altus-red)` | `recycle-bin-list.tsx:152` | Y |

### M-D8 · Focus ring (module-wide)

`outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]`

Source: `goals-level-board.tsx:85-86`. **Re-declared verbatim in ≥10 files** — see M-Z1.
Confirmed? N (no focus state appears in the PDF).

## M-E · Pills, chips & badges

### M-E1 · Goal stat chip (`GoalStatChip`)

| Element | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| Frame | `rounded-xl` · `padding: 5px 10px` · `gap-2` | `goals-level-board.tsx:1638, 1641` | Y |
| Rest fill | `var(--color-surface-card)` | `goals-level-board.tsx:1644` | Y |
| Rest border | `box-shadow: inset 0 0 0 1px var(--color-hairline)` | `goals-level-board.tsx:1647` | Y |
| Active fill | `color-mix(in srgb, var(--color-<tone>) 8%, var(--color-surface-card))` | `goals-level-board.tsx:1643` | Y |
| Active border | `box-shadow: inset 0 0 0 1.5px var(--color-<tone>-deep)` | `goals-level-board.tsx:1646` | Y |
| Dot | `size-2 rounded-full` · `background: var(--color-<tone>)` | `goals-level-board.tsx:1652-1654` | Y |
| Number | `var(--font-display)` · `font-weight: 900` · `font-size: 16` · `letter-spacing: -0.02em` · `tabular-nums` · `text-ink-strong` | `goals-level-board.tsx:1658-1663` | Y |
| Label | `font-size: 11.5` · `font-semibold` · active `var(--color-<tone>-deep)`, else `var(--color-ink-soft)` | `goals-level-board.tsx:1668-1669` | Y |
| Behaviour | toggles a completion filter; `aria-pressed`; re-click clears back to `all` | `goals-level-board.tsx:1047-1093` | — |

**Tone map (level boards)** — `goals-level-board.tsx:1047-1093`:

| Chip | Tone token | Confirmed? |
| --- | --- | --- |
| `Total` | `slate` (active by default) | Y |
| `Done` | `green` | Y |
| `75-100%` | `blue` | Y |
| `50-75%` | `yellow` | Y |
| `25-50%` | `orange` | Y |
| `<25%` | `red` | Y |
| `Not Started` | `slate` | Y |

The Weekly board carries a different set — `Total`, `Done`, `On track`, `Behind` (PDF page 4); tone
map not extracted (Gap 3).

### M-E2 · Period pills (quarter / month)

| State | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| Frame | `rounded-full border px-1.5 py-0.5 text-[10.5px] font-bold whitespace-nowrap gap-1` + `.wg-btn` | `components/goals/board/quarter-window-nav.tsx:149` | Y |
| Active | `linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))` · `border-color: var(--color-altus-red)` · `color: #fff` · `box-shadow: 0 8px 20px -10px rgba(225,6,0,0.5)` | `quarter-window-nav.tsx:152-156` | Y |
| Rest | `background: var(--color-surface-card)` · `border-color: var(--color-hairline-strong)` · `color: var(--color-ink-soft)` | `quarter-window-nav.tsx:159-162` | Y |
| Month — out-of-FY | `background: transparent` · `border-color: var(--color-hairline)` · `color: var(--color-ink-subtle)` | `components/goals/board/month-window-nav.tsx:188-190` | Y |
| Month — "current" ring | `box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-altus-red) 45%, transparent)` | `month-window-nav.tsx:199` | N |
| Month min width | `min-w-[34px]` | `month-window-nav.tsx:216` | Y |
| "Current period" dot | `size-[5px] rounded-full`; `rgba(255,255,255,0.85)` on the active pill, `var(--color-altus-red)` elsewhere | `quarter-window-nav.tsx:166-171` | Y |
| Group bracket | `rounded-lg border border-hairline px-1.5 pb-1 pt-2` · `background: color-mix(in srgb, var(--color-surface-soft) 55%, transparent)` | `quarter-window-nav.tsx:80-81` | Y |
| Bracket FY legend | `absolute -top-[5px] left-1.5 px-1 text-[9px] font-bold uppercase tracking-[0.1em] text-ink-subtle` · `background: var(--color-surface-card)` (notched into the border) | `quarter-window-nav.tsx:87-88` | Y |
| Month quarter caption | `mb-0.5 text-[9px] font-bold uppercase tracking-[0.08em]` | `month-window-nav.tsx:123` | Y |
| Month bracket | `rounded-lg border border-hairline px-1.5 pb-1 pt-2.5` | `month-window-nav.tsx:96` | Y |
| Copy | `Q2 · Jul–Sep`, `Q3 · Oct–Dec`, `Q4 · Jan–Mar`, `Q1 · Apr–Jun`; `FY 2026-27` legend | PDF page 2 | Y |

### M-E3 · View toggle segments (List · Kanban · Dashboard)

| Element | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| Group | `h-9 rounded-pill border border-hairline-strong bg-surface-soft overflow-hidden` · `role="group"` `aria-label="Board view"` | `goals-level-board.tsx:1269` | Y |
| Segment | `h-full px-3 text-[12.5px] font-bold gap-1.5` | `goals-level-board.tsx:1598` | Y |
| Active | `linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))` · `color: #fff` · `box-shadow: 0 6px 14px -8px var(--color-altus-red-deep)` | `goals-level-board.tsx:1602-1604` | Y |
| Rest | `background: transparent` · `color: var(--color-ink-subtle)` | `goals-level-board.tsx:1606` | Y |
| Icons | `List` / `Columns3` / `LayoutDashboard`, `size={14} strokeWidth={2.4}` | `goals-level-board.tsx:1276, 1282, 1286` | Y |

### M-E4 · Multi-pick filter pill (`All Areas`, `All Types`)

| State | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| Frame (default) | `h-9 gap-1.5 px-3.5 text-[13px] rounded-pill border font-bold` | `goals-level-board.tsx:1721` | Y |
| Frame (compact) | `h-7 gap-1 px-2 text-[11px]` | `goals-level-board.tsx:1721` | N |
| Rest | `border-color: var(--color-hairline)` · `background: var(--color-surface-card)` · `color: var(--color-ink-soft)` | `goals-level-board.tsx:1731` | Y |
| Active (≥1 selected) | `border-color: color-mix(in srgb, var(--color-altus-red) 45%, transparent)` · `background: color-mix(in srgb, var(--color-altus-red) 7%, transparent)` · `color: var(--color-altus-red-deep)` | `goals-level-board.tsx:1726-1729` | N |
| Chevron | lucide `ChevronDown`, `size={14} strokeWidth={2.4}`, `opacity-60`, `rotate-180` when open | `goals-level-board.tsx:1735` | Y |
| Label logic | 0 → `All {label}` · 1 → the value itself · n → `{n} {label}` | `goals-level-board.tsx:1700-1705` | Y |
| Popover | `align="start" w-[220px] p-1.5`; list `max-h-[280px] overflow-auto` | `goals-level-board.tsx:1738-1739` | N |
| Popover row | `rounded-md px-2 py-1.5 text-[13px] font-semibold text-ink-strong`, hover `bg-surface-soft` | `goals-level-board.tsx:1748` | N |
| Checkbox | `size-4 rounded border`; checked `background` + `border-color: var(--color-altus-red)` with `Check size={11} strokeWidth={3}` in white | `goals-level-board.tsx:1751-1760` | N |

### M-E5 · Table status pill

| Element | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| Frame | `inline-flex items-center whitespace-nowrap rounded-pill px-2 py-0.5 text-[11px] font-bold` | `components/goals/team/team-performance-board.tsx:704` | Y |

Tones — **all raw hexes, no tokens** (M-Z1). Source `team-performance-board.tsx:86-93`:

| Status | `color` | `background` | Confirmed? |
| --- | --- | --- | --- |
| Needs help | `#b45309` | `color-mix(in srgb, var(--color-amber) 16%, transparent)` | Y |
| Blocked | `#b45309` | `color-mix(in srgb, var(--color-amber) 14%, transparent)` | N |
| Working | `#15803d` | `color-mix(in srgb, var(--color-green) 15%, transparent)` | Y |
| Clocked out | `#475569` | `var(--color-surface-soft)` | N |
| No plan | `#dc2626` | `color-mix(in srgb, var(--color-altus-red) 10%, transparent)` | N |
| Not in yet | `#64748b` | `var(--color-surface-soft)` | Y |

Overdue count ink: `#dc2626` when `> 0`, else `var(--color-ink-subtle)` —
`team-performance-board.tsx:697`. Confirmed Y.

## M-F · Inputs & selects

| Element | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| Local search field | `w-full h-9 rounded-pill border border-hairline bg-surface-card pl-9 pr-9 text-[13.5px] font-medium text-ink-strong` | `goals-level-board.tsx:1132` | Y |
| Local search focus | `focus:border-altus-red` | same | N |
| Local search wrapper | `min-w-[180px] max-w-[360px] flex-1` | `goals-level-board.tsx:1124` | Y |
| Search icon | lucide `Search`, `size={15} strokeWidth={2.4}`, `absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle` | `goals-level-board.tsx:1125` | Y |
| Placeholder copy | `Local search — goals, areas, notes` | `goals-level-board.tsx:1129` | Y |
| Clear button | `absolute right-2.5 rounded-full text-ink-subtle`, `X size={14}`, hover `text-ink-strong` | `goals-level-board.tsx:1139-1141` | N |
| Select shell (Sort) | `h-9 rounded-pill border border-hairline bg-surface-card pl-7 pr-3` · `focus-within:border-altus-red` · `hover:border-hairline-strong` | `goals-level-board.tsx:1292` | Y |
| Sort icon | lucide `ArrowUpDown`, `size={13} strokeWidth={2.4}`, `absolute left-2.5 text-ink-subtle` | `goals-level-board.tsx:1293` | Y |
| Select text | `min-w-[5.5rem] text-[13px] font-bold text-ink-soft` | `goals-level-board.tsx:1299` | Y |
| Rows-per-page shell | `h-9 rounded-pill border border-hairline bg-surface-card px-3 gap-1.5`; label `text-[13px] font-semibold text-ink-subtle`; value `text-[13px] font-bold text-ink-strong min-w-[2.5rem]` | `goals-level-board.tsx:1318-1327` | Y |
| Rows options | `25` · `50` · `100` · `All` (default `25`) | `goals-level-board.tsx:1329-1332` | Y |
| Team-board search | `h-9 w-[210px] rounded-lg border border-hairline-strong bg-surface-card pl-8 pr-7 text-[13px] font-medium text-ink-strong`, focus ring `var(--color-altus-red)/40` | `team-performance-board.tsx:539` | Y |
| FY stepper group | `inline-flex overflow-hidden rounded-lg border border-hairline-strong bg-surface-card` | `goals-level-board.tsx:1200` | Y |
| FY stepper arrows | `px-2 py-1.5 text-ink-subtle`; hover `bg-surface-soft` + `text-altus-red`; `ChevronLeft` / `ChevronRight size={15} strokeWidth={2.4}` | `goals-level-board.tsx:1205-1218` | Y |
| FY stepper value | `border-x border-hairline-strong px-2.5 py-1.5 text-[13px] font-bold tabular-nums text-ink-strong` | `goals-level-board.tsx:1209` | Y |

## M-G · Tables

| Element | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| `<th>` | `py-2 pr-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle` | `team-performance-board.tsx:879` | Y |
| Body cell | `py-2.5 pr-3` | `team-performance-board.tsx:672` | Y |
| Name cell | `text-[13.5px] font-bold text-ink-strong truncate` | `team-performance-board.tsx:669` | Y |
| Secondary cell | `text-[12.5px] text-ink-subtle` | `team-performance-board.tsx:672` | Y |
| Sub-line | `text-[11.5px] text-ink-subtle opacity-80` | `team-performance-board.tsx:675` | Y |
| Numeric cell | `text-right text-[13px] tabular-nums text-ink-strong` | `team-performance-board.tsx:688` | Y |
| Percent cell | `text-[13px] font-bold tabular-nums` | `team-performance-board.tsx:696` | Y |
| Column set (Team) | `EMPLOYEE` · `DEPARTMENT · TEAM` · `GOAL` · `GOALS` · `DONE` · `OVERDUE` · `STATUS` | PDF page 6 | Y |
| Column set (Review) | `#` · `GOAL` · `CATEGORY` · `SELF %` · `APPROVED %` · `APPROVER NOTES` | PDF page 7 | Y |

> The `<th>` recipe above is byte-identical to the one used by the HR "All Filled Forms" table
> (`components/hr/forms/filled-forms-table.tsx:387`) — treat it as the app-wide table-header
> convention, not a Goals-only value.

## M-H · Cards & feature surfaces

### M-H1 · Empty state (board)

| Element | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| Card | `rounded-2xl border border-hairline bg-surface-card px-8 py-14 text-center overflow-hidden` + `.wg-rise` | `goals-level-board.tsx:1932` | Y |
| Shadow | `0 1px 3px rgba(15, 23, 42, 0.04)` | `goals-level-board.tsx:1933` | Y |
| Icon tile | `size-16 rounded-2xl mx-auto mb-4` · `background: color-mix(in srgb, var(--color-altus-red) 9%, transparent)` · `color: var(--color-altus-red)` | `goals-level-board.tsx:1936-1938` | Y |
| Icon | lucide `Target`, `size={30} strokeWidth={2.2}` | `goals-level-board.tsx:1940` | Y |
| Heading | `font-bold text-ink-strong` · `font-size: 22` · `letter-spacing: -0.01em` | `goals-level-board.tsx:1942` | Y |
| Body | `mt-2 max-w-[46ch] font-medium` · `font-size: 14.5` · `line-height: 1.5` · `color: var(--color-ink-muted)` | `goals-level-board.tsx:1946` | Y |
| Heading copy | `No goals in {periodLabel} yet` | `goals-level-board.tsx:1944` | Y |
| Body copy | `Add the first goal below — or drag a card here from another period. Goals added here land in this exact bucket.` | `goals-level-board.tsx:1947-1948` | Y |

### M-H2 · Empty state (Recycle Bin)

| Element | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| Card | `grid place-items-center gap-3 rounded-2xl border border-hairline-strong py-16 text-center` + `.wg-rise` | `recycle-bin-list.tsx:80` | Y |
| Icon tile | `size-14 rounded-2xl bg-surface-soft text-ink-muted` | `recycle-bin-list.tsx:81` | Y |
| Title | `text-[15px] font-semibold text-ink-soft` | `recycle-bin-list.tsx:84` | Y |
| Body | `max-w-[40ch] text-[13px] text-ink-muted` | `recycle-bin-list.tsx:85` | Y |

> Two distinct empty-state treatments in one module (M-H1 vs M-H2): white card + hairline + tinted
> red icon tile, versus transparent + `hairline-strong` + grey icon tile. Logged in M-Z1.

### M-H3 · List row card (Recycle Bin)

| Element | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| Row | `flex items-center gap-3 rounded-2xl border border-hairline bg-surface-card px-4 py-3` + `.wg-rise` | `recycle-bin-list.tsx:97` | Y |
| ID chip | `rounded-full bg-surface-soft px-2 py-0.5 text-[11px] font-bold tabular-nums text-ink-muted` | `recycle-bin-list.tsx:102` | Y |
| Title | `text-[15px] font-semibold text-ink-strong` · `overflow-wrap: anywhere` | `recycle-bin-list.tsx:106` | Y |
| Meta line | `mt-0.5 text-[12.5px] text-ink-muted` (` · `-joined) | `recycle-bin-list.tsx:110-113` | Y |
| Section heading | `mb-2.5 text-[12px] font-black uppercase tracking-[0.08em] text-ink-muted` | `app/(app)/goals/recycle-bin/page.tsx:157` | Y |

### M-H4 · Personal start prompt banner

| Element | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| Card | `rounded-2xl border p-5 mb-5 gap-4` + `.wg-rise` | `personal-start-prompt.tsx:35` | Y |
| Fill | `linear-gradient(135deg, color-mix(in srgb, var(--color-altus-red) 7%, var(--color-surface-card)), var(--color-surface-card) 72%)` | `personal-start-prompt.tsx:37` | Y |
| Border | `color-mix(in srgb, var(--color-altus-red) 34%, transparent)` | `personal-start-prompt.tsx:38` | Y |
| Shadow | `0 10px 30px -18px color-mix(in srgb, var(--color-altus-red) 45%, transparent)` | `personal-start-prompt.tsx:39` | Y |
| Icon tile | `size-11 rounded-2xl text-white` · `linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))` | `personal-start-prompt.tsx:42` | Y |
| Icon | lucide `Sparkles`, `size={22} strokeWidth={2.4}` | `personal-start-prompt.tsx:43` | Y |
| Heading | `text-[16px] font-black text-ink-strong` · `font-family: var(--font-display)` | `personal-start-prompt.tsx:46` | Y |
| Body | `mt-0.5 text-[13.5px] font-medium text-ink-muted` | `personal-start-prompt.tsx:49` | Y |
| Dismiss | `size-8 rounded-full text-ink-subtle`, hover `bg-black/[0.05]`; `X size={16} strokeWidth={2.4}` | `personal-start-prompt.tsx:68-71` | Y |

### M-H5 · Approve hero card

| Element | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| Card | `rounded-section` (16px) `border border-hairline bg-surface-card p-5 relative isolate overflow-hidden` + `.wg-rise` | `components/goals/approve/approve-workbench.tsx:69` | Y |
| Aurora tint vars | `--kpi-tone: #E10600`, `--kpi-tone-deep` | `approve-workbench.tsx:12, 71-74` | Y |
| `.kpi-aurora-primary` | `position: absolute; inset: 0; background: radial-gradient(circle at 22% 0%, var(--kpi-tone) 0%, transparent 55%); opacity: 0.18; animation: kpiBreathe 8s ease-in-out infinite; animation-delay: calc(var(--kpi-index, 0) * -1.3s)` | `app/globals.css:1372-1388` | Y — this is the pink wash over the card |
| Status disc | `h-14 w-14 rounded-full text-white` | `approve-workbench.tsx:81` | Y |
| Disc — complete | `linear-gradient(135deg, var(--color-green), var(--color-green-deep))`; shadow `0 8px 20px -8px rgba(21,128,61,0.5)` | `approve-workbench.tsx:84, 88` | Y |
| Disc — incomplete | `linear-gradient(135deg, #E10600, <ACCENT_DEEP>)`; shadow `0 8px 20px -8px #E1060088` | `approve-workbench.tsx:85, 89` | N |
| Disc icon | lucide `ShieldCheck`, `size={24}` (default stroke) | `approve-workbench.tsx:92` | Y |
| Headline | `var(--font-display)` · `font-weight: 900` · `font-size: 24` · `tabular-nums`; the `of n` span is `font-weight: 700; font-size: 16` on `text-ink-soft` | `approve-workbench.tsx:95-99` | Y |
| Sub-line | `text-[13px] font-semibold text-ink-muted` | `approve-workbench.tsx:102` | Y |
| Progress track | `h-2.5 w-full rounded-full bg-ink-strong/8`; container `min-w-[160px] flex-1` | `approve-workbench.tsx:106-107` | Y |
| Progress fill | complete → `linear-gradient(90deg, var(--color-green), var(--color-green-deep))`; else `linear-gradient(90deg, #E10600, #E10600)`; `transition-[width] duration-500` | `approve-workbench.tsx:109-115` | Y |
| Preview notice | `rounded-pill bg-surface-soft px-3 py-1.5 text-[12.5px] font-semibold text-ink-muted gap-1.5` | `approve-workbench.tsx:122` | Y |
| Notice icon | lucide `CalendarClock`, `size={14}`, `color: #E10600` | `approve-workbench.tsx:123` | Y |
| Empty-downline card | `rounded-section border border-hairline-strong bg-surface-soft/40 p-10 text-center`; icon tile `h-12 w-12 rounded-2xl` | `approve-workbench.tsx:49-51` | N |

### M-H6 · Daily Score strip (Review)

| Element | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| Section | `mb-4 rounded-2xl border border-hairline bg-surface-card p-4` | `components/goals/review/daily-score-card.tsx:21` | Y |
| Eyebrow | `text-[11px] font-black uppercase tracking-[0.12em] text-altus-red-deep` | `daily-score-card.tsx:24` | Y |
| Eyebrow sub | `text-[12px] font-medium text-ink-subtle` | `daily-score-card.tsx:27` | Y |
| Right stat label | `text-[13px] font-bold text-ink-muted` | `daily-score-card.tsx:32, 39` | Y |
| Right stat value | `text-[20px] font-black tabular-nums text-ink-strong` | `daily-score-card.tsx:34, 41` | Y |
| Sub-tile | `rounded-xl border border-hairline bg-surface-soft px-3 py-2.5` | `daily-score-card.tsx:105` | Y |
| Sub-tile label | `text-[10px] font-black uppercase tracking-[0.08em]`, colour per tone | `daily-score-card.tsx:106` | Y |
| Sub-tile value | `mt-1 text-[19px] font-black leading-none tabular-nums text-ink-strong` | `daily-score-card.tsx:110` | Y |
| Sub-tile hint | `mt-1 text-[10.5px] font-medium text-ink-subtle` | `daily-score-card.tsx:111` | Y |

## M-I · Motion

| Name | Exact Value | Source | Confirmed? |
| --- | --- | --- | --- |
| `.wg-rise` | `animation: fadeUp 0.55s cubic-bezier(0.22, 1, 0.36, 1) both` | `app/globals.css:2937` | N |
| `.wg-btn` | `transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.2s ease, filter 0.2s ease, background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease` | `app/globals.css:2977-2981` | N |
| `.wg-btn:hover` | `transform: translateY(-2px)` | `app/globals.css:2982` | N |
| `.wg-btn:active` | `transform: translateY(0) scale(0.985)` | `app/globals.css:2983` | N |
| `.module-wordmark` | `animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both` | `app/globals.css:3086` | N |
| `.module-wordmark-icon` | `animation: mwPop 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both` | `app/globals.css:3087` | N |
| `@keyframes mwPop` | `0%` `scale(0.6) rotate(-8deg)` opacity 0 → `60%` `scale(1.1)` → `100%` `scale(1) rotate(0)` opacity 1 | `app/globals.css:3108-3112` | N |
| `@keyframes mwSheen` | `background-position: 200% 0` → `-40% 0`, `5s linear infinite` | `app/globals.css:3104-3107` | Y* |
| `.goals-drag-source` | `goalsDropPulse 1.3s ease-in-out infinite` — border-color `altus-red 42%` ⇄ `70%` | `app/globals.css:2951-2957` | N |
| Drag guard | `[data-goals-dragging="true"] .wg-rise { opacity: 1 !important; transform: none !important }` | `app/globals.css:2945-2948` | N |
| Nav-pill base transition | `background 200ms ease, transform 200ms ease, box-shadow 250ms ease, color 200ms ease` | `app/globals.css:1132-1136` | N |

**Reduced motion:** `@media (prefers-reduced-motion: reduce)` disables `.module-wordmark`,
`.module-wordmark-icon` and `.module-wordmark-text` (`app/globals.css:3119-3122`),
`.goals-drag-source` (`:2958-2960`) and `.kpi-aurora-primary` (`:1402-1406`).

## M-J · UI copy inventory (verbatim from the screenshots)

| Surface | Copy |
| --- | --- |
| Top bar | `Global search — tasks, clients, people, documents…` · `⌘K` |
| Board titles | `Yearly Goals` · `Quarterly Goals` · `Monthly Goals` · `Weekly Goals` |
| Stat chips (level) | `Total` · `Done` · `75-100%` · `50-75%` · `25-50%` · `<25%` · `Not Started` |
| Stat chips (weekly) | `Total` · `Done` · `On track` · `Behind` |
| Toolbar | `Full screen` · `Local search — goals, areas, notes` · `New Goal` · `VIEWING` · `List` · `Kanban` · `Dashboard` · `Sr. No.` · `All Areas` · `All Types` · `Rows 25` · `Columns` · `Export` · `Bulk Upload` · `Show past (1)` · `Show past` |
| Board footer | `Capture goals with AI` · `— type it in plain words` · `Add Goal` · `Add New Goal · into 31 Aug 2026 – 06 Sep 2026` |
| Board empty | `No goals in FY 2026–27 yet` · `No goals in Q2 · Jul–Sep yet` · `No goals in Sep 2026 yet` · `Add the first goal below — or drag a card here from another period. Goals added here land in this exact bucket.` |
| Weekly empty | `No goals yet` · `This bucket is a blank page. Add a goal above and it will land here, ready to edit inline.` |
| Weekly card | `CROSSED OUT (1)` · `APP DEVP` · `Not linked to a monthly goal` · `TARGET · NA` · `TARGET AMOUNT` · `DEPENDENCY` · `Actual —` · `on team` · `TEAM` · `SELF 0%` · `ACCEPTED —` · `Fields` |
| Team | `Team Performance` · `Monitor team performance, workload, goals and blockers.` · `23 Employees` `6 Working` `5 No plan` `3 Need help` `16 Overdue` · `All departments` · `All teams` · `All statuses` · `Sort: Needs attent…` · `Local search — employee` |
| Review | `Review & Scores` · `% Done, approved score & approver notes for your goals · FY 2026-27` · `REVIEWING` · `DAILY SCORE` · `What you planned versus what you actually closed.` · `Today 0/5 (0%)` · `Last 14d 0/46 (0%)` · `FRESH DONE` / `planned today, closed today` · `CARRIED DONE` / `owed from before, cleared today` · `STILL OPEN` / `on today's plan, not done` · `AVERAGE DELAY` / `no dated task closed yet` · `Daily` / `Day-plan · self-completed` · `Weekly` / `Week goals · approval tier` · `Monthly` / `Month goals · approval tier` · `Quarterly` / `Quarter targets` · `Yearly` / `FY headline goals` · `AVG SCORE` `Green Band` · `0 done · 52 pending · 52 goals` · `self-completed` |
| Approve | `Approve your team's week` · `Sign off last week's progress and this week's goals for each of your reports.` · `1 of 1 signed off` · `Your team is fully approved — you're clear to clock in.` · `Preview — the clock-in approval gate is live on Mondays (IST).` · `0 goals to review` · `LAST WEEK: —` · `THIS WEEK: —` · `LAST WEEK · PROGRESS` · `THIS WEEK · COMMITTED` · `Approve all` · `No goals last week.` · `Nothing committed yet.` |
| Recycle Bin | `Recycle Bin` · `Deleted goals and abandoned tasks — restore, or delete for good.` · `Recycle bin is empty` · `Deleted goals land here so nothing is lost by accident. Restore them to the cascade, or clear them out for good.` · `ABANDONED TASKS` · `Restore` |
| Personal | `Start your Personal space from your Professional goals?` · `Copies your Yearly → Monthly goal tree into Personal — progress reset, yours to edit privately. Or just add your own below.` · `Copy from Professional` |

**Search-label convention** (`components/layout/app-top-bar.tsx:21-24`): the global field says
**"Global search"**; every page-level field says **"Local search — <what it filters>"**, so the two
magnifying glasses are never ambiguous. Page-level fields also carry
`title="Local search — filters only the list on this page"`.

## M-K · Icon inventory (lucide-react, this module)

| Icon | Where | Size · stroke | Confirmed? |
| --- | --- | --- | --- |
| `Target` | Goals wordmark tile; Quarterly nav; board empty state | `20`·`2.6` / `16`·`2.2` / `30`·`2.2` | Y |
| `Trophy` | Yearly Goals nav | `16`·`2.2` | Y |
| `CalendarRange` | Monthly Goals nav; Approve nav | `16`·`2.2` | Y |
| `CalendarCheck` | Weekly Goals nav | `16`·`2.2` | Y |
| `CalendarDays` | Daily Goals nav | `16`·`2.2` | Y |
| `Gauge` | Team Productivity nav | `16`·`2.2` | Y |
| `ClipboardList` | Review nav | `16`·`2.2` | Y |
| `Trash2` | Recycle Bin nav; row delete | `16`·`2.2` | Y |
| `Briefcase` / `User` | space-toggle segments | `13`·`2.5` | Y |
| `Search` | top bar / local search | `16`·`2.3` / `15`·`2.4` | Y |
| `Plus` | `+` quick action; New Goal; Add Goal | `16`·`2.8` / `14`·`2.8` / `13`·`2.8` | Y |
| `Maximize2` / `Minimize2` | focus-mode toggle; Full screen | `size-5`·`2.2` / `14`·`2.4` | Y |
| `Bell` | notifications | `17`·`2.3` | Y |
| `List` / `Columns3` / `LayoutDashboard` | view toggle | `14`·`2.4` | Y |
| `ArrowUpDown` | Sort select | `13`·`2.4` | Y |
| `ChevronDown` | filter pills, selects | `14`·`2.4` | Y |
| `ChevronLeft` / `ChevronRight` | FY and week steppers | `15`·`2.4` | Y |
| `Download` | Export | `14`·`2.4` | Y |
| `Sparkles` | AI capture; personal prompt | `15`·`2.4` / `22`·`2.4` | Y |
| `ShieldCheck` | Approve hero disc | `24` (default stroke) | Y |
| `CalendarClock` | Approve preview notice | `14` (default stroke) | Y |
| `RotateCcw` | Restore | `14` (default stroke) | Y |
| `X` | dismiss / clear | `16`·`2.4` / `14` | Y |
| `Check` | checkbox tick; Add Goal confirm | `11`·`3` / `15`·`2.8` | N |
| `Loader2` | busy states, `animate-spin` | `13`–`15` | N |
| `GripVertical` | drag handle | imported `goals-level-board.tsx:28` | N |

## M-L · Cross-module note — Daily Goals

PDF **page 5** (`Daily Goals & Commitments`) is reached from the Goals rail, but the nav entry points
at **`/my-day`**, which `workspaceForPath` maps to the **WMS** room — so the entire rail switches to
WMS on arrival. `components/layout/main-nav.tsx:396-405` documents this as deliberate ("one planner,
one URL, one set of `daily_checklist` rows"); `/goals/plan` is a redirect stub to the same place.

**Its components are NOT documented here** — they belong to the WMS module section (pending).

## M-Z · Conflicts flagged

### M-Z1 · Values that bypass the token system

Recorded verbatim because that is what renders. Each is untokenised debt, not a token.

| Value | Where | Nearest existing token (**not** used) |
| --- | --- | --- |
| `#b45309` | team status `needs_help`, `blocked` | `--color-amber-deep` `#8a3d06` |
| `#15803d` | team status `working` | `--color-green-deep` `#0f5b2e` |
| `#dc2626` | team status `no_plan`; overdue count | `--color-altus-red` `#E10600` |
| `#475569` | team status `clocked_out` | `--color-ink-muted` `#475569` — **exact match; the token exists** |
| `#64748b` | team status `not_in` | none exact; nearest `--color-ink-subtle` `#5b6675` |
| `bg-red-600` / `bg-red-700` | top-bar `+` button | `--color-altus-red`; this one will **not** follow a user's accent |
| `#E10600` literal | `approve-workbench.tsx:12`, `recycle-bin-list.tsx:10`, progress fill `:114` | `var(--color-altus-red)` |
| `rgba(225,6,0,0.5)` | period-pill active shadow | the accent, hardcoded to the default seed |
| `rgba(21,128,61,0.5)` | approve disc shadow | `--color-green-deep` `#0f5b2e` |
| `#ff5560` | nav-pill badge gradient stop (`main-nav-pill.tsx:66`) | none |
| `max-w-[1560px]` | board page frame | `--content-full` `1760px` / `--content-wide` `1400px` |
| `FOCUS_RING` string | re-declared verbatim in ≥10 files (`goals-level-board.tsx:85`, `quarter-window-nav.tsx:180`, `board-quick-add.tsx:27`, `goal-board-card.tsx:92`, `member-approval-card.tsx:30`, plus 5+ outside Goals) | no shared export |
| Two empty-state treatments | M-H1 vs M-H2 | no single empty-state component |
| Dead class on live element | `text-ink-strong` on the Restore button, overridden by an inline `color` (`recycle-bin-list.tsx:121-122`) | — |

### M-Z2 · Goals accent conflict — **UNRESOLVED**

Two different colours both claim to be "the Goals accent", and **both are visible in the PDF**:

| Value | Where it renders | Source |
| --- | --- | --- |
| `#b45309` / deep `#7C3D09` | the bottom module dock's active "Goals" item (PDF pages 2, 3, 8, 10) | `lib/module-theme.ts:142-143` |
| `#E10600` / deep `#A80400` | rail wordmark, every nav pill, every CTA, every period pill, empty-state icon | `app/globals.css:98-99`, `--color-altus-red` |

`components/layout/dashboard-sidebar.tsx:20-25` states a policy — "the module colour is reserved for
IDENTITY only … hub cards alone keep module colours" — but `MODULE_THEME.goals.accent` is *also* the
dock's colour, and the dock is not a hub card.

**Flagged as a conflict pending a decision. Do not treat either value as canonical until resolved.**

### M-Z3 · `.brand-btn` and `.pastel-cta` are duplicates

`app/globals.css:3003-3008` and `:3020-3025` declare **identical** `background`, `color`, `border`
and `box-shadow`. `.brand-btn` additionally has `:disabled { opacity: 0.55 }` (`:3014`).
`.brand-btn--soft` (`:3030-3039`) is a third near-twin at `14%` fill / `40%` border.

Recorded as **one token with two aliases** (M-D1); the duplication is flagged for cleanup.

### M-Z4 · Font weight requested beyond the loaded axis

Bricolage Grotesque is loaded with `weight: "300 800"` (`app/layout.tsx:55`), but several Goals
surfaces request **900**:

| Component | Requested | Source |
| --- | --- | --- |
| Board Title `<h1>` | `fontWeight: 900` | `goals-level-board.tsx:1038` |
| `GoalStatChip` number | `fontWeight: 900` | `goals-level-board.tsx:1661` |
| Review `<h1>` | `fontWeight: 900` | `app/(app)/goals/review/page.tsx:46` |
| Approve headline | `fontWeight: 900` | `approve-workbench.tsx:95` |
| `.module-wordmark-text` | `font-weight: 900` | `app/globals.css:3090` |
| Personal prompt heading | `font-black` (900) + `--font-display` | `personal-start-prompt.tsx:46` |

A variable font clamps a request above its axis maximum, so these render at **800**. Either the
loaded range should be widened or the declarations corrected — **not resolvable from the PDF**, since
800 and 900 are indistinguishable at these sizes in a screenshot.

## Gaps / Not Found

| # | Item | Why it is unresolved |
| --- | --- | --- |
| 1 | Goals accent `#b45309` vs `#E10600` | Flagged as a conflict per instruction (M-Z2); needs a design decision, not more searching. |
| 2 | Bricolage 900-vs-800 (M-Z4) | Cannot be settled from a screenshot; needs a call on widening the axis or fixing the declarations. |
| 3 | Weekly-board stat-chip tone map (`On track`, `Behind`) | Copy confirmed from PDF page 4; the tone tokens live in the weekly board, not extracted this pass. |
| 4 | Weekly goal card (`CROSSED OUT` section, PDF page 4) | Row / field-card / `APP DEVP` tag / `SELF %` / `ACCEPTED` styling not extracted — `components/goals/weekly/weekly-cascade-board.tsx` is a separate pass. |
| 5 | Review tier cards (`Daily` / `Weekly` / `Monthly` / `Quarterly` / `Yearly` with count badges, PDF page 7) | Not extracted this pass. |
| 6 | Review score ring (`90%` `AVG SCORE` `Green Band`) | Ring geometry, stroke and band thresholds not extracted; partial values at `review-workbench.tsx:131-137`. |
| 7 | `Approve all` **disabled** button (green, PDF page 8) | Visible as disabled in the screenshot; exact class / opacity not traced to `member-approval-card.tsx`. |
| 8 | Avatar initials chip (PDF pages 6, 8) | Size, fill and typography not traced to source. |
| 9 | Rail user card (avatar · `Vinal Patil` · `Administrator` · chevron) | `UserMenuServer` not opened this pass. |
| 10 | Sidebar top-row controls (back / forward / search / collapse — every PDF page) | `RailControl` / `NavHistoryButtons` not extracted. |
| 11 | Hover, focus and active states generally | Marked `Confirmed? N` throughout — the PDF captures resting states only. The two *disabled* states it does prove are Export (M-D3) and `Approve all` (gap 7). |
| 12 | Error state | No error surface appears in any screenshot; none extracted. |
| 13 | Toasts (`sonner` `^2.0.7` is a dependency; `fireToast` is called across Goals) | Not visible in any screenshot; `AppToaster` styling not extracted. |
| 14 | Modals / drawers (`WeeklyGoalDrawer`, `ArchiveGoalDialog`, the goal composer) | Referenced from the board but never open in a screenshot. |
| 15 | Bulk-upload surface (`Bulk Upload`, PDF pages 1–4) | Only the trigger is visible; `goals-bulk-upload.tsx` not extracted. |
| 16 | Kanban and Dashboard views | Both toggle segments are visible but neither view is captured in the PDF. |
| 17 | JetBrains Mono (`--font-mono-display`) | Loaded globally; **zero** usages found under `components/goals/` or `app/(app)/goals/`. Not applied in this module. |
| 18 | Fraunces (`--font-editorial`) | Loaded globally; its only consumer is `components/goals/canvas/goals-canvas.tsx:402`, and `main-nav.tsx:406` records the canvas as retired UI. No serif appears in any screenshot. |
| 19 | `public/logo-mark.png` | Exists (973×1074) but is not referenced anywhere in the Goals module. Intended use unknown. |
| 20 | `public/logo.png` ≡ `public/altus-corp-logo.png` | Byte-identical (MD5 `13162fa1b54984bf7ade8866cabe5ac7`). Two paths for one asset; which is canonical is undecided. |
| 21 | Bell badge `99+` cap | In code, but the screenshot shows a two-digit count (`97`), so the cap itself is unproven. |
| 22 | `--radius-leader` (14px), `--radius-brand` (999px) | Defined in the theme; **zero** consumers app-wide (`rounded-leader` / `rounded-brand` match nothing under `components/` or `app/`). Dead tokens. |
| 23 | `--radius-cell` (8px) | One Goals consumer only — `components/goals/weekly/cascade-goal-card.tsx:199`, in the weekly goal card (itself Gap 4). Not otherwise used app-wide. |
| 24 | `--radius-kpi` (16px), `--radius-bar` (8px) | No Goals consumer. Used elsewhere in the app (`components/admin/admin-kpi-tile.tsx:96`, `components/my-day/dashboard/parts.tsx:79-81`) — document them when those modules are processed. |
