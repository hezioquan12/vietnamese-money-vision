import { createRequire } from 'node:module';

let RN: any = null;
try {
  const req = createRequire(import.meta.url);
  RN = req('react-native');
} catch {
  // Headless / Node testing environment without react-native
}

const Vibration = RN?.Vibration;
const Platform = RN?.Platform;

export const CANDIDATE_GUIDANCE_PULSE_MS = 25;
export const CANDIDATE_GUIDANCE_COOLDOWN_MS = 1200;

/**
 * 9-Denomination Tactile Vibration Coding (Ticket 10)
 * - Thousands (1k, 2k, 5k — Cotton): 1..3 short pulses (35ms, gap 45ms)
 * - Tens of Thousands (10k, 20k, 50k — Medium Polymer): 1..3 medium pulses (70ms, gap 55ms)
 * - Hundreds of Thousands (100k, 200k, 500k — Large Polymer): 40ms lead tick + gap 45ms + 1..3 long pulses (120ms-140ms, gap 60ms)
 */
export const DENOMINATION_VIBRATION_PATTERNS: Record<number, readonly number[]> = {
  1000: [0, 35],
  2000: [0, 35, 45, 35],
  5000: [0, 35, 45, 35, 45, 35],
  10000: [0, 70],
  20000: [0, 70, 55, 70],
  50000: [0, 70, 55, 70, 55, 70],
  100000: [0, 40, 45, 120],
  200000: [0, 40, 45, 120, 60, 120],
  500000: [0, 40, 45, 120, 60, 120, 60, 140],
} as const;

export function getDenominationVibrationPattern(
  denomination?: number | null
): number[] {
  if (denomination && DENOMINATION_VIBRATION_PATTERNS[denomination]) {
    return [...DENOMINATION_VIBRATION_PATTERNS[denomination]];
  }
  return [0, 80];
}

/**
 * Haptic Feedback Service for Tactile Accessibility
 * Wraps React Native's Vibration API with tactile-specific patterns
 */
class HapticsService {
  private enabled: boolean = true;
  private lastCandidatePulseTimestamp: number = 0;

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public resetCandidateCooldown(): void {
    this.lastCandidatePulseTimestamp = 0;
  }

  public getLastCandidatePulseTimestamp(): number {
    return this.lastCandidatePulseTimestamp;
  }

  /**
   * Spatial Guidance "Hold Hand Steady" feedback - subtle 25ms pulse
   * Throttled with 1200ms cooldown when a candidate banknote silhouette enters the frame
   */
  public triggerCandidateGuidancePulse(nowMs: number = Date.now()): boolean {
    if (!this.enabled) return false;
    if (
      this.lastCandidatePulseTimestamp > 0 &&
      nowMs - this.lastCandidatePulseTimestamp < CANDIDATE_GUIDANCE_COOLDOWN_MS
    ) {
      return false;
    }
    this.lastCandidatePulseTimestamp = nowMs;
    try {
      Vibration.vibrate(CANDIDATE_GUIDANCE_PULSE_MS);
    } catch {
      // Ignore vibration error in mock/unsupported environments
    }
    return true;
  }

  /**
   * Single Tap feedback - subtle 40ms tick
   */
  public triggerSingleTap(): void {
    if (!this.enabled) return;
    try {
      Vibration.vibrate(40);
    } catch {
      // Ignore vibration error in mock/unsupported environments
    }
  }

  /**
   * Double Tap feedback (Torch toggle) - bimodal double pulse
   * Pattern: wait 0ms, vibrate 45ms, wait 50ms, vibrate 45ms
   */
  public triggerDoubleTap(): void {
    if (!this.enabled) return;
    try {
      if (Platform.OS === 'android') {
        Vibration.vibrate([0, 45, 50, 45]);
      } else {
        Vibration.vibrate(50);
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Auto Torch feedback (Smart Torch triggered in low light)
   * Requirement: Rung nhẹ 100ms
   */
  public triggerAutoTorch(): void {
    if (!this.enabled) return;
    try {
      Vibration.vibrate(100);
    } catch {
      // Ignore
    }
  }

  /**
   * Long Press feedback (Session Wallet Readout)
   * Requirement: Rung dài 200ms
   */
  public triggerLongPress(): void {
    if (!this.enabled) return;
    try {
      Vibration.vibrate(200);
    } catch {
      // Ignore
    }
  }

  /**
   * Two-Finger Double Tap feedback (Reset Wallet to 0)
   * Pattern: two pronounced thumps
   */
  public triggerTwoFingerDoubleTap(): void {
    if (!this.enabled) return;
    try {
      if (Platform.OS === 'android') {
        Vibration.vibrate([0, 100, 60, 100]);
      } else {
        Vibration.vibrate(100);
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Money Detected feedback - tactile alert when banknote enters frame.
   * Uses 9-denomination tactile coding when denomination is provided.
   */
  public triggerMoneyDetected(denomination?: number): number[] {
    if (!this.enabled) return [];
    const pattern = getDenominationVibrationPattern(denomination);
    try {
      if (denomination && DENOMINATION_VIBRATION_PATTERNS[denomination]) {
        Vibration.vibrate(pattern);
      } else {
        Vibration.vibrate(80);
      }
    } catch {
      // Ignore
    }
    return pattern;
  }

  /**
   * Money Removed feedback - frame emptied alert
   */
  public triggerMoneyRemoved(): void {
    if (!this.enabled) return;
    try {
      Vibration.vibrate(50);
    } catch {
      // Ignore
    }
  }

  /**
   * Cancel any ongoing vibration
   */
  public cancel(): void {
    try {
      Vibration.cancel();
    } catch {
      // Ignore
    }
  }
}

export const haptics = new HapticsService();

