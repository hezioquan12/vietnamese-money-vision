/**
 * YOLO26 Tensor Decoder
 * Decodes raw LiteRT / TFLite output tensor [1, 13, 8400]
 * (13 = 4 coordinates cx, cy, w, h + 9 class logits)
 * into a list of candidate bounding boxes with confidence scores >= 0.50.
 * Supports both pixel coordinates [0..640] and Ultralytics _NormalizeCoords [0..1].
 */

import type { MoneyClass } from '../../types/money.ts';
import {
  YOLO_NUM_COORDINATES,
  YOLO_NUM_CLASSES,
  YOLO_TOTAL_CHANNELS,
  YOLO_NUM_ANCHORS,
  YOLO_SCORE_THRESHOLD,
  YOLO_INPUT_WIDTH,
  YOLO_INPUT_HEIGHT,
  getYoloClassByIndex,
  getYoloLabelByIndex,
} from './yoloConstants.ts';

export interface CandidateBox {
  id?: string;
  x: number;       // Top-left x (in pixels 0..640)
  y: number;       // Top-left y (in pixels 0..640)
  width: number;   // Box width
  height: number;  // Box height
  cx: number;      // Center x
  cy: number;      // Center y
  score: number;   // Confidence score (0.00 .. 1.00)
  classIndex: number; // 0..8
  classId: MoneyClass; // 1000..500000
  label: string;   // Vietnamese denomination name
}

export interface DecodeOptions {
  /** Minimum confidence score threshold. Defaults to 0.50 */
  scoreThreshold?: number;
  /** Minimum candidate hint score threshold (0.28 <= score < 0.50). Defaults to 0.28 */
  hintThreshold?: number;
  /** Whether to apply sigmoid activation to raw class logits. Defaults to auto-detect */
  applySigmoid?: boolean;
  /** Input width in pixels. Defaults to 640 */
  inputWidth?: number;
  inputHeight?: number;
  /** Tensor memory layout: 'channels_first' [13, 8400] or 'channels_last' [8400, 13] */
  layout?: 'channels_first' | 'channels_last' | 'auto';
  /** If true, clamp coordinates within image bounds [0, inputSize] */
  clampCoords?: boolean;
}

export interface DecodeTelemetry {
  hitCount: number;
  coordinateReadsCount: number;
  hasCandidateHint: boolean;
}

export const YOLO_CANDIDATE_HINT_THRESHOLD = 0.28;
export const YUV_CACHE_TILE_SIZE = 16;

/** Pre-computed [0..255] -> [0.0..1.0] normalization lookup table (eliminates 1.22M divisions/frame) */
export const NORM_LUT_256: Float32Array = (() => {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = i / 255.0;
  }
  return lut;
})();

/**
 * Reusable sparse hit buffers for 8,400 anchors.
 * Reset sparsely (only O(hitCount) entries touched per frame, NEVER filling 8,400 elements on empty frames).
 */
const reusableBestScores = new Float32Array(YOLO_NUM_ANCHORS).fill(-Infinity);
const reusableBestClasses = new Int32Array(YOLO_NUM_ANCHORS).fill(-1);
const reusableHitAnchors = new Int32Array(YOLO_NUM_ANCHORS);
let prevActiveHitCount = 0;

let lastDecodeTelemetry: DecodeTelemetry = {
  hitCount: 0,
  coordinateReadsCount: 0,
  hasCandidateHint: false,
};

export function getLastDecodeTelemetry(): DecodeTelemetry {
  return { ...lastDecodeTelemetry };
}

/**
 * Numerically stable Sigmoid function
 */
export function sigmoid(x: number): number {
  if (!Number.isFinite(x)) return 0.0;
  if (x > 40) return 1.0;
  if (x < -40) return 0.0;
  return 1 / (1 + Math.exp(-x));
}

function inverseSigmoidThreshold(prob: number): number {
  if (prob <= 0) return -Infinity;
  if (prob >= 1) return 40.0;
  return -Math.log(1.0 / prob - 1.0);
}

/**
 * Decode YOLO26 raw tensor output into candidate bounding boxes.
 * Ticket 09 Optimizations:
 * 1. Row-Major class scan (for c = 0..8: for i = 0..8399) for 100% sequential L1D cache hits.
 * 2. Pre-sigmoid raw threshold comparison (avoids Math.exp on background anchors).
 * 3. Sparse hit tracking & reset via reusableHitAnchors (0 Arrays.fill calls per frame).
 * 4. Zero-Coordinate-Read fast path on empty frames (0 reads of channels 0..3 when hitCount == 0).
 */
export function decodeYoloTensor(
  tensor: Float32Array | number[] | number[][] | number[][][],
  options: DecodeOptions = {}
): CandidateBox[] {
  const scoreThreshold = options.scoreThreshold ?? YOLO_SCORE_THRESHOLD;
  const hintThreshold = options.hintThreshold ?? YOLO_CANDIDATE_HINT_THRESHOLD;
  const inputWidth = options.inputWidth ?? YOLO_INPUT_WIDTH;
  const inputHeight = options.inputHeight ?? YOLO_INPUT_HEIGHT;
  const clampCoords = options.clampCoords ?? true;

  lastDecodeTelemetry = {
    hitCount: 0,
    coordinateReadsCount: 0,
    hasCandidateHint: false,
  };

  if (!tensor) {
    return [];
  }

  // Ensure any leftover sparse entries from an interrupted call are cleaned in O(prevActiveHitCount)
  for (let k = 0; k < prevActiveHitCount; k++) {
    const idx = reusableHitAnchors[k];
    reusableBestClasses[idx] = -1;
    reusableBestScores[idx] = -Infinity;
  }
  prevActiveHitCount = 0;

  // 1. Flatten / normalize tensor access
  let getVal: (channel: number, anchor: number) => number;
  let layout = options.layout ?? 'auto';

  const isSequence = (v: any) =>
    v != null && (Array.isArray(v) || ArrayBuffer.isView(v));

  if (Array.isArray(tensor) && tensor.length === 1 && isSequence(tensor[0])) {
    // 3D array [1, 13, 8400] or [1, 8400, 13]
    const matrix = tensor[0] as any;
    if (matrix.length === YOLO_TOTAL_CHANNELS) {
      layout = 'channels_first';
      getVal = (c, i) => matrix[c]?.[i] ?? 0;
    } else if (matrix.length === YOLO_NUM_ANCHORS) {
      layout = 'channels_last';
      getVal = (c, i) => matrix[i]?.[c] ?? 0;
    } else {
      return [];
    }
  } else if (Array.isArray(tensor) && isSequence(tensor[0])) {
    // 2D array
    const matrix = tensor as any;
    if (matrix.length === YOLO_TOTAL_CHANNELS) {
      layout = 'channels_first';
      getVal = (c, i) => matrix[c]?.[i] ?? 0;
    } else if (matrix.length === YOLO_NUM_ANCHORS) {
      layout = 'channels_last';
      getVal = (c, i) => matrix[i]?.[c] ?? 0;
    } else {
      return [];
    }
  } else {
    // 1D flat buffer (Float32Array or flat number[])
    const flat = tensor as Float32Array | number[];
    if (flat.length === 0) return [];

    if (layout === 'auto') {
      layout = 'channels_first';
    }

    if (layout === 'channels_first') {
      getVal = (c, i) => flat[c * YOLO_NUM_ANCHORS + i] ?? 0;
    } else {
      getVal = (c, i) => flat[i * YOLO_TOTAL_CHANNELS + c] ?? 0;
    }
  }

  // Determine whether sigmoid should be applied
  let applySigmoid = options.applySigmoid;
  if (applySigmoid === undefined || (applySigmoid as unknown) === 'auto') {
    // Auto-detect: check sample class values (tolerating INT8 dequant scale up to ~1.07)
    let foundOutsideProbRange = false;
    const testSampleCount = Math.min(200, YOLO_NUM_ANCHORS);
    for (let c = YOLO_NUM_COORDINATES; c < YOLO_TOTAL_CHANNELS; c++) {
      for (let i = 0; i < testSampleCount; i++) {
        const val = getVal(c, i);
        if (val < -0.1 || val > 1.2) {
          foundOutsideProbRange = true;
          break;
        }
      }
      if (foundOutsideProbRange) break;
    }
    applySigmoid = foundOutsideProbRange;
  }

  const rawScoreThreshold = applySigmoid
    ? inverseSigmoidThreshold(scoreThreshold)
    : scoreThreshold;
  const rawHintThreshold = applySigmoid
    ? inverseSigmoidThreshold(hintThreshold)
    : hintThreshold;

  let hitCount = 0;
  let hasCandidateHint = false;

  // 2. Row-Major Class Pre-Filter Scan:
  // For channels_first [1, 13, 8400], scanning outer loop c=0..8, inner loop i=0..8399
  // reads 8,400 contiguous floats per class row with 100% L1D cache locality!
  if (layout === 'channels_first') {
    for (let c = 0; c < YOLO_NUM_CLASSES; c++) {
      const channelIdx = YOLO_NUM_COORDINATES + c;
      for (let anchorIdx = 0; anchorIdx < YOLO_NUM_ANCHORS; anchorIdx++) {
        const rawVal = getVal(channelIdx, anchorIdx);
        if (!Number.isFinite(rawVal) || rawVal < rawHintThreshold) {
          continue;
        }
        hasCandidateHint = true;
        if (rawVal < rawScoreThreshold) {
          continue;
        }
        const score = applySigmoid
          ? sigmoid(rawVal)
          : Math.max(0, Math.min(1, rawVal));
        if (score >= scoreThreshold) {
          if (reusableBestClasses[anchorIdx] === -1) {
            reusableHitAnchors[hitCount++] = anchorIdx;
          }
          if (score > reusableBestScores[anchorIdx]) {
            reusableBestScores[anchorIdx] = score;
            reusableBestClasses[anchorIdx] = c;
          }
        }
      }
    }
  } else {
    // channels_last [8400, 13]: per-anchor channels are contiguous
    for (let anchorIdx = 0; anchorIdx < YOLO_NUM_ANCHORS; anchorIdx++) {
      let maxClassScore = -Infinity;
      let bestClassIndex = -1;
      for (let c = 0; c < YOLO_NUM_CLASSES; c++) {
        const rawVal = getVal(YOLO_NUM_COORDINATES + c, anchorIdx);
        if (!Number.isFinite(rawVal) || rawVal < rawHintThreshold) {
          continue;
        }
        hasCandidateHint = true;
        if (rawVal < rawScoreThreshold) {
          continue;
        }
        const score = applySigmoid
          ? sigmoid(rawVal)
          : Math.max(0, Math.min(1, rawVal));
        if (score > maxClassScore) {
          maxClassScore = score;
          bestClassIndex = c;
        }
      }
      if (bestClassIndex >= 0 && maxClassScore >= scoreThreshold) {
        reusableHitAnchors[hitCount++] = anchorIdx;
        reusableBestScores[anchorIdx] = maxClassScore;
        reusableBestClasses[anchorIdx] = bestClassIndex;
      }
    }
  }

  prevActiveHitCount = hitCount;

  // 3. Fast Path on Empty Frame (hitCount === 0):
  // Skip 100% of the 33,600 coordinate reads (matrix[0..3][0..8399])!
  if (hitCount === 0) {
    lastDecodeTelemetry = {
      hitCount: 0,
      coordinateReadsCount: 0,
      hasCandidateHint,
    };
    return [];
  }

  // Sort hit anchor indices in ascending order (insertion sort on K <= 30 takes < 0.001ms)
  for (let i = 1; i < hitCount; i++) {
    const key = reusableHitAnchors[i];
    let j = i - 1;
    while (j >= 0 && reusableHitAnchors[j] > key) {
      reusableHitAnchors[j + 1] = reusableHitAnchors[j];
      j--;
    }
    reusableHitAnchors[j + 1] = key;
  }

  // 4. Coordinate Normalization Detection (O(hitCount) fast check first, fallback scan only if all hits <= 2.0)
  let maxCoordVal = 0;
  let coordinateReadsCount = 0;

  for (let hIdx = 0; hIdx < hitCount; hIdx++) {
    const anchorIdx = reusableHitAnchors[hIdx];
    for (let c = 0; c < YOLO_NUM_COORDINATES; c++) {
      const v = getVal(c, anchorIdx);
      coordinateReadsCount++;
      if (Number.isFinite(v) && v > maxCoordVal) {
        maxCoordVal = v;
      }
    }
    if (maxCoordVal > 2.0) break;
  }

  if (maxCoordVal <= 2.0) {
    for (let c = 0; c < YOLO_NUM_COORDINATES; c++) {
      for (let i = 0; i < YOLO_NUM_ANCHORS; i++) {
        const v = getVal(c, i);
        coordinateReadsCount++;
        if (Number.isFinite(v) && v > maxCoordVal) {
          maxCoordVal = v;
          if (maxCoordVal > 2.0) break;
        }
      }
      if (maxCoordVal > 2.0) break;
    }
  }

  const isNormalizedTensor = maxCoordVal > 0 && maxCoordVal <= 2.0;
  const candidates: CandidateBox[] = [];

  // 5. Decode coordinates ONLY for the hitCount qualifying anchors & sparsely reset state
  for (let hIdx = 0; hIdx < hitCount; hIdx++) {
    const anchorIdx = reusableHitAnchors[hIdx];
    const maxClassScore = reusableBestScores[anchorIdx];
    const bestClassIndex = reusableBestClasses[anchorIdx];

    // Sparse reset: O(1) per hit anchor, zero overhead on non-hit anchors
    reusableBestScores[anchorIdx] = -Infinity;
    reusableBestClasses[anchorIdx] = -1;

    const rawCx = getVal(0, anchorIdx);
    const rawCy = getVal(1, anchorIdx);
    const rawW = getVal(2, anchorIdx);
    const rawH = getVal(3, anchorIdx);
    coordinateReadsCount += 4;

    if (
      !Number.isFinite(rawCx) ||
      !Number.isFinite(rawCy) ||
      !Number.isFinite(rawW) ||
      !Number.isFinite(rawH) ||
      rawW <= 0 ||
      rawH <= 0
    ) {
      continue;
    }

    const cx = isNormalizedTensor ? rawCx * inputWidth : rawCx;
    const cy = isNormalizedTensor ? rawCy * inputHeight : rawCy;
    const w = isNormalizedTensor ? rawW * inputWidth : rawW;
    const h = isNormalizedTensor ? rawH * inputHeight : rawH;

    let x1 = cx - w / 2;
    let y1 = cy - h / 2;
    let x2 = cx + w / 2;
    let y2 = cy + h / 2;

    if (clampCoords) {
      x1 = Math.max(0, Math.min(inputWidth, x1));
      y1 = Math.max(0, Math.min(inputHeight, y1));
      x2 = Math.max(0, Math.min(inputWidth, x2));
      y2 = Math.max(0, Math.min(inputHeight, y2));
    }

    const x = x1;
    const y = y1;
    const width = Math.max(0, x2 - x1);
    const height = Math.max(0, y2 - y1);

    if (width < 2 || height < 2) {
      continue;
    }

    const boxCx = clampCoords ? x + width / 2 : cx;
    const boxCy = clampCoords ? y + height / 2 : cy;

    const classId = getYoloClassByIndex(bestClassIndex);
    const label = getYoloLabelByIndex(bestClassIndex);

    candidates.push({
      id: `box_${anchorIdx}_${bestClassIndex}`,
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      width: Math.round(width * 100) / 100,
      height: Math.round(height * 100) / 100,
      cx: Math.round(boxCx * 100) / 100,
      cy: Math.round(boxCy * 100) / 100,
      score: Math.round(maxClassScore * 10000) / 10000,
      classIndex: bestClassIndex,
      classId,
      label,
    });
  }

  prevActiveHitCount = 0;
  lastDecodeTelemetry = {
    hitCount,
    coordinateReadsCount,
    hasCandidateHint: hasCandidateHint && candidates.length === 0,
  };

  return candidates;
}

/**
 * Ticket 09: 16x16 Cache-Tiled 90° CW YUV_420_888 to NCHW [1, 3, 640, 640] Converter
 * Uses pre-computed coordinate/stride LUTs (sxLut, uvColOffLut, yRowOffLut, uvRowOffLut)
 * and NORM_LUT_256 to eliminate L1D Set-Associative Conflict Misses and float divisions.
 */
export function convertYuv420ToNchwTiled(
  yData: Uint8Array,
  uData: Uint8Array,
  vData: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  yRowStride: number = srcWidth,
  uvRowStride: number = srcWidth >> 1,
  uvPixelStride: number = 1,
  dstWidth: number = YOLO_INPUT_WIDTH,
  dstHeight: number = YOLO_INPUT_HEIGHT,
  outFloatBuffer?: Float32Array
): Float32Array {
  const planeFloats = dstWidth * dstHeight;
  const output =
    outFloatBuffer && outFloatBuffer.length >= planeFloats * 3
      ? outFloatBuffer
      : new Float32Array(planeFloats * 3);

  const sxLut = new Int32Array(dstHeight);
  const uvColOffLut = new Int32Array(dstHeight);
  for (let dy = 0; dy < dstHeight; dy++) {
    let sx = Math.floor((dy * srcWidth) / dstHeight);
    if (sx >= srcWidth) sx = srcWidth - 1;
    if (sx < 0) sx = 0;
    sxLut[dy] = sx;
    uvColOffLut[dy] = (sx >> 1) * uvPixelStride;
  }

  const yRowOffLut = new Int32Array(dstWidth);
  const uvRowOffLut = new Int32Array(dstWidth);
  for (let dx = 0; dx < dstWidth; dx++) {
    let sy = srcHeight - 1 - Math.floor((dx * srcHeight) / dstWidth);
    if (sy < 0) sy = 0;
    if (sy >= srcHeight) sy = srcHeight - 1;
    yRowOffLut[dx] = sy * yRowStride;
    uvRowOffLut[dx] = (sy >> 1) * uvRowStride;
  }

  const gPlaneOffset = planeFloats;
  const bPlaneOffset = planeFloats * 2;
  const yLen = yData.length;
  const uLen = uData.length;
  const vLen = vData.length;

  for (let dy0 = 0; dy0 < dstHeight; dy0 += YUV_CACHE_TILE_SIZE) {
    const dyLimit = Math.min(dy0 + YUV_CACHE_TILE_SIZE, dstHeight);
    for (let dx0 = 0; dx0 < dstWidth; dx0 += YUV_CACHE_TILE_SIZE) {
      const dxLimit = Math.min(dx0 + YUV_CACHE_TILE_SIZE, dstWidth);
      for (let dy = dy0; dy < dyLimit; dy++) {
        const sx = sxLut[dy];
        const uvColOff = uvColOffLut[dy];
        const pxBase = dy * dstWidth;

        for (let dx = dx0; dx < dxLimit; dx++) {
          const yIdx = yRowOffLut[dx] + sx;
          const uvIdx = uvRowOffLut[dx] + uvColOff;

          const yVal = yIdx >= 0 && yIdx < yLen ? yData[yIdx] & 0xff : 0;
          const uVal =
            (uvIdx >= 0 && uvIdx < uLen ? uData[uvIdx] & 0xff : 128) - 128;
          const vVal =
            (uvIdx >= 0 && uvIdx < vLen ? vData[uvIdx] & 0xff : 128) - 128;

          let r = yVal + ((1436 * vVal) >> 10);
          let g = yVal - ((352 * uVal + 731 * vVal) >> 10);
          let b = yVal + ((1815 * uVal) >> 10);

          if (r < 0) r = 0;
          else if (r > 255) r = 255;
          if (g < 0) g = 0;
          else if (g > 255) g = 255;
          if (b < 0) b = 0;
          else if (b > 255) b = 255;

          const pIdx = pxBase + dx;
          output[pIdx] = NORM_LUT_256[r];
          output[gPlaneOffset + pIdx] = NORM_LUT_256[g];
          output[bPlaneOffset + pIdx] = NORM_LUT_256[b];
        }
      }
    }
  }

  return output;
}

