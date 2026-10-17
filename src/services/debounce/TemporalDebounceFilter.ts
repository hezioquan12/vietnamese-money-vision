/**
 * TemporalDebounceFilter
 * 5-Frame Sliding Window Majority Vote Temporal Debounce Filter
 * Eliminates hand jitter, frame misses, and flicker in offline camera money detection.
 */

import { DENOMINATION_NAMES } from '../../types/money.ts';
import type { DetectedMoneyItem, MoneyClass } from '../../types/money.ts';
import type { DetectionResult } from '../detector/MockMoneyDetector.ts';
import type {
  DebounceFilterOptions,
  DebounceFilterResult,
  DebounceFrame,
  DebounceListener,
  DebounceState,
} from './types.ts';

/**
 * Computes a canonical deterministic string signature for a set of detected items.
 * Guaranteed invariant regardless of input ordering.
 * e.g. "10000:1|50000:2" or "EMPTY"
 */
export function computeDebounceSignature(
  items?: DetectedMoneyItem[] | null
): string {
  if (!items || items.length === 0) return 'EMPTY';
  const countMap = new Map<MoneyClass, number>();
  for (const item of items) {
    if (
      item &&
      typeof item.count === 'number' &&
      Number.isFinite(item.count) &&
      item.count > 0
    ) {
      const classId = Number(item.classId) as MoneyClass;
      if (Number.isFinite(classId) && classId > 0) {
        const intCount = Math.floor(item.count);
        if (intCount > 0) {
          countMap.set(classId, (countMap.get(classId) || 0) + intCount);
        }
      }
    }
  }

  if (countMap.size === 0) return 'EMPTY';

  // Sort by classId ascending for canonical representation
  return Array.from(countMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([classId, count]) => `${classId}:${count}`)
    .join('|');
}

/**
 * Aggregates item counts by denomination and sorts descending (e.g. 500k, 100k, 50k...)
 */
export function aggregateDebounceItems(
  items?: DetectedMoneyItem[] | null
): DetectedMoneyItem[] {
  if (!items || items.length === 0) return [];
  const map = new Map<MoneyClass, number>();

  for (const item of items) {
    if (
      item &&
      typeof item.count === 'number' &&
      Number.isFinite(item.count) &&
      item.count > 0
    ) {
      const classId = Number(item.classId) as MoneyClass;
      if (Number.isFinite(classId) && classId > 0) {
        const intCount = Math.floor(item.count);
        if (intCount > 0) {
          map.set(classId, (map.get(classId) || 0) + intCount);
        }
      }
    }
  }

  return Array.from(map.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([classId, count]) => ({
      classId,
      count,
      label: DENOMINATION_NAMES[classId] ?? `${classId} đ`,
      totalAmount: classId * count,
    }));
}

/**
 * Calculates the newly added banknote delta between previously confirmed items
 * and newly confirmed items to ensure the session wallet only accumulates positive additions.
 */
export function calculateAddedItemsDelta(
  prevItems: DetectedMoneyItem[] = [],
  newItems: DetectedMoneyItem[] = []
): {
  addedItems: DetectedMoneyItem[];
  addedAmount: number;
  addedCount: number;
} {
  const prevCountMap = new Map<number, number>();
  for (const item of prevItems || []) {
    if (item && item.count > 0) {
      prevCountMap.set(
        item.classId,
        (prevCountMap.get(item.classId) || 0) + item.count
      );
    }
  }

  const addedItems: DetectedMoneyItem[] = [];
  let addedAmount = 0;
  let addedCount = 0;

  for (const item of newItems || []) {
    if (item && item.count > 0) {
      const prevCount = prevCountMap.get(item.classId) || 0;
      const countDiff = item.count - prevCount;
      if (countDiff > 0) {
        const addedItem: DetectedMoneyItem = {
          classId: item.classId,
          count: countDiff,
          label: item.label,
          totalAmount: item.classId * countDiff,
        };
        addedItems.push(addedItem);
        addedAmount += addedItem.totalAmount;
        addedCount += countDiff;
      }
    }
  }

  return { addedItems, addedAmount, addedCount };
}

export class TemporalDebounceFilter {
  private readonly windowSize: number;
  private readonly minConsensus: number;
  private readonly emptyThreshold: number;

  private window: DebounceFrame[] = [];
  private readonly voteCounts: Map<string, number> = new Map();
  private readonly itemsBySig: Map<string, DetectedMoneyItem[]> = new Map();
  private consecutiveEmptyFrames: number = 0;
  private currentState: DebounceState = 'EMPTY';
  private currentStableSignature: string = 'EMPTY';
  private currentStableItems: DetectedMoneyItem[] = [];
  private listeners: Set<DebounceListener> = new Set();

  constructor(options?: DebounceFilterOptions) {
    this.windowSize = Math.max(1, options?.windowSize ?? 5);
    this.minConsensus = Math.max(1, Math.min(this.windowSize, options?.minConsensus ?? 4));
    this.emptyThreshold = Math.max(1, options?.emptyThreshold ?? 3);
  }

  public getOptions(): Required<DebounceFilterOptions> {
    return {
      windowSize: this.windowSize,
      minConsensus: this.minConsensus,
      emptyThreshold: this.emptyThreshold,
    };
  }

  public getState(): DebounceState {
    return this.currentState;
  }

  public getStableSignature(): string {
    return this.currentStableSignature;
  }

  public getStableItems(): DetectedMoneyItem[] {
    return [...this.currentStableItems];
  }

  public getWindow(): readonly DebounceFrame[] {
    return this.window;
  }

  public getConsecutiveEmptyFrames(): number {
    return this.consecutiveEmptyFrames;
  }

  /**
   * Process an incoming frame through the 5-frame sliding window majority vote filter.
   */
  public process(
    input:
      | DetectedMoneyItem[]
      | { items: DetectedMoneyItem[] }
      | DetectionResult
      | null
      | undefined,
    timestamp?: number
  ): DebounceFilterResult {
    let rawItems: DetectedMoneyItem[] = [];
    let rawResult: DetectionResult | null = null;

    if (input) {
      if (Array.isArray(input)) {
        rawItems = input;
      } else if (typeof input === 'object') {
        const anyInput = input as any;
        if (Array.isArray(anyInput.items)) {
          rawItems = anyInput.items;
          rawResult = input as DetectionResult;
        } else if (anyInput.nativeEvent && Array.isArray(anyInput.nativeEvent.items)) {
          rawItems = anyInput.nativeEvent.items;
          rawResult = anyInput.nativeEvent as DetectionResult;
        }
      }
    }

    const aggregatedItems = aggregateDebounceItems(rawItems);
    const frameSig = computeDebounceSignature(aggregatedItems);
    const ts = timestamp ?? Date.now();

    // Track consecutive empty frames
    if (frameSig === 'EMPTY') {
      this.consecutiveEmptyFrames++;
    } else {
      this.consecutiveEmptyFrames = 0;
    }

    // Push into sliding window
    if (this.window.length >= this.windowSize) {
      const popped = this.window.shift()!;
      const count = (this.voteCounts.get(popped.signature) || 1) - 1;
      if (count <= 0) {
        this.voteCounts.delete(popped.signature);
        this.itemsBySig.delete(popped.signature);
      } else {
        this.voteCounts.set(popped.signature, count);
      }
    }

    this.window.push({
      items: aggregatedItems,
      signature: frameSig,
      timestamp: ts,
      rawResult,
    });

    this.voteCounts.set(
      frameSig,
      (this.voteCounts.get(frameSig) || 0) + 1
    );
    this.itemsBySig.set(frameSig, aggregatedItems);

    let winningSig = 'EMPTY';
    let winningCount = 0;
    for (const [sig, count] of this.voteCounts.entries()) {
      if (count > winningCount) {
        winningCount = count;
        winningSig = sig;
      }
    }

    const oldStableSig = this.currentStableSignature;
    let stateChanged = false;
    let isEmptied = false;

    // Rule 1: Money Withdrawn (Empty threshold reached or consensus empty)
    if (
      this.consecutiveEmptyFrames >= this.emptyThreshold ||
      (winningSig === 'EMPTY' && winningCount >= this.minConsensus) ||
      (oldStableSig === 'EMPTY' && winningSig === 'EMPTY')
    ) {
      this.currentState = 'EMPTY';
      if (oldStableSig !== 'EMPTY') {
        this.currentStableSignature = 'EMPTY';
        this.currentStableItems = [];
        stateChanged = true;
        isEmptied = true;
      }
    } else if (winningSig !== 'EMPTY' && winningCount >= this.minConsensus) {
      // Rule 2: Consensus reached for banknote(s) (>= 4/5 frames)
      this.currentState = 'STABLE';
      if (winningSig !== oldStableSig) {
        this.currentStableSignature = winningSig;
        this.currentStableItems = this.itemsBySig.get(winningSig) || [];
        stateChanged = true;
        isEmptied = false;
      }
    } else {
      // Rule 3: Jitter / Stabilizing (no consensus, preserve previous stable state)
      this.currentState = 'STABILIZING';
      stateChanged = false;
      isEmptied = false;
    }

    const totalAmount = this.currentStableItems.reduce(
      (sum, i) => sum + i.totalAmount,
      0
    );
    const totalNotesCount = this.currentStableItems.reduce(
      (sum, i) => sum + i.count,
      0
    );
    const hasMoney = totalNotesCount > 0 && this.currentState !== 'EMPTY';

    const result: DebounceFilterResult = {
      state: this.currentState,
      stateChanged,
      isEmptied,
      signature: this.currentStableSignature,
      items: [...this.currentStableItems],
      totalAmount,
      totalNotesCount,
      hasMoney,
      consensusCount:
        winningSig === this.currentStableSignature ? winningCount : 0,
      candidateSignature: winningSig,
      candidateCount: winningCount,
      windowSize: this.window.length,
      consecutiveEmptyFrames: this.consecutiveEmptyFrames,
      timestamp: ts,
    };

    this.notifyListeners(result);
    return result;
  }

  /**
   * Instantly force a stable detection state (bypasses sliding window delay)
   * Designed for simulation controls and instant testing overrides.
   */
  public forceStable(
    input:
      | DetectedMoneyItem[]
      | { items: DetectedMoneyItem[] }
      | DetectionResult
      | null
      | undefined,
    timestamp?: number
  ): DebounceFilterResult {
    let rawItems: DetectedMoneyItem[] = [];
    if (input) {
      if (Array.isArray(input)) {
        rawItems = input;
      } else if (typeof input === 'object' && Array.isArray((input as any).items)) {
        rawItems = (input as any).items;
      }
    }

    const aggregated = aggregateDebounceItems(rawItems);
    const sig = computeDebounceSignature(aggregated);
    const ts = timestamp ?? Date.now();

    const oldStableSig = this.currentStableSignature;
    this.reset();
    for (let i = 0; i < this.windowSize; i++) {
      this.window.push({
        items: aggregated,
        signature: sig,
        timestamp: ts,
      });
    }

    this.voteCounts.set(sig, this.windowSize);
    this.itemsBySig.set(sig, aggregated);

    this.currentStableSignature = sig;
    this.currentStableItems = aggregated;
    this.currentState = sig === 'EMPTY' ? 'EMPTY' : 'STABLE';
    this.consecutiveEmptyFrames = sig === 'EMPTY' ? this.emptyThreshold : 0;

    const totalAmount = aggregated.reduce((sum, i) => sum + i.totalAmount, 0);
    const totalNotesCount = aggregated.reduce((sum, i) => sum + i.count, 0);
    const isEmptied = sig === 'EMPTY' && oldStableSig !== 'EMPTY';
    const stateChanged = sig !== oldStableSig;

    const result: DebounceFilterResult = {
      state: this.currentState,
      stateChanged,
      isEmptied,
      signature: sig,
      items: [...aggregated],
      totalAmount,
      totalNotesCount,
      hasMoney: totalNotesCount > 0,
      consensusCount: this.windowSize,
      candidateSignature: sig,
      candidateCount: this.windowSize,
      windowSize: this.windowSize,
      consecutiveEmptyFrames: this.consecutiveEmptyFrames,
      timestamp: ts,
    };

    this.notifyListeners(result);
    return result;
  }

  /**
   * Reset filter buffer to empty state
   */
  public reset(): void {
    this.window = [];
    this.voteCounts.clear();
    this.itemsBySig.clear();
    this.consecutiveEmptyFrames = 0;
    this.currentState = 'EMPTY';
    this.currentStableSignature = 'EMPTY';
    this.currentStableItems = [];
  }

  public addListener(listener: DebounceListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(result: DebounceFilterResult): void {
    for (const listener of this.listeners) {
      try {
        listener(result);
      } catch (err) {
        console.error('[TemporalDebounceFilter] Listener error:', err);
      }
    }
  }

  public destroy(): void {
    this.listeners.clear();
    this.reset();
  }
}

export const PRESENTATION_EMPTY_RESET_MS = 1200;
export const PRESENTATION_CONTINUITY_GRACE_MS = 1500;
export const DENOMINATION_REFINEMENT_WINDOW_MS = 1500;

export interface PresentationWalletUpdateResult {
  addedItems: DetectedMoneyItem[];
  addedAmount: number;
  addedCount: number;
  walletItems: DetectedMoneyItem[];
  walletTotalAmount: number;
  walletTotalCount: number;
  presentationReset: boolean;
}

/**
 * Ticket 13: Multi-Note Presentation Wallet Accumulator.
 * Reconciles per-presentation note counts across sequential 1->2 convergence,
 * 2->1->2 occlusion flicker, single-note camera panning, brief (< 1500ms) empty
 * grip-adjustment dropouts, and simultaneous same-count multi-note denomination refinement.
 */
export class PresentationWalletAccumulator {
  private readonly presentationEmptyResetMs: number;
  private readonly presentationContinuityGraceMs: number;
  private readonly denominationRefinementWindowMs: number;

  private baselineCounts: Map<MoneyClass, number> = new Map();
  private presentationCreditedCounts: Map<MoneyClass, number> = new Map();
  private presentationPeakTotalNotes: number = 0;
  private lastActiveCounts: Map<MoneyClass, number> = new Map();
  private lastActiveTimestampMs: number = 0;
  private wasEmpty: boolean = true;
  private lastEmptyTimestampMs: number = 0;
  private lastPresentationCreditedCounts: Map<MoneyClass, number> = new Map();
  private lastPresentationPeakTotalNotes: number = 0;
  private emptySinceTimestamp: number | null = null;

  constructor(options?: {
    presentationEmptyResetMs?: number;
    presentationContinuityGraceMs?: number;
    denominationRefinementWindowMs?: number;
  }) {
    this.presentationEmptyResetMs =
      options?.presentationEmptyResetMs ?? PRESENTATION_EMPTY_RESET_MS;
    this.presentationContinuityGraceMs =
      options?.presentationContinuityGraceMs ?? PRESENTATION_CONTINUITY_GRACE_MS;
    this.denominationRefinementWindowMs =
      options?.denominationRefinementWindowMs ?? DENOMINATION_REFINEMENT_WINDOW_MS;
  }

  private getCombinedWalletCounts(): Map<MoneyClass, number> {
    const combined = new Map<MoneyClass, number>();
    for (const [denom, count] of this.baselineCounts.entries()) {
      if (count > 0) {
        combined.set(denom, (combined.get(denom) || 0) + count);
      }
    }
    for (const [denom, count] of this.presentationCreditedCounts.entries()) {
      if (count > 0) {
        combined.set(denom, (combined.get(denom) || 0) + count);
      }
    }
    return combined;
  }

  private buildWalletItemsFromCounts(counts: Map<MoneyClass, number>): DetectedMoneyItem[] {
    const raw: DetectedMoneyItem[] = [];
    for (const [denom, count] of counts.entries()) {
      if (count > 0) {
        raw.push({
          classId: denom,
          count,
          label: DENOMINATION_NAMES[denom] || String(denom),
          totalAmount: denom * count,
        });
      }
    }
    return aggregateDebounceItems(raw);
  }

  private computeAddedDelta(
    prevWalletCounts: Map<MoneyClass, number>,
    nextWalletCounts: Map<MoneyClass, number>
  ): { addedItems: DetectedMoneyItem[]; addedAmount: number; addedCount: number } {
    const rawAdded: DetectedMoneyItem[] = [];
    let addedAmount = 0;
    let addedCount = 0;
    for (const [denom, nextCount] of nextWalletCounts.entries()) {
      const prevCount = prevWalletCounts.get(denom) || 0;
      const diff = nextCount - prevCount;
      if (diff > 0) {
        rawAdded.push({
          classId: denom,
          count: diff,
          label: DENOMINATION_NAMES[denom] || String(denom),
          totalAmount: denom * diff,
        });
        addedAmount += denom * diff;
        addedCount += diff;
      }
    }
    return {
      addedItems: aggregateDebounceItems(rawAdded),
      addedAmount,
      addedCount,
    };
  }

  public onEmptyFrame(nowMs: number = Date.now()): PresentationWalletUpdateResult {
    if (this.emptySinceTimestamp === null) {
      this.emptySinceTimestamp = nowMs;
    }

    if (!this.wasEmpty) {
      this.lastPresentationCreditedCounts = new Map(this.presentationCreditedCounts);
      this.lastPresentationPeakTotalNotes = this.presentationPeakTotalNotes;
      this.lastEmptyTimestampMs = nowMs;

      for (const [denom, count] of this.presentationCreditedCounts.entries()) {
        if (count > 0) {
          this.baselineCounts.set(denom, (this.baselineCounts.get(denom) || 0) + count);
        }
      }

      this.presentationCreditedCounts.clear();
      this.presentationPeakTotalNotes = 0;
      this.lastActiveCounts.clear();
      this.wasEmpty = true;
    }

    const elapsedEmpty = Math.max(0, nowMs - this.emptySinceTimestamp);
    let presentationReset = false;
    if (elapsedEmpty >= this.presentationEmptyResetMs) {
      if (this.lastPresentationCreditedCounts.size > 0) {
        presentationReset = true;
      }
      if (elapsedEmpty >= this.presentationContinuityGraceMs) {
        this.lastPresentationCreditedCounts.clear();
        this.lastPresentationPeakTotalNotes = 0;
      }
    }

    const snapshot = this.createWalletSnapshot();
    return {
      addedItems: [],
      addedAmount: 0,
      addedCount: 0,
      ...snapshot,
      presentationReset,
    };
  }

  public onStableDetection(
    newItems: DetectedMoneyItem[],
    nowMs: number = Date.now()
  ): PresentationWalletUpdateResult {
    const aggregated = aggregateDebounceItems(newItems || []);
    const newCounts = new Map<MoneyClass, number>();
    let newTotalNotes = 0;

    for (const item of aggregated) {
      if (item.count > 0) {
        newCounts.set(item.classId, (newCounts.get(item.classId) || 0) + item.count);
        newTotalNotes += item.count;
      }
    }

    if (newTotalNotes === 0) {
      return this.onEmptyFrame(nowMs);
    }

    const prevWalletCounts = this.getCombinedWalletCounts();
    this.emptySinceTimestamp = null;

    if (this.wasEmpty) {
      const emptyGapMs = Math.max(0, nowMs - this.lastEmptyTimestampMs);
      let sharesDenomination = false;
      let isSubsetOfLastCredited = true;

      for (const [denom, count] of newCounts.entries()) {
        const lastCredited = this.lastPresentationCreditedCounts.get(denom) || 0;
        if (lastCredited > 0) {
          sharesDenomination = true;
        }
        if (count > lastCredited) {
          isSubsetOfLastCredited = false;
        }
      }

      const isMultiNoteDropoutExpansion =
        this.lastPresentationPeakTotalNotes > 0 &&
        emptyGapMs < this.presentationContinuityGraceMs &&
        newTotalNotes > this.lastPresentationPeakTotalNotes &&
        sharesDenomination;

      const isBriefSameNoteFlicker =
        this.lastPresentationPeakTotalNotes > 0 &&
        emptyGapMs < this.presentationEmptyResetMs &&
        sharesDenomination &&
        isSubsetOfLastCredited;

      if (isMultiNoteDropoutExpansion || isBriefSameNoteFlicker) {
        // Un-commit lastPresentationCreditedCounts from baselineCounts and resume interrupted presentation
        for (const [denom, count] of this.lastPresentationCreditedCounts.entries()) {
          const base = this.baselineCounts.get(denom) || 0;
          const remaining = Math.max(0, base - count);
          if (remaining > 0) {
            this.baselineCounts.set(denom, remaining);
          } else {
            this.baselineCounts.delete(denom);
          }
        }
        this.presentationCreditedCounts = new Map(this.lastPresentationCreditedCounts);
        this.presentationPeakTotalNotes = this.lastPresentationPeakTotalNotes;
        this.wasEmpty = false;
      } else {
        // Genuinely new presentation
        this.wasEmpty = false;
        this.presentationCreditedCounts = new Map(newCounts);
        this.presentationPeakTotalNotes = newTotalNotes;
        this.lastActiveCounts = new Map(newCounts);
        this.lastActiveTimestampMs = nowMs;

        const nextWalletCounts = this.getCombinedWalletCounts();
        const delta = this.computeAddedDelta(prevWalletCounts, nextWalletCounts);
        const snapshot = this.createWalletSnapshot();
        return {
          ...delta,
          ...snapshot,
          presentationReset: false,
        };
      }
    }

    // Continuous presentation reconciliation (!this.wasEmpty)
    let creditedTotalNotes = 0;
    for (const count of this.presentationCreditedCounts.values()) {
      creditedTotalNotes += count;
    }
    let lastActiveTotalNotes = 0;
    for (const count of this.lastActiveCounts.values()) {
      lastActiveTotalNotes += count;
    }

    let isSubsetOrEqual = true;
    for (const [denom, count] of newCounts.entries()) {
      if (count > (this.presentationCreditedCounts.get(denom) || 0)) {
        isSubsetOrEqual = false;
        break;
      }
    }

    if (isSubsetOrEqual) {
      // Case 2A: Subset / equal occlusion flicker -> no change to presentationCreditedCounts
    } else if (
      newTotalNotes === creditedTotalNotes &&
      newTotalNotes >= 2 &&
      lastActiveTotalNotes === newTotalNotes &&
      Math.max(0, nowMs - this.lastActiveTimestampMs) <= this.denominationRefinementWindowMs
    ) {
      // Case 2B: Simultaneous same-count multi-note denomination refinement in place
      this.presentationCreditedCounts = new Map(newCounts);
    } else {
      // Case 2C: General expansion / addition (per-denomination high-water mark)
      for (const [denom, count] of newCounts.entries()) {
        const prevCredited = this.presentationCreditedCounts.get(denom) || 0;
        if (count > prevCredited) {
          this.presentationCreditedCounts.set(denom, count);
        }
      }
      let updatedCreditedTotal = 0;
      for (const count of this.presentationCreditedCounts.values()) {
        updatedCreditedTotal += count;
      }
      this.presentationPeakTotalNotes = Math.max(
        this.presentationPeakTotalNotes,
        updatedCreditedTotal
      );
    }

    this.lastActiveCounts = new Map(newCounts);
    this.lastActiveTimestampMs = nowMs;

    const nextWalletCounts = this.getCombinedWalletCounts();
    const delta = this.computeAddedDelta(prevWalletCounts, nextWalletCounts);
    const snapshot = this.createWalletSnapshot();
    return {
      ...delta,
      ...snapshot,
      presentationReset: false,
    };
  }

  private createWalletSnapshot(): {
    walletItems: DetectedMoneyItem[];
    walletTotalAmount: number;
    walletTotalCount: number;
  } {
    const walletItems = this.getWalletItems();
    let walletTotalAmount = 0;
    let walletTotalCount = 0;
    for (let i = 0; i < walletItems.length; i++) {
      walletTotalAmount += walletItems[i].totalAmount;
      walletTotalCount += walletItems[i].count;
    }
    return { walletItems, walletTotalAmount, walletTotalCount };
  }

  public updatePresentation(
    debouncedResult: Pick<DebounceFilterResult, 'state' | 'items'>,
    now: number = Date.now()
  ): PresentationWalletUpdateResult {
    const items = debouncedResult.items || [];
    if (debouncedResult.state === 'EMPTY' || items.length === 0) {
      return this.onEmptyFrame(now);
    }
    if (debouncedResult.state === 'STABLE' && items.length > 0) {
      return this.onStableDetection(items, now);
    }
    this.emptySinceTimestamp = null;
    const snapshot = this.createWalletSnapshot();
    return {
      addedItems: [],
      addedAmount: 0,
      addedCount: 0,
      ...snapshot,
      presentationReset: false,
    };
  }

  public getWalletItems(): DetectedMoneyItem[] {
    return this.buildWalletItemsFromCounts(this.getCombinedWalletCounts());
  }

  public getWalletTotalAmount(): number {
    return this.createWalletSnapshot().walletTotalAmount;
  }

  public getWalletTotalCount(): number {
    return this.createWalletSnapshot().walletTotalCount;
  }

  public getPresentationMaxCounts(): ReadonlyMap<MoneyClass, number> {
    return this.presentationCreditedCounts.size > 0
      ? this.presentationCreditedCounts
      : this.lastPresentationCreditedCounts;
  }

  public clearPresentationMaxCounts(): void {
    this.presentationCreditedCounts.clear();
    this.lastPresentationCreditedCounts.clear();
    this.presentationPeakTotalNotes = 0;
    this.lastPresentationPeakTotalNotes = 0;
    this.emptySinceTimestamp = null;
  }

  public reset(): void {
    this.baselineCounts.clear();
    this.presentationCreditedCounts.clear();
    this.presentationPeakTotalNotes = 0;
    this.lastActiveCounts.clear();
    this.lastActiveTimestampMs = 0;
    this.wasEmpty = true;
    this.lastEmptyTimestampMs = 0;
    this.lastPresentationCreditedCounts.clear();
    this.lastPresentationPeakTotalNotes = 0;
    this.emptySinceTimestamp = null;
  }
}

