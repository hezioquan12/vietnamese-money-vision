/**
 * Audio Pipeline Types & Definitions for MoneyVision
 * 100% Offline Audio System for Visually Impaired Users
 */

import type { DetectedMoneyItem, MoneyClass, SessionWalletState } from '../../types/money';

// 9 Vietnamese Dong Denominations
export type DenominationClipId =
  | 'vnd_1k'
  | 'vnd_2k'
  | 'vnd_5k'
  | 'vnd_10k'
  | 'vnd_20k'
  | 'vnd_50k'
  | 'vnd_100k'
  | 'vnd_200k'
  | 'vnd_500k';

// Quantity / Note Count Clips ("Một tờ", "Hai tờ", ...)
export type QuantityClipId =
  | 'qty_1'
  | 'qty_2'
  | 'qty_3'
  | 'qty_4'
  | 'qty_5'
  | 'qty_6'
  | 'qty_7'
  | 'qty_8'
  | 'qty_9'
  | 'qty_10';

// Short Audio Cues (Earcons)
export type EarconClipId =
  | 'tick'
  | 'empty'
  | 'torch_on'
  | 'torch_off'
  | 'wallet_reset';

export type SoundClipId = DenominationClipId | QuantityClipId | EarconClipId;

export interface AudioClipMeta {
  id: SoundClipId;
  filename: string;
  category: 'denomination' | 'quantity' | 'earcon';
  labelVi: string;
  durationMsEstimate: number;
}

export interface AudioPlaybackOptions {
  /** Inter-clip delay in ms when playing sequences */
  delayBetweenClipsMs?: number;
  /** Callback fired when a clip starts */
  onClipStart?: (clipId: SoundClipId) => void;
  /** Callback fired when sequence finishes naturally */
  onComplete?: () => void;
  /** Callback fired if sequence was interrupted */
  onInterrupted?: () => void;
}

/**
 * Underlying audio playback driver interface
 */
export interface AudioDriver {
  /** Play a single clip, resolving when playback finishes */
  play(clipId: SoundClipId): Promise<void>;
  /** Speak Vietnamese text directly via TTS engine (optional) */
  speakText?(text: string): Promise<void>;
  /** Immediately halt any playing clip */
  stop(): Promise<void>;
  /** Check if driver is available in current runtime */
  isAvailable(): boolean;
  /** Release resources */
  destroy(): void;
}

export interface HapticNotifier {
  triggerMoneyDetected(denomination?: number): void;
  triggerMoneyRemoved(): void;
  triggerCandidateGuidancePulse?(nowMs?: number): boolean;
  triggerAutoTorch?(): void;
  triggerDoubleTap?(): void;
  triggerSingleTap?(): void;
  triggerLongPress?(): void;
  triggerTwoFingerDoubleTap?(): void;
}

export type QueueState = 'IDLE' | 'PLAYING' | 'INTERRUPTED';

export interface PreemptionControllerOptions {
  /** Cooldown silence period in ms (default: 1500ms) */
  cooldownMs?: number;
  /** Gap between sequential clips in ms (default: 35ms) */
  interClipGapMs?: number;
  /** Enable haptic synchronization */
  enableHaptics?: boolean;
  /** Custom audio driver */
  driver?: AudioDriver;
  /** Custom haptic notifier */
  hapticNotifier?: HapticNotifier;
  /** Empty-scene reset duration for presentation peak tracking (default: 1200ms) */
  presentationEmptyResetMs?: number;
}
