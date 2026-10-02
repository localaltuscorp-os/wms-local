---
name: wms-ui-language
description: Apply the implemented WMS visual, interaction, information, and terminology language to a different product screen. Use when WMS is the stated UI reference; do not use to redesign WMS itself.
---

# WMS UI Language

When designing or modifying a new project that should follow WMS UI language, use this skill as the visual, interaction, information-hierarchy, and terminology reference.

This is an extraction of implemented WMS module, not a proposed design system. Preserve documented distinctions. Do not simplify pattern because generic component library would use something else.

## Required reading

Read [WMS reference](references/wms-reference.md) before making UI decisions. It contains evidence-backed rules, component and page references, vocabulary, colour roles, responsive behavior, signature rules, and exclusions.

## Operating rules

1. Adapt WMS language to new domain. Do not copy task-specific workflow, permission rules, fields, or data labels into unrelated product.
2. Start with information hierarchy: persistent chrome, one page identity, compact controls, primary data surface, then secondary detail. Do not add body heading when persistent top bar already names page.
3. Use warm paper canvas, white surfaces, restrained hairlines, dark ink, compact typography, and WMS spacing tokens. Use red gradient for committed named actions; reserve semantic hues for status and data meaning.
4. Prefer one clear action path. Put repeated edits inline, rare actions in action area, and destructive actions last with explicit confirmation.
5. Keep filters in one working ribbon; show active filters only when active. Distinguish local search from global search by placement and scope.
6. Treat lists as work surfaces: preserve context with horizontal scroll/frozen identity cells on desktop; use equivalent stacked cards and simpler paging on phones.
7. Make state observable: disabled controls reduce opacity, mutations show pending copy/spinner, success/error use concise toast or in-place field message, and failed sections retain clear retry path.
8. Use terms in vocabulary exactly when implementing WMS concepts. For new domain, choose one precise domain term and do not rotate synonyms.
9. Use deployed status model as data when extending WMS. Labels and colour tokens are admin-configurable; do not hardcode new semantic mapping or add competing palette.
10. Respect motion preferences. WMS uses brief structural feedback, not decorative animation; reduced-motion removes shimmer/sweeps.

## Implementation handoff

Before completing a WMS-language UI change, verify:

- No duplicated page title or redundant explanatory masthead.
- Named action uses WMS red treatment; status colour does not become arbitrary decoration.
- Compact field, button, chip, card, and table geometry follows reference.
- Desktop and phone behavior match reference pattern for page type.
- Empty, loading, error, disabled, focus, success, and destructive states have documented behavior.
- New copy follows WMS Vocabulary and sentence style.
- No rule was invented where WMS source has no corresponding pattern.
