/**
 * Camera & Smart Torch Types for MoneyVision
 * Real-time CameraX Ambient Luminance Analysis & Smart Torch Control
 */

export interface LuminanceSpatialMetrics {
  /** Overall average Y-plane luminance (0.0 - 255.0) */
  averageLuma: number;
  /** Average luminance of the center ROI (0.0 - 255.0) */
  centerLuma: number;
  /** Average luminance of the peripheral border ROI (0.0 - 255.0) */
  borderLuma: number;
  /** Ratio of pixels with specular glare Y > 230 (0.0 - 1.0) */
  glareRatio: number;
  /** Ratio of centerLuma to borderLuma (hotspot indicator) */
  centerToBorderRatio: number;
  /** Whether spatial profile indicates close-range LED reflection */
  isCloseRangeReflection: boolean;
}

/**
 * Ticket 09: Unified single-pass luminance, spatial reflection, and 16x16 Luma Grid motion metrics
 */
export interface LuminanceAndMotionMetrics extends LuminanceSpatialMetrics {
  /** 16x16 = 256 cell average luma grid extracted in the same single pass */
  lumaGrid16x16: Uint8Array;
  /** Mean absolute luma difference ΔY = (1/256) * sum(|Y_t - Y_{t-1}|) across 256 grid cells */
  motionDeltaY: number;
  /** Whether frame has severe motion blur (ΔY > 32.0) and should skip TFLite inference */
  isMotionBlurred: boolean;
}

export interface LuminanceSampleContext {
  /** Ratio of pixels exceeding specular glare threshold Y > 230 (0.0 - 1.0) */
  glareRatio?: number;
  /** Center region luminance (0 - 255) */
  centerLuma?: number;
  /** Border region luminance (0 - 255) */
  borderLuma?: number;
  /** Ratio of center luminance to border luminance */
  centerToBorderRatio?: number;
  /** Hardware front ambient light sensor reading in lux (Sensor.TYPE_LIGHT), or null if unavailable */
  ambientSensorLux?: number | null;
  /** Whether AI detector currently sees a banknote in frame */
  hasActiveDetection?: boolean;
  /** Ticket 09/12: 16x16 Luma Grid optical motion delta ΔY */
  motionDeltaY?: number;
  /** Ticket 12 alias for motionDeltaY */
  frameDeltaY?: number;
  /** Ticket 09/12: Linear acceleration / accelerometer delta Δa (m/s^2) */
  accelMagnitudeDelta?: number;
  /** Ticket 12 alias for accelMagnitudeDelta */
  imuLinearAccelDelta?: number;
  /** Ticket 09: Whether proximity sensor indicates face-down / pocket occlusion */
  isProximityNear?: boolean;
  /** Ticket 09: Whether YOLO pre-filter found a weak banknote hint (0.28 <= score < 0.50) */
  hasCandidateHint?: boolean;
}

export type LuminanceSampleMeta = LuminanceSampleContext;

export interface LuminanceSample {
  luminance: number;
  timestamp: number;
  context?: LuminanceSampleContext;
}

export type SmartTorchActionType = 'TURN_ON' | 'TURN_OFF' | 'NO_OP';

export type SmartTorchReason =
  | 'LOW_LIGHT_AUTO'
  | 'RESTORE_LIGHT_AUTO'
  | 'IDLE_THERMAL_CUTOFF'
  | 'MANUAL_TOGGLE'
  | 'MANUAL_FORCE_ON'
  | 'MANUAL_FORCE_OFF'
  | 'NONE';

export type SmartTorchGuardReason =
  | 'NONE'
  | 'MIN_HOLD_COOLDOWN'
  | 'ACTIVE_DETECTION_LOCK'
  | 'REFLECTION_GUARD_HOLD'
  | 'MANUAL_OVERRIDE_LOCK'
  | 'OSCILLATION_LATCH_HOLD';

export interface SmartTorchAction {
  action: SmartTorchActionType;
  reason: SmartTorchReason;
  guardReason?: SmartTorchGuardReason;
  isTorchOn: boolean;
  shouldPlayAudio: boolean;
  shouldVibrate: boolean;
  earcon?: 'torch_on' | 'torch_off';
}

export interface SmartTorchConfig {
  /** Low light threshold in lux to trigger torch (default: 25 lux) */
  lowLightThresholdLux?: number;
  /** Ambient light recovery threshold in lux to turn off torch (default: 60 lux) */
  restoreLightThresholdLux?: number;
  /** Required continuous duration in ms before auto-triggering (default: 1000ms / 1s) */
  triggerDurationMs?: number;
  /** Minimum hold duration in ms once torch auto-turns on (default: 12000ms / 12s) */
  minHoldDurationMs?: number;
  /** Window after auto-torch ON to capture post-torch reflection baseline (default: 450ms) */
  postTorchBaselineWindowMs?: number;
  /** High Y-plane recovery threshold when torch is on (default: 175 lux) */
  highRestoreThresholdLux?: number;
  /** Required delta above postTorchBaselineLuma for Y-plane recovery (default: 55 lux) */
  postTorchDeltaLux?: number;
  /** Required continuous duration of restored light before auto-turning off (default: 3000ms / 3s) */
  restoreSustainDurationMs?: number;
  /** Hardware front ambient light sensor threshold in lux for room recovery (default: 85 lux) */
  ambientSensorRestoreLux?: number;
  /** Rolling window in ms to detect rapid auto-torch oscillation (default: 30000ms / 30s) */
  oscillationWindowMs?: number;
  /** Number of auto ON-OFF cycles in window to trigger oscillation latch (default: 2) */
  oscillationMaxCycles?: number;
  /** Duration in ms to lock torch state when oscillation latch triggers (default: 60000ms / 60s) */
  oscillationLatchDurationMs?: number;
  /** Ticket 12: Post-toggle Camera2 ImageReader pipeline drain window in ms (default: 250ms) */
  manualOffSettleMs?: number;
  /** Ticket 12: Post-toggle delay in ms before latching user movement (default: 400ms) */
  manualOffMotionArmDelayMs?: number;
  /** Ticket 12: Unassisted rear-camera Y-plane luma threshold in lux that clears manual OFF override (default: 35 lux) */
  manualOffRearmLumaLux?: number;
  /** Ticket 12: Minimum suppression grace window in ms in continuous darkness when user relocates or scene darkens further (default: 2500ms) */
  manualOffDarkGraceMs?: number;
  /** Ticket 12: Further scene luma drop below manualOffBaselineLuma in lux indicating deeper darkness (default: 6 lux) */
  manualOffDarkeningDropLux?: number;
  /** Ticket 12: Frame-to-frame Y-plane luma delta ΔY indicating camera pan/walking after manual OFF (default: 4.5) */
  manualOffMotionDeltaY?: number;
  /** Ticket 12: Linear acceleration delta Δa (m/s^2) indicating physical walking/relocation after manual OFF (default: 0.35) */
  manualOffImuAccelDelta?: number;
  /** Whether auto-torch is enabled by default */
  autoTorchEnabled?: boolean;
}

export interface SmartTorchState {
  isTorchOn: boolean;
  isManualOverride: boolean;
  autoTorchEnabled: boolean;
  luminance: number;
  lowLightDurationMs: number;
  lastActionReason: SmartTorchReason;
  guardReason?: SmartTorchGuardReason;
  postTorchBaselineLuma: number | null;
  torchOnDurationMs: number;
  hasActiveDetection: boolean;
  ambientSensorLux: number | null;
  isOscillationLatched: boolean;
  oscillationCycleCount: number;
  hasMovedSinceManualOff?: boolean;
  manualOffBaselineLuma?: number | null;
}

/**
 * Ticket 09: 3-Tier Adaptive Power & Thermal Governor Types
 */
export type PowerState = 'BURST' | 'ECO' | 'HIBERNATION';

export type ThermalLevel = 'NOMINAL' | 'WARM' | 'HOT';

export type WakeUpReason =
  | 'OPTICAL_MOTION'
  | 'IMU_ACCELERATION'
  | 'PROXIMITY_UNCOVERED'
  | 'LIGHT_SENSOR_JUMP'
  | 'TOUCH_INTERACTION'
  | 'ACTIVE_DETECTION'
  | 'CANDIDATE_HINT'
  | 'WITHDRAWAL_TRANSITION'
  | 'MANUAL_RESET'
  | 'NONE';

export interface PowerGovernorTelemetry {
  /** Frame or event timestamp in ms */
  timestamp?: number;
  /** 16x16 Luma Grid optical motion delta ΔY (0.0 - 255.0) */
  motionDeltaY?: number;
  /** Overall Y-plane average luminance (0.0 - 255.0) */
  luminance?: number;
  /** Front-facing hardware light sensor reading in lux (Sensor.TYPE_LIGHT) */
  ambientSensorLux?: number | null;
  /** Linear acceleration / accelerometer delta Δa in m/s^2 */
  accelMagnitudeDelta?: number;
  /** Whether proximity sensor reports near/occluded (e.g., face-down or in pocket) */
  isProximityNear?: boolean;
  /** Whether user just touched or tapped the screen */
  isTouchActive?: boolean;
  /** Current 5-frame temporal debounce state */
  debounceState?: 'EMPTY' | 'STABILIZING' | 'STABLE';
  /** Whether money is currently detected */
  hasMoney?: boolean;
  /** Whether weak candidate hint (0.28 <= score < 0.50) is present in current frame */
  hasCandidateHint?: boolean;
  /** Number of consecutive empty frames (1..2 indicates withdrawal in progress) */
  consecutiveEmptyFrames?: number;
  /** Whether LED torch is currently ON */
  isTorchOn?: boolean;
  /** Whether LED torch was manually toggled by user */
  isManualTorchOverride?: boolean;
  /** Whether auto-torch oscillation latch is currently active */
  isOscillationLatched?: boolean;
  /** Continuous duration of low light (< 25 lux) in ms */
  lowLightDurationMs?: number;
  /** Continuous duration that auto-torch has been ON in ms */
  torchOnDurationMs?: number;
  /** Battery temperature in degrees Celsius (from BatteryManager.EXTRA_TEMPERATURE / 10) */
  batteryTempCelsius?: number;
  /** Remaining battery percentage (0 - 100) */
  batteryPercent?: number;
  /** Whether Android Battery Saver (PowerManager.isPowerSaveMode) is active */
  isPowerSaveMode?: boolean;
  /** Android PowerManager.getCurrentThermalStatus() value (0=NONE .. 4=CRITICAL) */
  androidThermalStatus?: number;
}

export interface PowerGovernorEvaluation {
  powerState: PowerState;
  previousPowerState: PowerState;
  stateChanged: boolean;
  thermalLevel: ThermalLevel;
  /** Target interval between TFLite inferences in ms */
  inferenceIntervalMs: number;
  /** True when ΔY > 32.0: stay in BURST but skip TFLite and do NOT feed fake EMPTY into debounce */
  shouldSkipInferenceForMotionBlur: boolean;
  /** Whether TFLite inference should execute on this frame */
  shouldRunInference: boolean;
  /** Target Camera2/CameraX AE FPS range [minFps, maxFps] */
  targetAeFpsRange: [number, number];
  /** True in HIBERNATION when !isTorchOn: call captureSession.stopRepeating() */
  shouldStopCameraRepeating: boolean;
  /** Single-frame readerSurface heartbeat period in ms during HIBERNATION (1500ms or 3000ms) */
  heartbeatIntervalMs: number;
  /** Auto-Torch Idle Thermal Cutoff fuse when left idle empty >= 15s or occluded >= 4s */
  shouldAutoCutoffIdleTorch: boolean;
  /** TextureView / PreviewView alpha (0.22 in BURST, 0.08 in ECO, 0.0 in HIBERNATION/HOT for OLED True Black) */
  previewAlpha: number;
  /** Whether EdgePulseBorder 60 FPS loop should pause to static opacity (0.85 in ECO, 0.0 in HIBERNATION) */
  shouldPauseBorderLoop: boolean;
  /** Window screenBrightness override (-1.0 for system default, 0.01 in HIBERNATION) */
  screenBrightness: number;
  /** Whether FLAG_KEEP_SCREEN_ON should remain active (cleared after >= 180s in HIBERNATION, restored on wake) */
  keepScreenOn: boolean;
  /** Adaptive IMU wake threshold (0.35 m/s^2 default, 0.65 m/s^2 after >= 3 false table-vibration wakes) */
  effectiveImuWakeThreshold: number;
  /** Reason for the most recent wake-up to BURST */
  wakeUpReason: WakeUpReason;
  /** Continuous duration of static scene in ms */
  staticDurationMs: number;
  /** Continuous duration in HIBERNATION in ms */
  hibernationDurationMs: number;
}


