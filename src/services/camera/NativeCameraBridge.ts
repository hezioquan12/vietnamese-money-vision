/**
 * NativeCameraBridge
 * Bridge interface wrapping MoneyCameraModule.
 * Safely handles missing native module in Node.js test environments or simulator.
 */

import { createRequire } from 'node:module';

let RN: any = null;
try {
  const req = createRequire(import.meta.url);
  RN = req('react-native');
} catch {
  // Headless / Node testing environment without react-native installed
}

const Platform = RN?.Platform;
const NativeModules = RN?.NativeModules;

export interface NativeCameraModuleInterface {
  setTorch(enabled: boolean): Promise<boolean>;
  isTorchOn(): Promise<boolean>;
  getLuminance(): Promise<number>;
  checkCameraPermission(): Promise<boolean>;
}

export class NativeCameraBridge implements NativeCameraModuleInterface {
  private mockTorchState: boolean = false;
  private mockLuminance: number = 100;
  private mockPermission: boolean = true;

  private get module(): NativeCameraModuleInterface | null {
    try {
      if (
        typeof Platform !== 'undefined' &&
        Platform.OS === 'android' &&
        typeof NativeModules !== 'undefined' &&
        NativeModules?.MoneyCameraModule
      ) {
        return NativeModules.MoneyCameraModule as NativeCameraModuleInterface;
      }
    } catch {
      // In mock/test environments
    }
    return null;
  }

  public async setTorch(enabled: boolean): Promise<boolean> {
    const native = this.module;
    if (native) {
      try {
        return await native.setTorch(enabled);
      } catch (err) {
        console.warn('[NativeCameraBridge] setTorch error:', err);
      }
    }
    this.mockTorchState = enabled;
    return true;
  }

  public async isTorchOn(): Promise<boolean> {
    const native = this.module;
    if (native) {
      try {
        return await native.isTorchOn();
      } catch (err) {
        console.warn('[NativeCameraBridge] isTorchOn error:', err);
      }
    }
    return this.mockTorchState;
  }

  public async getLuminance(): Promise<number> {
    const native = this.module;
    if (native) {
      try {
        return await native.getLuminance();
      } catch (err) {
        console.warn('[NativeCameraBridge] getLuminance error:', err);
      }
    }
    return this.mockLuminance;
  }

  public async checkCameraPermission(): Promise<boolean> {
    const native = this.module;
    if (native) {
      try {
        return await native.checkCameraPermission();
      } catch (err) {
        console.warn('[NativeCameraBridge] checkCameraPermission error:', err);
      }
    }
    return this.mockPermission;
  }

  // Testing & Fallback configuration helpers
  public setMockLuminance(lux: number): void {
    this.mockLuminance = lux;
  }

  public setMockPermission(granted: boolean): void {
    this.mockPermission = granted;
  }

  public resetMock(): void {
    this.mockTorchState = false;
    this.mockLuminance = 100;
    this.mockPermission = true;
  }
}

export const cameraBridge = new NativeCameraBridge();
