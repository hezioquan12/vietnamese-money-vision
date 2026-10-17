/**
 * LuminanceAnalyzer
 * Calculates ambient illuminance from CameraX YUV_420_888 Y-plane (Luma).
 * 100% offline, zero-network, highly optimized pixel sampling.
 */

import type {
  LuminanceAndMotionMetrics,
  LuminanceSpatialMetrics,
} from './types.ts';

export const LOW_LIGHT_THRESHOLD_LUX = 25;
export const RESTORE_LIGHT_THRESHOLD_LUX = 60;
export const TRIGGER_DURATION_MS = 1000;

/** Ticket 08: Anti-Strobe & Optical Reflection Guard Constants */
export const MIN_TORCH_ON_HOLD_MS = 12000;
export const POST_TORCH_BASELINE_WINDOW_MS = 450;
export const HIGH_RESTORE_LIGHT_THRESHOLD_LUX = 175;
export const POST_TORCH_DELTA_LUX = 55;
export const RESTORE_SUSTAIN_DURATION_MS = 3000;
export const AMBIENT_SENSOR_RESTORE_LUX = 85;
export const SPECULAR_GLARE_PIXEL_THRESHOLD = 230;
export const MAX_GLARE_RATIO_FOR_RESTORE = 0.08;
export const MAX_CENTER_TO_BORDER_RATIO = 1.30;
export const OSCILLATION_WINDOW_MS = 30000;
export const OSCILLATION_MAX_CYCLES = 2;
export const OSCILLATION_LATCH_DURATION_MS = 60000;

/** Ticket 09: 16x16 Luma Grid & Motion Blur Gate Constants */
export const LUMA_GRID_DIMENSION = 16;
export const LUMA_GRID_CELLS = 256;
export const MOTION_BLUR_DELTA_Y_THRESHOLD = 32.0;
export const MOTION_WAKE_DELTA_Y_THRESHOLD = 4.5;
export const STATIC_HOLDING_DELTA_Y_THRESHOLD = 2.5;
export const STATIC_EMPTY_DELTA_Y_THRESHOLD = 2.0;
export const STATIC_DEEP_IDLE_DELTA_Y_THRESHOLD = 1.5;

/** Ticket 12: Smart Manual-OFF Torch Recovery & Dark-Scene Relocation Re-Arming Constants */
export const MANUAL_OFF_SETTLE_MS = 250;
export const MANUAL_OFF_MOTION_ARM_DELAY_MS = 400;
export const MANUAL_OFF_REARM_LUMA_LUX = 35;
export const MANUAL_OFF_DARK_GRACE_MS = 2500;
export const MANUAL_OFF_DARKENING_DROP_LUX = 6;
export const MANUAL_OFF_MOTION_DELTA_Y = 4.5;
export const MANUAL_OFF_IMU_ACCEL_DELTA = 0.35;

/**
 * Calculates average luminance (0 - 255) from the Y (Luma) channel.
 *
 * @param yData Uint8Array, number array, or ArrayBuffer containing Y-plane pixel bytes.
 * @param width Image width in pixels.
 * @param height Image height in pixels.
 * @param rowStride Row stride in bytes (>= width, includes row padding if present).
 * @param pixelStride Pixel stride in bytes (typically 1 for Y-plane).
 * @param sampleStep Step size for sub-sampling (default: 1 for exhaustive, 4 for high-FPS).
 * @returns Average luminance (0.0 - 255.0).
 */
export function calculateYPlaneLuminance(
  yData: Uint8Array | number[] | ArrayBuffer | null | undefined,
  width: number,
  height: number,
  rowStride: number = width,
  pixelStride: number = 1,
  sampleStep: number = 1
): number {
  if (
    !yData ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return 0;
  }

  const data: Uint8Array =
    yData instanceof Uint8Array
      ? yData
      : yData instanceof ArrayBuffer
      ? new Uint8Array(yData)
      : new Uint8Array(yData);

  if (data.length === 0) {
    return 0;
  }

  let sum = 0;
  let count = 0;
  const step =
    Number.isFinite(sampleStep) && sampleStep >= 1
      ? Math.floor(sampleStep)
      : 1;
  const rStride =
    Number.isFinite(rowStride) && rowStride >= width
      ? Math.floor(rowStride)
      : width;
  const pStride =
    Number.isFinite(pixelStride) && pixelStride >= 1
      ? Math.floor(pixelStride)
      : 1;

  for (let row = 0; row < height; row += step) {
    const rowStart = row * rStride;
    for (let col = 0; col < width; col += step) {
      const idx = rowStart + col * pStride;
      if (idx < data.length) {
        sum += data[idx];
        count++;
      }
    }
  }

  return count > 0 ? sum / count : 0;
}

/**
 * Analyzes spatial luminance distribution (Center vs Border ROI + Specular Glare ratio)
 * to distinguish close-range LED torch reflection off banknotes/objects from true ambient room illumination.
 */
export function analyzeYPlaneSpatialProfile(
  yData: Uint8Array | number[] | ArrayBuffer | null | undefined,
  width: number,
  height: number,
  rowStride: number = width,
  pixelStride: number = 1,
  sampleStep: number = 1
): LuminanceSpatialMetrics {
  const emptyMetrics: LuminanceSpatialMetrics = {
    averageLuma: 0,
    centerLuma: 0,
    borderLuma: 0,
    glareRatio: 0,
    centerToBorderRatio: 1,
    isCloseRangeReflection: false,
  };

  if (
    !yData ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return emptyMetrics;
  }

  const data: Uint8Array =
    yData instanceof Uint8Array
      ? yData
      : yData instanceof ArrayBuffer
      ? new Uint8Array(yData)
      : new Uint8Array(yData);

  if (data.length === 0) {
    return emptyMetrics;
  }

  const step =
    Number.isFinite(sampleStep) && sampleStep >= 1
      ? Math.floor(sampleStep)
      : 1;
  const rStride =
    Number.isFinite(rowStride) && rowStride >= width
      ? Math.floor(rowStride)
      : width;
  const pStride =
    Number.isFinite(pixelStride) && pixelStride >= 1
      ? Math.floor(pixelStride)
      : 1;

  const rMin = height * 0.25;
  const rMax = height * 0.75;
  const cMin = width * 0.25;
  const cMax = width * 0.75;

  let totalSum = 0;
  let totalCount = 0;
  let centerSum = 0;
  let centerCount = 0;
  let borderSum = 0;
  let borderCount = 0;
  let glareCount = 0;

  for (let row = 0; row < height; row += step) {
    const rowStart = row * rStride;
    const inCenterRow = row >= rMin && row < rMax;
    for (let col = 0; col < width; col += step) {
      const idx = rowStart + col * pStride;
      if (idx < data.length) {
        const val = data[idx];
        totalSum += val;
        totalCount++;
        if (val > SPECULAR_GLARE_PIXEL_THRESHOLD) {
          glareCount++;
        }
        if (inCenterRow && col >= cMin && col < cMax) {
          centerSum += val;
          centerCount++;
        } else {
          borderSum += val;
          borderCount++;
        }
      }
    }
  }

  if (totalCount === 0) {
    return emptyMetrics;
  }

  const averageLuma = totalSum / totalCount;
  const centerLuma = centerCount > 0 ? centerSum / centerCount : averageLuma;
  const borderLuma = borderCount > 0 ? borderSum / borderCount : averageLuma;
  const glareRatio = glareCount / totalCount;
  const centerToBorderRatio =
    borderLuma > 1
      ? centerLuma / borderLuma
      : centerLuma > 1
      ? centerLuma
      : 1.0;
  const isCloseRangeReflection =
    glareRatio >= MAX_GLARE_RATIO_FOR_RESTORE ||
    ((averageLuma >= RESTORE_LIGHT_THRESHOLD_LUX ||
      centerLuma >= RESTORE_LIGHT_THRESHOLD_LUX) &&
      centerToBorderRatio >= MAX_CENTER_TO_BORDER_RATIO);

  return {
    averageLuma,
    centerLuma,
    borderLuma,
    glareRatio,
    centerToBorderRatio,
    isCloseRangeReflection,
  };
}

/**
 * Checks if measured luminance while torch is ON is likely caused by self-illumination / reflection
 * rather than genuine ambient room light recovery.
 */
export function isOpticalReflectionLikely(
  luminance: number,
  postTorchBaselineLuma: number | null,
  glareRatio: number = 0,
  centerToBorderRatio: number = 1.0,
  highRestoreThreshold: number = HIGH_RESTORE_LIGHT_THRESHOLD_LUX,
  postTorchDelta: number = POST_TORCH_DELTA_LUX
): boolean {
  if (glareRatio >= MAX_GLARE_RATIO_FOR_RESTORE) {
    return true;
  }
  if (centerToBorderRatio >= MAX_CENTER_TO_BORDER_RATIO) {
    return true;
  }
  const effectiveBaseline =
    postTorchBaselineLuma !== null && Number.isFinite(postTorchBaselineLuma)
      ? postTorchBaselineLuma
      : RESTORE_LIGHT_THRESHOLD_LUX;
  const requiredThreshold = Math.max(
    highRestoreThreshold,
    effectiveBaseline + postTorchDelta
  );
  return luminance < requiredThreshold;
}

/**
 * Checks if ambient luminance is below low-light threshold (< 25 lux).
 */
export function isLowLight(
  luminance: number,
  threshold: number = LOW_LIGHT_THRESHOLD_LUX
): boolean {
  return luminance < threshold;
}

/**
 * Checks if ambient luminance has recovered to normal levels (>= 60 lux).
 */
export function isLightRestored(
  luminance: number,
  threshold: number = RESTORE_LIGHT_THRESHOLD_LUX
): boolean {
  return luminance >= threshold;
}

/**
 * Ticket 09: Calculates mean absolute luma difference ΔY = (1/256) * sum(|Y_t[i] - Y_{t-1}[i]|)
 * across two 16x16 = 256-element Y-channel grids.
 */
export function calculateLumaGridMotionDelta(
  currentGrid: Uint8Array | number[] | null | undefined,
  previousGrid: Uint8Array | number[] | null | undefined
): number {
  if (
    !currentGrid ||
    !previousGrid ||
    currentGrid.length < LUMA_GRID_CELLS ||
    previousGrid.length < LUMA_GRID_CELLS
  ) {
    return 0;
  }

  let diffSum = 0;
  for (let i = 0; i < LUMA_GRID_CELLS; i++) {
    const a = currentGrid[i] & 0xff;
    const b = previousGrid[i] & 0xff;
    diffSum += a >= b ? a - b : b - a;
  }

  return diffSum / LUMA_GRID_CELLS;
}

const reusableGridSums = new Int32Array(LUMA_GRID_CELLS);
const reusableGridCounts = new Int32Array(LUMA_GRID_CELLS);

/**
 * Ticket 09: Unified Single-Pass Y-Plane Analyzer (< 0.03ms CPU).
 * Computes overall luminance, spatial reflection profile (Center vs Border ROI + Specular Glare),
 * and extracts the 16x16 = 256 Luma Grid + optical motion delta ΔY in a single loop.
 */
export function analyzeYPlaneSinglePass(
  yData: Uint8Array | number[] | ArrayBuffer | null | undefined,
  width: number,
  height: number,
  rowStride: number = width,
  pixelStride: number = 1,
  sampleStep: number = 1,
  previousGrid16x16?: Uint8Array | number[] | null,
  outGrid16x16?: Uint8Array
): LuminanceAndMotionMetrics {
  const targetGrid =
    outGrid16x16 && outGrid16x16.length >= LUMA_GRID_CELLS
      ? outGrid16x16
      : new Uint8Array(LUMA_GRID_CELLS);

  const emptyMetrics: LuminanceAndMotionMetrics = {
    averageLuma: 0,
    centerLuma: 0,
    borderLuma: 0,
    glareRatio: 0,
    centerToBorderRatio: 1,
    isCloseRangeReflection: false,
    lumaGrid16x16: targetGrid,
    motionDeltaY: 0,
    isMotionBlurred: false,
  };

  if (
    !yData ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    targetGrid.fill(0);
    return emptyMetrics;
  }

  const data: Uint8Array =
    yData instanceof Uint8Array
      ? yData
      : yData instanceof ArrayBuffer
      ? new Uint8Array(yData)
      : new Uint8Array(yData);

  if (data.length === 0) {
    targetGrid.fill(0);
    return emptyMetrics;
  }

  const w = Math.floor(width);
  const h = Math.floor(height);
  const step =
    Number.isFinite(sampleStep) && sampleStep >= 1
      ? Math.floor(sampleStep)
      : 1;
  const rStride =
    Number.isFinite(rowStride) && rowStride >= w ? Math.floor(rowStride) : w;
  const pStride =
    Number.isFinite(pixelStride) && pixelStride >= 1
      ? Math.floor(pixelStride)
      : 1;

  reusableGridSums.fill(0);
  reusableGridCounts.fill(0);

  const rMin = h * 0.25;
  const rMax = h * 0.75;
  const cMin = w * 0.25;
  const cMax = w * 0.75;

  let totalSum = 0;
  let totalCount = 0;
  let centerSum = 0;
  let centerCount = 0;
  let borderSum = 0;
  let borderCount = 0;
  let glareCount = 0;

  for (let row = 0; row < h; row += step) {
    const rowStart = row * rStride;
    const inCenterRow = row >= rMin && row < rMax;
    const gy = Math.min(
      LUMA_GRID_DIMENSION - 1,
      Math.floor((row * LUMA_GRID_DIMENSION) / h)
    );
    const gridRowBase = gy << 4;

    for (let col = 0; col < w; col += step) {
      const idx = rowStart + col * pStride;
      if (idx < data.length) {
        const val = data[idx];
        totalSum += val;
        totalCount++;
        if (val > SPECULAR_GLARE_PIXEL_THRESHOLD) {
          glareCount++;
        }
        if (inCenterRow && col >= cMin && col < cMax) {
          centerSum += val;
          centerCount++;
        } else {
          borderSum += val;
          borderCount++;
        }

        const gx = Math.min(
          LUMA_GRID_DIMENSION - 1,
          Math.floor((col * LUMA_GRID_DIMENSION) / w)
        );
        const cellIdx = gridRowBase + gx;
        reusableGridSums[cellIdx] += val;
        reusableGridCounts[cellIdx]++;
      }
    }
  }

  if (totalCount === 0) {
    targetGrid.fill(0);
    return emptyMetrics;
  }

  const averageLuma = totalSum / totalCount;
  const centerLuma = centerCount > 0 ? centerSum / centerCount : averageLuma;
  const borderLuma = borderCount > 0 ? borderSum / borderCount : averageLuma;
  const glareRatio = glareCount / totalCount;
  const centerToBorderRatio =
    borderLuma > 1
      ? centerLuma / borderLuma
      : centerLuma > 1
      ? centerLuma
      : 1.0;
  const isCloseRangeReflection =
    glareRatio >= MAX_GLARE_RATIO_FOR_RESTORE ||
    ((averageLuma >= RESTORE_LIGHT_THRESHOLD_LUX ||
      centerLuma >= RESTORE_LIGHT_THRESHOLD_LUX) &&
      centerToBorderRatio >= MAX_CENTER_TO_BORDER_RATIO);

  const fallbackCellVal = Math.max(0, Math.min(255, Math.round(averageLuma)));
  const hasPrevGrid =
    previousGrid16x16 != null && previousGrid16x16.length >= LUMA_GRID_CELLS;
  let diffSum = 0;

  for (let cellIdx = 0; cellIdx < LUMA_GRID_CELLS; cellIdx++) {
    const cnt = reusableGridCounts[cellIdx];
    let cellLuma: number;
    if (cnt > 0) {
      cellLuma = (reusableGridSums[cellIdx] / cnt + 0.5) | 0;
    } else {
      const gy = cellIdx >> 4;
      const gx = cellIdx & 15;
      const sr = Math.min(
        h - 1,
        Math.floor(((gy + 0.5) * h) / LUMA_GRID_DIMENSION)
      );
      const sc = Math.min(
        w - 1,
        Math.floor(((gx + 0.5) * w) / LUMA_GRID_DIMENSION)
      );
      const sampleIdx = sr * rStride + sc * pStride;
      cellLuma = sampleIdx < data.length ? data[sampleIdx] : fallbackCellVal;
    }
    if (cellLuma < 0) cellLuma = 0;
    else if (cellLuma > 255) cellLuma = 255;

    if (hasPrevGrid) {
      const prevVal = previousGrid16x16![cellIdx] & 0xff;
      diffSum += cellLuma >= prevVal ? cellLuma - prevVal : prevVal - cellLuma;
    }
    targetGrid[cellIdx] = cellLuma;
  }

  const motionDeltaY = hasPrevGrid ? diffSum / LUMA_GRID_CELLS : 0;
  const isMotionBlurred = motionDeltaY > MOTION_BLUR_DELTA_Y_THRESHOLD;

  return {
    averageLuma,
    centerLuma,
    borderLuma,
    glareRatio,
    centerToBorderRatio,
    isCloseRangeReflection,
    lumaGrid16x16: targetGrid,
    motionDeltaY,
    isMotionBlurred,
  };
}


