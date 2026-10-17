/**
 * YOLO26 LiteRT Engine Constants
 * Model Architecture: YOLO26 Quantized INT8 / Float32
 * Input: [1, 640, 640, 3] RGB
 * Output: [1, 13, 8400] (4 box coordinates cx, cy, w, h + 9 class logits)
 *
 * Designed for Offline Money Vision (Vietnamese Dong 1k - 500k)
 */

import type { MoneyClass } from '../../types/money.ts';
import { DENOMINATION_NAMES } from '../../types/money.ts';

// 1. Tensor Dimension Constants
export const YOLO_INPUT_WIDTH = 640;
export const YOLO_INPUT_HEIGHT = 640;
export const YOLO_INPUT_CHANNELS = 3;

export const YOLO_NUM_COORDINATES = 4; // cx, cy, w, h
export const YOLO_NUM_CLASSES = 9;
export const YOLO_TOTAL_CHANNELS = YOLO_NUM_COORDINATES + YOLO_NUM_CLASSES; // 13 channels
export const YOLO_NUM_ANCHORS = 8400;
export const YOLO_TENSOR_ELEMENTS = YOLO_TOTAL_CHANNELS * YOLO_NUM_ANCHORS; // 109,200 elements

// 2. Detection & Suppression Thresholds
export const YOLO_SCORE_THRESHOLD = 0.50; // Confidence score >= 0.50
export const YOLO_IOU_THRESHOLD = 0.45;   // Non-Maximum Suppression IoU >= 0.45

// 3. Execution & Performance Thresholds
export const TARGET_INFERENCE_FPS_MIN = 8;
export const TARGET_INFERENCE_FPS_MAX = 12;
export const DEFAULT_INFERENCE_FPS = 10;
export const DEFAULT_FRAME_INTERVAL_MS = 100; // 10 FPS = 100ms per frame
export const NMS_MAX_LATENCY_MS = 5;          // Under 5ms on CPU (Android 9 requirement)

// 4. Alphabetical Class Order (Roboflow / YOLO convention)
// Index 0: 1000    (1.000 VNĐ)
// Index 1: 10000   (10.000 VNĐ)
// Index 2: 100000  (100.000 VNĐ)
// Index 3: 2000    (2.000 VNĐ)
// Index 4: 20000   (20.000 VNĐ)
// Index 5: 200000  (200.000 VNĐ)
// Index 6: 5000    (5.000 VNĐ)
// Index 7: 50000   (50.000 VNĐ)
// Index 8: 500000  (500.000 VNĐ)
export const YOLO_CLASS_ORDER: readonly MoneyClass[] = [
  1000,
  10000,
  100000,
  2000,
  20000,
  200000,
  5000,
  50000,
  500000,
] as const;

export const YOLO_CLASS_INDEX_TO_DENOMINATION: Record<number, MoneyClass> = {
  0: 1000,
  1: 10000,
  2: 100000,
  3: 2000,
  4: 20000,
  5: 200000,
  6: 5000,
  7: 50000,
  8: 500000,
};

export const DENOMINATION_TO_YOLO_CLASS_INDEX: Record<MoneyClass, number> = {
  1000: 0,
  10000: 1,
  100000: 2,
  2000: 3,
  20000: 4,
  200000: 5,
  5000: 6,
  50000: 7,
  500000: 8,
};

// 5. Conventional Model File Paths
export const MODEL_ASSET_PATH = 'models/yolo26_money_quant.tflite';
export const FULL_MODEL_ASSET_PATH = 'android/app/src/main/assets/models/yolo26_money_quant.tflite';

/**
 * Map YOLO class index (0..8) to Vietnamese denomination (1000..500000)
 */
export function getYoloClassByIndex(index: number): MoneyClass {
  const denom = YOLO_CLASS_INDEX_TO_DENOMINATION[index];
  if (denom === undefined) {
    throw new Error(`Invalid YOLO class index: ${index}. Must be 0..8.`);
  }
  return denom;
}

/**
 * Map channel index (4..12) to Vietnamese denomination (1000..500000)
 */
export function getYoloClassByChannelIndex(channel: number): MoneyClass {
  const classIdx = channel - YOLO_NUM_COORDINATES;
  return getYoloClassByIndex(classIdx);
}

/**
 * Map denomination to YOLO class index (0..8)
 */
export function getYoloIndexByDenomination(denom: MoneyClass): number {
  const index = DENOMINATION_TO_YOLO_CLASS_INDEX[denom];
  if (index === undefined) {
    throw new Error(`Unsupported denomination for YOLO: ${denom}`);
  }
  return index;
}

/**
 * Get human-readable Vietnamese label for YOLO class index
 */
export function getYoloLabelByIndex(index: number): string {
  const denom = getYoloClassByIndex(index);
  return DENOMINATION_NAMES[denom] ?? `${denom} VNĐ`;
}
