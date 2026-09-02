/**
 * Altus Corp — mobile design system (native).
 * Brand tokens ported from the web app (Altus red on warm-dark / light paper),
 * tuned for mobile per the mobile-app-design framework: 44pt touch targets,
 * 16pt+ body, 4.5:1 contrast, 8pt spacing grid.
 */

import '@/global.css';

import { Platform } from 'react-native';

/** Core brand ramp — the Altus red + supporting neutrals/status colors. */
export const Brand = {
  red: '#E10600',
  redLight: '#F4554D',
  redDeep: '#A80400',
  ink: '#17120F',
  inkSoft: '#3B322D',
  paper: '#F6F3EF',
  green: '#16A34A',
  amber: '#F59E0B',
  blue: '#3B82F6',
} as const;

export const Colors = {
  light: {
    text: Brand.ink,
    textSecondary: '#6B5E57',
    background: Brand.paper,
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#FCE9E8',
    tint: Brand.red,
    border: '#E7DED7',
  },
  dark: {
    text: '#FFFFFF',
    textSecondary: 'rgba(255,255,255,0.62)',
    background: '#0E0B0A',
    backgroundElement: '#1A1311',
    backgroundSelected: '#241917',
    tint: Brand.redLight,
    border: 'rgba(255,255,255,0.10)',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
/** Structural palette shape (string values) — use for props that accept either mode. */
export type Palette = { readonly [K in keyof typeof Colors.light]: string };

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', serif: 'ui-serif', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', serif: 'serif', rounded: 'normal', mono: 'monospace' },
  web: { sans: 'var(--font-display)', serif: 'var(--font-serif)', rounded: 'var(--font-rounded)', mono: 'var(--font-mono)' },
});

/** 4 / 8 pt grid — keep all spacing on this scale. */
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 24,
  six: 32,
  eight: 48,
} as const;

/** Type scale (pt). Body never below 16 per the framework. */
export const Type = {
  caption: 12,
  label: 13,
  body: 16,
  bodyLg: 18,
  title: 22,
  h2: 28,
  h1: 34,
  display: 44,
} as const;

export const Radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const;

/**
 * Status colour-token → hex. Mirrors the web's STATUS_COLOR_TOKENS palette so
 * task pills match the dashboard. The API may also send a raw `#hex`; resolve
 * with `statusHex()` which passes hex through and falls back to neutral.
 */
export const StatusTokenColors: Record<string, string> = {
  blue: '#3B82F6',
  green: '#16A34A',
  amber: '#F59E0B',
  red: '#E10600',
  rose: '#F43F5E',
  purple: '#8B5CF6',
  yellow: '#EAB308',
  orange: '#F97316',
  slate: '#64748B',
  brown: '#92551F',
  stone: '#A8A29E',
};

export function statusHex(token: string | undefined): string {
  if (!token) return StatusTokenColors.slate;
  if (token.startsWith('#')) return token;
  return StatusTokenColors[token] ?? StatusTokenColors.slate;
}

/** Priority token → { label, color }. Matches the web PRIORITY_LABELS scheme. */
export const PriorityMeta: Record<string, { label: string; color: string }> = {
  imp_urgent: { label: 'Critical', color: '#E10600' },
  imp_not_urgent: { label: 'Important', color: '#F59E0B' },
  not_imp_urgent: { label: 'Urgent', color: '#3B82F6' },
  not_imp_not_urgent: { label: 'Normal', color: '#64748B' },
};

/** Minimum interactive size — 44pt (iOS HIG) / 48dp (Material). */
export const TouchTarget = Platform.select({ android: 48, default: 44 }) ?? 44;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
