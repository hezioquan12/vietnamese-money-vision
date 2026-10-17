/**
 * Audio Registry for MoneyVision
 * Maps currency denominations, note quantities, and earcons to audio clips.
 * Provides sequence builder functions adhering to Ticket 03 specifications.
 */

import type { DetectedMoneyItem, MoneyClass, SessionWalletState } from '../../types/money';
import type {
  AudioClipMeta,
  DenominationClipId,
  EarconClipId,
  QuantityClipId,
  SoundClipId,
} from './types';

export const DENOMINATION_TO_CLIP: Record<MoneyClass, DenominationClipId> = {
  1000: 'vnd_1k',
  2000: 'vnd_2k',
  5000: 'vnd_5k',
  10000: 'vnd_10k',
  20000: 'vnd_20k',
  50000: 'vnd_50k',
  100000: 'vnd_100k',
  200000: 'vnd_200k',
  500000: 'vnd_500k',
};

export const CLIP_TO_DENOMINATION: Record<DenominationClipId, MoneyClass> = {
  vnd_1k: 1000,
  vnd_2k: 2000,
  vnd_5k: 5000,
  vnd_10k: 10000,
  vnd_20k: 20000,
  vnd_50k: 50000,
  vnd_100k: 100000,
  vnd_200k: 200000,
  vnd_500k: 500000,
};

export const QUANTITY_TO_CLIP: Record<number, QuantityClipId> = {
  1: 'qty_1',
  2: 'qty_2',
  3: 'qty_3',
  4: 'qty_4',
  5: 'qty_5',
  6: 'qty_6',
  7: 'qty_7',
  8: 'qty_8',
  9: 'qty_9',
  10: 'qty_10',
};

export const AUDIO_CLIPS_META: Record<SoundClipId, AudioClipMeta> = {
  // Denominations
  vnd_1k: {
    id: 'vnd_1k',
    filename: 'vnd_1k.mp3',
    category: 'denomination',
    labelVi: 'Một nghìn',
    durationMsEstimate: 300,
  },
  vnd_2k: {
    id: 'vnd_2k',
    filename: 'vnd_2k.mp3',
    category: 'denomination',
    labelVi: 'Hai nghìn',
    durationMsEstimate: 300,
  },
  vnd_5k: {
    id: 'vnd_5k',
    filename: 'vnd_5k.mp3',
    category: 'denomination',
    labelVi: 'Năm nghìn',
    durationMsEstimate: 300,
  },
  vnd_10k: {
    id: 'vnd_10k',
    filename: 'vnd_10k.mp3',
    category: 'denomination',
    labelVi: 'Mười nghìn',
    durationMsEstimate: 300,
  },
  vnd_20k: {
    id: 'vnd_20k',
    filename: 'vnd_20k.mp3',
    category: 'denomination',
    labelVi: 'Hai mươi nghìn',
    durationMsEstimate: 300,
  },
  vnd_50k: {
    id: 'vnd_50k',
    filename: 'vnd_50k.mp3',
    category: 'denomination',
    labelVi: 'Năm mươi nghìn',
    durationMsEstimate: 300,
  },
  vnd_100k: {
    id: 'vnd_100k',
    filename: 'vnd_100k.mp3',
    category: 'denomination',
    labelVi: 'Một trăm nghìn',
    durationMsEstimate: 300,
  },
  vnd_200k: {
    id: 'vnd_200k',
    filename: 'vnd_200k.mp3',
    category: 'denomination',
    labelVi: 'Hai trăm nghìn',
    durationMsEstimate: 300,
  },
  vnd_500k: {
    id: 'vnd_500k',
    filename: 'vnd_500k.mp3',
    category: 'denomination',
    labelVi: 'Năm trăm nghìn',
    durationMsEstimate: 300,
  },

  // Quantities
  qty_1: {
    id: 'qty_1',
    filename: 'qty_1.mp3',
    category: 'quantity',
    labelVi: 'Một tờ',
    durationMsEstimate: 250,
  },
  qty_2: {
    id: 'qty_2',
    filename: 'qty_2.mp3',
    category: 'quantity',
    labelVi: 'Hai tờ',
    durationMsEstimate: 250,
  },
  qty_3: {
    id: 'qty_3',
    filename: 'qty_3.mp3',
    category: 'quantity',
    labelVi: 'Ba tờ',
    durationMsEstimate: 250,
  },
  qty_4: {
    id: 'qty_4',
    filename: 'qty_4.mp3',
    category: 'quantity',
    labelVi: 'Bốn tờ',
    durationMsEstimate: 250,
  },
  qty_5: {
    id: 'qty_5',
    filename: 'qty_5.mp3',
    category: 'quantity',
    labelVi: 'Năm tờ',
    durationMsEstimate: 250,
  },
  qty_6: {
    id: 'qty_6',
    filename: 'qty_6.mp3',
    category: 'quantity',
    labelVi: 'Sáu tờ',
    durationMsEstimate: 250,
  },
  qty_7: {
    id: 'qty_7',
    filename: 'qty_7.mp3',
    category: 'quantity',
    labelVi: 'Bảy tờ',
    durationMsEstimate: 250,
  },
  qty_8: {
    id: 'qty_8',
    filename: 'qty_8.mp3',
    category: 'quantity',
    labelVi: 'Tám tờ',
    durationMsEstimate: 250,
  },
  qty_9: {
    id: 'qty_9',
    filename: 'qty_9.mp3',
    category: 'quantity',
    labelVi: 'Chín tờ',
    durationMsEstimate: 250,
  },
  qty_10: {
    id: 'qty_10',
    filename: 'qty_10.mp3',
    category: 'quantity',
    labelVi: 'Mười tờ',
    durationMsEstimate: 250,
  },

  // Earcons
  tick: {
    id: 'tick',
    filename: 'tick.wav',
    category: 'earcon',
    labelVi: '[Bắt được tiền]',
    durationMsEstimate: 50,
  },
  empty: {
    id: 'empty',
    filename: 'empty.wav',
    category: 'earcon',
    labelVi: '[Rút tiền ra]',
    durationMsEstimate: 80,
  },
  torch_on: {
    id: 'torch_on',
    filename: 'torch_on.wav',
    category: 'earcon',
    labelVi: '[Đèn bật]',
    durationMsEstimate: 100,
  },
  torch_off: {
    id: 'torch_off',
    filename: 'torch_off.wav',
    category: 'earcon',
    labelVi: '[Đèn tắt]',
    durationMsEstimate: 100,
  },
  wallet_reset: {
    id: 'wallet_reset',
    filename: 'wallet_reset.wav',
    category: 'earcon',
    labelVi: '[Reset ví]',
    durationMsEstimate: 120,
  },
};

/**
 * Returns DenominationClipId for a given MoneyClass
 */
export function getDenominationClip(classId: MoneyClass): DenominationClipId {
  const clip = DENOMINATION_TO_CLIP[classId];
  if (!clip) {
    throw new Error(`Unsupported denomination classId: ${classId}`);
  }
  return clip;
}

/**
 * Returns QuantityClipId for a given note count (1 to 10)
 */
export function getQuantityClip(count: number): QuantityClipId | null {
  if (count in QUANTITY_TO_CLIP) {
    return QUANTITY_TO_CLIP[count];
  }
  // For counts > 10, clamp or return null
  if (count > 10) {
    return 'qty_10';
  }
  return null;
}

/**
 * Builds sequential audio clips for detected money according to Ticket 03 spec:
 * 1. Single banknote (1 tờ): chỉ đọc mệnh giá (ví dụ: "Năm trăm nghìn")
 * 2. Multiple banknotes (nhiều tờ): [Số lượng] + [Mệnh giá]
 *    (ví dụ: "Hai tờ một trăm nghìn, một tờ năm mươi nghìn")
 */
export function buildDetectionAudioSequence(
  items: DetectedMoneyItem[]
): SoundClipId[] {
  if (!items || items.length === 0) {
    return [];
  }

  // Filter out any invalid items or items with count <= 0
  const validItems = items.filter(i => i && i.count > 0);
  if (validItems.length === 0) {
    return [];
  }

  // Aggregate by denomination
  const countMap = new Map<MoneyClass, number>();
  for (const item of validItems) {
    countMap.set(item.classId, (countMap.get(item.classId) || 0) + item.count);
  }

  // Sort descending by denomination (highest value first)
  const sortedClasses = Array.from(countMap.keys()).sort((a, b) => b - a);

  // 1. Exactly 1 note total: read only the denomination clip
  if (sortedClasses.length === 1 && countMap.get(sortedClasses[0]) === 1) {
    return [getDenominationClip(sortedClasses[0])];
  }

  // 2. Exactly 1 denomination, but count > 1: [Quantity] + [Denomination]
  if (sortedClasses.length === 1) {
    const classId = sortedClasses[0];
    const count = countMap.get(classId)!;
    const qtyClip = getQuantityClip(count);
    const denomClip = getDenominationClip(classId);
    return qtyClip ? [qtyClip, denomClip] : [denomClip];
  }

  // 3. Multiple denominations: [Quantity] + [Denomination] for each, sorted descending
  const clips: SoundClipId[] = [];
  for (const classId of sortedClasses) {
    const count = countMap.get(classId)!;
    const qtyClip = getQuantityClip(count);
    if (qtyClip) {
      clips.push(qtyClip);
    }
    clips.push(getDenominationClip(classId));
  }
  return clips;
}

/**
 * Builds audio sequence for session wallet.
 * Groups wallet items by denomination and generates natural spoken sequence.
 */
export function buildWalletAudioSequence(
  wallet: SessionWalletState
): SoundClipId[] {
  if (!wallet || wallet.totalAmount === 0 || wallet.totalNotesCount === 0) {
    return [];
  }

  // Aggregate notes by denomination
  const countMap = new Map<MoneyClass, number>();
  for (const item of wallet.history) {
    const curr = countMap.get(item.classId) || 0;
    countMap.set(item.classId, curr + item.count);
  }

  // Sort descending by denomination (e.g. 500k, 200k, 100k...)
  const sortedClasses = Array.from(countMap.keys()).sort((a, b) => b - a);

  const aggregatedItems: DetectedMoneyItem[] = sortedClasses.map(classId => ({
    classId,
    count: countMap.get(classId)!,
    label: AUDIO_CLIPS_META[DENOMINATION_TO_CLIP[classId]].labelVi,
    totalAmount: classId * countMap.get(classId)!,
  }));

  return buildDetectionAudioSequence(aggregatedItems);
}

/**
 * Converts a list of clips to readable Vietnamese text for display/logging
 */
export function formatClipsToVietnamese(clips: SoundClipId[]): string {
  if (!clips || clips.length === 0) return '';
  return clips
    .map(c => AUDIO_CLIPS_META[c]?.labelVi || c)
    .join(' ');
}
