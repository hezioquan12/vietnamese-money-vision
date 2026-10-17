/**
 * MockMoneyDetector
 * Fallback detector when the physical YOLO26 TFLite model is training or missing.
 * Generates realistic synthetic candidate boxes and raw [1, 13, 8400] tensors
 * for comprehensive UI, audio, haptics, and debounce pipeline testing.
 */

import type { MoneyClass, DetectedMoneyItem } from '../../types/money.ts';
import { DENOMINATION_NAMES } from '../../types/money.ts';
import {
  YOLO_NUM_ANCHORS,
  YOLO_TOTAL_CHANNELS,
  YOLO_TENSOR_ELEMENTS,
  YOLO_NUM_COORDINATES,
  getYoloIndexByDenomination,
} from './yoloConstants.ts';
import type { CandidateBox } from './yoloDecoder.ts';
import { aggregateDetections, nonMaximumSuppression } from './nmsAlgorithm.ts';

export type MockScenario =
  | 'EMPTY'
  | 'SINGLE_1K'
  | 'SINGLE_2K'
  | 'SINGLE_5K'
  | 'SINGLE_10K'
  | 'SINGLE_20K'
  | 'SINGLE_50K'
  | 'SINGLE_100K'
  | 'SINGLE_200K'
  | 'SINGLE_500K'
  | 'MULTI_NOTES'
  | 'ALL_9_DENOMINATIONS';

export interface DetectionResult {
  items: DetectedMoneyItem[];
  boxes: CandidateBox[];
  totalAmount: number;
  totalNotesCount: number;
  hasMoney: boolean;
  timestamp: number;
  inferenceTimeMs: number;
  isMock: boolean;
}

export interface SyntheticBoxSpec {
  classId: MoneyClass;
  cx?: number;
  cy?: number;
  w?: number;
  h?: number;
  score?: number;
  anchorIndex?: number;
}

export class MockMoneyDetector {
  private currentScenario: MockScenario = 'SINGLE_50K';
  private customBoxes: CandidateBox[] | null = null;

  constructor(initialScenario: MockScenario = 'SINGLE_50K') {
    this.currentScenario = initialScenario;
  }

  public setScenario(scenario: MockScenario): void {
    this.currentScenario = scenario;
    this.customBoxes = null;
  }

  public getScenario(): MockScenario {
    return this.currentScenario;
  }

  public setCustomBoxes(boxes: CandidateBox[]): void {
    this.customBoxes = [...boxes];
  }

  public isModelLoaded(): boolean {
    return false; // Real model is not loaded
  }

  public isMock(): boolean {
    return true;
  }

  /**
   * Generates candidate boxes for the current scenario
   */
  public generateCandidateBoxes(): CandidateBox[] {
    if (this.customBoxes !== null) {
      return [...this.customBoxes];
    }
    return MockMoneyDetector.getScenarioBoxes(this.currentScenario);
  }

  /**
   * Runs simulated detection and returns full DetectionResult
   */
  public async detect(): Promise<DetectionResult> {
    const startTime = Date.now();
    const candidateBoxes = this.generateCandidateBoxes();
    const nmsBoxes = nonMaximumSuppression(candidateBoxes);
    const summary = aggregateDetections(nmsBoxes);
    const inferenceTimeMs = Math.max(1, Date.now() - startTime);

    return {
      items: summary.items,
      boxes: nmsBoxes,
      totalAmount: summary.totalAmount,
      totalNotesCount: summary.totalNotesCount,
      hasMoney: summary.hasMoney,
      timestamp: Date.now(),
      inferenceTimeMs,
      isMock: true,
    };
  }

  /**
   * Static helper to generate candidate boxes for a given scenario
   */
  public static getScenarioBoxes(scenario: MockScenario): CandidateBox[] {
    switch (scenario) {
      case 'EMPTY':
        return [];

      case 'SINGLE_1K':
        return [this.createMockBox(1000, 100, 150, 440, 260, 0.94)];

      case 'SINGLE_2K':
        return [this.createMockBox(2000, 100, 150, 440, 260, 0.93)];

      case 'SINGLE_5K':
        return [this.createMockBox(5000, 100, 150, 440, 260, 0.95)];

      case 'SINGLE_10K':
        return [this.createMockBox(10000, 100, 150, 440, 260, 0.96)];

      case 'SINGLE_20K':
        return [this.createMockBox(20000, 100, 150, 440, 260, 0.92)];

      case 'SINGLE_50K':
        return [this.createMockBox(50000, 100, 150, 440, 260, 0.97)];

      case 'SINGLE_100K':
        return [this.createMockBox(100000, 100, 150, 440, 260, 0.95)];

      case 'SINGLE_200K':
        return [this.createMockBox(200000, 100, 150, 440, 260, 0.96)];

      case 'SINGLE_500K':
        return [this.createMockBox(500000, 100, 150, 440, 260, 0.98)];

      case 'MULTI_NOTES':
        // Two 100k notes, one 50k note
        return [
          this.createMockBox(100000, 60, 80, 400, 220, 0.95),
          this.createMockBox(100000, 180, 200, 400, 220, 0.91),
          this.createMockBox(50000, 120, 380, 380, 210, 0.89),
        ];

      case 'ALL_9_DENOMINATIONS':
        return [
          this.createMockBox(1000, 50, 50, 200, 120, 0.88),
          this.createMockBox(2000, 260, 50, 200, 120, 0.89),
          this.createMockBox(5000, 470, 50, 200, 120, 0.90),
          this.createMockBox(10000, 50, 180, 200, 120, 0.91),
          this.createMockBox(20000, 260, 180, 200, 120, 0.92),
          this.createMockBox(50000, 470, 180, 200, 120, 0.93),
          this.createMockBox(100000, 50, 310, 200, 120, 0.94),
          this.createMockBox(200000, 260, 310, 200, 120, 0.95),
          this.createMockBox(500000, 470, 310, 200, 120, 0.96),
        ];

      default:
        return [];
    }
  }

  /**
   * Helper to construct a single CandidateBox
   */
  public static createMockBox(
    classId: MoneyClass,
    x: number = 100,
    y: number = 150,
    width: number = 440,
    height: number = 260,
    score: number = 0.95
  ): CandidateBox {
    const classIndex = getYoloIndexByDenomination(classId);
    return {
      id: `mock_${classId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      x,
      y,
      width,
      height,
      cx: x + width / 2,
      cy: y + height / 2,
      score,
      classIndex,
      classId,
      label: DENOMINATION_NAMES[classId],
    };
  }

  /**
   * Creates a synthetic raw [1, 13, 8400] Float32Array tensor
   * with candidate boxes encoded at specific anchors.
   * Can also inject overlapping duplicate anchors to test NMS suppression.
   */
  public static createSyntheticYoloTensor(
    specs: SyntheticBoxSpec[],
    options: {
      addDuplicates?: boolean;
      duplicateIoU?: number;
      noiseFloor?: number;
    } = {}
  ): Float32Array {
    const buffer = new Float32Array(YOLO_TENSOR_ELEMENTS);
    const noise = options.noiseFloor ?? 0.01;

    // Fill with slight background noise
    if (noise > 0) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] = noise * (i % 7) * 0.1;
      }
    }

    let defaultAnchor = 100;

    for (const spec of specs) {
      const anchorIdx = spec.anchorIndex ?? defaultAnchor;
      defaultAnchor += 350;

      const cx = spec.cx ?? 320;
      const cy = spec.cy ?? 320;
      const w = spec.w ?? 440;
      const h = spec.h ?? 260;
      const score = spec.score ?? 0.95;
      const classIdx = getYoloIndexByDenomination(spec.classId);

      // Channel 0: cx, Channel 1: cy, Channel 2: w, Channel 3: h
      buffer[0 * YOLO_NUM_ANCHORS + anchorIdx] = cx;
      buffer[1 * YOLO_NUM_ANCHORS + anchorIdx] = cy;
      buffer[2 * YOLO_NUM_ANCHORS + anchorIdx] = w;
      buffer[3 * YOLO_NUM_ANCHORS + anchorIdx] = h;

      // Class logits (channels 4..12)
      buffer[(YOLO_NUM_COORDINATES + classIdx) * YOLO_NUM_ANCHORS + anchorIdx] = score;

      // Optional duplicate anchor for NMS suppression verification
      if (options.addDuplicates) {
        const dupAnchorIdx = anchorIdx + 1;
        // Slightly shifted coordinates with high IoU
        buffer[0 * YOLO_NUM_ANCHORS + dupAnchorIdx] = cx + 4;
        buffer[1 * YOLO_NUM_ANCHORS + dupAnchorIdx] = cy + 4;
        buffer[2 * YOLO_NUM_ANCHORS + dupAnchorIdx] = w;
        buffer[3 * YOLO_NUM_ANCHORS + dupAnchorIdx] = h;
        // Slightly lower score (so it gets suppressed by NMS)
        buffer[(YOLO_NUM_COORDINATES + classIdx) * YOLO_NUM_ANCHORS + dupAnchorIdx] =
          score - 0.05;
      }
    }

    return buffer;
  }
}
