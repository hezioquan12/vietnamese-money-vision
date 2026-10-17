/**
 * Temporal Debounce Filter Types
 * Sliding Window Majority Vote Filter for Banknote Detection
 */

import type { DetectedMoneyItem, MoneyClass } from '../../types/money.ts';
import type { DetectionResult } from '../detector/MockMoneyDetector.ts';

export type DebounceState = 'EMPTY' | 'STABILIZING' | 'STABLE';

export interface DebounceFilterOptions {
  /**
   * Size of the sliding window buffer N (default: 5 frames)
   */
  windowSize?: number;

  /**
   * Minimum consensus votes required to confirm stable state (default: 4 of 5 frames, >= 80%)
   */
  minConsensus?: number;

  /**
   * Number of consecutive empty frames to confirm withdrawal / empty frame (default: 3 frames)
   */
  emptyThreshold?: number;
}

export interface DebounceFrame {
  items: DetectedMoneyItem[];
  signature: string;
  timestamp: number;
  rawResult?: DetectionResult | null;
}

export interface DebounceFilterResult {
  state: DebounceState;
  stateChanged: boolean;
  isEmptied: boolean;
  signature: string;
  items: DetectedMoneyItem[];
  totalAmount: number;
  totalNotesCount: number;
  hasMoney: boolean;
  consensusCount: number;
  candidateSignature?: string;
  candidateCount?: number;
  windowSize: number;
  consecutiveEmptyFrames: number;
  timestamp: number;
}

export type DebounceListener = (result: DebounceFilterResult) => void;
