import type { DetectedMoneyItem } from '../types/money';

/**
 * Formats a number into standard Vietnamese Dong string representation
 * e.g., 500000 -> "500.000 đ"
 */
export function formatVND(amount: number): string {
  if (amount === 0) return '0 đ';
  const formatted = Math.abs(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return amount < 0 ? `-${formatted} đ` : `${formatted} đ`;
}

/**
 * Converts a Vietnamese Dong amount into natural spoken Vietnamese text
 */
export function formatSpokenVND(amount: number): string {
  if (amount === 0) return 'Không đồng';

  // Handle standard denominations directly for natural speech
  switch (amount) {
    case 1000:
      return 'Một nghìn đồng';
    case 2000:
      return 'Hai nghìn đồng';
    case 5000:
      return 'Năm nghìn đồng';
    case 10000:
      return 'Mười nghìn đồng';
    case 20000:
      return 'Hai mươi nghìn đồng';
    case 50000:
      return 'Năm mươi nghìn đồng';
    case 100000:
      return 'Một trăm nghìn đồng';
    case 200000:
      return 'Hai trăm nghìn đồng';
    case 500000:
      return 'Năm trăm nghìn đồng';
    default:
      break;
  }

  // Generalized spoken number for session totals
  if (amount >= 1000000) {
    const millions = Math.floor(amount / 1000000);
    const remainder = amount % 1000000;
    if (remainder === 0) {
      return `${millions} triệu đồng`;
    }
    const thousands = Math.floor(remainder / 1000);
    return `${millions} triệu ${thousands} nghìn đồng`;
  }

  if (amount >= 1000) {
    const thousands = Math.floor(amount / 1000);
    return `${thousands} nghìn đồng`;
  }

  return `${amount} đồng`;
}

/**
 * Creates formatted visual text and spoken announcements for detection states
 */
export function formatDetectionSummary(items: DetectedMoneyItem[]): {
  headline: string;
  detail: string;
  spokenText: string;
} {
  if (items.length === 0) {
    return {
      headline: 'CHƯA CÓ TIỀN',
      detail: 'ĐẶT TIỀN VÀO TẦM QUÉT',
      spokenText: 'Không có tiền trong tầm quét',
    };
  }

  const totalCount = items.reduce((sum, item) => sum + item.count, 0);
  const totalAmount = items.reduce((sum, item) => sum + item.totalAmount, 0);

  if (items.length === 1 && items[0].count === 1) {
    const item = items[0];
    return {
      headline: '1 TỜ',
      detail: formatVND(item.classId),
      spokenText: `${item.label} đồng`,
    };
  }

  const headline = `${totalCount} TỜ`;
  const detail = formatVND(totalAmount);

function formatNoteCount(count: number): string {
  const words: Record<number, string> = {
    1: 'Một',
    2: 'Hai',
    3: 'Ba',
    4: 'Bốn',
    5: 'Năm',
    6: 'Sáu',
    7: 'Bảy',
    8: 'Tám',
    9: 'Chín',
    10: 'Mười',
  };
  return words[count] ?? `${count}`;
}

  // Build spoken string: e.g., "Hai tờ một trăm nghìn, một tờ năm mươi nghìn"
  const spokenParts = items.map((item, idx) => {
    const countWord =
      idx === 0
        ? formatNoteCount(item.count)
        : formatNoteCount(item.count).toLowerCase();
    return `${countWord} tờ ${item.label.toLowerCase()}`;
  });
  const spokenText = `${spokenParts.join(', ')}. Tổng cộng ${formatSpokenVND(totalAmount)}`;

  return { headline, detail, spokenText };
}

/**
 * Calculates WCAG 2.1 relative luminance and contrast ratio between two hex colors
 * Verifies WCAG AAA compliance (>= 7.0:1)
 */
export function calculateContrastRatio(hex1: string, hex2: string): number {
  const parseRgb = (hex: string): [number, number, number] => {
    const cleanHex = hex.replace('#', '');
    const num = parseInt(cleanHex, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  };

  const getLuminance = ([r, g, b]: [number, number, number]): number => {
    const a = [r, g, b].map(v => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
  };

  const lum1 = getLuminance(parseRgb(hex1));
  const lum2 = getLuminance(parseRgb(hex2));

  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);

  return (brightest + 0.05) / (darkest + 0.05);
}
