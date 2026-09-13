/**
 * Aurora's design tokens — dark product UI.
 *
 * The look is a near-black instrument panel: flat surfaces, hairline borders,
 * and exactly one saturated colour on screen at a time. Emerald means the
 * tunnel is genuinely up; indigo is the action colour; everything else is
 * greyscale. That restraint is what lets the power button and the live figures
 * carry the screen.
 *
 * Colour is never the only signal — every state also has an icon and a word.
 */

export const palette = {
  // Surfaces, darkest to lightest
  base: '#08090D',
  surface: '#121419',
  surfaceRaised: '#181B22',
  surfaceHover: '#1E222A',

  // Hairlines
  line: 'rgba(255,255,255,0.07)',
  lineStrong: 'rgba(255,255,255,0.13)',

  // Text
  textPrimary: '#F4F6FA',
  textSecondary: '#9AA3B2',
  textMuted: '#6A7383',

  // Semantics. Emerald is reserved for "actually protected".
  emerald: '#22C55E',
  emeraldSoft: 'rgba(34,197,94,0.14)',
  indigo: '#4C6FFF',
  indigoSoft: 'rgba(76,111,255,0.14)',
  amber: '#F5A524',
  amberSoft: 'rgba(245,165,36,0.14)',
  rose: '#F0526A',
  roseSoft: 'rgba(240,82,106,0.14)',
  slate: '#6A7383',

  // Aurora, used only on the splash scene
  auroraTeal: '#2FD3C4',
  auroraViolet: '#7C5CFF',
  auroraGreen: '#4ADE80',

  white: '#FFFFFF',
} as const;

export type AuroraColors = {
  isDark: boolean;
  base: string;
  surface: string;
  surfaceRaised: string;
  surfaceHover: string;
  line: string;
  lineStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  /** The tunnel is genuinely up. */
  protected: string;
  protectedSoft: string;
  /** Primary action / informational. */
  accent: string;
  accentSoft: string;
  negotiating: string;
  negotiatingSoft: string;
  off: string;
  alert: string;
  alertSoft: string;
};

export const darkColors: AuroraColors = {
  isDark: true,
  base: palette.base,
  surface: palette.surface,
  surfaceRaised: palette.surfaceRaised,
  surfaceHover: palette.surfaceHover,
  line: palette.line,
  lineStrong: palette.lineStrong,
  textPrimary: palette.textPrimary,
  textSecondary: palette.textSecondary,
  textMuted: palette.textMuted,
  protected: palette.emerald,
  protectedSoft: palette.emeraldSoft,
  accent: palette.indigo,
  accentSoft: palette.indigoSoft,
  negotiating: palette.amber,
  negotiatingSoft: palette.amberSoft,
  off: palette.slate,
  alert: palette.rose,
  alertSoft: palette.roseSoft,
};

/**
 * Light theme.
 *
 * The product is designed dark — the emerald glow and the near-black field are
 * the identity — but a phone left on "light" should not blind anyone. Same
 * structure, inverted surfaces, and the semantic colours darkened so they keep
 * their contrast ratio on white.
 */
export const lightColors: AuroraColors = {
  isDark: false,
  base: '#F5F6F9',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceHover: '#EEF0F5',
  line: 'rgba(11,18,32,0.08)',
  lineStrong: 'rgba(11,18,32,0.14)',
  textPrimary: '#0D111A',
  textSecondary: '#4A5464',
  textMuted: '#78828F',
  protected: '#0F9D58',
  protectedSoft: 'rgba(15,157,88,0.12)',
  accent: '#3355E8',
  accentSoft: 'rgba(51,85,232,0.10)',
  negotiating: '#B26A00',
  negotiatingSoft: 'rgba(178,106,0,0.12)',
  off: '#78828F',
  alert: '#CC2E48',
  alertSoft: 'rgba(204,46,72,0.10)',
};

export type Layout = 'phone' | 'tablet' | 'desktop';

export type Dimens = {
  layout: Layout;
  typeScale: number;
  gutter: number;
  gapXs: number;
  gapSm: number;
  gapMd: number;
  gapLg: number;
  gapXl: number;
  cardRadius: number;
  controlRadius: number;
  tileRadius: number;
  /** Diameter of the power button on the home screen. */
  powerSize: number;
  contentMaxWidth: number;
  twoPane: boolean;
  minTouchTarget: number;
};

/**
 * Breakpoints follow Material's window size classes so the app agrees with the
 * platform about what "a tablet" is. From 600dp the home screen puts the
 * connection panel and the location list side by side — on a tablet, changing
 * country should not mean leaving the screen that shows whether you are
 * protected.
 */
export function dimensFor(width: number): Dimens {
  if (width < 600) {
    return {
      layout: 'phone',
      typeScale: 1,
      gutter: 20,
      gapXs: 4,
      gapSm: 8,
      gapMd: 14,
      gapLg: 22,
      gapXl: 32,
      cardRadius: 18,
      controlRadius: 14,
      tileRadius: 12,
      powerSize: 188,
      contentMaxWidth: 520,
      twoPane: false,
      minTouchTarget: 48,
    };
  }
  if (width < 1240) {
    return {
      layout: 'tablet',
      typeScale: 1.06,
      gutter: 28,
      gapXs: 6,
      gapSm: 10,
      gapMd: 18,
      gapLg: 26,
      gapXl: 40,
      cardRadius: 20,
      controlRadius: 16,
      tileRadius: 14,
      powerSize: 224,
      contentMaxWidth: 900,
      twoPane: true,
      minTouchTarget: 48,
    };
  }
  return {
    layout: 'desktop',
    typeScale: 1.1,
    gutter: 36,
    gapXs: 6,
    gapSm: 12,
    gapMd: 20,
    gapLg: 30,
    gapXl: 48,
    cardRadius: 22,
    controlRadius: 16,
    tileRadius: 14,
    powerSize: 248,
    contentMaxWidth: 1180,
    twoPane: true,
    minTouchTarget: 48,
  };
}

/**
 * Type scale.
 *
 * One family for prose, one for numbers. Every figure the product is really
 * about — the countdown, the throughput, the latency — is set in the display
 * face with tabular figures, so a digit change never shifts the layout.
 *
 * To switch the real faces on: drop the TTFs into
 * android/app/src/main/assets/fonts and change the two constants below. Until
 * then both map to the platform sans face, so a fresh checkout runs without
 * font binaries and nothing reflows when they arrive.
 */
const DISPLAY_FAMILY: string | undefined = undefined; // 'SpaceGrotesk-Medium'
const BODY_FAMILY: string | undefined = undefined; // 'Inter-Regular'

type Weight = '400' | '500' | '600' | '700';

export function typography(scale: number) {
  const display = (size: number, height: number, weight: Weight = '600') => ({
    fontFamily: DISPLAY_FAMILY,
    fontSize: Math.round(size * scale),
    lineHeight: Math.round(height * scale),
    fontWeight: weight,
  });
  const body = (size: number, height: number, weight: Weight = '400') => ({
    fontFamily: BODY_FAMILY,
    fontSize: Math.round(size * scale),
    lineHeight: Math.round(height * scale),
    fontWeight: weight,
  });
  const tabular = ['tabular-nums' as const];

  return {
    /** The session timer and other hero numerals. */
    hero: {...display(40, 46, '600'), letterSpacing: -0.8, fontVariant: tabular},
    display: {...display(28, 34), letterSpacing: -0.4},
    title: display(22, 28),
    heading: body(17, 23, '600'),
    body: body(15, 21),
    bodyStrong: body(15, 21, '600'),
    label: body(13, 18, '500'),
    meta: body(12, 16),
    /** Stat chips and table values. */
    metric: {...display(17, 22, '600'), fontVariant: tabular},
    metricLarge: {...display(24, 30, '600'), fontVariant: tabular},
    mono: {
      fontFamily: 'monospace',
      fontSize: Math.round(13 * scale),
      lineHeight: Math.round(18 * scale),
      fontWeight: '400' as Weight,
    },
  };
}

export type Typography = ReturnType<typeof typography>;
