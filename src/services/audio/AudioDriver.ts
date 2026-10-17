/**
 * Audio Drivers for MoneyVision
 * Includes SimulatedAudioDriver for headless testing & development,
 * and NativeAudioDriver bridging to MoneyAudioModule on Android.
 */

import { createRequire } from 'node:module';
import type { AudioDriver } from './types.ts';
import { SimulatedAudioDriver } from './SimulatedAudioDriver.ts';
import { NativeAudioDriver } from './NativeAudioDriver.ts';

let RN: any = null;
try {
  const req = createRequire(import.meta.url);
  RN = req('react-native');
} catch {
  // Headless Node environment
}

const Platform = RN?.Platform;
const NativeModules = RN?.NativeModules;

export { SimulatedAudioDriver } from './SimulatedAudioDriver.ts';
export { NativeAudioDriver } from './NativeAudioDriver.ts';

/**
 * Creates the appropriate driver based on environment
 */
export function createDefaultAudioDriver(): AudioDriver {
  try {
    if (
      Platform?.OS === 'android' &&
      NativeModules?.MoneyAudioModule &&
      typeof NativeModules.MoneyAudioModule.playClip === 'function'
    ) {
      return new NativeAudioDriver();
    }
  } catch {
    // In Node.js or headless test environment Platform might not be fully configured
  }
  return new SimulatedAudioDriver(20);
}
