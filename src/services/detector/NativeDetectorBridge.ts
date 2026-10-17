/**
 * NativeDetectorBridge
 * TypeScript bridge interfacing with native MoneyDetectorModule.
 * Safely falls back to MockMoneyDetector in Node.js test environments
 * or when the native module is unavailable.
 */

import { createRequire } from 'node:module';
import type {
  MockScenario,
  DetectionResult,
} from './MockMoneyDetector.ts';
import { MockMoneyDetector } from './MockMoneyDetector.ts';
import { DEFAULT_INFERENCE_FPS } from './yoloConstants.ts';
import { TemporalDebounceFilter } from '../debounce/TemporalDebounceFilter.ts';

let RN: any = null;
try {
  const req = createRequire(import.meta.url);
  RN = req('react-native');
} catch {
  // Headless / Node testing environment without react-native
}

const Platform = RN?.Platform;
const NativeModules = RN?.NativeModules;
const DeviceEventEmitter = RN?.DeviceEventEmitter;

export interface NativeDetectorModuleInterface {
  isModelLoaded(): Promise<boolean>;
  isUsingMock(): Promise<boolean>;
  setInferenceFps(fps: number): Promise<boolean>;
  getInferenceFps(): Promise<number>;
  getLastDetection(): Promise<DetectionResult | null>;
  setMockScenario(scenario: string): Promise<boolean>;
  detectSimulatedFrame?(): Promise<DetectionResult>;
  reloadModel?(): Promise<boolean>;
  resetDebounceFilter?(): Promise<boolean>;
  getDebounceState?(): Promise<any>;
}

export class NativeDetectorBridge implements NativeDetectorModuleInterface {
  private fallbackMockDetector: MockMoneyDetector;
  private currentInferenceFps: number = DEFAULT_INFERENCE_FPS;
  private lastDetectionResult: DetectionResult | null = null;
  private listeners: Set<(result: DetectionResult) => void> = new Set();
  private nativeSubscription: any = null;
  private fallbackDebounceFilter: TemporalDebounceFilter = new TemporalDebounceFilter();

  constructor(initialScenario: MockScenario = 'SINGLE_50K') {
    this.fallbackMockDetector = new MockMoneyDetector(initialScenario);
    this.setupNativeListener();
  }

  private get module(): NativeDetectorModuleInterface | null {
    try {
      if (
        typeof Platform !== 'undefined' &&
        Platform.OS === 'android' &&
        typeof NativeModules !== 'undefined' &&
        NativeModules?.MoneyDetectorModule
      ) {
        return NativeModules.MoneyDetectorModule as NativeDetectorModuleInterface;
      }
    } catch {
      // In mock/test environments
    }
    return null;
  }

  private setupNativeListener(): void {
    if (DeviceEventEmitter && typeof DeviceEventEmitter.addListener === 'function') {
      try {
        this.nativeSubscription = DeviceEventEmitter.addListener(
          'onMoneyDetected',
          (result: DetectionResult) => {
            this.lastDetectionResult = result;
            this.notifyListeners(result);
          }
        );
      } catch {
        // Safe fallback in test environments
      }
    }
  }

  public async isModelLoaded(): Promise<boolean> {
    const native = this.module;
    if (native) {
      try {
        return await native.isModelLoaded();
      } catch (err) {
        console.warn('[NativeDetectorBridge] isModelLoaded error:', err);
      }
    }
    return this.fallbackMockDetector.isModelLoaded();
  }

  public async isUsingMock(): Promise<boolean> {
    const native = this.module;
    if (native) {
      try {
        return await native.isUsingMock();
      } catch (err) {
        console.warn('[NativeDetectorBridge] isUsingMock error:', err);
      }
    }
    return this.fallbackMockDetector.isMock();
  }

  public async setInferenceFps(fps: number): Promise<boolean> {
    const clampedFps = Math.max(8, Math.min(12, Math.round(fps)));
    this.currentInferenceFps = clampedFps;

    const native = this.module;
    if (native) {
      try {
        return await native.setInferenceFps(clampedFps);
      } catch (err) {
        console.warn('[NativeDetectorBridge] setInferenceFps error:', err);
      }
    }
    return true;
  }

  public async getInferenceFps(): Promise<number> {
    const native = this.module;
    if (native) {
      try {
        return await native.getInferenceFps();
      } catch (err) {
        console.warn('[NativeDetectorBridge] getInferenceFps error:', err);
      }
    }
    return this.currentInferenceFps;
  }

  public async getLastDetection(): Promise<DetectionResult | null> {
    const native = this.module;
    if (native) {
      try {
        const result = await native.getLastDetection();
        if (result) return result;
      } catch (err) {
        console.warn('[NativeDetectorBridge] getLastDetection error:', err);
      }
    }
    if (!this.lastDetectionResult) {
      this.lastDetectionResult = await this.fallbackMockDetector.detect();
    }
    return this.lastDetectionResult;
  }

  public async setMockScenario(scenario: MockScenario): Promise<boolean> {
    this.fallbackMockDetector.setScenario(scenario);
    const native = this.module;
    if (native) {
      try {
        return await native.setMockScenario(scenario);
      } catch (err) {
        console.warn('[NativeDetectorBridge] setMockScenario error:', err);
      }
    }
    return true;
  }

  /**
   * Run one inference pass (using mock fallback if native is unavailable)
   */
  public async detect(): Promise<DetectionResult> {
    const native = this.module;
    if (native && typeof native.detectSimulatedFrame === 'function') {
      try {
        const result = await native.detectSimulatedFrame();
        if (result) {
          this.lastDetectionResult = result;
          this.notifyListeners(result);
          return result;
        }
      } catch (err) {
        console.warn('[NativeDetectorBridge] detect error via native module:', err);
      }
    }

    const result = await this.fallbackMockDetector.detect();
    this.lastDetectionResult = result;
    this.notifyListeners(result);
    return result;
  }

  public async reloadModel(): Promise<boolean> {
    const native = this.module;
    if (native && typeof native.reloadModel === 'function') {
      try {
        return await native.reloadModel();
      } catch (err) {
        console.warn('[NativeDetectorBridge] reloadModel error:', err);
      }
    }
    return false;
  }

  public async resetDebounceFilter(): Promise<boolean> {
    const native = this.module;
    if (native && typeof native.resetDebounceFilter === 'function') {
      try {
        return await native.resetDebounceFilter();
      } catch (err) {
        console.warn('[NativeDetectorBridge] resetDebounceFilter error:', err);
      }
    }
    this.fallbackDebounceFilter.reset();
    return true;
  }

  public async getDebounceState(): Promise<any> {
    const native = this.module;
    if (native && typeof native.getDebounceState === 'function') {
      try {
        return await native.getDebounceState();
      } catch (err) {
        console.warn('[NativeDetectorBridge] getDebounceState error:', err);
      }
    }
    return {
      state: this.fallbackDebounceFilter.getState(),
      signature: this.fallbackDebounceFilter.getStableSignature(),
      consecutiveEmptyFrames:
        this.fallbackDebounceFilter.getConsecutiveEmptyFrames(),
    };
  }

  /**
   * Subscribe to detection updates
   */
  public addDetectionListener(listener: (result: DetectionResult) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(result: DetectionResult): void {
    for (const listener of this.listeners) {
      try {
        listener(result);
      } catch (err) {
        console.error('[NativeDetectorBridge] Listener error:', err);
      }
    }
  }

  public getMockDetector(): MockMoneyDetector {
    return this.fallbackMockDetector;
  }

  public destroy(): void {
    this.listeners.clear();
    if (this.nativeSubscription && typeof this.nativeSubscription.remove === 'function') {
      this.nativeSubscription.remove();
      this.nativeSubscription = null;
    }
  }
}

// Global singleton instance for app-wide use
export const detectorBridge = new NativeDetectorBridge();
