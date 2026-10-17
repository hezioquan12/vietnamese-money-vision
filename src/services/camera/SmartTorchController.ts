/**
 * SmartTorchController
 * State machine managing automated flashlight control for visually impaired users
 * with 4-Layer Anti-Strobe & Optical Reflection Guard (Ticket 08).
 *
 * Rules:
 * 1. Ambient Luminance < 25 lux continuously for 1.0 second:
 *    - Automatically turns ON torch (unless manually overridden or oscillation-latched).
 *    - Plays 'torch_on.wav' earcon and triggers 100ms haptic feedback.
 * 2. 4-Layer Anti-Strobe & Optical Reflection Guard while Torch is ON:
 *    - Layer 1 (Hardware Light Sensor): Uses front-facing Sensor.TYPE_LIGHT (if present)
 *      to measure true room illuminance (>= 85 lux) independent of rear LED flash reflection.
 *    - Layer 2 (Post-Torch Baseline & Spatial Glare Guard): Captures postTorchBaselineLuma
 *      (~450ms after auto-ON). Rejects close-range banknote/object reflections (high glareRatio
 *      Y > 230 or high centerToBorderRatio hotspot). Requires Y-plane luminance
 *      >= Math.max(175, postTorchBaselineLuma + 55) sustained continuously for >= 3000ms.
 *    - Layer 3 (Minimum Hold & Active Detection Lock): Holds torch ON for at least
 *      MIN_TORCH_ON_HOLD_MS (12,000ms) and never auto-turns off while banknotes are detected.
 *    - Layer 4 (Manual Override Protection & Oscillation Latch): Never clears isManualOverride
 *      while torch is ON due to reflected light. Latches torch state for 60s if >= 2 auto
 *      ON-OFF cycles occur within a 30s window.
 */

import {
  LOW_LIGHT_THRESHOLD_LUX,
  RESTORE_LIGHT_THRESHOLD_LUX,
  TRIGGER_DURATION_MS,
  MIN_TORCH_ON_HOLD_MS,
  POST_TORCH_BASELINE_WINDOW_MS,
  HIGH_RESTORE_LIGHT_THRESHOLD_LUX,
  POST_TORCH_DELTA_LUX,
  RESTORE_SUSTAIN_DURATION_MS,
  AMBIENT_SENSOR_RESTORE_LUX,
  MAX_GLARE_RATIO_FOR_RESTORE,
  MAX_CENTER_TO_BORDER_RATIO,
  OSCILLATION_WINDOW_MS,
  OSCILLATION_MAX_CYCLES,
  OSCILLATION_LATCH_DURATION_MS,
  MANUAL_OFF_SETTLE_MS,
  MANUAL_OFF_MOTION_ARM_DELAY_MS,
  MANUAL_OFF_REARM_LUMA_LUX,
  MANUAL_OFF_DARK_GRACE_MS,
  MANUAL_OFF_DARKENING_DROP_LUX,
  MANUAL_OFF_MOTION_DELTA_Y,
  MANUAL_OFF_IMU_ACCEL_DELTA,
  isLowLight,
  isLightRestored,
} from './LuminanceAnalyzer.ts';
import type {
  LuminanceSampleContext,
  SmartTorchAction,
  SmartTorchConfig,
  SmartTorchGuardReason,
  SmartTorchReason,
  SmartTorchState,
} from './types.ts';

export const DEFAULT_SMART_TORCH_CONFIG: Required<SmartTorchConfig> = {
  lowLightThresholdLux: LOW_LIGHT_THRESHOLD_LUX,
  restoreLightThresholdLux: RESTORE_LIGHT_THRESHOLD_LUX,
  triggerDurationMs: TRIGGER_DURATION_MS,
  minHoldDurationMs: MIN_TORCH_ON_HOLD_MS,
  postTorchBaselineWindowMs: POST_TORCH_BASELINE_WINDOW_MS,
  highRestoreThresholdLux: HIGH_RESTORE_LIGHT_THRESHOLD_LUX,
  postTorchDeltaLux: POST_TORCH_DELTA_LUX,
  restoreSustainDurationMs: RESTORE_SUSTAIN_DURATION_MS,
  ambientSensorRestoreLux: AMBIENT_SENSOR_RESTORE_LUX,
  oscillationWindowMs: OSCILLATION_WINDOW_MS,
  oscillationMaxCycles: OSCILLATION_MAX_CYCLES,
  oscillationLatchDurationMs: OSCILLATION_LATCH_DURATION_MS,
  manualOffSettleMs: MANUAL_OFF_SETTLE_MS,
  manualOffMotionArmDelayMs: MANUAL_OFF_MOTION_ARM_DELAY_MS,
  manualOffRearmLumaLux: MANUAL_OFF_REARM_LUMA_LUX,
  manualOffDarkGraceMs: MANUAL_OFF_DARK_GRACE_MS,
  manualOffDarkeningDropLux: MANUAL_OFF_DARKENING_DROP_LUX,
  manualOffMotionDeltaY: MANUAL_OFF_MOTION_DELTA_Y,
  manualOffImuAccelDelta: MANUAL_OFF_IMU_ACCEL_DELTA,
  autoTorchEnabled: true,
};

export class SmartTorchController {
  private readonly lowLightThreshold: number;
  private readonly restoreLightThreshold: number;
  private readonly triggerDurationMs: number;
  private readonly minHoldDurationMs: number;
  private readonly postTorchBaselineWindowMs: number;
  private readonly highRestoreThresholdLux: number;
  private readonly postTorchDeltaLux: number;
  private readonly restoreSustainDurationMs: number;
  private readonly ambientSensorRestoreLux: number;
  private readonly oscillationWindowMs: number;
  private readonly oscillationMaxCycles: number;
  private readonly oscillationLatchDurationMs: number;
  private readonly manualOffSettleMs: number;
  private readonly manualOffMotionArmDelayMs: number;
  private readonly manualOffRearmLumaLux: number;
  private readonly manualOffDarkGraceMs: number;
  private readonly manualOffDarkeningDropLux: number;
  private readonly manualOffMotionDeltaY: number;
  private readonly manualOffImuAccelDelta: number;
  private readonly hasCustomAntiStrobeConfig: boolean;

  private isTorchOn: boolean = false;
  private isManualOverride: boolean = false;
  private autoTorchEnabled: boolean = true;
  private lowLightStartTime: number | null = null;
  private restoreLightStartTime: number | null = null;
  private torchAutoOnTimestamp: number | null = null;
  private postTorchBaselineLuma: number | null = null;
  private preTorchAmbientSensorLux: number | null = null;
  private manualOffTimestamp: number | null = null;
  private manualOffBaselineLuma: number | null = null;
  private hasMovedSinceManualOff: boolean = false;
  private reflectionGuardEngaged: boolean = false;
  private hasActiveDetection: boolean = false;
  private ambientSensorLux: number | null = null;
  private autoCycleTimestamps: number[] = [];
  private oscillationLatchUntil: number | null = null;
  private currentLuminance: number = 100;
  private lastActionReason: SmartTorchReason = 'NONE';
  private lastGuardReason: SmartTorchGuardReason = 'NONE';
  private lastSampleTimestamp: number = Date.now();
  private hasSampledTimestamp: boolean = false;

  constructor(config?: SmartTorchConfig) {
    this.lowLightThreshold =
      config?.lowLightThresholdLux ?? DEFAULT_SMART_TORCH_CONFIG.lowLightThresholdLux;
    this.restoreLightThreshold =
      config?.restoreLightThresholdLux ?? DEFAULT_SMART_TORCH_CONFIG.restoreLightThresholdLux;
    this.triggerDurationMs =
      config?.triggerDurationMs ?? DEFAULT_SMART_TORCH_CONFIG.triggerDurationMs;
    this.minHoldDurationMs =
      config?.minHoldDurationMs ?? DEFAULT_SMART_TORCH_CONFIG.minHoldDurationMs;
    this.postTorchBaselineWindowMs =
      config?.postTorchBaselineWindowMs ?? DEFAULT_SMART_TORCH_CONFIG.postTorchBaselineWindowMs;
    this.highRestoreThresholdLux =
      config?.highRestoreThresholdLux ?? DEFAULT_SMART_TORCH_CONFIG.highRestoreThresholdLux;
    this.postTorchDeltaLux =
      config?.postTorchDeltaLux ?? DEFAULT_SMART_TORCH_CONFIG.postTorchDeltaLux;
    this.restoreSustainDurationMs =
      config?.restoreSustainDurationMs ?? DEFAULT_SMART_TORCH_CONFIG.restoreSustainDurationMs;
    this.ambientSensorRestoreLux =
      config?.ambientSensorRestoreLux ?? DEFAULT_SMART_TORCH_CONFIG.ambientSensorRestoreLux;
    this.oscillationWindowMs =
      config?.oscillationWindowMs ?? DEFAULT_SMART_TORCH_CONFIG.oscillationWindowMs;
    this.oscillationMaxCycles =
      config?.oscillationMaxCycles ?? DEFAULT_SMART_TORCH_CONFIG.oscillationMaxCycles;
    this.oscillationLatchDurationMs =
      config?.oscillationLatchDurationMs ?? DEFAULT_SMART_TORCH_CONFIG.oscillationLatchDurationMs;
    this.manualOffSettleMs =
      config?.manualOffSettleMs ?? DEFAULT_SMART_TORCH_CONFIG.manualOffSettleMs;
    this.manualOffMotionArmDelayMs =
      config?.manualOffMotionArmDelayMs ?? DEFAULT_SMART_TORCH_CONFIG.manualOffMotionArmDelayMs;
    this.manualOffRearmLumaLux =
      config?.manualOffRearmLumaLux ?? DEFAULT_SMART_TORCH_CONFIG.manualOffRearmLumaLux;
    this.manualOffDarkGraceMs =
      config?.manualOffDarkGraceMs ?? DEFAULT_SMART_TORCH_CONFIG.manualOffDarkGraceMs;
    this.manualOffDarkeningDropLux =
      config?.manualOffDarkeningDropLux ?? DEFAULT_SMART_TORCH_CONFIG.manualOffDarkeningDropLux;
    this.manualOffMotionDeltaY =
      config?.manualOffMotionDeltaY ?? DEFAULT_SMART_TORCH_CONFIG.manualOffMotionDeltaY;
    this.manualOffImuAccelDelta =
      config?.manualOffImuAccelDelta ?? DEFAULT_SMART_TORCH_CONFIG.manualOffImuAccelDelta;
    this.autoTorchEnabled =
      config?.autoTorchEnabled ?? DEFAULT_SMART_TORCH_CONFIG.autoTorchEnabled;

    this.hasCustomAntiStrobeConfig = Boolean(
      config &&
        (config.minHoldDurationMs !== undefined ||
          config.postTorchBaselineWindowMs !== undefined ||
          config.highRestoreThresholdLux !== undefined ||
          config.postTorchDeltaLux !== undefined ||
          config.restoreSustainDurationMs !== undefined ||
          config.ambientSensorRestoreLux !== undefined ||
          config.oscillationWindowMs !== undefined ||
          config.oscillationMaxCycles !== undefined ||
          config.oscillationLatchDurationMs !== undefined)
    );
  }

  private updateOscillationState(now: number): boolean {
    if (
      this.oscillationLatchUntil !== null &&
      now >= this.oscillationLatchUntil
    ) {
      this.oscillationLatchUntil = null;
      this.autoCycleTimestamps = [];
      this.lowLightStartTime = null;
      this.restoreLightStartTime = null;
    }
    while (
      this.autoCycleTimestamps.length > 0 &&
      now - this.autoCycleTimestamps[0] > this.oscillationWindowMs
    ) {
      this.autoCycleTimestamps.shift();
    }
    return (
      this.oscillationLatchUntil !== null && now < this.oscillationLatchUntil
    );
  }

  /**
   * Process incoming ambient luminance sample with 4-Layer Anti-Strobe & Reflection Guard.
   *
   * @param luminance Measured luminance (lux / average luma 0-255).
   * @param timestamp Optional timestamp in ms (defaults to Date.now()).
   * @param context Optional spatial reflection, ambient sensor, and active detection telemetry.
   * @returns SmartTorchAction indicating any action to be taken.
   */
  public onLuminanceSample(
    luminance: number,
    timestamp?: number,
    context?: LuminanceSampleContext
  ): SmartTorchAction {
    const now = timestamp ?? Date.now();
    this.lastSampleTimestamp = now;
    this.hasSampledTimestamp = true;
    this.currentLuminance = luminance;

    if (context?.hasActiveDetection !== undefined) {
      this.hasActiveDetection = context.hasActiveDetection;
    }
    if (context?.ambientSensorLux !== undefined) {
      this.ambientSensorLux = context.ambientSensorLux;
    }

    const isLatched = this.updateOscillationState(now);

    const elapsedSinceTorchOn =
      this.isTorchOn && this.torchAutoOnTimestamp !== null
        ? Math.max(0, now - this.torchAutoOnTimestamp)
        : 0;

    const glareRatio = context?.glareRatio ?? 0;
    const centerToBorderRatio =
      context?.centerToBorderRatio ??
      (context?.centerLuma !== undefined &&
      context?.borderLuma !== undefined
        ? context.borderLuma > 1
          ? context.centerLuma / context.borderLuma
          : context.centerLuma > 1
          ? context.centerLuma
          : 1.0
        : 1.0);
    const hasSpatialReflection =
      glareRatio >= MAX_GLARE_RATIO_FOR_RESTORE ||
      centerToBorderRatio >= MAX_CENTER_TO_BORDER_RATIO;
    const effectiveSampleLuma =
      hasSpatialReflection && context?.centerLuma !== undefined
        ? Math.max(luminance, context.centerLuma)
        : luminance;

    // Record post-torch baseline luminance (~400-500ms after auto-torch ON, or on immediate/delayed reflection jump)
    if (this.isTorchOn && !this.isManualOverride && this.torchAutoOnTimestamp !== null) {
      if (
        elapsedSinceTorchOn > 0 &&
        elapsedSinceTorchOn <= this.postTorchBaselineWindowMs
      ) {
        if (effectiveSampleLuma >= this.lowLightThreshold) {
          this.postTorchBaselineLuma =
            this.postTorchBaselineLuma === null
              ? effectiveSampleLuma
              : Math.max(this.postTorchBaselineLuma, effectiveSampleLuma);
        }
        this.reflectionGuardEngaged = true;
      } else if (
        (this.postTorchBaselineLuma === null || this.postTorchBaselineLuma < 80) &&
        elapsedSinceTorchOn > 0 &&
        elapsedSinceTorchOn <= 1000 &&
        effectiveSampleLuma >= 80
      ) {
        // Immediate or delayed close-range reflection jump (e.g., 15 lux -> 180..255 lux) within first 1000ms
        this.postTorchBaselineLuma =
          this.postTorchBaselineLuma === null
            ? effectiveSampleLuma
            : Math.max(this.postTorchBaselineLuma, effectiveSampleLuma);
        this.reflectionGuardEngaged = true;
      }
    }

    // =========================================================================
    // Ticket 12: Smart Manual-OFF Recovery & Dark-to-Dark Motion/Darkening Re-Arm
    // =========================================================================
    if (this.isManualOverride && !this.isTorchOn) {
      if (
        this.manualOffTimestamp === null &&
        luminance < this.manualOffRearmLumaLux
      ) {
        this.manualOffTimestamp = now;
      }

      const elapsedSinceManualOff =
        this.manualOffTimestamp !== null
          ? Math.max(0, now - this.manualOffTimestamp)
          : Infinity;

      // Capture baseline only AFTER torch filament decay settles (250ms)
      if (
        elapsedSinceManualOff >= this.manualOffSettleMs &&
        this.manualOffBaselineLuma === null &&
        luminance < this.manualOffRearmLumaLux
      ) {
        this.manualOffBaselineLuma = luminance;
      }

      // Latch repositioning motion only AFTER double-tap finger jitter settles (400ms)
      const frameDeltaY = context?.motionDeltaY ?? context?.frameDeltaY ?? 0;
      const imuLinearAccelDelta =
        context?.accelMagnitudeDelta ?? context?.imuLinearAccelDelta ?? 0;
      const hasFrameMotion =
        frameDeltaY >= this.manualOffMotionDeltaY ||
        imuLinearAccelDelta >= this.manualOffImuAccelDelta;
      const hasDarkenedFurther =
        this.manualOffBaselineLuma !== null &&
        this.manualOffBaselineLuma - luminance >= this.manualOffDarkeningDropLux;

      if (
        elapsedSinceManualOff >= this.manualOffMotionArmDelayMs &&
        (hasFrameMotion || hasDarkenedFurther)
      ) {
        this.hasMovedSinceManualOff = true;
      }

      // Path A: Dim/Moderate Room Re-Arm (>= 35 luma without hotspot reflection, no front sensor gate needed since LED is OFF)
      if (
        elapsedSinceManualOff >= this.manualOffSettleMs &&
        luminance >= this.manualOffRearmLumaLux &&
        !hasSpatialReflection
      ) {
        this.isManualOverride = false;
        this.manualOffTimestamp = null;
        this.hasMovedSinceManualOff = false;
        this.manualOffBaselineLuma = null;
        this.lowLightStartTime = null;
        this.lastGuardReason = 'NONE';
      }
      // Path B: Dark-to-Dark Motion + Grace Recovery (< 35 luma after >= 2500ms grace + motion or darkening drop)
      else if (
        elapsedSinceManualOff >= this.manualOffDarkGraceMs &&
        luminance < this.manualOffRearmLumaLux
      ) {
        if (
          this.hasMovedSinceManualOff ||
          hasFrameMotion ||
          hasDarkenedFurther
        ) {
          this.isManualOverride = false;
          this.manualOffTimestamp = null;
          this.hasMovedSinceManualOff = false;
          this.manualOffBaselineLuma = null;
          if (luminance < this.lowLightThreshold) {
            this.lowLightStartTime = now; // begin fresh 1000ms low-light confirmation
          }
          this.lastGuardReason = 'NONE';
        }
      }
    }

    // =========================================================================
    // Condition 1: Low Light (< 25 lux)
    // =========================================================================
    if (isLowLight(luminance, this.lowLightThreshold)) {
      this.restoreLightStartTime = null;

      if (this.lowLightStartTime === null) {
        this.lowLightStartTime = now;
      }

      const elapsed = now - this.lowLightStartTime;

      if (elapsed >= this.triggerDurationMs) {
        if (this.autoTorchEnabled && !this.isTorchOn && !this.isManualOverride) {
          if (isLatched) {
            this.lowLightStartTime = null;
            this.lastGuardReason = 'OSCILLATION_LATCH_HOLD';
            return {
              action: 'NO_OP',
              reason: 'NONE',
              guardReason: 'OSCILLATION_LATCH_HOLD',
              isTorchOn: this.isTorchOn,
              shouldPlayAudio: false,
              shouldVibrate: false,
            };
          }

          this.isTorchOn = true;
          this.torchAutoOnTimestamp = now;
          this.postTorchBaselineLuma = null;
          this.preTorchAmbientSensorLux = this.ambientSensorLux;
          this.restoreLightStartTime = null;
          this.reflectionGuardEngaged =
            this.hasCustomAntiStrobeConfig ||
            context !== undefined ||
            this.hasActiveDetection ||
            this.ambientSensorLux !== null ||
            this.autoCycleTimestamps.length > 0;
          this.lastActionReason = 'LOW_LIGHT_AUTO';
          this.lastGuardReason = 'NONE';
          return {
            action: 'TURN_ON',
            reason: 'LOW_LIGHT_AUTO',
            guardReason: 'NONE',
            isTorchOn: true,
            shouldPlayAudio: true,
            shouldVibrate: true,
            earcon: 'torch_on',
          };
        }
      }

      return {
        action: 'NO_OP',
        reason: 'NONE',
        guardReason: this.lastGuardReason,
        isTorchOn: this.isTorchOn,
        shouldPlayAudio: false,
        shouldVibrate: false,
      };
    }

    // =========================================================================
    // Condition 2: Restored Light (>= 60 lux)
    // =========================================================================
    if (isLightRestored(luminance, this.restoreLightThreshold)) {
      this.lowLightStartTime = null;

      // Layer 4a: Absolute protection of isManualOverride
      // NEVER clear isManualOverride while torch is ON!
      // Only re-arm auto mode if user manually turned torch OFF in dark and entered a genuinely bright room
      // AFTER the 250ms LED filament decay settle window.
      if (this.isManualOverride) {
        const elapsedSinceManualOff =
          this.manualOffTimestamp !== null
            ? Math.max(0, now - this.manualOffTimestamp)
            : Infinity;
        if (
          !this.isTorchOn &&
          elapsedSinceManualOff > this.manualOffSettleMs &&
          !hasSpatialReflection &&
          (this.ambientSensorLux === null ||
            this.ambientSensorLux >= this.ambientSensorRestoreLux)
        ) {
          this.isManualOverride = false;
          this.hasMovedSinceManualOff = false;
          this.manualOffBaselineLuma = null;
          this.lastGuardReason = 'NONE';
        } else {
          this.lastGuardReason = 'MANUAL_OVERRIDE_LOCK';
          return {
            action: 'NO_OP',
            reason: 'NONE',
            guardReason: 'MANUAL_OVERRIDE_LOCK',
            isTorchOn: this.isTorchOn,
            shouldPlayAudio: false,
            shouldVibrate: false,
          };
        }
      }

      // Auto turn-off evaluation when torch is ON
      if (this.autoTorchEnabled && this.isTorchOn && !this.isManualOverride) {
        // Layer 4b: Oscillation Latch check
        if (isLatched) {
          this.lastGuardReason = 'OSCILLATION_LATCH_HOLD';
          return {
            action: 'NO_OP',
            reason: 'NONE',
            guardReason: 'OSCILLATION_LATCH_HOLD',
            isTorchOn: this.isTorchOn,
            shouldPlayAudio: false,
            shouldVibrate: false,
          };
        }

        // Layer 3a: Active Banknote Detection Lock
        if (this.hasActiveDetection) {
          this.restoreLightStartTime = null;
          this.lastGuardReason = 'ACTIVE_DETECTION_LOCK';
          return {
            action: 'NO_OP',
            reason: 'NONE',
            guardReason: 'ACTIVE_DETECTION_LOCK',
            isTorchOn: this.isTorchOn,
            shouldPlayAudio: false,
            shouldVibrate: false,
          };
        }

        // Determine if 4-layer anti-strobe reflection & hold guard applies
        const useAntiStrobeGuard =
          this.reflectionGuardEngaged ||
          context !== undefined ||
          this.ambientSensorLux !== null ||
          this.postTorchBaselineLuma !== null ||
          luminance >= 80 ||
          elapsedSinceTorchOn !== 1000;

        if (useAntiStrobeGuard) {
          const baseline =
            this.postTorchBaselineLuma ?? this.restoreLightThreshold;
          const requiredYThreshold = Math.max(
            this.highRestoreThresholdLux,
            baseline + this.postTorchDeltaLux
          );

          // Layer 1 & Layer 2: Check whether true room illumination is restored
          let isTrueAmbientRecovery = false;
          if (this.ambientSensorLux !== null) {
            const wasShadowedInLitRoom =
              this.preTorchAmbientSensorLux !== null &&
              this.preTorchAmbientSensorLux >= this.ambientSensorRestoreLux;
            const sensorRestored = wasShadowedInLitRoom
              ? this.ambientSensorLux >= this.preTorchAmbientSensorLux! + 40 ||
                luminance >= requiredYThreshold
              : this.ambientSensorLux >= this.ambientSensorRestoreLux;
            isTrueAmbientRecovery = sensorRestored && !hasSpatialReflection;
          } else {
            isTrueAmbientRecovery =
              luminance >= requiredYThreshold && !hasSpatialReflection;
          }

          if (isTrueAmbientRecovery) {
            if (this.restoreLightStartTime === null) {
              this.restoreLightStartTime = now;
            }
          } else {
            this.restoreLightStartTime = null;
          }

          // Layer 3b: Minimum Torch ON Hold Duration (12,000ms)
          if (elapsedSinceTorchOn < this.minHoldDurationMs) {
            this.lastGuardReason = isTrueAmbientRecovery
              ? 'MIN_HOLD_COOLDOWN'
              : 'REFLECTION_GUARD_HOLD';
            return {
              action: 'NO_OP',
              reason: 'NONE',
              guardReason: this.lastGuardReason,
              isTorchOn: this.isTorchOn,
              shouldPlayAudio: false,
              shouldVibrate: false,
            };
          }

          // Layer 2b: Sustained recovery duration (>= 3000ms)
          if (
            !isTrueAmbientRecovery ||
            this.restoreLightStartTime === null ||
            now - this.restoreLightStartTime < this.restoreSustainDurationMs
          ) {
            this.lastGuardReason = 'REFLECTION_GUARD_HOLD';
            return {
              action: 'NO_OP',
              reason: 'NONE',
              guardReason: 'REFLECTION_GUARD_HOLD',
              isTorchOn: this.isTorchOn,
              shouldPlayAudio: false,
              shouldVibrate: false,
            };
          }
        }

        // All anti-strobe layers satisfied: turn OFF torch
        this.isTorchOn = false;
        this.torchAutoOnTimestamp = null;
        this.postTorchBaselineLuma = null;
        this.preTorchAmbientSensorLux = null;
        this.restoreLightStartTime = null;
        this.reflectionGuardEngaged = false;
        this.lastActionReason = 'RESTORE_LIGHT_AUTO';
        this.lastGuardReason = 'NONE';

        // Record completed auto ON-OFF cycle for Oscillation Latch
        this.autoCycleTimestamps.push(now);
        this.autoCycleTimestamps = this.autoCycleTimestamps.filter(
          ts => now - ts <= this.oscillationWindowMs
        );
        if (this.autoCycleTimestamps.length >= this.oscillationMaxCycles) {
          this.oscillationLatchUntil = now + this.oscillationLatchDurationMs;
        }

        return {
          action: 'TURN_OFF',
          reason: 'RESTORE_LIGHT_AUTO',
          guardReason: 'NONE',
          isTorchOn: false,
          shouldPlayAudio: true,
          shouldVibrate: false,
          earcon: 'torch_off',
        };
      }

      return {
        action: 'NO_OP',
        reason: 'NONE',
        guardReason: this.lastGuardReason,
        isTorchOn: this.isTorchOn,
        shouldPlayAudio: false,
        shouldVibrate: false,
      };
    }

    // =========================================================================
    // Condition 3: Intermediate Light (25 <= lux < 60)
    // Resets low light timer without toggling torch
    // =========================================================================
    this.lowLightStartTime = null;
    this.restoreLightStartTime = null;
    return {
      action: 'NO_OP',
      reason: 'NONE',
      guardReason: this.lastGuardReason,
      isTorchOn: this.isTorchOn,
      shouldPlayAudio: false,
      shouldVibrate: false,
    };
  }

  /**
   * User manual toggle via Double Tap gesture.
   * Activates Manual Override to prevent auto-switching until restored.
   * Preserves any active Oscillation Latch window so auto-torch circuit breaker
   * remains effective if manual override is later cleared before the 60s latch expires.
   *
   * @param targetState Explicit state to set, or undefined to toggle.
   * @param now Optional timestamp in ms for manual-OFF settle/grace tracking.
   */
  public handleManualToggle(
    targetState?: boolean,
    now?: number
  ): SmartTorchAction {
    if (now !== undefined) {
      this.lastSampleTimestamp = now;
      this.hasSampledTimestamp = true;
    }
    const next = targetState !== undefined ? targetState : !this.isTorchOn;
    this.isTorchOn = next;
    this.isManualOverride = true;
    this.lowLightStartTime = null;
    this.restoreLightStartTime = null;
    if (!next) {
      this.torchAutoOnTimestamp = null;
      this.postTorchBaselineLuma = null;
      this.preTorchAmbientSensorLux = null;
      this.manualOffTimestamp =
        now !== undefined
          ? now
          : this.hasSampledTimestamp
          ? this.lastSampleTimestamp
          : null;
      this.manualOffBaselineLuma = null;
      this.hasMovedSinceManualOff = false;
    } else {
      this.manualOffTimestamp = null;
      this.manualOffBaselineLuma = null;
      this.hasMovedSinceManualOff = false;
    }
    this.lastActionReason = 'MANUAL_TOGGLE';
    this.lastGuardReason = 'MANUAL_OVERRIDE_LOCK';

    return {
      action: next ? 'TURN_ON' : 'TURN_OFF',
      reason: 'MANUAL_TOGGLE',
      guardReason: 'MANUAL_OVERRIDE_LOCK',
      isTorchOn: next,
      shouldPlayAudio: true,
      shouldVibrate: true,
      earcon: next ? 'torch_on' : 'torch_off',
    };
  }

  /**
   * Update whether AI detector currently detects banknotes in the camera frame.
   * While true, auto-torch will never turn off the flashlight.
   */
  public setHasActiveDetection(active: boolean): void {
    this.hasActiveDetection = active;
    if (active) {
      this.restoreLightStartTime = null;
    }
  }

  /**
   * Update front-facing hardware light sensor reading (Sensor.TYPE_LIGHT in lux).
   */
  public setAmbientSensorLux(lux: number | null): void {
    this.ambientSensorLux = lux;
  }

  /**
   * Get captured post-torch reflection baseline luminance.
   */
  public getPostTorchBaselineLuma(): number | null {
    return this.postTorchBaselineLuma;
  }

  /**
   * Ticket 09: Auto-Torch Idle Thermal Cutoff (Safety Fuse).
   * Safely turns off auto-triggered torch when the phone has been left idle with no money
   * for >= 15s (or placed face-down / in pocket >= 4s), preventing pocket overheating.
   * Respects manual override and active banknote detection locks.
   */
  public handleIdleThermalCutoff(timestamp?: number): SmartTorchAction {
    if (timestamp !== undefined) {
      this.lastSampleTimestamp = timestamp;
      this.hasSampledTimestamp = true;
    }
    if (!this.isTorchOn || this.isManualOverride || this.hasActiveDetection) {
      return {
        action: 'NO_OP',
        reason: 'NONE',
        guardReason: this.isManualOverride
          ? 'MANUAL_OVERRIDE_LOCK'
          : this.hasActiveDetection
          ? 'ACTIVE_DETECTION_LOCK'
          : 'NONE',
        isTorchOn: this.isTorchOn,
        shouldPlayAudio: false,
        shouldVibrate: false,
      };
    }

    this.isTorchOn = false;
    this.torchAutoOnTimestamp = null;
    this.postTorchBaselineLuma = null;
    this.preTorchAmbientSensorLux = null;
    this.lowLightStartTime = null;
    this.restoreLightStartTime = null;
    this.reflectionGuardEngaged = false;
    this.lastActionReason = 'IDLE_THERMAL_CUTOFF';
    this.lastGuardReason = 'NONE';

    return {
      action: 'TURN_OFF',
      reason: 'IDLE_THERMAL_CUTOFF',
      guardReason: 'NONE',
      isTorchOn: false,
      shouldPlayAudio: true,
      shouldVibrate: false,
      earcon: 'torch_off',
    };
  }

  /**
   * Synchronizes internal torch state with external / hardware native state
   * without creating a manual override.
   */
  public syncTorchState(isOn: boolean): void {
    if (this.isTorchOn !== isOn) {
      this.isTorchOn = isOn;
      if (isOn && this.torchAutoOnTimestamp === null) {
        this.torchAutoOnTimestamp = this.lastSampleTimestamp;
      } else if (!isOn && !this.isManualOverride) {
        this.lowLightStartTime = null;
        this.restoreLightStartTime = null;
        this.torchAutoOnTimestamp = null;
        this.postTorchBaselineLuma = null;
        this.preTorchAmbientSensorLux = null;
      }
    }
  }

  /**
   * Restores automatic torch control, clearing any manual override.
   */
  public resetManualOverride(): void {
    this.isManualOverride = false;
    this.manualOffTimestamp = null;
    this.manualOffBaselineLuma = null;
    this.hasMovedSinceManualOff = false;
    this.lowLightStartTime = null;
    this.restoreLightStartTime = null;
    this.lastGuardReason = 'NONE';
  }

  /**
   * Enable or disable automatic torch trigger.
   */
  public setAutoTorchEnabled(enabled: boolean): void {
    this.autoTorchEnabled = enabled;
    if (!enabled) {
      this.lowLightStartTime = null;
      this.restoreLightStartTime = null;
    }
  }

  /**
   * Get current state of the smart torch engine.
   */
  public getState(): SmartTorchState {
    const now = this.lastSampleTimestamp;
    const duration =
      this.lowLightStartTime !== null
        ? Math.max(0, now - this.lowLightStartTime)
        : 0;
    const torchOnDuration =
      this.isTorchOn && this.torchAutoOnTimestamp !== null
        ? Math.max(0, now - this.torchAutoOnTimestamp)
        : 0;
    const isLatched = this.updateOscillationState(now);

    return {
      isTorchOn: this.isTorchOn,
      isManualOverride: this.isManualOverride,
      autoTorchEnabled: this.autoTorchEnabled,
      luminance: this.currentLuminance,
      lowLightDurationMs: duration,
      lastActionReason: this.lastActionReason,
      guardReason: this.lastGuardReason,
      postTorchBaselineLuma: this.postTorchBaselineLuma,
      torchOnDurationMs: torchOnDuration,
      hasActiveDetection: this.hasActiveDetection,
      ambientSensorLux: this.ambientSensorLux,
      isOscillationLatched: isLatched,
      oscillationCycleCount: this.autoCycleTimestamps.length,
      hasMovedSinceManualOff: this.hasMovedSinceManualOff,
      manualOffBaselineLuma: this.manualOffBaselineLuma,
    };
  }

  /**
   * Reset all state to defaults.
   */
  public reset(): void {
    this.isTorchOn = false;
    this.isManualOverride = false;
    this.lowLightStartTime = null;
    this.restoreLightStartTime = null;
    this.torchAutoOnTimestamp = null;
    this.postTorchBaselineLuma = null;
    this.preTorchAmbientSensorLux = null;
    this.manualOffTimestamp = null;
    this.manualOffBaselineLuma = null;
    this.hasMovedSinceManualOff = false;
    this.reflectionGuardEngaged = false;
    this.hasActiveDetection = false;
    this.ambientSensorLux = null;
    this.autoCycleTimestamps = [];
    this.oscillationLatchUntil = null;
    this.currentLuminance = 100;
    this.lastActionReason = 'NONE';
    this.lastGuardReason = 'NONE';
    this.lastSampleTimestamp = Date.now();
    this.hasSampledTimestamp = false;
  }
}

