/**
 * Audio Queue Manager for MoneyVision
 * Plays sequential audio clips with ultra-low latency, natural pacing,
 * and robust interruption handling.
 */

import { createDefaultAudioDriver } from './AudioDriver.ts';
import type {
  AudioDriver,
  AudioPlaybackOptions,
  QueueState,
  SoundClipId,
} from './types.ts';

export type QueueStateListener = (state: {
  queueState: QueueState;
  currentClip: SoundClipId | null;
  isPlaying: boolean;
}) => void;

export class AudioQueueManager {
  private driver: AudioDriver;
  private currentSequenceId: number = 0;
  private queueState: QueueState = 'IDLE';
  private currentClip: SoundClipId | null = null;
  private defaultInterClipDelayMs: number;
  private listeners: Set<QueueStateListener> = new Set();
  private pendingDelayTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    driver?: AudioDriver,
    defaultInterClipDelayMs: number = 30
  ) {
    this.driver = driver ?? createDefaultAudioDriver();
    this.defaultInterClipDelayMs = defaultInterClipDelayMs;
  }

  public getDriver(): AudioDriver {
    return this.driver;
  }

  public setDriver(driver: AudioDriver): void {
    this.stopSync();
    this.driver = driver;
  }

  public isPlaying(): boolean {
    return this.queueState === 'PLAYING';
  }

  public getCurrentClip(): SoundClipId | null {
    return this.currentClip;
  }

  public getQueueState(): QueueState {
    return this.queueState;
  }

  public subscribe(listener: QueueStateListener): () => void {
    this.listeners.add(listener);
    // Initial call
    listener({
      queueState: this.queueState,
      currentClip: this.currentClip,
      isPlaying: this.isPlaying(),
    });
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyStateChange(): void {
    const snapshot = {
      queueState: this.queueState,
      currentClip: this.currentClip,
      isPlaying: this.isPlaying(),
    };
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        // Suppress listener error
      }
    }
  }

  /**
   * Plays a list of audio clips in strict sequential order.
   * Resolves true if finished completely, or false if interrupted.
   */
  public async playSequence(
    clips: SoundClipId[],
    options?: AudioPlaybackOptions
  ): Promise<boolean> {
    if (!clips || clips.length === 0) {
      return true;
    }

    // Cancel any previous sequence
    this.stopSync();

    const seqId = ++this.currentSequenceId;
    this.queueState = 'PLAYING';
    const interClipDelay =
      options?.delayBetweenClipsMs ?? this.defaultInterClipDelayMs;

    for (let i = 0; i < clips.length; i++) {
      if (this.currentSequenceId !== seqId) {
        options?.onInterrupted?.();
        return false;
      }

      const clip = clips[i];
      this.currentClip = clip;
      this.notifyStateChange();
      options?.onClipStart?.(clip);

      try {
        await this.driver.play(clip);
      } catch {
        // Playback was stopped/interrupted
        if (this.currentSequenceId !== seqId) {
          options?.onInterrupted?.();
          return false;
        }
      }

      if (this.currentSequenceId !== seqId) {
        options?.onInterrupted?.();
        return false;
      }

      // Small natural delay between words
      if (i < clips.length - 1 && interClipDelay > 0) {
        const kept = await this.waitDelay(interClipDelay, seqId);
        if (!kept || this.currentSequenceId !== seqId) {
          options?.onInterrupted?.();
          return false;
        }
      }
    }

    if (this.currentSequenceId === seqId) {
      this.currentClip = null;
      this.queueState = 'IDLE';
      this.notifyStateChange();
      options?.onComplete?.();
      return true;
    }

    options?.onInterrupted?.();
    return false;
  }

  /**
   * Convenient helper to play a single clip
   */
  public async playClip(
    clip: SoundClipId,
    options?: AudioPlaybackOptions
  ): Promise<boolean> {
    return this.playSequence([clip], options);
  }

  /**
   * Speaks custom Vietnamese text directly via the underlying driver's TTS engine
   */
  public async speakText(text: string): Promise<boolean> {
    if (!text || text.trim().length === 0) {
      return false;
    }
    this.stopSync();
    if (typeof this.driver.speakText === 'function') {
      try {
        await this.driver.speakText(text.trim());
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Immediately halts current speech and discards remaining queue
   */
  public async stop(): Promise<void> {
    this.stopSync();
    await this.driver.stop();
  }

  private stopSync(): void {
    this.currentSequenceId++;
    if (this.pendingDelayTimer !== null) {
      clearTimeout(this.pendingDelayTimer);
      this.pendingDelayTimer = null;
    }
    this.currentClip = null;
    this.queueState = 'IDLE';
    this.notifyStateChange();
  }

  private waitDelay(ms: number, seqId: number): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      this.pendingDelayTimer = setTimeout(() => {
        this.pendingDelayTimer = null;
        resolve(this.currentSequenceId === seqId);
      }, ms);
    });
  }

  public destroy(): void {
    this.stopSync();
    this.driver.destroy();
    this.listeners.clear();
  }
}
