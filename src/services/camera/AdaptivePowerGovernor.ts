/**
 * AdaptivePowerGovernor (Ticket 09)
 * 3-Tier Power & Thermal Governor (BURST / ECO / HIBERNATION) with:
 * - 16x16 Luma Grid Optical Motion Gate (ΔY) & Motion Blur Gate (ΔY > 32.0)
 * - Zero-Permission Hardware Sensor Fusion (TYPE_LINEAR_ACCELERATION / TYPE_ACCELEROMETER,
 *   TYPE_PROXIMITY, TYPE_LIGHT, Touch) for < 30-50ms instant wake-up
 * - Adaptive IMU Table-Vibration Guard (auto-raises Δa threshold from 0.35 to 0.65 m/s^2
 *   after >= 3 consecutive IMU-only wakes with ΔY < 1.2)
 * - Hardware Thermal & Battery Scaling (API 28-34: NOMINAL / WARM / HOT)
 * - Camera2 stopRepeating() + single-frame readerSurface heartbeat & Auto-Torch Idle Thermal Cutoff
 * - OLED True Black (alpha = 0.0f), EdgePulseBorder loop pause, and 180s FLAG_KEEP_SCREEN_ON timeout
 */

import {
  MOTION_BLUR_DELTA_Y_THRESHOLD,
  MOTION_WAKE_DELTA_Y_THRESHOLD,
  STATIC_DEEP_IDLE_DELTA_Y_THRESHOLD,
  STATIC_EMPTY_DELTA_Y_THRESHOLD,
  STATIC_HOLDING_DELTA_Y_THRESHOLD,
} from './LuminanceAnalyzer.ts';
import type {
  PowerGovernorEvaluation,
  PowerGovernorTelemetry,
  PowerState,
  ThermalLevel,
  WakeUpReason,
} from './types.ts';

export const BURST_INTERVAL_NOMINAL_MS = 130;
export const BURST_INTERVAL_WARM_MS = 175;
export const BURST_INTERVAL_HOT_MS = 240;

export const ECO_INTERVAL_NOMINAL_MS = 650;
export const ECO_INTERVAL_WARM_MS = 850;
export const ECO_INTERVAL_HOT_MS = 1100;

export const HIBERNATION_HEARTBEAT_MS = 1500;
export const HIBERNATION_DARK_HEARTBEAT_MS = 3000;

export const ECO_ENTRY_STATIC_DURATION_NOMINAL_MS = 2500;
export const ECO_ENTRY_STATIC_DURATION_WARM_MS = 1800;
export const ECO_ENTRY_STATIC_DURATION_HOT_MS = 1200;

export const HIBERNATION_ENTRY_DARK_STATIC_MS = 3000;
export const HIBERNATION_ENTRY_EMPTY_STATIC_NOMINAL_MS = 8000;
export const HIBERNATION_ENTRY_EMPTY_STATIC_HOT_MS = 5000;
export const HIBERNATION_KEEP_SCREEN_ON_TIMEOUT_MS = 180000;

export const AUTO_TORCH_IDLE_CUTOFF_MS = 15000;
export const AUTO_TORCH_PROXIMITY_CUTOFF_MS = 4000;

export const IMU_WAKE_DELTA_A_DEFAULT = 0.35;
export const IMU_WAKE_DELTA_A_ADAPTIVE_TABLE = 0.65;
export const IMU_FALSE_WAKE_MAX_STREAK = 3;
export const IMU_DEEP_IDLE_MAX_DELTA_A = 0.20;

export const LIGHT_SENSOR_WAKE_JUMP_LUX = 15.0;
export const DARK_OCCLUDED_LUX_THRESHOLD = 5.0;

export const THERMAL_WARM_TEMP_CELSIUS = 38.0;
export const THERMAL_HOT_TEMP_CELSIUS = 41.0;
export const LOW_BATTERY_THRESHOLD_PERCENT = 15;

export const PREVIEW_ALPHA_BURST = 0.22;
export const PREVIEW_ALPHA_ECO = 0.08;
export const PREVIEW_ALPHA_HIBERNATION = 0.0;

export class AdaptivePowerGovernor {
  private powerState: PowerState = 'BURST';
  private thermalLevel: ThermalLevel = 'NOMINAL';
  private wakeUpReason: WakeUpReason = 'NONE';

  private staticStartTime: number | null = null;
  private deepIdleStartTime: number | null = null;
  private darkOccludedStartTime: number | null = null;
  private proximityNearStartTime: number | null = null;
  private hibernationStartTime: number | null = null;
  private lastInferenceTimestamp: number = 0;

  private wasProximityNear: boolean = false;
  private wasHasMoney: boolean = false;
  private lastIdleLuminance: number | null = null;
  private lastIdleAmbientLux: number | null = null;

  private consecutiveImuOnlyWakes: number = 0;
  private pendingImuWakeVerification: boolean = false;
  private ecoMotionSpikeStartMs: number | null = null;
  private lastEvaluationTimestamp: number = Date.now();

  /**
   * Evaluates thermal & battery level across Android 9.0 (API 28) to Android 14+ (API 34).
   * Combines PowerManager.getCurrentThermalStatus() (API 29+) and BatteryManager telemetry (API 28+).
   */
  public static evaluateThermalLevel(
    telemetry: Pick<
      PowerGovernorTelemetry,
      | 'batteryTempCelsius'
      | 'batteryPercent'
      | 'isPowerSaveMode'
      | 'androidThermalStatus'
    >
  ): ThermalLevel {
    const temp = telemetry.batteryTempCelsius ?? 30.0;
    const status = telemetry.androidThermalStatus ?? 0;
    const batteryPct = telemetry.batteryPercent ?? 100;
    const powerSave = Boolean(telemetry.isPowerSaveMode);

    // THERMAL_STATUS_SEVERE (3), CRITICAL (4), EMERGENCY (5), SHUTDOWN (6) or >= 41.0°C
    if (temp >= THERMAL_HOT_TEMP_CELSIUS || status >= 3) {
      return 'HOT';
    }

    // THERMAL_STATUS_MODERATE (2), 38.0°C <= T < 41.0°C, Battery < 15%, or Battery Saver ON
    if (
      temp >= THERMAL_WARM_TEMP_CELSIUS ||
      status >= 2 ||
      powerSave ||
      batteryPct < LOW_BATTERY_THRESHOLD_PERCENT
    ) {
      return 'WARM';
    }

    return 'NOMINAL';
  }

  public getEffectiveImuWakeThreshold(
    isHoldingConfirmedMoney: boolean = false
  ): number {
    if (isHoldingConfirmedMoney) {
      return IMU_WAKE_DELTA_A_ADAPTIVE_TABLE;
    }
    return this.consecutiveImuOnlyWakes >= IMU_FALSE_WAKE_MAX_STREAK
      ? IMU_WAKE_DELTA_A_ADAPTIVE_TABLE
      : IMU_WAKE_DELTA_A_DEFAULT;
  }

  public getConsecutiveImuOnlyWakes(): number {
    return this.consecutiveImuOnlyWakes;
  }

  public getPowerState(): PowerState {
    return this.powerState;
  }

  public getState(): PowerState {
    return this.powerState;
  }

  public getThermalLevel(): ThermalLevel {
    return this.thermalLevel;
  }

  /**
   * Force immediate wake-up to BURST mode (e.g. on user touch or gesture).
   */
  public wakeUpToBurst(
    reason: WakeUpReason = 'TOUCH_INTERACTION',
    timestamp?: number
  ): PowerGovernorEvaluation {
    const now = timestamp ?? this.lastEvaluationTimestamp;
    if (
      reason === 'TOUCH_INTERACTION' ||
      reason === 'OPTICAL_MOTION' ||
      reason === 'ACTIVE_DETECTION' ||
      reason === 'MANUAL_RESET'
    ) {
      this.consecutiveImuOnlyWakes = 0;
      this.pendingImuWakeVerification = false;
    }
    this.staticStartTime = null;
    this.deepIdleStartTime = null;
    this.darkOccludedStartTime = null;
    this.hibernationStartTime = null;
    this.ecoMotionSpikeStartMs = null;

    const prev = this.powerState;
    this.powerState = 'BURST';
    this.wakeUpReason = reason;

    return this.evaluate({
      timestamp: now,
      isTouchActive: reason === 'TOUCH_INTERACTION',
      motionDeltaY: reason === 'OPTICAL_MOTION' ? MOTION_WAKE_DELTA_Y_THRESHOLD : 0,
    }, prev);
  }

  public wakeUp(
    reason: WakeUpReason = 'TOUCH_INTERACTION',
    timestamp?: number
  ): PowerGovernorEvaluation {
    return this.wakeUpToBurst(reason, timestamp);
  }

  public evaluateFrame(
    telemetry: PowerGovernorTelemetry,
    overridePrevState?: PowerState
  ): PowerGovernorEvaluation {
    return this.evaluate(telemetry, overridePrevState);
  }

  /**
   * Evaluates current frame & hardware sensor telemetry and updates the 3-tier power state machine.
   */
  public evaluate(
    telemetry: PowerGovernorTelemetry,
    overridePrevState?: PowerState
  ): PowerGovernorEvaluation {
    const now = telemetry.timestamp ?? Date.now();
    this.lastEvaluationTimestamp = now;
    const previousPowerState = overridePrevState ?? this.powerState;

    this.thermalLevel = AdaptivePowerGovernor.evaluateThermalLevel(telemetry);

    const motionDeltaY = telemetry.motionDeltaY ?? 0;
    const luminance = telemetry.luminance ?? 100;
    const ambientSensorLux =
      telemetry.ambientSensorLux !== undefined ? telemetry.ambientSensorLux : null;
    const accelDelta = telemetry.accelMagnitudeDelta ?? 0;
    const isProximityNear = Boolean(telemetry.isProximityNear);
    const isTouchActive = Boolean(telemetry.isTouchActive);
    const debounceState = telemetry.debounceState ?? 'EMPTY';
    const hasMoney = Boolean(telemetry.hasMoney);
    const hasCandidateHint = Boolean(telemetry.hasCandidateHint);
    const consecutiveEmptyFrames = telemetry.consecutiveEmptyFrames ?? 0;
    const isTorchOn = Boolean(telemetry.isTorchOn);
    const isManualTorchOverride = Boolean(telemetry.isManualTorchOverride);
    const lowLightDurationMs = telemetry.lowLightDurationMs ?? 0;
    const torchOnDurationMs = telemetry.torchOnDurationMs ?? 0;

    // Track proximity occlusion duration
    const proximityUncovered = this.wasProximityNear && !isProximityNear;
    this.wasProximityNear = isProximityNear;
    if (isProximityNear) {
      if (this.proximityNearStartTime === null) {
        this.proximityNearStartTime = now;
      }
    } else {
      this.proximityNearStartTime = null;
    }
    const proximityNearDurationMs =
      this.proximityNearStartTime !== null
        ? Math.max(0, now - this.proximityNearStartTime)
        : 0;

    // 1. Check if genuine optical motion, detection, or touch clears Adaptive IMU Table-Vibration Guard
    if (
      isTouchActive ||
      motionDeltaY >= MOTION_WAKE_DELTA_Y_THRESHOLD ||
      hasMoney ||
      hasCandidateHint ||
      debounceState === 'STABILIZING'
    ) {
      this.consecutiveImuOnlyWakes = 0;
      this.pendingImuWakeVerification = false;
    } else if (this.pendingImuWakeVerification) {
      if (motionDeltaY < 1.2) {
        // IMU woke the device, but optical 16x16 Luma Grid remained completely static (< 1.2)
        this.consecutiveImuOnlyWakes++;
      } else {
        // Moderate optical change (1.2 <= motionDeltaY < 4.5) confirms real visual shift
        this.consecutiveImuOnlyWakes = 0;
      }
      this.pendingImuWakeVerification = false;
    }

    const isHoldingConfirmed = hasMoney && debounceState === 'STABLE';
    const effectiveImuThreshold = this.getEffectiveImuWakeThreshold(isHoldingConfirmed);

    // 2. Motion Blur Gate (ΔY > 32.0): Fast hand wave / camera pan
    // Keep in BURST mode, reset idle timers, but skip TFLite and do NOT feed fake EMPTY to debounce!
    const isMotionBlurred = motionDeltaY > MOTION_BLUR_DELTA_Y_THRESHOLD;
    if (isMotionBlurred) {
      this.powerState = 'BURST';
      this.wakeUpReason = 'OPTICAL_MOTION';
      this.staticStartTime = null;
      this.deepIdleStartTime = null;
      this.darkOccludedStartTime = null;
      this.hibernationStartTime = null;
      this.lastIdleLuminance = null;
      this.lastIdleAmbientLux = null;
      this.ecoMotionSpikeStartMs = null;
    } else {
      // 3. Evaluate Instant Wake-Up Conditions (< 30-50ms) to BURST
      const isWithdrawingMoney =
        (hasMoney || this.wasHasMoney || debounceState !== 'EMPTY') &&
        consecutiveEmptyFrames >= 1 &&
        consecutiveEmptyFrames < 3;
      const isNewMoneyArrival = hasMoney && !this.wasHasMoney;

      const lightSensorJumped =
        this.powerState !== 'BURST' &&
        ((ambientSensorLux !== null &&
          this.lastIdleAmbientLux !== null &&
          Math.abs(ambientSensorLux - this.lastIdleAmbientLux) >=
            LIGHT_SENSOR_WAKE_JUMP_LUX) ||
          (this.lastIdleLuminance !== null &&
            Math.abs(luminance - this.lastIdleLuminance) >=
              LIGHT_SENSOR_WAKE_JUMP_LUX));

      let wakeReason: WakeUpReason = 'NONE';
      if (isTouchActive) {
        wakeReason = 'TOUCH_INTERACTION';
      } else if (motionDeltaY >= MOTION_WAKE_DELTA_Y_THRESHOLD) {
        wakeReason = 'OPTICAL_MOTION';
      } else if (debounceState === 'STABILIZING' || isNewMoneyArrival) {
        wakeReason = 'ACTIVE_DETECTION';
      } else if (hasCandidateHint && !hasMoney) {
        wakeReason = 'CANDIDATE_HINT';
      } else if (isWithdrawingMoney) {
        wakeReason = 'WITHDRAWAL_TRANSITION';
      } else if (proximityUncovered) {
        wakeReason = 'PROXIMITY_UNCOVERED';
      } else if (lightSensorJumped) {
        wakeReason = 'LIGHT_SENSOR_JUMP';
      } else if (
        this.powerState !== 'BURST' &&
        accelDelta >= effectiveImuThreshold
      ) {
        wakeReason = 'IMU_ACCELERATION';
        if (motionDeltaY < 1.2 && !hasMoney && !hasCandidateHint) {
          this.pendingImuWakeVerification = true;
        }
      }

      if (wakeReason !== 'NONE') {
        this.powerState = 'BURST';
        this.wakeUpReason = wakeReason;
        this.staticStartTime = null;
        this.deepIdleStartTime = null;
        this.darkOccludedStartTime = null;
        this.hibernationStartTime = null;
        this.lastIdleLuminance = null;
        this.lastIdleAmbientLux = null;
        this.ecoMotionSpikeStartMs = null;
      } else {
        // 4. Track Static Scene & Deep Idle Timers for ECO and HIBERNATION transitions
        if (hasMoney !== this.wasHasMoney) {
          this.staticStartTime = null;
        }

        const isStaticForEco = hasMoney
          ? debounceState === 'STABLE' &&
            motionDeltaY < STATIC_HOLDING_DELTA_Y_THRESHOLD
          : debounceState === 'EMPTY' &&
            !hasCandidateHint &&
            motionDeltaY < STATIC_EMPTY_DELTA_Y_THRESHOLD;

        if (isStaticForEco) {
          if (this.staticStartTime === null) {
            this.staticStartTime = now;
          }
        } else {
          this.staticStartTime = null;
        }

        const isDeepIdleEmpty =
          !hasMoney &&
          !hasCandidateHint &&
          debounceState === 'EMPTY' &&
          motionDeltaY < STATIC_DEEP_IDLE_DELTA_Y_THRESHOLD &&
          accelDelta < IMU_DEEP_IDLE_MAX_DELTA_A;

        if (isDeepIdleEmpty) {
          if (this.deepIdleStartTime === null) {
            this.deepIdleStartTime = now;
          }
        } else {
          this.deepIdleStartTime = null;
        }

        // Dark / Occluded / Face-down check (< 5 lux or proximity near, outside Ticket 08's 1s low-light trigger window)
        const isOutsideAutoTorchTriggerWindow =
          isTorchOn ||
          isManualTorchOverride ||
          Boolean(telemetry.isOscillationLatched) ||
          lowLightDurationMs === 0 ||
          lowLightDurationMs > 1200;
        const isDarkOrOccluded =
          isDeepIdleEmpty &&
          (luminance < DARK_OCCLUDED_LUX_THRESHOLD || isProximityNear) &&
          isOutsideAutoTorchTriggerWindow;

        if (isDarkOrOccluded) {
          if (this.darkOccludedStartTime === null) {
            this.darkOccludedStartTime = now;
          }
        } else {
          this.darkOccludedStartTime = null;
        }

        const staticElapsed =
          this.staticStartTime !== null
            ? Math.max(0, now - this.staticStartTime)
            : 0;
        const deepIdleElapsed =
          this.deepIdleStartTime !== null
            ? Math.max(0, now - this.deepIdleStartTime)
            : 0;
        const darkOccludedElapsed =
          this.darkOccludedStartTime !== null
            ? Math.max(0, now - this.darkOccludedStartTime)
            : 0;

        const ecoThresholdMs =
          this.thermalLevel === 'HOT'
            ? ECO_ENTRY_STATIC_DURATION_HOT_MS
            : this.thermalLevel === 'WARM'
            ? ECO_ENTRY_STATIC_DURATION_WARM_MS
            : ECO_ENTRY_STATIC_DURATION_NOMINAL_MS;

        const hibernationEmptyThresholdMs =
          this.thermalLevel === 'HOT'
            ? HIBERNATION_ENTRY_EMPTY_STATIC_HOT_MS
            : HIBERNATION_ENTRY_EMPTY_STATIC_NOMINAL_MS;

        if (
          !hasMoney &&
          !hasCandidateHint &&
          debounceState === 'EMPTY' &&
          (darkOccludedElapsed >= HIBERNATION_ENTRY_DARK_STATIC_MS ||
            deepIdleElapsed >= hibernationEmptyThresholdMs)
        ) {
          if (this.powerState !== 'HIBERNATION') {
            this.powerState = 'HIBERNATION';
            this.hibernationStartTime = now;
            this.lastIdleLuminance = luminance;
            this.lastIdleAmbientLux = ambientSensorLux;
          }
        } else if (staticElapsed >= ecoThresholdMs) {
          if (this.powerState === 'BURST') {
            this.powerState = 'ECO';
            this.lastIdleLuminance = luminance;
            this.lastIdleAmbientLux = ambientSensorLux;
          }
          this.ecoMotionSpikeStartMs = null;
        } else if (!isStaticForEco && this.powerState !== 'BURST') {
          if (this.powerState === 'ECO') {
            if (this.ecoMotionSpikeStartMs === null) {
              this.ecoMotionSpikeStartMs = now;
            } else if (now - this.ecoMotionSpikeStartMs >= 350) {
              this.powerState = 'BURST';
              this.wakeUpReason = 'OPTICAL_MOTION';
              this.hibernationStartTime = null;
              this.ecoMotionSpikeStartMs = null;
            }
          } else {
            this.powerState = 'BURST';
            this.wakeUpReason = 'OPTICAL_MOTION';
            this.hibernationStartTime = null;
            this.ecoMotionSpikeStartMs = null;
          }
        } else {
          this.ecoMotionSpikeStartMs = null;
        }
      }
    }

    this.wasHasMoney = hasMoney;

    const staticDurationMs =
      this.staticStartTime !== null
        ? Math.max(0, now - this.staticStartTime)
        : 0;
    const deepIdleDurationMs =
      this.deepIdleStartTime !== null
        ? Math.max(0, now - this.deepIdleStartTime)
        : 0;
    const hibernationDurationMs =
      this.powerState === 'HIBERNATION' && this.hibernationStartTime !== null
        ? Math.max(0, now - this.hibernationStartTime)
        : 0;

    // 5. Auto-Torch Idle Thermal Cutoff (Safety Fuse):
    // If auto-torch was turned on in dark room, then phone was left idle on table >= 15s (empty & static)
    // or placed face-down / in pocket (isProximityNear) >= 4s, cut off LED torch to prevent overheating.
    const shouldAutoCutoffIdleTorch =
      isTorchOn &&
      !isManualTorchOverride &&
      !hasMoney &&
      !hasCandidateHint &&
      debounceState === 'EMPTY' &&
      ((torchOnDurationMs >= AUTO_TORCH_IDLE_CUTOFF_MS &&
        deepIdleDurationMs >= AUTO_TORCH_IDLE_CUTOFF_MS) ||
        (torchOnDurationMs >= AUTO_TORCH_PROXIMITY_CUTOFF_MS &&
          proximityNearDurationMs >= AUTO_TORCH_PROXIMITY_CUTOFF_MS));

    // 6. Compute Inference Interval, Camera AE FPS, Preview Alpha, and Screen Power Flags
    let inferenceIntervalMs: number;
    let targetAeFpsRange: [number, number];
    let previewAlpha: number;
    let heartbeatIntervalMs = 0;

    if (this.powerState === 'BURST') {
      inferenceIntervalMs =
        this.thermalLevel === 'HOT'
          ? BURST_INTERVAL_HOT_MS
          : this.thermalLevel === 'WARM'
          ? BURST_INTERVAL_WARM_MS
          : BURST_INTERVAL_NOMINAL_MS;
      targetAeFpsRange = [15, 24];
      previewAlpha =
        this.thermalLevel === 'HOT' ? PREVIEW_ALPHA_HIBERNATION : PREVIEW_ALPHA_BURST;
    } else if (this.powerState === 'ECO') {
      inferenceIntervalMs =
        this.thermalLevel === 'HOT'
          ? ECO_INTERVAL_HOT_MS
          : this.thermalLevel === 'WARM'
          ? ECO_INTERVAL_WARM_MS
          : ECO_INTERVAL_NOMINAL_MS;
      targetAeFpsRange = [10, 15];
      previewAlpha =
        this.thermalLevel === 'HOT' ? PREVIEW_ALPHA_HIBERNATION : PREVIEW_ALPHA_ECO;
    } else {
      // HIBERNATION: 0 FPS TFLite inference; single-frame readerSurface heartbeat every 1500ms or 3000ms
      heartbeatIntervalMs =
        luminance < DARK_OCCLUDED_LUX_THRESHOLD || isProximityNear
          ? HIBERNATION_DARK_HEARTBEAT_MS
          : HIBERNATION_HEARTBEAT_MS;
      inferenceIntervalMs = heartbeatIntervalMs;
      targetAeFpsRange = [0, 0];
      previewAlpha = PREVIEW_ALPHA_HIBERNATION;
    }

    // Never call captureSession.stopRepeating() while FLASH_MODE_TORCH is active (unless cutoff just turned it off)
    const effectiveTorchRemainingOn = isTorchOn && !shouldAutoCutoffIdleTorch;
    const shouldStopCameraRepeating =
      this.powerState === 'HIBERNATION' && !effectiveTorchRemainingOn;

    const shouldRunInference =
      !isMotionBlurred &&
      this.powerState !== 'HIBERNATION' &&
      (this.lastInferenceTimestamp === 0 ||
        now - this.lastInferenceTimestamp >= inferenceIntervalMs);

    if (shouldRunInference) {
      this.lastInferenceTimestamp = now;
    }

    const shouldPauseBorderLoop = this.powerState !== 'BURST';
    const screenBrightness = this.powerState === 'HIBERNATION' ? 0.01 : -1.0;
    const keepScreenOn =
      this.powerState !== 'HIBERNATION' ||
      hibernationDurationMs < HIBERNATION_KEEP_SCREEN_ON_TIMEOUT_MS;

    return {
      powerState: this.powerState,
      previousPowerState,
      stateChanged: this.powerState !== previousPowerState,
      thermalLevel: this.thermalLevel,
      inferenceIntervalMs,
      shouldSkipInferenceForMotionBlur: isMotionBlurred,
      shouldRunInference,
      targetAeFpsRange,
      shouldStopCameraRepeating,
      heartbeatIntervalMs,
      shouldAutoCutoffIdleTorch,
      previewAlpha,
      shouldPauseBorderLoop,
      screenBrightness,
      keepScreenOn,
      effectiveImuWakeThreshold: this.getEffectiveImuWakeThreshold(isHoldingConfirmed),
      wakeUpReason: this.wakeUpReason,
      staticDurationMs,
      hibernationDurationMs,
    };
  }

  public reset(): void {
    this.powerState = 'BURST';
    this.thermalLevel = 'NOMINAL';
    this.wakeUpReason = 'NONE';
    this.staticStartTime = null;
    this.deepIdleStartTime = null;
    this.darkOccludedStartTime = null;
    this.proximityNearStartTime = null;
    this.hibernationStartTime = null;
    this.ecoMotionSpikeStartMs = null;
    this.lastInferenceTimestamp = 0;
    this.wasProximityNear = false;
    this.wasHasMoney = false;
    this.lastIdleLuminance = null;
    this.lastIdleAmbientLux = null;
    this.consecutiveImuOnlyWakes = 0;
    this.pendingImuWakeVerification = false;
    this.lastEvaluationTimestamp = Date.now();
  }
}
