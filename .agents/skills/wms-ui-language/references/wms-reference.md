# WMS implementation reference

## Scope and evidence

Source inspected: WMS dashboard; task list, table, inline cells, bulk bar, filters, search, list drawer and full detail; Kanban, initiator Kanban, agenda; New Task and bulk-import dialogs/forms; task time/report surfaces; archive; persistent top bar, rail, mobile drawer, shared UI primitives, status palette, and visual tests. Source locations include `app/globals.css`, `app/(app)/{page,dashboard,tasks}/`, `components/{layout,ui,dashboard,tasks}/`, `db/enums.ts`, and `lib/status-palette.ts`.

Do not treat comments or an old snapshot as second source of truth when applying this skill. Live WMS implementation and shared tokens/components are authoritative.

## Visual language

WMS is an editorial-operational workbench: information dense, calm, light, and action-oriented. It uses warm paper behind white work surfaces. Most importance comes from position, type weight, and compact grouping, not large type, decoration, or saturated blocks.

- Canvas: `#faf8f7`; secondary canvas `#f4f1ef`. Primary surface: white. Soft surface: `#f8f6f4`; track: `#efecea`.
- Ink: strong `#0f172a`; normal `#1f2937`; soft `#334155`; muted `#475569`; subtle `#5b6675`.
- Borders: warmed, low-opacity hairlines (`rgba(60,44,40,.07/.12)`). Standard WMS card shell uses near-invisible red-black hairline, strengthening only on hover. Do not surround every nested group with strong border.
- Shadows: low elevation. Cards commonly use `0 1px 2–3px rgba(15,23,42,.04–.07)`; interactive cards may lift to modest medium shadow. Dialogs/drawers receive only large shadows.
- Radii: KPI/section `16px`; leader `14px`; field/chip `12px`; small pill/cell/bar `8px`; fully round only for circular controls, avatars, and count pills.
- Typography: body is Roboto/system sans. Persistent chrome and major display titles use Bricolage Grotesque at weight 900 and tight negative tracking. In-content serif/italic is reserved for section-style editorial headings such as `Activity`, not ordinary labels.
- Type hierarchy: top-bar title `17–20px`; page heading `20–25px`; dialog title `26–36px`; section/card heading about `22px`; field and ordinary body `14px`; table/action text `12–14px`; labels/eyebrows `10–12px`, often uppercase with tracking. Use tabular numerals for counts, dates, and ranges.
- Icons: Lucide line icons, generally `13–18px`, stroke `2.2–2.6`; icons clarify control or state and do not replace readable labels except familiar compact toolbar controls with tooltip and accessible name.
- Spacing: fluid page gutters `clamp(16px, 4vw, 32px)`. Standard page rhythm top `32px`, bottom `64px`, tightening to `24px`/`48px` on mobile. Cards use roughly `16–24px` internal padding; dense bars use `8–12px`; related controls use `6–10px` gaps; page sections usually breathe at `24–40px`.
- Width: named page widths are narrow `1120px`, standard `1280px`, wide `1400px`, and full `1760px`. Use full/wide for dashboards and wide data tables; constrain reading/form surfaces when they benefit from it.

## Colour language

Red is WMS action identity, not general background colour.

| Role | Implemented treatment | Use | Do not use |
|---|---|---|---|
| Committed named action | `#E10600` to `#A80400` red gradient, white label, compact shadow | Create, apply, retry, post, primary commit | Passive cards, every tab, ordinary metadata |
| Soft brand selection | red wash/tint with deep-red ink, or subtle red active rail | active nav, selected/focused filter, armed bulk strip | unrelated decoration |
| Surface and hierarchy | warm canvas + white card + low-opacity hairline | page, card, table, drawer layering | grey slab backgrounds or dark mode invented for WMS |
| Status | hue family uses `-bg` surface, `-deep` text, `-edge` outline/dot | status badges, KPI status groups, chart/board encoding | second meaning such as primary action |
| Error/destructive | red family, clear text/confirmation, red icon/button emphasis | validation, delete, declined/not approved | routine navigation or neutral warning |
| Success | green/emerald family | Done, success feedback, positive action card | standalone marketing decoration |
| Warning/attention | amber/yellow/orange family | Pending, initiated/follow-up, urgency | interchangeable with error |
| Informational/neutral | blue, purple, slate/stone families as established by data | status, selected supporting information | arbitrary new taxonomy |

Actual global tokens include blue `#2563EB`, green `#10B981`, amber `#b45309`, red `#DC2626`, rose `#be123c`, purple `#7c3aed`, yellow `#D97706`, orange `#EA580C`, slate `#64748B`, neutral `#1F2937`, brown, stone, teal, and indigo families. Each family provides strong mark, deep ink, pale background, and edge tokens. On general WMS surfaces, use pale background plus deep ink for readable status chips; use strong tone for tiny dots, rails, progress fills, and chart strokes.

Kanban intentionally has its own neutral slate column surface and scoped status-token palette. Do not export this override to regular WMS pages.

## Layout and hierarchy

Persistent chrome owns page identity. Desktop has sticky 56px translucent white top bar and sticky left rail. Rail carries uppercase WMS wordmark/navigation; top bar carries exactly one title-cased page name and right-side global controls in this order: global search, WMS-only bulk add when applicable, New Task, notification bell, focus mode. Page controls may occupy slot immediately left of that cluster.

Do not repeat page title in body. When body title is required because routing cannot name page, put that one title into top bar rather than create second title band.

Main content begins with task filters or compact contextual row, then primary work surface. Use headers as one row: left contains section marker/title/subtitle; right contains search, local controls, and collapse/action controls. Keep related controls on one baseline where room allows; wrap only where reference does.

For dashboards: section header, compact KPI/status set, then drill-down tables/charts/cards. KPI cards are equal-weight adaptive tiles, not hero marketing panels. Their labels are small uppercase, values dominant, and card click drills into stated task scope.

For details: primary content is document-like and metadata-led; supporting actions/audit use right rail on desktop. Task detail skeleton mirrors this two-column structure rather than using unrelated generic placeholders.

## Component reference

| Component | WMS Pattern | Usage | Avoid |
|---|---|---|---|
| Persistent top bar | 56px translucent white sticky strip, red display title, compact right action cluster | every desktop app screen | duplicate in-body title band |
| Sidebar/nav | light vertical rail, text-like 12px rounded nav items; red-tint/deep-red active item; icon-only collapsed state | module navigation | boxed/glossy active sidebar items |
| Named button | 40px height, `px-4`, 14px medium label, 12px chip radius, red gradient with white label | commit/create/save/retry/post | different colour per action or giant CTA |
| Icon button | 28–36px compact square/rounded control, tooltip and aria label | global/row/header controls | unlabeled unfamiliar icons |
| Filter pill | 30px compact white hairline control, 12px radius, icon + concise label/value; tinted only when active | filter ribbon | permanent active-chip row when no filters apply |
| Date range picker | calendar-icon filter pill opens compact popover; selected range remains visible and two-month calendar lets reader complete range | dashboard/list date scope | a full-width date form when one compact filter answers question |
| Employee selector | controlled searchable multi-select for permitted people; selected values remain explicit filter context | Doer/assignee selection and form ownership | free-text person names or an unscoped roster picker |
| Segmented control | small labels inside white bordered shell; selected is white raised subtle state; view-changing Doer/Initiator uses solid WMS red | mutually exclusive scope/view choices | making every segment solid/colourful |
| Tabs/function toggle | compact in-card switcher with active state and count where useful; changes one related data view | dashboard table/function lens | page-level decorative tabs that repeat navigation |
| Local search | collapsible magnifier in filter/section bar; expands to compact 30px field on focus; Escape clears | current list/section only | confusing it with top-bar global search |
| Select/dropdown | 38px field, 12–13px radius, chevron, soft shadow, optional typeahead for more than eight options; selected item gets red tint, deep-red bold label/check | controlled taxonomy/employee fields | native-looking select beside custom field, or search for tiny option sets |
| Field/textarea | 38px tactile top-lit gradient field, 14px semibold text, 1.5px hairline, visible focus ring; textareas retain roomy editable measure | forms | tall generic SaaS fields or flat borderless input |
| WMS card | white/pale status surface, 16px radius, WMS hairline, low shadow, `16–24px` padding | primary widget/container | dense grids of strongly bordered nested cards |
| KPI card | compact adaptive tile; small uppercase label, large tabular count, state tint; click links to filtered work | status summary/drill-through | decorative analytics without executable scope |
| Data table | framed white surface, compact toolbar above, left headers, row dividers, inline data edits, horizontal scroll and frozen identity/action cells on desktop | broad operational lists | squeeze many columns into mobile width |
| Mobile list | same dataset rendered as stacked cards; preserves essential field parity; simpler controls/pager | phone task list | desktop table reduced to illegible columns |
| Pager | range count; page size and numbered Prev/Next on desktop; Prev/Next only on phone | long local lists | pager on short list or complex phone page chooser |
| Kanban | white board ground, neutral pale columns with status accent/dot/count, fixed roughly 288px columns, horizontal grab-scroll, compact white task cards | status/movement work | warm peach column surface, full-page coloured slabs |
| Status indicator | data-driven label with matching tint/deep ink/edge/dot; labels remain readable | task state and totals | hard-coded alternate status language/colours |
| Modal | centered broad white WMS-card, blurred dark scrim, red top accent, title/subtitle header, close at top right, single internal scroll body | New Task, bulk import | stacked modals or page background scrolling |
| Detail drawer | right-side, dim/blur scrim, one scroll region, fixed header with Esc/close and desktop fullscreen | inspect task without losing list context | persistent split pane that steals table width before selection |
| Bulk action bar | sticky, glassy white/red-accent strip; count first; task edits ordered before manager status; archive/delete last; Clear at far right | selected rows | wrapping control rows or destructive action first |
| Action/overflow menu | compact icon or labelled menu sits beside peer view actions; menu labels state exact operation | infrequent import/export/tools actions | a second route to edits already available inline |
| Audit/activity | white bordered card, editorial `Activity` heading, filter chips, vertical coloured-dot timeline, newest first | historical record | unstructured log text |
| Toast | bottom-right, rich success/error, close button, 14px text, rounded WMS card; Undo for archive/restore | completed mutation feedback | verbose success banners |
| Skeleton/error/empty | muted shape-matched skeleton; centered restrained empty/error copy; Retry is red action when recovery exists | load/failure/no results | blank screen, spinner-only panel, celebratory illustration |

## Page reference

| Page type | WMS Pattern | Required Structure | Notes |
|---|---|---|---|
| WMS Dashboard | continuous operational dashboard | persistent chrome; filter ribbon; Task Summary/KPI strip; named sections; drill-down data cards/tables | KPI reflects current scope and clicks carry exact filter state |
| Task list | full-width work register | filters; title supplied by top bar; inline KPI chips + view actions; optional weekly-goal group; toolbar; table/card list; pager; optional URL drawer | defaults to user's work; bulk bar appears only after selection |
| Kanban | horizontal status workboard | filters/context; axis toggle; horizontally scrollable status columns; compact draggable cards | keep Kanban palette local and preserve board panning/drag distinction |
| Agenda/My Day | date-window board | local range/window controls; date columns; task cards; reschedule movement | drag/drop changes due-date context, with recovery on failure |
| Task detail | document plus accountability surface | task hero/status/meta; rich description/checklist/files/comments; action rail; activity timeline | full route and list drawer show same underlying detail language |
| Create/edit form | broad modal or focused page | red-accent title header; concise purpose subtitle; compact grouped fields; one primary submit; inline field errors | focus title field; do not stack second dialog for bulk import |
| Archive/list variant | same register language with explicit archive context | top-bar title; list/table; restore/archive actions by permission | archive is recoverable; permanent delete is separately confirmed |
| Time/report table | dashboard/report frame | compact filters/search/tabs; KPI/summary where present; table/card result; empty result copy | preserve task/report vocabulary, not generic analytics chrome |

## Information architecture and content

WMS leads with accountability and current work. Primary information is task title, status, owner role, priority, due/age signal, and count. Secondary metadata is grouped compactly beneath or beside it. Doer and Initiator are distinct, named roles; do not collapse them into generic assignee when applying WMS task model.

Use labels before values for meta fields. Present status as label plus data colour. Present dates as meaningful date/range controls and counts in tabular numerals. Link KPI or table row only when it changes reader scope or opens record; make affordance visible with chevron/hover, not explanatory prose.

Required task vocabulary, drawn from implementation:

| Preferred term | Context / avoid |
|---|---|
| `New Task` | creation trigger/title; do not rotate with Add Task or New Work Item |
| `Bulk Add Tasks` | bulk grid/import flow; do not call it mass create |
| `Tasks` | main list title |
| `Kanban View` | link from task list to board |
| `Doer` / `Initiator` | distinct work/hand-out lenses; do not replace with random synonyms |
| `Doer Status` / `Manager Status` | separate lifecycle edit from ruling |
| `My Tasks` / `All Tasks` | permitted-scope selector, not organisation-wide claim |
| `Task Summary` | dashboard KPI section |
| `Activity` | audit history heading |
| `Archive` / `Restore` | reversible lifecycle action; never label archive as delete |
| `Delete` | permanent action only, with `Permanently delete …?` and cannot-be-undone warning |
| `Clear` / `Clear All` / `Clear Filter(s)` | remove active local state; use singular form where implementation does |
| `Apply Filter` / `Apply Filters` | explicit commit control where host uses one |
| `Search [scope]…` | local-search placeholder names its scope |
| `No tasks match the current filter.` | task-list empty state |
| `Nothing in this view matches your search.` | local-search empty state |
| `No results.` | dropdown search empty state |
| `Dashboard is taking longer than usual` + `Retry` | transient dashboard load failure |

Keep copy short, direct, and operational. Use sentence-case labels except compact KPI headings/eyebrows. Explain cause and recovery in error copy: tell reader what failed and whether to retry, instead of generic `Something went wrong`.

## Interaction grammar

- Hover: lightly tint/lift actionable rows/cards; reveal or strengthen row quick actions. Row gets pointer cursor only when it opens something. Table link hovers may underline and shift toward accent.
- Focus: visible accent ring/outline, never focus removal without replacement. Select Escape returns focus to trigger. Detail drawer restores focus to originating row after close.
- Selection: active navigation gets red tint; active filters render removable chips and `Clear All`; KPI selection is exclusive and preserves every non-KPI filter.
- Inline edits: task status/priority/doer cells offer direct controls. Do not retain overflow duplicate for action already inline. Saving needs explicit confirm/Enter where cell supports staged editing.
- Filters: URL-backed filters cause re-query/update; local section search filters already-loaded current section per keystroke and clears on route change/unmount. Active filters form horizontally scrollable row rather than wrapping.
- Sorting/paging: sortable headers show affordance before hover. Apply search/sort/grouping before paging. Show range text; clamp changed page after result count shrinks.
- Drag/drop: Kanban and agenda distinguish drag cards from grab-to-pan board ground. Droppable destination provides explicit empty/drop wording. Persist allowed state move optimistically only with rollback/error recovery; permission gates movable cards.
- Modals: one active dialog; dark translucent blurred scrim; focus lands on primary field; body scrolls internally. New Task opens through shared dialog and keyboard `N` when not typing.
- Drawer: selection is URL-addressable (`?task=`), so reload and Back work. Esc, close button, and scrim dismiss; body behind does not scroll. Panel has one scroll region and optional sticky fullscreen state.
- Bulk actions: appear only for real selection, stay one horizontal scrollable row, show pending spinner/count, order routine edits before rulings and destructive actions, then clear selection after success.
- Confirmation and destructive work: Archive is recoverable and offers Undo toast. Permanent delete must name target/count, say history is removed and cannot be undone, and recommend Archive/Cancel when distinction matters.
- Feedback: buttons/controls disable and reduce opacity while pending. Success messages are short past-tense (`Task archived.`, `Comment posted.`). Permission or validation failure stays at relevant field/area when possible and can also toast.
- Motion: 150–300ms subtle fade, slide, lift, chip transition, or ring pulse supports state change. Reduced-motion removes shimmer, sheen, and nonessential animation.

## Responsive behavior

Below desktop breakpoint (768px), desktop top bar and rail hide; navigation becomes light vertical mobile drawer with labelled, full-width 44px+ touch targets. Page gutter falls to 16px. Filter ribbons may stack/wrap into readable vertical controls. Task table switches to same-data mobile cards and only Prev/Next paging. Detail drawer uses full available width; fullscreen control hides on smaller screens. Adaptive card grids naturally collapse from many columns to one using minimum card widths, not device-specific card redesign.

Wide tables keep horizontal overflow in their own framed scroll area; desktop freezes identity/action cells only at `min-width: 768px`. Do not make page body horizontally scroll. Kanban remains horizontal board with visible slim scrollbar and grab panning.

## WMS UI SIGNATURE

1. Warm paper outside, white work surfaces inside.
2. Dense operations UI, with whitespace used between sections instead of inflating each control.
3. One persistent page title in chrome; no duplicated body masthead.
4. Brand-red gradient means committed action, not generic colour branding.
5. Semantic colour is data-bound, pale behind deep ink, and supported by label.
6. Hairlines and low shadows define surfaces; hover provides stronger interactive cue.
7. Compact rounded controls cluster into ribbons, toolbars, and single-line action strips.
8. Top bar owns global search/actions; page bar owns local filters/search.
9. Doer and Initiator are first-class, visually separate accountability perspectives.
10. KPIs are scoped drill-down controls, never decorative dashboard numbers.
11. Lists retain dense desktop context through local horizontal scroll and frozen identity; phones switch to equivalent cards.
12. Detail opens on demand in addressable drawer so list width remains usable.
13. Repeated work changes happen inline; rare/destructive actions move later in action order.
14. Audit trail is visible, chronological, filtered, and visually structured as timeline.
15. State change has feedback: pending, concise success/error, retry or undo where supported.
16. Motion is short and functional, with reduced-motion support.

## WMS UI DO NOT

- Do not introduce gradients except WMS's narrow brand-action/brand-accent cases. Do not use gradients as card or page decoration.
- Do not turn every status/card into saturated fill. WMS uses soft semantic tint and dark readable text.
- Do not add hero-sized typography, marketing subtitles, or duplicated page headings to data workbench.
- Do not add generic empty-state illustrations, celebratory visuals, or unhelpful generic errors.
- Do not replace compact filter ribbons with large stacked form panels on desktop.
- Do not use global search field where local scoped search or filter is required.
- Do not wrap wide table columns into ambiguous cells or make body scroll sideways; use WMS horizontal table containment and mobile cards.
- Do not use permanent split detail panes that reduce task register before selection.
- Do not duplicate inline actions in overflow menu.
- Do not place delete before normal batch edits or blur it with archive. Do not omit permanent-delete confirmation.
- Do not change WMS status vocabulary, labels, or colours without using WMS's configurable status source.
- Do not add colour, badges, pills, borders, or shadows when position and type already provide hierarchy.
- Do not hardcode dark theme or apply Kanban's scoped neutral palette outside Kanban.
