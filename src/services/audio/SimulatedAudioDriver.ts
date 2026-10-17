/**
 * Simulated Audio Driver for MoneyVision
 * High-performance, zero-dependency mock audio driver for headless tests,
 * state machine verification, and development simulation.
 */

import type { AudioDriver, SoundClipId } from './types';

export class SimulatedAudioDriver implements AudioDriver {
  private activeClip: SoundClipId | null = null;
  private playedClips: SoundClipId[] = [];
  private spokenTexts: string[] = [];
  private activeTimer: ReturnType<typeof setTimeout> | null = null;
  private rejectCurrent: ((reason?: any) => void) | null = null;
  private resolveCurrent: (() => void) | null = null;
  private clipDurationMs: number;

  constructor(clipDurationMs: number = 20) {
    this.clipDurationMs = clipDurationMs;
  }

  public setClipDurationMs(ms: number): void {
    this.clipDurationMs = ms;
  }

  public getPlayedClips(): SoundClipId[] {
    return [...this.playedClips];
  }

  public getSpokenTexts(): string[] {
    return [...this.spokenTexts];
  }

  public getActiveClip(): SoundClipId | null {
    return this.activeClip;
  }

  public clearHistory(): void {
    this.playedClips = [];
    this.spokenTexts = [];
  }

  public play(clipId: SoundClipId): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // If already playing something, stop it first
      this.stopSync();

      this.activeClip = clipId;
      this.playedClips.push(clipId);
      this.resolveCurrent = resolve;
      this.rejectCurrent = reject;

      if (this.clipDurationMs <= 0) {
        this.activeClip = null;
        this.resolveCurrent = null;
        this.rejectCurrent = null;
        resolve();
        return;
      }

      this.activeTimer = setTimeout(() => {
        this.activeClip = null;
        this.activeTimer = null;
        const res = this.resolveCurrent;
        this.resolveCurrent = null;
        this.rejectCurrent = null;
        if (res) res();
      }, this.clipDurationMs);
    });
  }

  public speakText(text: string): Promise<void> {
    this.stopSync();
    if (text && text.trim().length > 0) {
      this.spokenTexts.push(text.trim());
    }
    return Promise.resolve();
  }

  public stop(): Promise<void> {
    this.stopSync();
    return Promise.resolve();
  }

  private stopSync(): void {
    if (this.activeTimer !== null) {
      clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
    if (this.rejectCurrent) {
      const rej = this.rejectCurrent;
      this.rejectCurrent = null;
      this.resolveCurrent = null;
      rej(new Error('Audio playback interrupted by stop()'));
    }
    this.activeClip = null;
  }

  public isAvailable(): boolean {
    return true;
  }

  public destroy(): void {
    this.stopSync();
    this.playedClips = [];
    this.spokenTexts = [];
  }
}
