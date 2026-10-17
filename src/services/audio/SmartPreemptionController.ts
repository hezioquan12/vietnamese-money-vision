/**
 * Smart Preemption Controller for MoneyVision
 * Coordinates the Smart Hybrid Preemption engine and Cooldown policy.
 *
 * Requirements:
 * 1. Frame Emptied (M = ∅):
 *    - Immediately halts active speech (hard stop()).
 *    - Cancels any pending queue.
 *    - Immediately plays earcon 'empty' (empty.wav).
 *    - Emits short 50ms haptic feedback.
 * 2. Money Added / Changed (M_new ≠ M_old):
 *    - If speaking: lets current speech finish naturally, then immediately plays the latest update.
 *    - If multiple updates occur during speech, collapses to the most recent state.
 *    - Syntax: 1 note -> denomination only; multiple notes -> [Quantity] + [Denomination].
 * 3. Cooldown / Silence Period (1.5s):
 *    - Suppresses redundant repeated speech if the banknotes in frame remain unchanged.
 * 4. Gesture Audio Integration:
 *    - Single Tap: Re-reads current status (bypasses cooldown).
 *    - Double Tap: Plays torch_on / torch_off earcon.
 *    - Long Press: Plays accumulated session wallet sequence.
 *    - Two-Finger Double Tap: Plays wallet_reset earcon.
 */

import type { DetectedMoneyItem, SessionWalletState } from '../../types/money.ts';
import { AudioQueueManager } from './AudioQueueManager.ts';
import {
  buildDetectionAudioSequence,
  buildWalletAudioSequence,
} from './audioRegistry.ts';
import { createDefaultAudioDriver } from './AudioDriver.ts';
import type {
  AudioDriver,
  HapticNotifier,
  PreemptionControllerOptions,
  SoundClipId,
} from './types.ts';

import {
  CANDIDATE_GUIDANCE_COOLDOWN_MS,
  getDenominationVibrationPattern,
} from '../haptics.ts';

export class DefaultHapticNotifier implements HapticNotifier {
  public detectedCount: number = 0;
  public removedCount: number = 0;
  public autoTorchCount: number = 0;
  public doubleTapCount: number = 0;
  public candidateGuidanceCount: number = 0;
  public lastDetectedDenomination: number | null = null;
  public lastDetectedPattern: number[] = [];
  private lastCandidatePulseMs: number = 0;

  public triggerMoneyDetected(denomination?: number): void {
    this.detectedCount++;
    this.lastDetectedDenomination = denomination ?? null;
    this.lastDetectedPattern = getDenominationVibrationPattern(denomination);
  }

  public triggerMoneyRemoved(): void {
    this.removedCount++;
  }

  public triggerCandidateGuidancePulse(nowMs: number = Date.now()): boolean {
    if (
      this.lastCandidatePulseMs > 0 &&
      nowMs - this.lastCandidatePulseMs < CANDIDATE_GUIDANCE_COOLDOWN_MS
    ) {
      return false;
    }
    this.lastCandidatePulseMs = nowMs;
    this.candidateGuidanceCount++;
    return true;
  }

  public triggerAutoTorch(): void {
    this.autoTorchCount++;
  }

  public triggerDoubleTap(): void {
    this.doubleTapCount++;
  }

  public reset(): void {
    this.detectedCount = 0;
    this.removedCount = 0;
    this.autoTorchCount = 0;
    this.doubleTapCount = 0;
    this.candidateGuidanceCount = 0;
    this.lastDetectedDenomination = null;
    this.lastDetectedPattern = [];
    this.lastCandidatePulseMs = 0;
  }
}

export class SmartPreemptionController {
  private queueManager: AudioQueueManager;
  private cooldownMs: number;
  private presentationEmptyResetMs: number;
  private enableHaptics: boolean;
  private hapticNotifier: HapticNotifier;

  // State tracking
  private lastAnnouncedSignature: string = 'EMPTY';
  private lastAnnouncedTimestamp: number = 0;
  private pendingDetection: DetectedMoneyItem[] | null = null;
  private isProcessingSequence: boolean = false;
  private hadMoneyInLastFrame: boolean = false;
  private currentlyAnnouncingNotesCount: number = 0;
  private activeAnnouncementId: number = 0;
  private presentationPeakAnnouncedCounts: Map<number, number> = new Map();
  private presentationEmptyStartMs: number | null = null;
  private isReadingWallet: boolean = false;

  constructor(options?: PreemptionControllerOptions) {
    this.cooldownMs = options?.cooldownMs ?? 1500;
    this.presentationEmptyResetMs = options?.presentationEmptyResetMs ?? 1200;
    this.enableHaptics = options?.enableHaptics ?? true;
    this.hapticNotifier = options?.hapticNotifier ?? new DefaultHapticNotifier();
    const driver = options?.driver ?? createDefaultAudioDriver();
    this.queueManager = new AudioQueueManager(
      driver,
      options?.interClipGapMs ?? 35
    );
  }

  public getQueueManager(): AudioQueueManager {
    return this.queueManager;
  }

  public setDriver(driver: AudioDriver): void {
    this.queueManager.setDriver(driver);
  }

  public getHapticNotifier(): HapticNotifier {
    return this.hapticNotifier;
  }

  public setHapticNotifier(notifier: HapticNotifier): void {
    this.hapticNotifier = notifier;
  }

  public getCooldownMs(): number {
    return this.cooldownMs;
  }

  public getLastAnnouncedSignature(): string {
    return this.lastAnnouncedSignature;
  }

  public getLastAnnouncedTimestamp(): number {
    return this.lastAnnouncedTimestamp;
  }

  public isSpeaking(): boolean {
    return this.isProcessingSequence;
  }

  public isReadingWalletActive(): boolean {
    return this.isReadingWallet;
  }

  public resetPresentationPeak(): void {
    this.presentationPeakAnnouncedCounts.clear();
    this.presentationEmptyStartMs = null;
  }

  /**
   * Generates a stable deterministic signature for detection items
   */
  public computeSignature(items: DetectedMoneyItem[]): string {
    if (!items || items.length === 0) return 'EMPTY';
    const active = items.filter(i => i && i.count > 0);
    if (active.length === 0) return 'EMPTY';

    const countMap = new Map<number, number>();
    for (const item of active) {
      countMap.set(item.classId, (countMap.get(item.classId) || 0) + item.count);
    }

    return Array.from(countMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([classId, count]) => `${classId}:${count}`)
      .join('|');
  }

  /**
   * Main pipeline entry point: Handles camera/mock detection updates
   */
  public async handleDetectionUpdate(
    items: DetectedMoneyItem[],
    timestamp?: number
  ): Promise<void> {
    const now = timestamp ?? Date.now();
    const activeItems = (items || []).filter(i => i && i.count > 0);
    const hasMoney = activeItems.length > 0;
    const newSignature = this.computeSignature(activeItems);

    if (this.isReadingWallet) {
      if (!hasMoney) {
        this.hadMoneyInLastFrame = false;
        this.lastAnnouncedSignature = 'EMPTY';
        this.pendingDetection = null;
        this.presentationPeakAnnouncedCounts.clear();
      } else {
        this.pendingDetection = activeItems;
      }
      return;
    }

    // =========================================================================
    // Rule 1: Frame Emptied (Rút tiền ra / M = ∅)
    // Hard interrupt: immediately cut speech + play empty.wav + 50ms haptic
    // =========================================================================
    if (!hasMoney) {
      this.pendingDetection = null;
      if (this.presentationEmptyStartMs === null) {
        this.presentationEmptyStartMs = now;
      }
      if (now - this.presentationEmptyStartMs >= this.presentationEmptyResetMs) {
        this.presentationPeakAnnouncedCounts.clear();
      }

      if (this.hadMoneyInLastFrame || this.isSpeaking()) {
        this.hadMoneyInLastFrame = false;
        this.lastAnnouncedSignature = 'EMPTY';
        this.lastAnnouncedTimestamp = now;
        this.activeAnnouncementId++;
        this.currentlyAnnouncingNotesCount = 0;

        // 1. Hard cancel any ongoing speech
        await this.queueManager.stop();
        this.isProcessingSequence = false;

        // 2. Tactile feedback (50ms vibration)
        if (this.enableHaptics) {
          this.hapticNotifier.triggerMoneyRemoved();
        }

        // 3. Immediate earcon
        await this.queueManager.playClip('empty');
      }
      return;
    }

    if (this.presentationEmptyStartMs !== null) {
      if (now - this.presentationEmptyStartMs >= this.presentationEmptyResetMs) {
        this.presentationPeakAnnouncedCounts.clear();
      }
      this.presentationEmptyStartMs = null;
    }

    this.hadMoneyInLastFrame = true;

    // Aggregate counts by denomination for accurate peak comparison
    const currentCountMap = new Map<number, number>();
    let newTotalNotes = 0;
    for (const item of activeItems) {
      const nextCount = (currentCountMap.get(item.classId) || 0) + item.count;
      currentCountMap.set(item.classId, nextCount);
      newTotalNotes += item.count;
    }

    // =========================================================================
    // Rule 3: Cooldown / Silence Period (1.5s) & Downward-Flicker Suppression
    // If the banknote configuration in frame has not changed, or if a multi-note
    // presentation transiently flickered down to a subset of already-announced notes
    // (e.g. {50k: 2} -> {50k: 1} -> {50k: 2}), stay silent.
    // =========================================================================
    if (newSignature === this.lastAnnouncedSignature) {
      return;
    }

    let peakTotalNotes = 0;
    for (const count of this.presentationPeakAnnouncedCounts.values()) {
      peakTotalNotes += count;
    }

    if (peakTotalNotes >= 2 && newTotalNotes <= peakTotalNotes) {
      let isSubsetOrEqualToPeak = true;
      for (const [classId, count] of currentCountMap.entries()) {
        const peakCount = this.presentationPeakAnnouncedCounts.get(classId) || 0;
        if (count > peakCount) {
          isSubsetOrEqualToPeak = false;
          break;
        }
      }
      if (isSubsetOrEqualToPeak) {
        return;
      }
    }

    // =========================================================================
    // Rule 2: Money Added or Changed (M_new ≠ M_old)
    // Ticket 13 Upgrade Preemption: If total note count strictly increased while
    // speaking (e.g. 1 note -> 2 notes as 2nd note finishes stabilizing), immediately
    // preempt stale 1-note speech and announce the upgraded multi-note count.
    // Otherwise (1-note -> 1-note change), wait for speech to finish naturally.
    // =========================================================================
    if (this.isSpeaking()) {
      if (
        this.currentlyAnnouncingNotesCount > 0 &&
        newTotalNotes > this.currentlyAnnouncingNotesCount
      ) {
        this.pendingDetection = null;
        const upgradeAnnouncementId = ++this.activeAnnouncementId;
        this.isProcessingSequence = true;
        this.currentlyAnnouncingNotesCount = newTotalNotes;
        await this.queueManager.stop();
        if (this.activeAnnouncementId !== upgradeAnnouncementId) {
          return;
        }
        await this.startAnnouncement(
          activeItems,
          newSignature,
          false,
          true,
          upgradeAnnouncementId
        );
        return;
      }

      // Save freshest state to play right after current speech finishes
      this.pendingDetection = activeItems;
      return;
    }

    // Speech is idle -> play immediately
    const enteringFromEmpty = this.lastAnnouncedSignature === 'EMPTY';
    await this.startAnnouncement(activeItems, newSignature, enteringFromEmpty);
  }

  public triggerCandidateGuidancePulse(nowMs: number = Date.now()): boolean {
    if (!this.enableHaptics) return false;
    if (typeof this.hapticNotifier.triggerCandidateGuidancePulse === 'function') {
      return this.hapticNotifier.triggerCandidateGuidancePulse(nowMs);
    }
    return false;
  }

  private recordPresentationPeak(items: DetectedMoneyItem[]): void {
    const countMap = new Map<number, number>();
    for (const item of items) {
      if (item && item.count > 0) {
        countMap.set(item.classId, (countMap.get(item.classId) || 0) + item.count);
      }
    }
    for (const [classId, count] of countMap.entries()) {
      const prevPeak = this.presentationPeakAnnouncedCounts.get(classId) || 0;
      if (count > prevPeak) {
        this.presentationPeakAnnouncedCounts.set(classId, count);
      }
    }
  }

  /**
   * Starts playback of a detection announcement
   */
  private async startAnnouncement(
    items: DetectedMoneyItem[],
    signature: string,
    fromEmpty: boolean,
    shouldVibrate: boolean = true,
    providedAnnouncementId?: number
  ): Promise<void> {
    const announcementId =
      providedAnnouncementId ?? ++this.activeAnnouncementId;
    const activeItems = items.filter(i => i && i.count > 0);
    const totalNotes = activeItems.reduce((sum, i) => sum + i.count, 0);

    this.isProcessingSequence = true;
    this.currentlyAnnouncingNotesCount = totalNotes;

    if (shouldVibrate && this.enableHaptics) {
      const primaryDenom =
        activeItems.length > 0
          ? Math.max(...activeItems.map(i => i.classId))
          : undefined;
      this.hapticNotifier.triggerMoneyDetected(primaryDenom);
    }

    const speechClips = buildDetectionAudioSequence(activeItems);
    if (speechClips.length === 0) {
      if (this.activeAnnouncementId === announcementId) {
        this.isProcessingSequence = false;
        this.currentlyAnnouncingNotesCount = 0;
      }
      return;
    }

    // Record peak counts when announcement begins so downward flickers are suppressed
    this.recordPresentationPeak(activeItems);

    // When entering from empty, prefix with 'tick' earcon
    const clipsToPlay: SoundClipId[] = fromEmpty
      ? ['tick', ...speechClips]
      : speechClips;

    let completed = false;
    try {
      completed = await this.queueManager.playSequence(clipsToPlay);
    } finally {
      if (this.activeAnnouncementId === announcementId) {
        this.isProcessingSequence = false;
        this.currentlyAnnouncingNotesCount = 0;
      }
    }

    if (completed && this.activeAnnouncementId === announcementId) {
      this.lastAnnouncedSignature = signature;
      this.lastAnnouncedTimestamp = Date.now();

      // Check if a newer state arrived while we were speaking
      if (this.pendingDetection) {
        const nextItems = this.pendingDetection;
        this.pendingDetection = null;
        const nextSig = this.computeSignature(nextItems);

        if (nextSig !== this.lastAnnouncedSignature && nextSig !== 'EMPTY') {
          // Play the pending updated speech
          await this.startAnnouncement(nextItems, nextSig, false, true);
        }
      }
    } else if (this.activeAnnouncementId === announcementId) {
      this.pendingDetection = null;
    }
  }

  // ===========================================================================
  // Gestures Integration
  // ===========================================================================

  /**
   * Single Tap: Re-read detection or "Không có tiền" (bypasses cooldown)
   */
  public async handleSingleTap(
    currentItems: DetectedMoneyItem[]
  ): Promise<void> {
    this.isReadingWallet = false;
    this.activeAnnouncementId++;
    await this.queueManager.stop();
    this.isProcessingSequence = false;
    this.currentlyAnnouncingNotesCount = 0;
    this.pendingDetection = null;

    const hasMoney =
      currentItems &&
      currentItems.length > 0 &&
      currentItems.some(i => i.count > 0);

    if (!hasMoney) {
      await this.queueManager.playClip('empty');
      return;
    }

    const sig = this.computeSignature(currentItems);
    await this.startAnnouncement(currentItems, sig, false, false);
  }

  /**
   * Double Tap: Torch toggle earcon
   */
  public async handleDoubleTap(isTorchOn: boolean): Promise<void> {
    await this.playTorchEarcon(isTorchOn);
  }

  /**
   * Play torch earcon ('torch_on' or 'torch_off')
   */
  public async playTorchEarcon(isTorchOn: boolean): Promise<void> {
    const clip: SoundClipId = isTorchOn ? 'torch_on' : 'torch_off';
    await this.queueManager.playClip(clip);
  }

  /**
   * Long Press: Announce accumulated session wallet
   */
  public async handleLongPress(wallet: SessionWalletState): Promise<void> {
    this.isReadingWallet = true;
    const walletReadoutId = ++this.activeAnnouncementId;
    await this.queueManager.stop();
    this.isProcessingSequence = false;
    this.currentlyAnnouncingNotesCount = 0;
    this.pendingDetection = null;

    try {
      if (!wallet || wallet.totalAmount === 0 || wallet.totalNotesCount === 0) {
        this.isProcessingSequence = true;
        await this.queueManager.playClip('empty');
        return;
      }

      const clips = buildWalletAudioSequence(wallet);
      if (clips.length > 0) {
        this.isProcessingSequence = true;
        await this.queueManager.playSequence(clips);
      }
    } finally {
      if (this.activeAnnouncementId === walletReadoutId) {
        this.isReadingWallet = false;
        this.isProcessingSequence = false;
        this.currentlyAnnouncingNotesCount = 0;
      }
    }
  }

  /**
   * Two-Finger Double Tap: Reset session wallet
   */
  public async handleTwoFingerDoubleTap(): Promise<void> {
    this.isReadingWallet = false;
    this.activeAnnouncementId++;
    this.presentationPeakAnnouncedCounts.clear();
    this.presentationEmptyStartMs = null;
    await this.queueManager.stop();
    this.isProcessingSequence = false;
    this.currentlyAnnouncingNotesCount = 0;
    this.pendingDetection = null;

    await this.queueManager.playClip('wallet_reset');
  }

  private authorAnnouncementId: number = 0;

  /**
   * Author & Copyright Modal Trigger:
   * Speaks the Vietnamese author attribution on demand with tactile haptic feedback.
   * Debounces rapid repeated taps and prevents concurrent tick/TTS overlap.
   */
  public async handleAuthorInfoAnnouncement(
    spokenText: string = 'Ứng dụng thuộc sở hữu và phát triển độc lập bởi Nguyễn Quang Toàn'
  ): Promise<string> {
    this.isReadingWallet = false;
    const announcementId = ++this.authorAnnouncementId;
    this.activeAnnouncementId++;
    await this.queueManager.stop();
    if (announcementId !== this.authorAnnouncementId) {
      return spokenText;
    }

    this.isProcessingSequence = true;
    this.currentlyAnnouncingNotesCount = 0;
    this.pendingDetection = null;

    if (this.enableHaptics) {
      if (typeof this.hapticNotifier.triggerSingleTap === 'function') {
        this.hapticNotifier.triggerSingleTap();
      } else {
        this.hapticNotifier.triggerMoneyDetected();
      }
    }

    try {
      const tickCompleted = await this.queueManager.playClip('tick');
      if (!tickCompleted || announcementId !== this.authorAnnouncementId) {
        return spokenText;
      }
      await this.queueManager.speakText(spokenText);
    } finally {
      if (announcementId === this.authorAnnouncementId) {
        this.isProcessingSequence = false;
      }
    }
    return spokenText;
  }

  /**
   * Release and cleanup all resources
   */
  public destroy(): void {
    this.isReadingWallet = false;
    this.pendingDetection = null;
    this.isProcessingSequence = false;
    this.currentlyAnnouncingNotesCount = 0;
    this.presentationPeakAnnouncedCounts.clear();
    this.presentationEmptyStartMs = null;
    this.queueManager.destroy();
  }
}

