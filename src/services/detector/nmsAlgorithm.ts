/**
 * Non-Maximum Suppression (NMS) Algorithm for YOLO26
 * Filters overlapping candidate boxes based on IoU threshold >= 0.45.
 * Optimized for real-time mobile execution (< 5ms on CPU).
 */

import type { DetectedMoneyItem, MoneyClass } from '../../types/money.ts';
import { DENOMINATION_NAMES } from '../../types/money.ts';
import type { CandidateBox } from './yoloDecoder.ts';
import { YOLO_IOU_THRESHOLD } from './yoloConstants.ts';

export interface NMSOptions {
  /** IoU threshold above which overlapping boxes are suppressed. Defaults to 0.45 */
  iouThreshold?: number;
  /** Maximum number of boxes to retain after NMS. Defaults to 100 */
  maxDetections?: number;
  /** If true, suppress overlapping boxes regardless of class. Defaults to false (class-aware NMS) */
  classAgnostic?: boolean;
}

export interface DetectionSummary {
  items: DetectedMoneyItem[];
  boxes: CandidateBox[];
  totalAmount: number;
  totalNotesCount: number;
  hasMoney: boolean;
}

/**
 * Calculate Intersection over Union (IoU) of two bounding boxes.
 * Box coordinates format: top-left (x, y) with width and height.
 */
export function calculateIoUFast(
  boxA: CandidateBox,
  boxB: CandidateBox,
  areaA: number,
  areaB: number
): number {
  if (
    areaA <= 0 ||
    areaB <= 0 ||
    !Number.isFinite(boxA.x) ||
    !Number.isFinite(boxA.y) ||
    !Number.isFinite(boxB.x) ||
    !Number.isFinite(boxB.y)
  ) {
    return 0;
  }

  const ax1 = boxA.x;
  const ay1 = boxA.y;
  const ax2 = boxA.x + boxA.width;
  const ay2 = boxA.y + boxA.height;

  const bx1 = boxB.x;
  const by1 = boxB.y;
  const bx2 = boxB.x + boxB.width;
  const by2 = boxB.y + boxB.height;

  const interX1 = Math.max(ax1, bx1);
  const interY1 = Math.max(ay1, by1);
  const interX2 = Math.min(ax2, bx2);
  const interY2 = Math.min(ay2, by2);

  const interW = Math.max(0, interX2 - interX1);
  const interH = Math.max(0, interY2 - interY1);
  const interArea = interW * interH;

  if (interArea <= 0) {
    return 0;
  }

  const unionArea = areaA + areaB - interArea;
  if (unionArea <= 0) {
    return 0;
  }

  return interArea / unionArea;
}

export function calculateIoU(boxA: CandidateBox, boxB: CandidateBox): number {
  if (
    !boxA ||
    !boxB ||
    boxA.width <= 0 ||
    boxA.height <= 0 ||
    boxB.width <= 0 ||
    boxB.height <= 0
  ) {
    return 0;
  }
  return calculateIoUFast(
    boxA,
    boxB,
    boxA.width * boxA.height,
    boxB.width * boxB.height
  );
}

/**
 * Fast greedy Non-Maximum Suppression (NMS).
 * Guarantees that the highest confidence box in each overlapping cluster is preserved.
 * Runs in under 5ms on modern & low-end mobile CPUs.
 */
export function nonMaximumSuppression(
  boxes: CandidateBox[],
  options: NMSOptions = {}
): CandidateBox[] {
  if (!boxes || boxes.length === 0) {
    return [];
  }
  if (boxes.length === 1) {
    return [boxes[0]];
  }

  const iouThreshold = options.iouThreshold ?? YOLO_IOU_THRESHOLD;
  const maxDetections = options.maxDetections ?? 100;
  const classAgnostic = options.classAgnostic ?? false;

  // 1. Sort candidate boxes in descending order of confidence score
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const n = sorted.length;
  const kept: CandidateBox[] = [];
  const suppressed = new Uint8Array(n);
  const areas = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    areas[i] = sorted[i].width * sorted[i].height;
  }

  // 2. Greedy suppression
  for (let i = 0; i < n; i++) {
    if (suppressed[i] === 1) {
      continue;
    }

    const currentBox = sorted[i];
    const areaA = areas[i];
    kept.push(currentBox);

    if (kept.length >= maxDetections) {
      break;
    }

    for (let j = i + 1; j < n; j++) {
      if (suppressed[j] === 1) {
        continue;
      }

      const nextBox = sorted[j];

      // In class-aware mode, only suppress boxes belonging to the same class
      if (!classAgnostic && currentBox.classIndex !== nextBox.classIndex) {
        continue;
      }

      const iou = calculateIoUFast(currentBox, nextBox, areaA, areas[j]);
      if (iou >= iouThreshold) {
        suppressed[j] = 1;
      }
    }
  }

  return kept;
}

/**
 * Aggregates candidate bounding boxes into DetectedMoneyItem summaries.
 * Groups by denomination and sorts descending (500k -> 200k -> ... -> 1k).
 */
export function aggregateDetections(boxes: CandidateBox[]): DetectionSummary {
  if (!boxes || boxes.length === 0) {
    return {
      items: [],
      boxes: [],
      totalAmount: 0,
      totalNotesCount: 0,
      hasMoney: false,
    };
  }

  // Count instances of each denomination
  const countsByClass: Partial<Record<MoneyClass, number>> = {};
  for (const box of boxes) {
    countsByClass[box.classId] = (countsByClass[box.classId] ?? 0) + 1;
  }

  // Build items array sorted descending by denomination amount
  const supportedClasses: MoneyClass[] = [
    500000, 200000, 100000, 50000, 20000, 10000, 5000, 2000, 1000,
  ];

  const items: DetectedMoneyItem[] = [];
  let totalAmount = 0;
  let totalNotesCount = 0;

  for (const denom of supportedClasses) {
    const count = countsByClass[denom];
    if (count && count > 0) {
      const denomTotal = denom * count;
      totalAmount += denomTotal;
      totalNotesCount += count;
      items.push({
        classId: denom,
        count,
        label: DENOMINATION_NAMES[denom],
        totalAmount: denomTotal,
      });
    }
  }

  return {
    items,
    boxes,
    totalAmount,
    totalNotesCount,
    hasMoney: totalNotesCount > 0,
  };
}
