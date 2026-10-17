/**
 * Native Audio Driver for MoneyVision
 * Bridges React Native to MoneyAudioModule on Android (MediaPlayer + Native Vietnamese TTS fallback)
 * with fallback to SimulatedAudioDriver in headless/Node environments.
 */

import { createRequire } from 'node:module';
import type { AudioDriver, SoundClipId } from './types.ts';
import { AUDIO_CLIPS_META } from './audioRegistry.ts';
import { SimulatedAudioDriver } from './SimulatedAudioDriver.ts';

let RN: any = null;
try {
  const req = createRequire(import.meta.url);
  RN = req('react-native');
} catch {
  // Headless / Node testing environment without react-native installed
}

const Platform = RN?.Platform;
const NativeModules = RN?.NativeModules;

export class NativeAudioDriver implements AudioDriver {
  private fallbackDriver: SimulatedAudioDriver;
  private hasNativeModule: boolean;

  constructor() {
    this.fallbackDriver = new SimulatedAudioDriver(20);
    this.hasNativeModule =
      Platform?.OS === 'android' &&
      !!NativeModules?.MoneyAudioModule &&
      typeof NativeModules.MoneyAudioModule.playClip === 'function';
  }

  public async play(clipId: SoundClipId): Promise<void> {
    if (this.hasNativeModule) {
      try {
        const success = await NativeModules.MoneyAudioModule.playClip(clipId);
        if (!success && typeof NativeModules.MoneyAudioModule.speakText === 'function') {
          const meta = AUDIO_CLIPS_META[clipId];
          if (meta && meta.category !== 'earcon') {
            await NativeModules.MoneyAudioModule.speakText(meta.labelVi);
          }
        }
      } catch {
        // Fallback if native call throws
      }
      return;
    }
    return this.fallbackDriver.play(clipId);
  }

  public async speakText(text: string): Promise<void> {
    if (
      this.hasNativeModule &&
      typeof NativeModules.MoneyAudioModule.speakText === 'function'
    ) {
      try {
        await NativeModules.MoneyAudioModule.speakText(text);
      } catch {
        // Suppress TTS errors
      }
      return;
    }
    return this.fallbackDriver.speakText(text);
  }

  public async stop(): Promise<void> {
    if (this.hasNativeModule) {
      try {
        await NativeModules.MoneyAudioModule.stop();
      } catch {
        // Suppress native stop errors
      }
      return;
    }
    return this.fallbackDriver.stop();
  }

  public isAvailable(): boolean {
    return true;
  }

  public destroy(): void {
    if (this.hasNativeModule) {
      try {
        NativeModules.MoneyAudioModule.release?.();
      } catch {
        // Suppress release error
      }
    }
    this.fallbackDriver.destroy();
  }
}
