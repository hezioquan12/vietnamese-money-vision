/**
 * Accessibility Ergonomic Theme (WCAG AAA Compliant)
 * OLED Black (#000000) & Solar Yellow (#FFE600)
 * Maximum contrast ratio (> 18:1) for low vision and visually impaired users
 */

import { AUTHOR_INFO } from './author.ts';
export { AUTHOR_INFO } from './author.ts';
import type { MoneyClass } from '../types/money.ts';

export const EDGE_PALM_REJECTION_DP = 16;
export const MIN_TOUCH_TARGET_DP = 44;

export interface DenominationVisualSpec {
  classId: MoneyClass;
  material: 'POLYMER' | 'COTTON';
  materialVi: string;
  colorHex: string;
  badgeColor: string;
  textColor: string;
  colorNameVi: string;
  badgeLabel: string;
}

export const DENOMINATION_VISUAL_SPECS: Record<MoneyClass, DenominationVisualSpec> = {
  500000: {
    classId: 500000,
    material: 'POLYMER',
    materialVi: 'POLYMER',
    colorHex: '#00E5FF',
    badgeColor: '#00E5FF',
    textColor: '#000000',
    colorNameVi: 'Xanh lục lam',
    badgeLabel: 'POLYMER • XANH LỤC LAM • 500.000 Đ',
  },
  200000: {
    classId: 200000,
    material: 'POLYMER',
    materialVi: 'POLYMER',
    colorHex: '#FF6D00',
    badgeColor: '#FF6D00',
    textColor: '#000000',
    colorNameVi: 'Cam đỏ',
    badgeLabel: 'POLYMER • CAM ĐỎ • 200.000 Đ',
  },
  100000: {
    classId: 100000,
    material: 'POLYMER',
    materialVi: 'POLYMER',
    colorHex: '#00E676',
    badgeColor: '#00E676',
    textColor: '#000000',
    colorNameVi: 'Xanh lá',
    badgeLabel: 'POLYMER • XANH LÁ • 100.000 Đ',
  },
  50000: {
    classId: 50000,
    material: 'POLYMER',
    materialVi: 'POLYMER',
    colorHex: '#FF4081',
    badgeColor: '#FF4081',
    textColor: '#000000',
    colorNameVi: 'Hồng tím',
    badgeLabel: 'POLYMER • HỒNG TÍM • 50.000 Đ',
  },
  20000: {
    classId: 20000,
    material: 'POLYMER',
    materialVi: 'POLYMER',
    colorHex: '#40C4FF',
    badgeColor: '#40C4FF',
    textColor: '#000000',
    colorNameVi: 'Xanh dương',
    badgeLabel: 'POLYMER • XANH DƯƠNG • 20.000 Đ',
  },
  10000: {
    classId: 10000,
    material: 'POLYMER',
    materialVi: 'POLYMER',
    colorHex: '#FFD740',
    badgeColor: '#FFD740',
    textColor: '#000000',
    colorNameVi: 'Vàng',
    badgeLabel: 'POLYMER • VÀNG • 10.000 Đ',
  },
  5000: {
    classId: 5000,
    material: 'COTTON',
    materialVi: 'COTTON',
    colorHex: '#80D8FF',
    badgeColor: '#80D8FF',
    textColor: '#000000',
    colorNameVi: 'Xanh cổ vịt',
    badgeLabel: 'COTTON • XANH CỔ VỊT • 5.000 Đ',
  },
  2000: {
    classId: 2000,
    material: 'COTTON',
    materialVi: 'COTTON',
    colorHex: '#E0E0E0',
    badgeColor: '#E0E0E0',
    textColor: '#000000',
    colorNameVi: 'Xám sáng',
    badgeLabel: 'COTTON • XÁM SÁNG • 2.000 Đ',
  },
  1000: {
    classId: 1000,
    material: 'COTTON',
    materialVi: 'COTTON',
    colorHex: '#FFF59D',
    badgeColor: '#FFF59D',
    textColor: '#000000',
    colorNameVi: 'Vàng nhạt',
    badgeLabel: 'COTTON • VÀNG NHẠT • 1.000 Đ',
  },
} as const;

export function getDenominationVisualSpec(
  denomination?: number | null
): DenominationVisualSpec | null {
  if (!denomination) return null;
  return (
    DENOMINATION_VISUAL_SPECS[denomination as MoneyClass] ?? null
  );
}

export function formatPowerStateBadge(
  powerState?: 'BURST' | 'ECO' | 'HIBERNATION' | string
): string {
  switch (powerState) {
    case 'ECO':
      return '🌿 ECO';
    case 'HIBERNATION':
      return '💤 CHỜ';
    case 'BURST':
    default:
      return '🔍 ĐANG QUÉT';
  }
}

export function getPowerStateBadgeSpec(
  powerState?: 'BURST' | 'ECO' | 'HIBERNATION' | string
): { label: string; color: string } {
  const label = formatPowerStateBadge(powerState);
  if (powerState === 'HIBERNATION') {
    return { label, color: '#9E9E9E' };
  }
  if (powerState === 'ECO') {
    return { label, color: '#FFE600' };
  }
  return { label, color: '#00FF66' };
}

export function getActiveBorderGlowColor(
  topDenomination?: number | null,
  hasCandidateHint?: boolean,
  hasMoney?: boolean
): string {
  if (hasMoney && topDenomination) {
    const spec = getDenominationVisualSpec(topDenomination);
    if (spec) return spec.colorHex;
  }
  if (hasCandidateHint) {
    return THEME.colors.primaryYellow;
  }
  return THEME.colors.borderGlow;
}

export const THEME = {
  author: AUTHOR_INFO,

  colors: {
    // True OLED Black - Zero light emission for OLED displays
    background: '#000000',

    // Solar / Safety Yellow - Peak retinal sensitivity wavelength (~555nm)
    primaryYellow: '#FFE600',

    // High contrast secondary text
    secondaryWhite: '#FFFFFF',

    // Active status / Flashlight indicator
    accentGreen: '#00FF66',

    // Reset indicator / Alerts (WCAG AAA compliant on black background > 7:1)
    accentRed: '#FF7777',

    // Edge pulse border glow
    borderGlow: '#FFE600',

    // Neutral dark surfaces for simulation drawers, docks and cards
    surfaceDark: '#121212',
    surfaceElevated: '#1A1A1A',
    surfaceElevatedHigh: '#242424',
    borderMuted: '#333333',
    scrimBackdrop: 'rgba(0, 0, 0, 0.92)',
  },

  denominationColors: {
    500000: '#00E5FF',
    200000: '#FF6D00',
    100000: '#00E676',
    50000: '#FF4081',
    20000: '#40C4FF',
    10000: '#FFD740',
    5000: '#80D8FF',
    2000: '#E0E0E0',
    1000: '#FFF59D',
  },

  typography: {
    fontFamilySans: 'sans-serif',
    fontFamilyMono: 'monospace',
    fontFamilyTabular: 'monospace',

    // Extra-large sizes as specified in Ticket 02 (>= 48sp) & Ticket 10 (64sp Hero)
    fontSizeHero: 64,
    fontSizePrimary: 52,
    fontSizeSecondary: 26,
    fontSizeStatus: 20,
    fontSizeBody: 18,
    fontSizeLabel: 15,

    fontWeightHeavy: '900' as const,
    fontWeightBold: '700' as const,
    fontWeightSemiBold: '600' as const,
    fontWeightMedium: '500' as const,
    fontWeightNormal: '400' as const,
  },

  layout: {
    edgeBorderWidth: 8, // 8dp border for breathing glow
    edgePalmRejectionDp: EDGE_PALM_REJECTION_DP, // 16dp edge palm-rejection margin
    minTouchTargetDp: MIN_TOUCH_TARGET_DP, // 44dp minimum accessible touch target
    accessibleTouchTarget48Dp: 48, // 48dp Material Design 3 accessible touch target
    screenPadding: 16,
    buttonBorderRadius: 8,
    cardBorderRadius: 12,
    pillBorderRadius: 9999,
  },

  animation: {
    pulseMinOpacity: 0.25,
    pulseMaxOpacity: 1.0,
    pulseDurationMs: 900,
  },
} as const;

