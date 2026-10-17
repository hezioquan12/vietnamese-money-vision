/**
 * Standalone Test Runner using Node.js built-in test & assert modules
 * Zero external dependencies required.
 */
import test from 'node:test';
import assert from 'node:assert';

// 1. Import formatters and contrast calculator
import {
  formatVND,
  formatSpokenVND,
  formatDetectionSummary,
  calculateContrastRatio,
} from '../src/utils/formatters.ts';

// 2. Import theme and author constants
import {
  THEME,
  EDGE_PALM_REJECTION_DP,
  MIN_TOUCH_TARGET_DP,
  DENOMINATION_VISUAL_SPECS,
  getDenominationVisualSpec,
  formatPowerStateBadge,
  getPowerStateBadgeSpec,
} from '../src/constants/theme.ts';
import { AUTHOR_INFO } from '../src/constants/author.ts';

// 3. Import gesture recognizer and haptics
import {
  GestureRecognizer,
  isPointInsideSafeZone,
  filterInteriorTouchPoints,
} from '../src/utils/gestureRecognizer.ts';
import {
  CANDIDATE_GUIDANCE_PULSE_MS,
  CANDIDATE_GUIDANCE_COOLDOWN_MS,
  DENOMINATION_VIBRATION_PATTERNS,
  getDenominationVibrationPattern,
  haptics,
} from '../src/services/haptics.ts';

// 4. Import types and denominations
import {
  SUPPORTED_DENOMINATIONS,
  DENOMINATION_NAMES,
} from '../src/types/money.ts';

// 5. Import audio system
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import {
  ensureAudioAssetsSync,
  isRealAudioPayload,
} from '../src/services/audio/assetGenerator.ts';
import {
  DENOMINATION_TO_CLIP,
  QUANTITY_TO_CLIP,
  AUDIO_CLIPS_META,
  getDenominationClip,
  getQuantityClip,
  buildDetectionAudioSequence,
  buildWalletAudioSequence,
  formatClipsToVietnamese,
} from '../src/services/audio/audioRegistry.ts';
import { SimulatedAudioDriver } from '../src/services/audio/SimulatedAudioDriver.ts';
import {
  createDefaultAudioDriver,
  NativeAudioDriver,
} from '../src/services/audio/AudioDriver.ts';
import { AudioQueueManager } from '../src/services/audio/AudioQueueManager.ts';
import {
  SmartPreemptionController,
  DefaultHapticNotifier,
} from '../src/services/audio/SmartPreemptionController.ts';

// 6. Import camera and smart torch system
import {
  calculateYPlaneLuminance,
  analyzeYPlaneSpatialProfile,
  analyzeYPlaneSinglePass,
  calculateLumaGridMotionDelta,
  isOpticalReflectionLikely,
  isLowLight,
  isLightRestored,
  LOW_LIGHT_THRESHOLD_LUX,
  RESTORE_LIGHT_THRESHOLD_LUX,
  TRIGGER_DURATION_MS,
  MIN_TORCH_ON_HOLD_MS,
  POST_TORCH_BASELINE_WINDOW_MS,
  HIGH_RESTORE_LIGHT_THRESHOLD_LUX,
  POST_TORCH_DELTA_LUX,
  RESTORE_SUSTAIN_DURATION_MS,
  AMBIENT_SENSOR_RESTORE_LUX,
  SPECULAR_GLARE_PIXEL_THRESHOLD,
  MAX_GLARE_RATIO_FOR_RESTORE,
  MAX_CENTER_TO_BORDER_RATIO,
  OSCILLATION_WINDOW_MS,
  OSCILLATION_MAX_CYCLES,
  OSCILLATION_LATCH_DURATION_MS,
  LUMA_GRID_DIMENSION,
  LUMA_GRID_CELLS,
  MOTION_BLUR_DELTA_Y_THRESHOLD,
  MOTION_WAKE_DELTA_Y_THRESHOLD,
  STATIC_HOLDING_DELTA_Y_THRESHOLD,
  STATIC_EMPTY_DELTA_Y_THRESHOLD,
  STATIC_DEEP_IDLE_DELTA_Y_THRESHOLD,
  BURST_INTERVAL_NOMINAL_MS,
  BURST_INTERVAL_WARM_MS,
  BURST_INTERVAL_HOT_MS,
  ECO_INTERVAL_NOMINAL_MS,
  ECO_INTERVAL_WARM_MS,
  ECO_INTERVAL_HOT_MS,
  HIBERNATION_HEARTBEAT_MS,
  HIBERNATION_DARK_HEARTBEAT_MS,
  ECO_ENTRY_STATIC_DURATION_NOMINAL_MS,
  ECO_ENTRY_STATIC_DURATION_WARM_MS,
  ECO_ENTRY_STATIC_DURATION_HOT_MS,
  HIBERNATION_ENTRY_DARK_STATIC_MS,
  HIBERNATION_ENTRY_EMPTY_STATIC_NOMINAL_MS,
  HIBERNATION_ENTRY_EMPTY_STATIC_HOT_MS,
  HIBERNATION_KEEP_SCREEN_ON_TIMEOUT_MS,
  AUTO_TORCH_IDLE_CUTOFF_MS,
  AUTO_TORCH_PROXIMITY_CUTOFF_MS,
  IMU_WAKE_DELTA_A_DEFAULT,
  IMU_WAKE_DELTA_A_ADAPTIVE_TABLE,
  IMU_FALSE_WAKE_MAX_STREAK,
  IMU_DEEP_IDLE_MAX_DELTA_A,
  LIGHT_SENSOR_WAKE_JUMP_LUX,
  DARK_OCCLUDED_LUX_THRESHOLD,
  THERMAL_WARM_TEMP_CELSIUS,
  THERMAL_HOT_TEMP_CELSIUS,
  LOW_BATTERY_THRESHOLD_PERCENT,
  PREVIEW_ALPHA_BURST,
  PREVIEW_ALPHA_ECO,
  PREVIEW_ALPHA_HIBERNATION,
  MANUAL_OFF_SETTLE_MS,
  MANUAL_OFF_MOTION_ARM_DELAY_MS,
  MANUAL_OFF_REARM_LUMA_LUX,
  MANUAL_OFF_DARK_GRACE_MS,
  MANUAL_OFF_DARKENING_DROP_LUX,
  MANUAL_OFF_MOTION_DELTA_Y,
  MANUAL_OFF_IMU_ACCEL_DELTA,
  SmartTorchController,
  AdaptivePowerGovernor,
  cameraBridge,
} from '../src/services/camera/index.ts';

// 7. Import YOLO26 LiteRT Engine and Detector System
import {
  YOLO_INPUT_WIDTH,
  YOLO_INPUT_HEIGHT,
  YOLO_TOTAL_CHANNELS,
  YOLO_NUM_ANCHORS,
  YOLO_TENSOR_ELEMENTS,
  YOLO_SCORE_THRESHOLD,
  YOLO_IOU_THRESHOLD,
  YOLO_CANDIDATE_HINT_THRESHOLD,
  YUV_CACHE_TILE_SIZE,
  TARGET_INFERENCE_FPS_MIN,
  TARGET_INFERENCE_FPS_MAX,
  DEFAULT_INFERENCE_FPS,
  YOLO_CLASS_ORDER,
  YOLO_CLASS_INDEX_TO_DENOMINATION,
  DENOMINATION_TO_YOLO_CLASS_INDEX,
  getYoloClassByIndex,
  getYoloClassByChannelIndex,
  getYoloIndexByDenomination,
  getYoloLabelByIndex,
  decodeYoloTensor,
  getLastDecodeTelemetry,
  NORM_LUT_256,
  convertYuv420ToNchwTiled,
  sigmoid,
  calculateIoU,
  nonMaximumSuppression,
  aggregateDetections,
  MockMoneyDetector,
  NativeDetectorBridge,
  detectorBridge,
} from '../src/services/detector/index.ts';

// 8. Import Temporal Debounce System
import {
  TemporalDebounceFilter,
  PresentationWalletAccumulator,
  PRESENTATION_EMPTY_RESET_MS,
  PRESENTATION_CONTINUITY_GRACE_MS,
  DENOMINATION_REFINEMENT_WINDOW_MS,
  computeDebounceSignature,
  aggregateDebounceItems,
  calculateAddedItemsDelta,
} from '../src/services/debounce/index.ts';

// 9. Import Ticket 07 Packaging & Security Verification
import {
  verifyAllCriteria,
  checkZeroNetworkManifest,
  checkReleaseKeystore,
  checkAbiFilters,
  checkSplitsAbiDisabled,
  checkSdkVersions,
  checkSigningConfigSchemes,
  checkProguardRules,
  checkAudioAssetsInRaw,
  checkModelAssetsReady,
  checkMainApplicationPackages,
  inspectApkPackage,
  checkAndroidSdkPath,
  checkAllPrerequisites,
  REQUIRED_RAW_AUDIO_FILES,
  ensureModelAssetsSync,
  checkAuthorAndCopyrightMetadata,
} from './verify-apk-package.mjs';
import {
  buildReleaseApk,
  buildUniversalApkArchive,
  findGradleExecutable,
  ensureLocalProperties,
} from './build-release-apk.mjs';
import { locateAndroidSdkTools } from './android-sdk-builder.mjs';


test('1. THEME & WCAG AAA Compliance', async (t) => {
  await t.test('OLED Black and Solar Yellow contrast ratio must exceed WCAG AAA (>= 7.0:1)', () => {
    const ratio = calculateContrastRatio(
      THEME.colors.primaryYellow,
      THEME.colors.background
    );
    console.log(`   [WCAG Check] Solar Yellow on OLED Black contrast ratio: ${ratio.toFixed(2)}:1`);
    assert.ok(
      ratio >= 7.0,
      `Contrast ratio ${ratio} must be at least 7.0:1 for WCAG AAA`
    );
    assert.ok(
      ratio > 16.0,
      `Expected solar yellow #FFE600 on #000000 to have extreme contrast > 16:1, got ${ratio}`
    );
  });

  await t.test('Secondary white on OLED black must exceed WCAG AAA (>= 7.0:1)', () => {
    const ratio = calculateContrastRatio(
      THEME.colors.secondaryWhite,
      THEME.colors.background
    );
    console.log(`   [WCAG Check] White on OLED Black contrast ratio: ${ratio.toFixed(2)}:1`);
    assert.ok(ratio >= 7.0, `White contrast ratio ${ratio} must be >= 7.0:1`);
  });

  await t.test('Accent red on OLED black must exceed WCAG AAA (>= 7.0:1)', () => {
    const ratio = calculateContrastRatio(
      THEME.colors.accentRed,
      THEME.colors.background
    );
    console.log(`   [WCAG Check] Accent Red on OLED Black contrast ratio: ${ratio.toFixed(2)}:1`);
    assert.ok(
      ratio >= 7.0,
      `Accent Red contrast ratio ${ratio} must be >= 7.0:1 for WCAG AAA`
    );
  });

  await t.test('Primary and Hero typography must be >= 48sp as required by Ticket 02', () => {
    assert.ok(
      THEME.typography.fontSizePrimary >= 48,
      `fontSizePrimary (${THEME.typography.fontSizePrimary}) must be >= 48`
    );
    assert.ok(
      THEME.typography.fontSizeHero >= 48,
      `fontSizeHero (${THEME.typography.fontSizeHero}) must be >= 48`
    );
    assert.strictEqual(
      THEME.typography.fontFamilyMono,
      'monospace',
      'Font family must be monospace'
    );
  });

  await t.test('Edge border width must be exactly 8dp', () => {
    assert.strictEqual(
      THEME.layout.edgeBorderWidth,
      8,
      'Edge border width must be 8'
    );
  });
});

test('2. Vietnamese Currency & Formatters', async (t) => {
  await t.test('All 9 denominations are present from 1k to 500k', () => {
    const expected = [1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000];
    assert.deepStrictEqual(Array.from(SUPPORTED_DENOMINATIONS), expected);
    for (const d of expected) {
      assert.ok(DENOMINATION_NAMES[d], `Label for ${d} must exist`);
    }
  });

  await t.test('formatVND formats values with dot separators and currency symbol', () => {
    assert.strictEqual(formatVND(0), '0 đ');
    assert.strictEqual(formatVND(1000), '1.000 đ');
    assert.strictEqual(formatVND(20000), '20.000 đ');
    assert.strictEqual(formatVND(100000), '100.000 đ');
    assert.strictEqual(formatVND(500000), '500.000 đ');
    assert.strictEqual(formatVND(1250000), '1.250.000 đ');
  });

  await t.test('formatSpokenVND generates natural Vietnamese speech strings', () => {
    assert.strictEqual(formatSpokenVND(0), 'Không đồng');
    assert.strictEqual(formatSpokenVND(1000), 'Một nghìn đồng');
    assert.strictEqual(formatSpokenVND(10000), 'Mười nghìn đồng');
    assert.strictEqual(formatSpokenVND(50000), 'Năm mươi nghìn đồng');
    assert.strictEqual(formatSpokenVND(100000), 'Một trăm nghìn đồng');
    assert.strictEqual(formatSpokenVND(500000), 'Năm trăm nghìn đồng');
    assert.strictEqual(formatSpokenVND(1000000), '1 triệu đồng');
    assert.strictEqual(formatSpokenVND(1500000), '1 triệu 500 nghìn đồng');
  });

  await t.test('formatDetectionSummary handles empty, single and multiple items', () => {
    // Empty state
    const empty = formatDetectionSummary([]);
    assert.strictEqual(empty.headline, 'CHƯA CÓ TIỀN');
    assert.strictEqual(empty.spokenText, 'Không có tiền trong tầm quét');

    // Single item
    const single = formatDetectionSummary([
      { classId: 500000, count: 1, label: 'Năm trăm nghìn', totalAmount: 500000 },
    ]);
    assert.strictEqual(single.headline, '1 TỜ');
    assert.strictEqual(single.detail, '500.000 đ');
    assert.strictEqual(single.spokenText, 'Năm trăm nghìn đồng');

    // Multiple items
    const multi = formatDetectionSummary([
      { classId: 100000, count: 2, label: 'Một trăm nghìn', totalAmount: 200000 },
      { classId: 50000, count: 1, label: 'Năm mươi nghìn', totalAmount: 50000 },
    ]);
    assert.strictEqual(multi.headline, '3 TỜ');
    assert.strictEqual(multi.detail, '250.000 đ');
    assert.ok(multi.spokenText.includes('Hai tờ một trăm nghìn'));
    assert.ok(multi.spokenText.includes('một tờ năm mươi nghìn'));
  });
});

test('3. GestureRecognizer State Machine', async (t) => {
  await t.test('Single Tap triggers when released without second tap', async () => {
    let singleTapCount = 0;
    let doubleTapCount = 0;

    const recognizer = new GestureRecognizer(
      {
        onSingleTap: () => { singleTapCount++; },
        onDoubleTap: () => { doubleTapCount++; },
      },
      { doubleTapThresholdMs: 50, longPressThresholdMs: 200 }
    );

    // Touch down and up quickly
    recognizer.handleTouchStart({ touchCount: 1, x: 100, y: 100, timestamp: 1000 });
    recognizer.handleTouchEnd({ touchCount: 0, x: 100, y: 100, timestamp: 1050 });

    assert.strictEqual(singleTapCount, 0, 'Single tap should wait for double tap window');

    // Wait past doubleTapThreshold
    await new Promise(r => setTimeout(r, 70));

    assert.strictEqual(singleTapCount, 1, 'Single tap should have fired');
    assert.strictEqual(doubleTapCount, 0, 'Double tap should not have fired');

    recognizer.destroy();
  });

  await t.test('Double Tap triggers when tapped twice within window', async () => {
    let singleTapCount = 0;
    let doubleTapCount = 0;

    const recognizer = new GestureRecognizer(
      {
        onSingleTap: () => { singleTapCount++; },
        onDoubleTap: () => { doubleTapCount++; },
      },
      { doubleTapThresholdMs: 100, longPressThresholdMs: 500 }
    );

    // Tap 1
    recognizer.handleTouchStart({ touchCount: 1, x: 100, y: 100, timestamp: 1000 });
    recognizer.handleTouchEnd({ touchCount: 0, x: 100, y: 100, timestamp: 1040 });

    // Tap 2 within 50ms
    recognizer.handleTouchStart({ touchCount: 1, x: 102, y: 102, timestamp: 1090 });
    recognizer.handleTouchEnd({ touchCount: 0, x: 102, y: 102, timestamp: 1130 });

    assert.strictEqual(doubleTapCount, 1, 'Double tap should trigger immediately on 2nd tap end');

    // Wait past doubleTap threshold
    await new Promise(r => setTimeout(r, 120));

    assert.strictEqual(singleTapCount, 0, 'Single tap should NOT fire on double tap');
    assert.strictEqual(doubleTapCount, 1, 'Double tap should remain 1');

    recognizer.destroy();
  });

  await t.test('Long Press triggers after 1000ms hold and suppresses tap', async () => {
    let singleTapCount = 0;
    let longPressCount = 0;

    const recognizer = new GestureRecognizer(
      {
        onSingleTap: () => { singleTapCount++; },
        onLongPress: () => { longPressCount++; },
      },
      { doubleTapThresholdMs: 50, longPressThresholdMs: 80 }
    );

    recognizer.handleTouchStart({ touchCount: 1, x: 100, y: 100, timestamp: 1000 });

    // Wait 100ms (past 80ms longPress threshold)
    await new Promise(r => setTimeout(r, 100));

    assert.strictEqual(longPressCount, 1, 'Long press should have triggered');

    // Release finger
    recognizer.handleTouchEnd({ touchCount: 0, x: 100, y: 100, timestamp: 1150 });

    await new Promise(r => setTimeout(r, 70));

    assert.strictEqual(singleTapCount, 0, 'Single tap must not fire after long press');
    assert.strictEqual(longPressCount, 1, 'Long press count remains 1');

    recognizer.destroy();
  });

  await t.test('Finger movement beyond threshold cancels tap and long press', async () => {
    let singleTapCount = 0;
    let longPressCount = 0;

    const recognizer = new GestureRecognizer(
      {
        onSingleTap: () => { singleTapCount++; },
        onLongPress: () => { longPressCount++; },
      },
      { doubleTapThresholdMs: 50, longPressThresholdMs: 80, maxMoveDistance: 15 }
    );

    recognizer.handleTouchStart({ touchCount: 1, x: 100, y: 100, timestamp: 1000 });
    // Move 50px (drag)
    recognizer.handleTouchMove({ touchCount: 1, dx: 50, dy: 0 });

    await new Promise(r => setTimeout(r, 100));
    assert.strictEqual(longPressCount, 0, 'Long press must be cancelled by movement');

    recognizer.handleTouchEnd({ touchCount: 0, x: 150, y: 100, timestamp: 1120 });
    await new Promise(r => setTimeout(r, 70));

    assert.strictEqual(singleTapCount, 0, 'Single tap must be cancelled by movement');

    recognizer.destroy();
  });

  await t.test('Two-Finger Double Tap triggers when two fingers tap twice', async () => {
    let twoFingerDoubleTapCount = 0;
    let singleTapCount = 0;

    const recognizer = new GestureRecognizer(
      {
        onTwoFingerDoubleTap: () => { twoFingerDoubleTapCount++; },
        onSingleTap: () => { singleTapCount++; },
      },
      { twoFingerTapWindowMs: 100, doubleTapThresholdMs: 50 }
    );

    // 1st two-finger tap
    recognizer.handleTouchStart({ touchCount: 2, x: 150, y: 200, timestamp: 1000 });
    recognizer.handleTouchEnd({ touchCount: 0, x: 150, y: 200, timestamp: 1050 });

    assert.strictEqual(twoFingerDoubleTapCount, 0, 'First two-finger tap does not trigger reset yet');

    // 2nd two-finger tap within 40ms
    recognizer.handleTouchStart({ touchCount: 2, x: 150, y: 200, timestamp: 1090 });
    recognizer.handleTouchEnd({ touchCount: 0, x: 150, y: 200, timestamp: 1140 });

    assert.strictEqual(twoFingerDoubleTapCount, 1, 'Two-Finger Double Tap should have triggered');

    await new Promise(r => setTimeout(r, 70));
    assert.strictEqual(singleTapCount, 0, 'Single tap must not fire during two finger taps');

    recognizer.destroy();
  });

  await t.test('Double Tap works across entire fullscreen canvas regardless of tap distance', async () => {
    let doubleTapCount = 0;
    let singleTapCount = 0;

    const recognizer = new GestureRecognizer(
      {
        onSingleTap: () => { singleTapCount++; },
        onDoubleTap: () => { doubleTapCount++; },
      },
      { doubleTapThresholdMs: 100, longPressThresholdMs: 500 }
    );

    // Tap 1 at top-left
    recognizer.handleTouchStart({ touchCount: 1, x: 50, y: 50, timestamp: 1000 });
    recognizer.handleTouchEnd({ touchCount: 0, x: 50, y: 50, timestamp: 1040 });

    // Tap 2 at bottom-right (distance > 500px across fullscreen canvas)
    recognizer.handleTouchStart({ touchCount: 1, x: 350, y: 650, timestamp: 1090 });
    recognizer.handleTouchEnd({ touchCount: 0, x: 350, y: 650, timestamp: 1130 });

    assert.strictEqual(doubleTapCount, 1, 'Double tap on fullscreen canvas must trigger regardless of distance');

    await new Promise(r => setTimeout(r, 120));
    assert.strictEqual(singleTapCount, 0, 'Single tap must be suppressed');

    recognizer.destroy();
  });

  await t.test('Staggered two-finger touch landing is accurately recognized as two-finger gesture', async () => {
    let twoFingerDoubleTapCount = 0;
    let singleTapCount = 0;

    const recognizer = new GestureRecognizer(
      {
        onTwoFingerDoubleTap: () => { twoFingerDoubleTapCount++; },
        onSingleTap: () => { singleTapCount++; },
      },
      { twoFingerTapWindowMs: 120, doubleTapThresholdMs: 50 }
    );

    // Tap 1: Finger 1 lands first (t=1000), finger 2 lands 15ms later (t=1015)
    recognizer.handleTouchStart({ touchCount: 1, x: 100, y: 200, timestamp: 1000 });
    recognizer.handleTouchStart({ touchCount: 2, x: 200, y: 200, timestamp: 1015 });
    recognizer.handleTouchEnd({ touchCount: 0, x: 150, y: 200, timestamp: 1060 });

    assert.strictEqual(twoFingerDoubleTapCount, 0);

    // Tap 2: Finger 1 lands first (t=1090), finger 2 lands 10ms later (t=1100)
    recognizer.handleTouchStart({ touchCount: 1, x: 100, y: 200, timestamp: 1090 });
    recognizer.handleTouchStart({ touchCount: 2, x: 200, y: 200, timestamp: 1100 });
    recognizer.handleTouchEnd({ touchCount: 0, x: 150, y: 200, timestamp: 1140 });

    assert.strictEqual(twoFingerDoubleTapCount, 1, 'Staggered two-finger double tap must trigger reset');

    await new Promise(r => setTimeout(r, 70));
    assert.strictEqual(singleTapCount, 0);

    recognizer.destroy();
  });

  await t.test('Two-finger hold exceeding maxTapDurationMs is not treated as a tap', async () => {
    let twoFingerDoubleTapCount = 0;
    const recognizer = new GestureRecognizer(
      {
        onTwoFingerDoubleTap: () => { twoFingerDoubleTapCount++; },
      },
      { maxTapDurationMs: 200, twoFingerTapWindowMs: 300 }
    );

    // Hold 2 fingers down for 250ms (> 200ms maxTapDurationMs)
    recognizer.handleTouchStart({ touchCount: 2, x: 100, y: 100, timestamp: 1000 });
    recognizer.handleTouchEnd({ touchCount: 0, x: 100, y: 100, timestamp: 1250 });

    // 2nd tap is quick (50ms)
    recognizer.handleTouchStart({ touchCount: 2, x: 100, y: 100, timestamp: 1300 });
    recognizer.handleTouchEnd({ touchCount: 0, x: 100, y: 100, timestamp: 1350 });

    assert.strictEqual(twoFingerDoubleTapCount, 0, 'Long two-finger contact must not count toward double tap');
    recognizer.destroy();
  });

  await t.test('Two-finger double tap window expiration resets sequence', async () => {
    let twoFingerDoubleTapCount = 0;
    const recognizer = new GestureRecognizer(
      {
        onTwoFingerDoubleTap: () => { twoFingerDoubleTapCount++; },
      },
      { twoFingerTapWindowMs: 100 }
    );

    // Tap 1
    recognizer.handleTouchStart({ touchCount: 2, x: 100, y: 100, timestamp: 1000 });
    recognizer.handleTouchEnd({ touchCount: 0, x: 100, y: 100, timestamp: 1050 });

    // Tap 2 arrives 200ms later (> 100ms window)
    recognizer.handleTouchStart({ touchCount: 2, x: 100, y: 100, timestamp: 1250 });
    recognizer.handleTouchEnd({ touchCount: 0, x: 100, y: 100, timestamp: 1300 });

    assert.strictEqual(twoFingerDoubleTapCount, 0, 'Double tap should not fire when window expired');

    // Tap 3 arrives 50ms after Tap 2 (within 100ms of Tap 2)
    recognizer.handleTouchStart({ touchCount: 2, x: 100, y: 100, timestamp: 1350 });
    recognizer.handleTouchEnd({ touchCount: 0, x: 100, y: 100, timestamp: 1390 });

    assert.strictEqual(twoFingerDoubleTapCount, 1, 'Double tap should fire on Tap 2 + Tap 3');
    recognizer.destroy();
  });

  await t.test('Spurious handleTouchEnd with no prior handleTouchStart is handled safely', () => {
    let count = 0;
    const recognizer = new GestureRecognizer({
      onSingleTap: () => { count++; },
      onDoubleTap: () => { count++; },
      onTwoFingerDoubleTap: () => { count++; },
    });

    assert.doesNotThrow(() => {
      recognizer.handleTouchEnd({ touchCount: 0, x: 50, y: 50, timestamp: 1000 });
      recognizer.handleTouchEnd({ touchCount: 0, x: 50, y: 50, timestamp: 1000 });
    });
    assert.strictEqual(count, 0);
    recognizer.destroy();
  });

  await t.test('Two-finger drag or swipe beyond maxMoveDistance cancels two-finger tap', () => {
    let twoFingerDoubleTapCount = 0;
    const recognizer = new GestureRecognizer(
      {
        onTwoFingerDoubleTap: () => { twoFingerDoubleTapCount++; },
      },
      { maxMoveDistance: 30, twoFingerTapWindowMs: 200 }
    );

    // Swipe 1: 2 fingers move 60px (> 30px maxMoveDistance)
    recognizer.handleTouchStart({ touchCount: 2, x: 100, y: 100, timestamp: 1000 });
    recognizer.handleTouchMove({ touchCount: 2, dx: 60, dy: 0 });
    recognizer.handleTouchEnd({ touchCount: 0, x: 160, y: 100, timestamp: 1050 });

    // Tap 2: normal quick tap
    recognizer.handleTouchStart({ touchCount: 2, x: 100, y: 100, timestamp: 1100 });
    recognizer.handleTouchEnd({ touchCount: 0, x: 100, y: 100, timestamp: 1150 });

    assert.strictEqual(twoFingerDoubleTapCount, 0, 'Swipe must not count as tap in two-finger double tap sequence');
    recognizer.destroy();
  });

  await t.test('Interleaved single-finger tap resets two-finger double tap sequence', async () => {
    let twoFingerDoubleTapCount = 0;
    let singleTapCount = 0;
    const recognizer = new GestureRecognizer(
      {
        onTwoFingerDoubleTap: () => { twoFingerDoubleTapCount++; },
        onSingleTap: () => { singleTapCount++; },
      },
      { twoFingerTapWindowMs: 300, doubleTapThresholdMs: 50 }
    );

    // 1st two-finger tap
    recognizer.handleTouchStart({ touchCount: 2, x: 100, y: 100, timestamp: 1000 });
    recognizer.handleTouchEnd({ touchCount: 0, x: 100, y: 100, timestamp: 1040 });

    // Interleaved single-finger tap at t=1080
    recognizer.handleTouchStart({ touchCount: 1, x: 100, y: 100, timestamp: 1080 });
    recognizer.handleTouchEnd({ touchCount: 0, x: 100, y: 100, timestamp: 1110 });

    // Wait for single tap timer
    await new Promise(r => setTimeout(r, 60));
    assert.strictEqual(singleTapCount, 1, 'Single tap should have fired');

    // 2nd two-finger tap arrives at t=1200 (within 300ms of 1st two-finger tap, but single tap intervened)
    recognizer.handleTouchStart({ touchCount: 2, x: 100, y: 100, timestamp: 1200 });
    recognizer.handleTouchEnd({ touchCount: 0, x: 100, y: 100, timestamp: 1240 });

    assert.strictEqual(twoFingerDoubleTapCount, 0, 'Interleaved single tap must prevent two-finger double tap');
    recognizer.destroy();
  });

  await t.test('Partial finger release with remaining finger held cancels tap', () => {
    let twoFingerDoubleTapCount = 0;
    const recognizer = new GestureRecognizer(
      {
        onTwoFingerDoubleTap: () => { twoFingerDoubleTapCount++; },
      },
      { maxTapDurationMs: 200, twoFingerTapWindowMs: 300 }
    );

    // Two fingers touch at t=1000
    recognizer.handleTouchStart({ touchCount: 2, x: 100, y: 100, timestamp: 1000 });

    // Finger 1 lifts at t=1050, but finger 2 remains on screen (touchCount: 1)
    recognizer.handleTouchEnd({ touchCount: 1, x: 100, y: 100, timestamp: 1050 });

    // Finger 2 stays down until t=1300 (> 200ms total duration from t=1000)
    recognizer.handleTouchEnd({ touchCount: 0, x: 100, y: 100, timestamp: 1300 });

    // Second tap is quick
    recognizer.handleTouchStart({ touchCount: 2, x: 100, y: 100, timestamp: 1350 });
    recognizer.handleTouchEnd({ touchCount: 0, x: 100, y: 100, timestamp: 1390 });

    assert.strictEqual(twoFingerDoubleTapCount, 0, 'Hold must cancel two-finger tap even if first finger lifted early');
    recognizer.destroy();
  });
});

test('4. Session Wallet Accumulation and Reset Logic', async (t) => {
  await t.test('Wallet accumulates multiple denominations and note counts', () => {
    let wallet = {
      totalAmount: 0,
      totalNotesCount: 0,
      history: [],
    };

    // Helper to simulate adding detection
    const addMoney = (classId, count = 1) => {
      const item = {
        classId,
        count,
        label: DENOMINATION_NAMES[classId],
        totalAmount: classId * count,
      };
      wallet = {
        totalAmount: wallet.totalAmount + item.totalAmount,
        totalNotesCount: wallet.totalNotesCount + count,
        history: [...wallet.history, item],
      };
    };

    addMoney(100000, 2); // +200k (2 notes)
    assert.strictEqual(wallet.totalAmount, 200000);
    assert.strictEqual(wallet.totalNotesCount, 2);

    addMoney(50000, 1);  // +50k (1 note)
    assert.strictEqual(wallet.totalAmount, 250000);
    assert.strictEqual(wallet.totalNotesCount, 3);

    addMoney(500000, 1); // +500k (1 note)
    assert.strictEqual(wallet.totalAmount, 750000);
    assert.strictEqual(wallet.totalNotesCount, 4);

    // Reset wallet
    wallet = {
      totalAmount: 0,
      totalNotesCount: 0,
      history: [],
    };
    assert.strictEqual(wallet.totalAmount, 0);
    assert.strictEqual(wallet.totalNotesCount, 0);
    assert.strictEqual(wallet.history.length, 0);
  });
});

test('5. Offline Audio System & Audio Assets', async (t) => {
  await t.test('All 24 physical audio assets are generated across res/raw, assets/audio, and src/assets/audio', () => {
    ensureAudioAssetsSync();

    const expectedFiles = [
      // 9 Denominations
      'vnd_1k.mp3', 'vnd_2k.mp3', 'vnd_5k.mp3', 'vnd_10k.mp3', 'vnd_20k.mp3',
      'vnd_50k.mp3', 'vnd_100k.mp3', 'vnd_200k.mp3', 'vnd_500k.mp3',
      // 10 Quantities
      'qty_1.mp3', 'qty_2.mp3', 'qty_3.mp3', 'qty_4.mp3', 'qty_5.mp3',
      'qty_6.mp3', 'qty_7.mp3', 'qty_8.mp3', 'qty_9.mp3', 'qty_10.mp3',
      // 5 Earcons
      'tick.wav', 'empty.wav', 'torch_on.wav', 'torch_off.wav', 'wallet_reset.wav'
    ];

    assert.strictEqual(expectedFiles.length, 24, 'Exactly 24 audio assets expected');

    const checkDirs = [
      path.join(process.cwd(), 'android', 'app', 'src', 'main', 'res', 'raw'),
      path.join(process.cwd(), 'android', 'app', 'src', 'main', 'assets', 'audio'),
      path.join(process.cwd(), 'src', 'assets', 'audio'),
    ];

    for (const dir of checkDirs) {
      assert.ok(fs.existsSync(dir), `Directory ${dir} must exist`);
      for (const file of expectedFiles) {
        const filePath = path.join(dir, file);
        assert.ok(fs.existsSync(filePath), `Audio asset ${file} must exist in ${dir}`);
        const stat = fs.statSync(filePath);
        assert.ok(stat.size > 0, `Audio asset ${file} in ${dir} must be non-empty (got ${stat.size} bytes)`);
      }
    }
  });

  await t.test('Audio registry maps all 9 denominations and 10 quantities correctly', () => {
    const denoms = [1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000];
    for (const d of denoms) {
      const clip = getDenominationClip(d);
      assert.ok(clip, `Clip for ${d} must exist`);
      assert.ok(AUDIO_CLIPS_META[clip], `Meta for ${clip} must exist`);
      assert.strictEqual(AUDIO_CLIPS_META[clip].category, 'denomination');
    }

    for (let count = 1; count <= 10; count++) {
      const clip = getQuantityClip(count);
      assert.strictEqual(clip, `qty_${count}`);
      assert.strictEqual(AUDIO_CLIPS_META[clip].category, 'quantity');
    }
  });

  await t.test('Sequence Builder: 1 banknote outputs ONLY denomination clip (syntax requirement)', () => {
    // 1 note 500k -> ['vnd_500k']
    const seq500k = buildDetectionAudioSequence([
      { classId: 500000, count: 1, label: 'Năm trăm nghìn', totalAmount: 500000 }
    ]);
    assert.deepStrictEqual(seq500k, ['vnd_500k'], '1 banknote must only speak denomination clip');
    assert.strictEqual(formatClipsToVietnamese(seq500k), 'Năm trăm nghìn');

    // 1 note 10k -> ['vnd_10k']
    const seq10k = buildDetectionAudioSequence([
      { classId: 10000, count: 1, label: 'Mười nghìn', totalAmount: 10000 }
    ]);
    assert.deepStrictEqual(seq10k, ['vnd_10k']);
  });

  await t.test('Sequence Builder: Multiple banknotes of single denomination output [Quantity] + [Denomination]', () => {
    // 2 notes 100k -> ['qty_2', 'vnd_100k']
    const seq2x100k = buildDetectionAudioSequence([
      { classId: 100000, count: 2, label: 'Một trăm nghìn', totalAmount: 200000 }
    ]);
    assert.deepStrictEqual(seq2x100k, ['qty_2', 'vnd_100k']);
    assert.strictEqual(formatClipsToVietnamese(seq2x100k), 'Hai tờ Một trăm nghìn');

    // 5 notes 20k -> ['qty_5', 'vnd_20k']
    const seq5x20k = buildDetectionAudioSequence([
      { classId: 20000, count: 5, label: 'Hai mươi nghìn', totalAmount: 100000 }
    ]);
    assert.deepStrictEqual(seq5x20k, ['qty_5', 'vnd_20k']);
    assert.strictEqual(formatClipsToVietnamese(seq5x20k), 'Năm tờ Hai mươi nghìn');
  });

  await t.test('Sequence Builder: Multiple denominations combine sequentially', () => {
    // 2x 100k + 1x 50k -> ['qty_2', 'vnd_100k', 'qty_1', 'vnd_50k']
    const multi = buildDetectionAudioSequence([
      { classId: 100000, count: 2, label: 'Một trăm nghìn', totalAmount: 200000 },
      { classId: 50000, count: 1, label: 'Năm mươi nghìn', totalAmount: 50000 },
    ]);
    assert.deepStrictEqual(multi, ['qty_2', 'vnd_100k', 'qty_1', 'vnd_50k']);
    assert.strictEqual(
      formatClipsToVietnamese(multi),
      'Hai tờ Một trăm nghìn Một tờ Năm mươi nghìn'
    );
  });

  await t.test('Sequence Builder: Empty detection returns empty array', () => {
    assert.deepStrictEqual(buildDetectionAudioSequence([]), []);
  });

  await t.test('Sequence Builder: Wallet builds descending aggregated sequence', () => {
    const wallet = {
      totalAmount: 250000,
      totalNotesCount: 3,
      history: [
        { classId: 50000, count: 1, label: 'Năm mươi nghìn', totalAmount: 50000 },
        { classId: 100000, count: 2, label: 'Một trăm nghìn', totalAmount: 200000 },
      ],
      lastUpdated: Date.now(),
    };
    const seq = buildWalletAudioSequence(wallet);
    // Should sort descending: 100k first, then 50k
    assert.deepStrictEqual(seq, ['qty_2', 'vnd_100k', 'qty_1', 'vnd_50k']);
  });
});

test('6. AudioQueueManager Sequential Playback & Interruption', async (t) => {
  await t.test('Plays clips in sequential order and resolves true', async () => {
    const driver = new SimulatedAudioDriver(10);
    const queue = new AudioQueueManager(driver, 5);

    const startedClips = [];
    let completed = false;

    const promise = queue.playSequence(['qty_2', 'vnd_100k'], {
      onClipStart: (c) => startedClips.push(c),
      onComplete: () => { completed = true; },
    });

    assert.strictEqual(queue.isPlaying(), true);
    const result = await promise;

    assert.strictEqual(result, true, 'playSequence must resolve true when finished');
    assert.strictEqual(completed, true, 'onComplete callback must be called');
    assert.deepStrictEqual(startedClips, ['qty_2', 'vnd_100k']);
    assert.deepStrictEqual(driver.getPlayedClips(), ['qty_2', 'vnd_100k']);
    assert.strictEqual(queue.isPlaying(), false);
    assert.strictEqual(queue.getCurrentClip(), null);

    queue.destroy();
  });

  await t.test('stop() immediately aborts active sequence and clears state', async () => {
    const driver = new SimulatedAudioDriver(50);
    const queue = new AudioQueueManager(driver, 10);

    let interrupted = false;
    const playPromise = queue.playSequence(['qty_3', 'vnd_200k', 'vnd_50k'], {
      onInterrupted: () => { interrupted = true; },
    });

    // Let first clip start
    await new Promise(r => setTimeout(r, 15));
    assert.strictEqual(queue.isPlaying(), true);
    assert.strictEqual(queue.getCurrentClip(), 'qty_3');

    // Immediate stop
    await queue.stop();

    const result = await playPromise;
    assert.strictEqual(result, false, 'Interrupted sequence must resolve false');
    assert.strictEqual(interrupted, true, 'onInterrupted callback must fire');
    assert.strictEqual(queue.isPlaying(), false);
    assert.strictEqual(queue.getCurrentClip(), null);

    queue.destroy();
  });
});

test('7. Smart Hybrid Preemption & Cooldown Engine', async (t) => {
  await t.test('Rule 1: Empty frame (M = ∅) triggers immediate hard stop, plays empty.wav, and emits haptic', async () => {
    const driver = new SimulatedAudioDriver(40);
    const haptic = new DefaultHapticNotifier();
    const controller = new SmartPreemptionController({
      driver,
      hapticNotifier: haptic,
      interClipGapMs: 5,
    });

    // Money in frame -> start speech
    controller.handleDetectionUpdate([
      { classId: 500000, count: 1, label: 'Năm trăm nghìn', totalAmount: 500000 }
    ]);

    await new Promise(r => setTimeout(r, 15));
    assert.strictEqual(controller.isSpeaking(), true);

    // Frame emptied while speaking!
    await controller.handleDetectionUpdate([]);

    assert.strictEqual(haptic.removedCount, 1, 'Haptic money removed must trigger');
    assert.ok(driver.getPlayedClips().includes('empty'), 'empty earcon must be played immediately');

    controller.destroy();
  });

  await t.test('Rule 2: Money added/changed (M_new ≠ M_old) waits for speech to finish naturally, then announces update', async () => {
    const driver = new SimulatedAudioDriver(15);
    const haptic = new DefaultHapticNotifier();
    const controller = new SmartPreemptionController({
      driver,
      hapticNotifier: haptic,
      interClipGapMs: 5,
    });

    // 1st Detection: 100k
    controller.handleDetectionUpdate([
      { classId: 100000, count: 1, label: 'Một trăm nghìn', totalAmount: 100000 }
    ]);

    await new Promise(r => setTimeout(r, 10));
    assert.strictEqual(controller.isSpeaking(), true);

    // 2nd Detection while 1st is still playing: Add 50k (total 1x100k + 1x50k)
    controller.handleDetectionUpdate([
      { classId: 100000, count: 1, label: 'Một trăm nghìn', totalAmount: 100000 },
      { classId: 50000, count: 1, label: 'Năm mươi nghìn', totalAmount: 50000 },
    ]);

    // Initial speech should NOT be cut mid-flight
    assert.strictEqual(controller.isSpeaking(), true);

    // Wait for initial speech and pending updated announcement to finish
    await new Promise(r => setTimeout(r, 200));

    const clips = driver.getPlayedClips();
    assert.ok(clips.includes('vnd_100k'));
    assert.ok(clips.includes('vnd_50k'));
    assert.strictEqual(controller.isSpeaking(), false);

    controller.destroy();
  });

  await t.test('Rule 2b: Intermediate state updates during speech collapse to latest update', async () => {
    const driver = new SimulatedAudioDriver(35);
    const haptic = new DefaultHapticNotifier();
    const controller = new SmartPreemptionController({
      driver,
      hapticNotifier: haptic,
      interClipGapMs: 5,
    });

    // Start with 10k
    controller.handleDetectionUpdate([
      { classId: 10000, count: 1, label: 'Mười nghìn', totalAmount: 10000 }
    ]);

    await new Promise(r => setTimeout(r, 10));

    // Rapid intermediate update: 20k
    controller.handleDetectionUpdate([
      { classId: 20000, count: 1, label: 'Hai mươi nghìn', totalAmount: 20000 }
    ]);

    // Rapid final update: 500k
    controller.handleDetectionUpdate([
      { classId: 500000, count: 1, label: 'Năm trăm nghìn', totalAmount: 500000 }
    ]);

    // Wait for all to resolve
    await new Promise(r => setTimeout(r, 160));

    const clips = driver.getPlayedClips();
    assert.ok(clips.includes('vnd_10k'), 'Initial clip played');
    assert.ok(!clips.includes('vnd_20k'), 'Obsolete intermediate clip 20k must be discarded');
    assert.ok(clips.includes('vnd_500k'), 'Latest clip 500k must be played');

    controller.destroy();
  });

  await t.test('Rule 3: Cooldown / Silence Period (1.5s) suppresses duplicate speech for identical frames', async () => {
    const driver = new SimulatedAudioDriver(10);
    const haptic = new DefaultHapticNotifier();
    const controller = new SmartPreemptionController({
      driver,
      hapticNotifier: haptic,
      cooldownMs: 1500,
      interClipGapMs: 5,
    });

    const item = { classId: 100000, count: 1, label: 'Một trăm nghìn', totalAmount: 100000 };

    // Initial frame
    await controller.handleDetectionUpdate([item]);
    await new Promise(r => setTimeout(r, 30));

    const clipsCountInitial = driver.getPlayedClips().length;
    assert.ok(clipsCountInitial > 0);

    // Repeated frame updates (Camera runs at 10 FPS with same banknotes)
    await controller.handleDetectionUpdate([item]);
    await controller.handleDetectionUpdate([item]);
    await controller.handleDetectionUpdate([item]);

    assert.strictEqual(
      driver.getPlayedClips().length,
      clipsCountInitial,
      'Duplicate frames must not trigger additional audio clips'
    );

    controller.destroy();
  });

  await t.test('Single Tap forces replay of current detection bypassing cooldown', async () => {
    const driver = new SimulatedAudioDriver(10);
    const controller = new SmartPreemptionController({ driver, cooldownMs: 1500 });

    const item = { classId: 200000, count: 1, label: 'Hai trăm nghìn', totalAmount: 200000 };
    await controller.handleDetectionUpdate([item]);
    await new Promise(r => setTimeout(r, 30));

    const countBeforeTap = driver.getPlayedClips().length;

    // Single Tap replay
    await controller.handleSingleTap([item]);
    await new Promise(r => setTimeout(r, 30));

    assert.ok(
      driver.getPlayedClips().length > countBeforeTap,
      'Single Tap must trigger replay even within cooldown period'
    );

    controller.destroy();
  });

  await t.test('Single Tap on empty frame plays empty.wav earcon', async () => {
    const driver = new SimulatedAudioDriver(10);
    const controller = new SmartPreemptionController({ driver });

    await controller.handleSingleTap([]);
    assert.ok(driver.getPlayedClips().includes('empty'), 'Empty tap must play empty earcon');

    controller.destroy();
  });

  await t.test('Double Tap plays torch_on and torch_off earcons', async () => {
    const driver = new SimulatedAudioDriver(10);
    const controller = new SmartPreemptionController({ driver });

    await controller.handleDoubleTap(true);
    assert.strictEqual(driver.getPlayedClips().at(-1), 'torch_on');

    await controller.handleDoubleTap(false);
    assert.strictEqual(driver.getPlayedClips().at(-1), 'torch_off');

    controller.destroy();
  });

  await t.test('Long Press plays session wallet sequence, or empty earcon if 0', async () => {
    const driver = new SimulatedAudioDriver(10);
    const controller = new SmartPreemptionController({ driver, interClipGapMs: 5 });

    // Empty wallet
    await controller.handleLongPress({
      totalAmount: 0,
      totalNotesCount: 0,
      history: [],
      lastUpdated: Date.now(),
    });
    assert.strictEqual(driver.getPlayedClips().at(-1), 'empty');

    driver.clearHistory();

    // Wallet with money
    await controller.handleLongPress({
      totalAmount: 500000,
      totalNotesCount: 1,
      history: [{ classId: 500000, count: 1, label: 'Năm trăm nghìn', totalAmount: 500000 }],
      lastUpdated: Date.now(),
    });
    await new Promise(r => setTimeout(r, 30));
    assert.ok(driver.getPlayedClips().includes('vnd_500k'));

    controller.destroy();
  });

  await t.test('Two-Finger Double Tap plays wallet_reset earcon', async () => {
    const driver = new SimulatedAudioDriver(10);
    const controller = new SmartPreemptionController({ driver });

    await controller.handleTwoFingerDoubleTap();
    assert.strictEqual(driver.getPlayedClips().at(-1), 'wallet_reset');

    controller.destroy();
  });

  await t.test('Resource hygiene: destroy() clears pending state and releases drivers', () => {
    const driver = new SimulatedAudioDriver(20);
    const controller = new SmartPreemptionController({ driver });

    controller.destroy();
    assert.strictEqual(controller.isSpeaking(), false);
  });
});

test('8. Edge Cases & Boundary Conditions', async (t) => {
  await t.test('getDenominationClip throws for unsupported denominations', () => {
    assert.throws(() => getDenominationClip(3000), /Unsupported denomination/);
    assert.throws(() => getDenominationClip(0), /Unsupported denomination/);
    assert.throws(() => getDenominationClip(-5000), /Unsupported denomination/);
  });

  await t.test('getQuantityClip handles edge numbers correctly', () => {
    assert.strictEqual(getQuantityClip(0), null);
    assert.strictEqual(getQuantityClip(-1), null);
    assert.strictEqual(getQuantityClip(1), 'qty_1');
    assert.strictEqual(getQuantityClip(10), 'qty_10');
    assert.strictEqual(getQuantityClip(11), 'qty_10', 'Counts > 10 clamp to qty_10');
    assert.strictEqual(getQuantityClip(99), 'qty_10');
  });

  await t.test('buildDetectionAudioSequence ignores items with count <= 0', () => {
    const items = [
      { classId: 100000, count: 0, label: 'Một trăm nghìn', totalAmount: 0 },
      { classId: 50000, count: -1, label: 'Năm mươi nghìn', totalAmount: 0 },
      { classId: 20000, count: 1, label: 'Hai mươi nghìn', totalAmount: 20000 },
    ];
    const seq = buildDetectionAudioSequence(items);
    assert.deepStrictEqual(seq, ['vnd_20k']);
  });

  await t.test('AudioQueueManager.playSequence with empty or null resolves true immediately', async () => {
    const driver = new SimulatedAudioDriver(10);
    const queue = new AudioQueueManager(driver);

    const res1 = await queue.playSequence([]);
    assert.strictEqual(res1, true);

    const res2 = await queue.playSequence(null);
    assert.strictEqual(res2, true);

    assert.strictEqual(driver.getPlayedClips().length, 0);
    queue.destroy();
  });

  await t.test('Multiple consecutive stop() calls on queue manager are safe and idempotent', async () => {
    const queue = new AudioQueueManager(new SimulatedAudioDriver());
    await assert.doesNotReject(async () => {
      await queue.stop();
      await queue.stop();
      await queue.stop();
    });
    queue.destroy();
  });

  await t.test('Consecutive empty frames trigger empty earcon only on first departure, remaining silent after', async () => {
    const driver = new SimulatedAudioDriver(10);
    const haptic = new DefaultHapticNotifier();
    const controller = new SmartPreemptionController({ driver, hapticNotifier: haptic });

    // Transition from money to empty
    await controller.handleDetectionUpdate([
      { classId: 50000, count: 1, label: 'Năm mươi nghìn', totalAmount: 50000 }
    ]);
    await new Promise(r => setTimeout(r, 20));

    // 1st empty update -> triggers empty + haptic
    await controller.handleDetectionUpdate([]);
    assert.strictEqual(haptic.removedCount, 1);
    const clipsCount = driver.getPlayedClips().length;

    // 2nd and 3rd empty updates (steady state empty camera view)
    await controller.handleDetectionUpdate([]);
    await controller.handleDetectionUpdate([]);
    assert.strictEqual(haptic.removedCount, 1, 'Haptic should not fire again for already empty frame');
    assert.strictEqual(
      driver.getPlayedClips().length,
      clipsCount,
      'No extra audio clips emitted while remaining in empty state'
    );

    controller.destroy();
  });

  await t.test('computeSignature is deterministic regardless of item order', () => {
    const controller = new SmartPreemptionController();

    const orderA = [
      { classId: 100000, count: 2, label: '100k', totalAmount: 200000 },
      { classId: 50000, count: 1, label: '50k', totalAmount: 50000 },
    ];
    const orderB = [
      { classId: 50000, count: 1, label: '50k', totalAmount: 50000 },
      { classId: 100000, count: 2, label: '100k', totalAmount: 200000 },
    ];

    assert.strictEqual(controller.computeSignature(orderA), controller.computeSignature(orderB));
    assert.strictEqual(controller.computeSignature([]), 'EMPTY');
    assert.strictEqual(controller.computeSignature([{ classId: 50000, count: 0, label: '50k', totalAmount: 0 }]), 'EMPTY');

    controller.destroy();
  });

  await t.test('Empty earcon preemption race: Detection arriving during empty earcon is announced without being dropped', async () => {
    const driver = new SimulatedAudioDriver(40);
    const controller = new SmartPreemptionController({ driver });

    // 1. Initial state has money
    await controller.handleDetectionUpdate([
      { classId: 50000, count: 1, label: 'Năm mươi nghìn', totalAmount: 50000 }
    ]);
    await new Promise(r => setTimeout(r, 60));

    // 2. Remove money -> triggers empty earcon (takes 40ms)
    controller.handleDetectionUpdate([]);

    // 3. New money arrives while empty earcon is still playing (at 10ms)
    await new Promise(r => setTimeout(r, 10));
    await controller.handleDetectionUpdate([
      { classId: 100000, count: 1, label: 'Một trăm nghìn', totalAmount: 100000 }
    ]);

    // 4. Wait for announcement to complete
    await new Promise(r => setTimeout(r, 120));

    const clips = driver.getPlayedClips();
    assert.ok(clips.includes('vnd_100k'), '100k detection must not be dropped while empty earcon was playing');
    assert.strictEqual(controller.isSpeaking(), false);

    controller.destroy();
  });

  await t.test('buildDetectionAudioSequence aggregates multiple items of the same denomination and sorts descending', () => {
    // Two separate 100k items (e.g. 2 YOLO bounding boxes)
    const twoItemsSameDenom = [
      { classId: 100000, count: 1, label: '100k', totalAmount: 100000 },
      { classId: 100000, count: 1, label: '100k', totalAmount: 100000 },
    ];
    const seq = buildDetectionAudioSequence(twoItemsSameDenom);
    assert.deepStrictEqual(seq, ['qty_2', 'vnd_100k']);

    // Unordered multiple items -> sorted descending by denomination (500k > 100k > 20k)
    const unordered = [
      { classId: 20000, count: 1, label: '20k', totalAmount: 20000 },
      { classId: 500000, count: 1, label: '500k', totalAmount: 500000 },
      { classId: 100000, count: 2, label: '100k', totalAmount: 200000 },
    ];
    const seqUnordered = buildDetectionAudioSequence(unordered);
    assert.deepStrictEqual(seqUnordered, [
      'qty_1', 'vnd_500k',
      'qty_2', 'vnd_100k',
      'qty_1', 'vnd_20k',
    ]);
  });

  await t.test('createDefaultAudioDriver produces valid AudioDriver and defaults in queue manager and controller', () => {
    const driver = createDefaultAudioDriver();
    assert.ok(driver, 'Driver should be instantiated');
    assert.strictEqual(typeof driver.play, 'function');
    assert.strictEqual(typeof driver.stop, 'function');
    assert.strictEqual(driver.isAvailable(), true);

    const queue = new AudioQueueManager();
    assert.ok(queue.getDriver(), 'Queue manager should have default driver');
    queue.destroy();

    const controller = new SmartPreemptionController();
    assert.ok(controller.getQueueManager().getDriver(), 'Controller should have default driver');
    controller.destroy();
  });

  await t.test('NativeAudioDriver falls back gracefully in non-native environment', async () => {
    const nativeDriver = new NativeAudioDriver();
    assert.strictEqual(nativeDriver.isAvailable(), true);
    await assert.doesNotReject(async () => {
      await nativeDriver.play('tick');
      await nativeDriver.stop();
    });
    nativeDriver.destroy();
  });
});

test('9. CameraX Smart Ambient Luminance & Smart Torch System', async (t) => {
  await t.test('Threshold constants: LOW_LIGHT is 25 lux, RESTORE_LIGHT is 60 lux, DURATION is 1000ms', () => {
    assert.strictEqual(LOW_LIGHT_THRESHOLD_LUX, 25);
    assert.strictEqual(RESTORE_LIGHT_THRESHOLD_LUX, 60);
    assert.strictEqual(TRIGGER_DURATION_MS, 1000);
  });

  await t.test('calculateYPlaneLuminance accurately computes average from uniform pixel buffers', () => {
    // 0 brightness (pitch black)
    const black = new Uint8Array(16).fill(0);
    assert.strictEqual(calculateYPlaneLuminance(black, 4, 4), 0);

    // 255 brightness (pure white)
    const white = new Uint8Array(16).fill(255);
    assert.strictEqual(calculateYPlaneLuminance(white, 4, 4), 255);

    // 20 lux (dark room)
    const dark = new Uint8Array(100).fill(20);
    assert.strictEqual(calculateYPlaneLuminance(dark, 10, 10), 20);

    // 80 lux (illuminated room)
    const bright = new Uint8Array(100).fill(80);
    assert.strictEqual(calculateYPlaneLuminance(bright, 10, 10), 80);
  });

  await t.test('calculateYPlaneLuminance accurately calculates average from variable and mixed pixel data', () => {
    // 2x2 image with pixel values: [10, 20, 30, 40] -> avg = 25.0
    const pixels = new Uint8Array([10, 20, 30, 40]);
    const avg = calculateYPlaneLuminance(pixels, 2, 2);
    assert.strictEqual(avg, 25.0);
  });

  await t.test('calculateYPlaneLuminance respects rowStride padding bytes (ignores camera row stride padding)', () => {
    // 2x2 image with rowStride = 4 (2 active pixels, 2 padding bytes filled with 255)
    // Row 0: [10, 20, 255, 255]
    // Row 1: [30, 40, 255, 255]
    // Only pixels at cols 0 and 1 must be sampled! Expected average: (10 + 20 + 30 + 40) / 4 = 25.0
    const padded = new Uint8Array([
      10, 20, 255, 255,
      30, 40, 255, 255,
    ]);
    const avg = calculateYPlaneLuminance(padded, 2, 2, 4, 1);
    assert.strictEqual(avg, 25.0, 'Padding bytes must not affect average luminance');
  });

  await t.test('calculateYPlaneLuminance supports sub-sampling step for high-performance 30 FPS processing', () => {
    // 4x4 image, sampleStep = 2
    // Rows sampled: 0, 2. Cols sampled: 0, 2.
    // Active samples: (0,0)=10, (0,2)=20, (2,0)=30, (2,2)=40 -> avg = 25.0
    const grid = new Uint8Array(16);
    grid[0] = 10;
    grid[2] = 20;
    grid[8] = 30;
    grid[10] = 40;
    const avg = calculateYPlaneLuminance(grid, 4, 4, 4, 1, 2);
    assert.strictEqual(avg, 25.0);
  });

  await t.test('calculateYPlaneLuminance handles edge cases safely (empty, null, zero dimensions)', () => {
    assert.strictEqual(calculateYPlaneLuminance(null, 10, 10), 0);
    assert.strictEqual(calculateYPlaneLuminance(undefined, 10, 10), 0);
    assert.strictEqual(calculateYPlaneLuminance(new Uint8Array(0), 10, 10), 0);
    assert.strictEqual(calculateYPlaneLuminance(new Uint8Array(10), 0, 10), 0);
    assert.strictEqual(calculateYPlaneLuminance(new Uint8Array(10), 10, 0), 0);
    assert.strictEqual(calculateYPlaneLuminance(new Uint8Array(10), -5, -5), 0);
  });

  await t.test('calculateYPlaneLuminance handles extreme and invalid numbers (NaN, non-finite, negative strides)', () => {
    assert.strictEqual(calculateYPlaneLuminance(new Uint8Array(16), NaN, 4), 0);
    assert.strictEqual(calculateYPlaneLuminance(new Uint8Array(16), 4, NaN), 0);
    assert.strictEqual(calculateYPlaneLuminance(new Uint8Array(16), Infinity, 4), 0);
    // sampleStep = NaN should default to 1 and not throw or fail
    const ones = new Uint8Array(4).fill(10);
    assert.strictEqual(calculateYPlaneLuminance(ones, 2, 2, 2, 1, NaN), 10);
    // rowStride = -1 should clamp to width
    assert.strictEqual(calculateYPlaneLuminance(ones, 2, 2, -1, 1, 1), 10);
  });

  await t.test('isLowLight and isLightRestored boundary classifications', () => {
    // Low light < 25
    assert.strictEqual(isLowLight(24.9), true);
    assert.strictEqual(isLowLight(25.0), false);
    assert.strictEqual(isLowLight(0), true);
    assert.strictEqual(isLowLight(10), true);

    // Restored light >= 60
    assert.strictEqual(isLightRestored(60.0), true);
    assert.strictEqual(isLightRestored(60.1), true);
    assert.strictEqual(isLightRestored(59.9), false);
    assert.strictEqual(isLightRestored(200), true);

    // Intermediate deadband (25 <= lux < 60)
    assert.strictEqual(isLowLight(40), false);
    assert.strictEqual(isLightRestored(40), false);
  });

  await t.test('SmartTorchController: Low light < 25 lux for under 1.0 second does NOT trigger torch', () => {
    const controller = new SmartTorchController();
    assert.strictEqual(controller.getState().isTorchOn, false);

    // t = 0ms: darkness arrives
    let action = controller.onLuminanceSample(18, 1000);
    assert.strictEqual(action.action, 'NO_OP');
    assert.strictEqual(controller.getState().isTorchOn, false);

    // t = 500ms: still dark
    action = controller.onLuminanceSample(15, 1500);
    assert.strictEqual(action.action, 'NO_OP');
    assert.strictEqual(controller.getState().isTorchOn, false);

    // t = 999ms: 1ms before 1s threshold
    action = controller.onLuminanceSample(12, 1999);
    assert.strictEqual(action.action, 'NO_OP');
    assert.strictEqual(controller.getState().isTorchOn, false);
  });

  await t.test('SmartTorchController: Continuous low light for >= 1000ms triggers TURN_ON with torch_on earcon & haptic', () => {
    const controller = new SmartTorchController();

    // t = 1000ms: low light starts
    controller.onLuminanceSample(15, 1000);

    // t = 2000ms: exactly 1000ms later
    const action = controller.onLuminanceSample(15, 2000);
    assert.strictEqual(action.action, 'TURN_ON');
    assert.strictEqual(action.reason, 'LOW_LIGHT_AUTO');
    assert.strictEqual(action.isTorchOn, true);
    assert.strictEqual(action.shouldPlayAudio, true);
    assert.strictEqual(action.shouldVibrate, true);
    assert.strictEqual(action.earcon, 'torch_on');
    assert.strictEqual(controller.getState().isTorchOn, true);

    // Further low light samples while already ON should be NO_OP
    const nextAction = controller.onLuminanceSample(10, 2500);
    assert.strictEqual(nextAction.action, 'NO_OP');
    assert.strictEqual(controller.getState().isTorchOn, true);
  });

  await t.test('SmartTorchController: Intermediate light spike resets continuous low-light timer', () => {
    const controller = new SmartTorchController();

    // t = 1000ms: dark
    controller.onLuminanceSample(15, 1000);
    // t = 1600ms: still dark (600ms elapsed)
    controller.onLuminanceSample(15, 1600);

    // t = 1800ms: light briefly jumps to 35 lux (>= 25 lux deadband)!
    const spike = controller.onLuminanceSample(35, 1800);
    assert.strictEqual(spike.action, 'NO_OP');

    // t = 2000ms: dark again (new timer begins at 2000ms)
    controller.onLuminanceSample(15, 2000);

    // t = 2700ms (700ms since reset): must NOT trigger yet
    const mid = controller.onLuminanceSample(15, 2700);
    assert.strictEqual(mid.action, 'NO_OP');
    assert.strictEqual(controller.getState().isTorchOn, false);

    // t = 3000ms (1000ms since reset): triggers TURN_ON!
    const trigger = controller.onLuminanceSample(15, 3000);
    assert.strictEqual(trigger.action, 'TURN_ON');
    assert.strictEqual(trigger.isTorchOn, true);
  });

  await t.test('SmartTorchController: Ambient light recovery (>= 60 lux) triggers TURN_OFF with torch_off earcon', () => {
    const controller = new SmartTorchController();

    // Turn torch on via low light
    controller.onLuminanceSample(10, 1000);
    controller.onLuminanceSample(10, 2000);
    assert.strictEqual(controller.getState().isTorchOn, true);

    // Ambient light rises to 50 lux (intermediate): torch stays ON
    const intermediate = controller.onLuminanceSample(50, 2500);
    assert.strictEqual(intermediate.action, 'NO_OP');
    assert.strictEqual(controller.getState().isTorchOn, true);

    // Ambient light recovers to 75 lux (>= 60 lux): auto turns OFF
    const recovery = controller.onLuminanceSample(75, 3000);
    assert.strictEqual(recovery.action, 'TURN_OFF');
    assert.strictEqual(recovery.reason, 'RESTORE_LIGHT_AUTO');
    assert.strictEqual(recovery.isTorchOn, false);
    assert.strictEqual(recovery.shouldPlayAudio, true);
    assert.strictEqual(recovery.earcon, 'torch_off');
    assert.strictEqual(controller.getState().isTorchOn, false);
  });

  await t.test('SmartTorchController: Manual Override (Double Tap) turns torch OFF in darkness and suppresses auto-turn-on', () => {
    const controller = new SmartTorchController();

    // Torch auto-turns on in dark
    controller.onLuminanceSample(10, 1000);
    controller.onLuminanceSample(10, 2000);
    assert.strictEqual(controller.getState().isTorchOn, true);

    // User explicitly double taps to turn torch OFF while it is still dark
    const manualAction = controller.handleManualToggle();
    assert.strictEqual(manualAction.action, 'TURN_OFF');
    assert.strictEqual(manualAction.reason, 'MANUAL_TOGGLE');
    assert.strictEqual(manualAction.isTorchOn, false);
    assert.strictEqual(controller.getState().isManualOverride, true);

    // Darkness continues for 3 more seconds
    const sample1 = controller.onLuminanceSample(10, 3000);
    const sample2 = controller.onLuminanceSample(10, 5000);
    assert.strictEqual(sample1.action, 'NO_OP');
    assert.strictEqual(sample2.action, 'NO_OP');
    assert.strictEqual(controller.getState().isTorchOn, false, 'Torch must remain OFF respecting user manual override');
  });

  await t.test('SmartTorchController: Manual Override respects explicit manual turn ON in illuminated environment', () => {
    const controller = new SmartTorchController();

    // In bright environment (100 lux), user explicitly double taps to turn torch ON
    const manualOn = controller.handleManualToggle(true);
    assert.strictEqual(manualOn.action, 'TURN_ON');
    assert.strictEqual(manualOn.isTorchOn, true);
    assert.strictEqual(controller.getState().isManualOverride, true);

    // Even though light is 100 lux (>= 60 lux), manual override preserves user intent
    const sample = controller.onLuminanceSample(100, 2000);
    assert.strictEqual(sample.action, 'NO_OP');
    assert.strictEqual(controller.getState().isTorchOn, true);
  });

  await t.test('SmartTorchController: Recovery of ambient light restores auto-mode after manual turn off', () => {
    const controller = new SmartTorchController();

    // 1. Dark -> torch turns ON
    controller.onLuminanceSample(10, 1000);
    controller.onLuminanceSample(10, 2000);
    assert.strictEqual(controller.getState().isTorchOn, true);

    // 2. User turns OFF manually -> isManualOverride = true
    controller.handleManualToggle(false);
    assert.strictEqual(controller.getState().isTorchOn, false);
    assert.strictEqual(controller.getState().isManualOverride, true);

    // 3. User walks into brightly lit room (85 lux >= 60 lux) -> clears manual override
    controller.onLuminanceSample(85, 3000);
    assert.strictEqual(controller.getState().isManualOverride, false, 'Manual override cleared upon light restoration');

    // 4. User walks back into dark room (10 lux) and stays for 1 second -> auto-torch turns ON again!
    controller.onLuminanceSample(10, 4000);
    const autoAgain = controller.onLuminanceSample(10, 5000);
    assert.strictEqual(autoAgain.action, 'TURN_ON');
    assert.strictEqual(autoAgain.isTorchOn, true);
  });

  await t.test('SmartTorchController: resetManualOverride and setAutoTorchEnabled controls', () => {
    const controller = new SmartTorchController();

    controller.handleManualToggle(false);
    assert.strictEqual(controller.getState().isManualOverride, true);
    controller.resetManualOverride();
    assert.strictEqual(controller.getState().isManualOverride, false);

    // When autoTorchEnabled = false, low light does not trigger torch
    controller.setAutoTorchEnabled(false);
    controller.onLuminanceSample(10, 1000);
    const noTrigger = controller.onLuminanceSample(10, 2500);
    assert.strictEqual(noTrigger.action, 'NO_OP');
    assert.strictEqual(controller.getState().isTorchOn, false);
  });

  await t.test('NativeCameraBridge fallback driver functions safely in mock environment', async () => {
    const bridge = cameraBridge;
    bridge.resetMock();

    assert.strictEqual(await bridge.isTorchOn(), false);
    assert.strictEqual(await bridge.setTorch(true), true);
    assert.strictEqual(await bridge.isTorchOn(), true);
    assert.strictEqual(await bridge.setTorch(false), true);
    assert.strictEqual(await bridge.isTorchOn(), false);

    bridge.setMockLuminance(42);
    assert.strictEqual(await bridge.getLuminance(), 42);

    assert.strictEqual(await bridge.checkCameraPermission(), true);
    bridge.setMockPermission(false);
    assert.strictEqual(await bridge.checkCameraPermission(), false);

    bridge.resetMock();
  });

  await t.test('Integration: SmartTorchController actions drive SmartPreemptionController torch earcons and haptic notifier', async () => {
    const driver = new SimulatedAudioDriver(10);
    const haptic = new DefaultHapticNotifier();
    const audio = new SmartPreemptionController({ driver, hapticNotifier: haptic });
    const controller = new SmartTorchController();

    // 1. Low light triggers TURN_ON
    controller.onLuminanceSample(15, 1000);
    const onAction = controller.onLuminanceSample(15, 2000);
    assert.strictEqual(onAction.action, 'TURN_ON');

    if (onAction.shouldVibrate) {
      haptic.triggerAutoTorch();
    }
    if (onAction.shouldPlayAudio && onAction.earcon) {
      await audio.playTorchEarcon(true);
    }

    assert.strictEqual(haptic.autoTorchCount, 1, 'Auto-torch haptic pulse emitted (100ms)');
    assert.deepStrictEqual(driver.getPlayedClips(), ['torch_on'], 'torch_on earcon played');

    // 2. Light restored triggers TURN_OFF
    const offAction = controller.onLuminanceSample(75, 3000);
    assert.strictEqual(offAction.action, 'TURN_OFF');
    if (offAction.shouldPlayAudio && offAction.earcon) {
      await audio.playTorchEarcon(false);
    }
    assert.deepStrictEqual(driver.getPlayedClips(), ['torch_on', 'torch_off'], 'torch_off earcon played');

    audio.destroy();
  });

  await t.test('SmartTorchController: syncTorchState synchronizes external torch state without creating manual override', () => {
    const controller = new SmartTorchController();
    assert.strictEqual(controller.getState().isTorchOn, false);
    assert.strictEqual(controller.getState().isManualOverride, false);

    // Hardware torch turned ON externally
    controller.syncTorchState(true);
    assert.strictEqual(controller.getState().isTorchOn, true);
    assert.strictEqual(controller.getState().isManualOverride, false, 'syncTorchState must NOT create manual override');

    // Hardware torch turned OFF externally
    controller.syncTorchState(false);
    assert.strictEqual(controller.getState().isTorchOn, false);
    assert.strictEqual(controller.getState().isManualOverride, false);
  });

  await t.test('SmartTorchController: getState correctly calculates lowLightDurationMs using sample timestamps', () => {
    const controller = new SmartTorchController();

    // t = 1000: darkness starts
    controller.onLuminanceSample(10, 1000);
    assert.strictEqual(controller.getState().lowLightDurationMs, 0);

    // t = 1600: 600ms elapsed
    controller.onLuminanceSample(10, 1600);
    assert.strictEqual(controller.getState().lowLightDurationMs, 600);

    // t = 2000: 1000ms elapsed
    controller.onLuminanceSample(10, 2000);
    assert.strictEqual(controller.getState().lowLightDurationMs, 1000);
  });

  await t.test('SmartTorchController: Rapid Double Tap toggling under rapid luminance transitions maintains state consistency', () => {
    const controller = new SmartTorchController();

    // 1. Darkness begins
    controller.onLuminanceSample(10, 1000);
    controller.onLuminanceSample(10, 1500);

    // 2. User rapidly double taps to turn torch ON manually
    const tap1 = controller.handleManualToggle();
    assert.strictEqual(tap1.action, 'TURN_ON');
    assert.strictEqual(tap1.isTorchOn, true);
    assert.strictEqual(controller.getState().isManualOverride, true);

    // 3. Torch reflection jumps brightness to 90 lux
    const sampleBright = controller.onLuminanceSample(90, 1600);
    assert.strictEqual(sampleBright.action, 'NO_OP', 'Manual override preserves ON state despite bright reflection');
    assert.strictEqual(controller.getState().isTorchOn, true);

    // 4. User rapidly double taps again to turn torch OFF manually
    const tap2 = controller.handleManualToggle();
    assert.strictEqual(tap2.action, 'TURN_OFF');
    assert.strictEqual(tap2.isTorchOn, false);
    assert.strictEqual(controller.getState().isManualOverride, true);

    // 5. Scene drops back to 10 lux (darkness)
    const darkAgain1 = controller.onLuminanceSample(10, 1700);
    const darkAgain2 = controller.onLuminanceSample(10, 3000);
    assert.strictEqual(darkAgain1.action, 'NO_OP');
    assert.strictEqual(darkAgain2.action, 'NO_OP');
    assert.strictEqual(controller.getState().isTorchOn, false, 'Must respect user turn-off override despite darkness');

    // 6. User enters actual bright room (80 lux >= 60 lux) -> clears manual override
    const recovery = controller.onLuminanceSample(80, 4000);
    assert.strictEqual(recovery.action, 'NO_OP');
    assert.strictEqual(controller.getState().isManualOverride, false, 'Manual override cleared upon light restoration');

    // 7. User returns to dark room and stays 1 second -> auto-torch fires!
    controller.onLuminanceSample(10, 5000);
    const retrigger = controller.onLuminanceSample(10, 6000);
    assert.strictEqual(retrigger.action, 'TURN_ON');
  });
});

test('10. YOLO26 LiteRT Engine, Tensor Decoder & Mock Fallback', async (t) => {
  await t.test('Tensor dimensions, channels and performance constants match YOLO26 specs', () => {
    assert.strictEqual(YOLO_INPUT_WIDTH, 640, 'Input width must be 640');
    assert.strictEqual(YOLO_INPUT_HEIGHT, 640, 'Input height must be 640');
    assert.strictEqual(YOLO_TOTAL_CHANNELS, 13, 'Total channels must be 13 (4 coords + 9 classes)');
    assert.strictEqual(YOLO_NUM_ANCHORS, 8400, 'Anchors count must be 8400');
    assert.strictEqual(
      YOLO_TENSOR_ELEMENTS,
      13 * 8400,
      'Tensor buffer must contain 109,200 elements'
    );
    assert.strictEqual(YOLO_SCORE_THRESHOLD, 0.50, 'Confidence threshold must be >= 0.50');
    assert.strictEqual(YOLO_IOU_THRESHOLD, 0.45, 'NMS IoU threshold must be >= 0.45');
    assert.strictEqual(TARGET_INFERENCE_FPS_MIN, 8, 'Target FPS min must be 8 FPS');
    assert.strictEqual(TARGET_INFERENCE_FPS_MAX, 12, 'Target FPS max must be 12 FPS');
    assert.strictEqual(DEFAULT_INFERENCE_FPS, 10, 'Default FPS must be 10 FPS');
  });

  await t.test('Roboflow Alphabetical 9-Class Order is 100% accurate and bijective', () => {
    const expectedOrder = [1000, 10000, 100000, 2000, 20000, 200000, 5000, 50000, 500000];
    assert.deepStrictEqual(
      Array.from(YOLO_CLASS_ORDER),
      expectedOrder,
      'YOLO_CLASS_ORDER must match Roboflow alphabetical order'
    );

    // Verify each index mapping
    expectedOrder.forEach((denom, idx) => {
      assert.strictEqual(getYoloClassByIndex(idx), denom);
      assert.strictEqual(getYoloIndexByDenomination(denom), idx);
      assert.strictEqual(getYoloClassByChannelIndex(4 + idx), denom);
      assert.ok(getYoloLabelByIndex(idx).length > 0);
    });

    // Out of bounds checks
    assert.throws(() => getYoloClassByIndex(-1), /Invalid YOLO class index/);
    assert.throws(() => getYoloClassByIndex(9), /Invalid YOLO class index/);
    assert.throws(() => getYoloIndexByDenomination(12345), /Unsupported denomination/);
  });

  await t.test('yoloDecoder: decode empty or zeroed tensor produces 0 candidate boxes', () => {
    const emptyBuffer = new Float32Array(YOLO_TENSOR_ELEMENTS);
    const candidates = decodeYoloTensor(emptyBuffer);
    assert.strictEqual(candidates.length, 0, 'Zeroed tensor must yield 0 candidates');
  });

  await t.test('yoloDecoder: correctly decodes single candidate box with cx, cy, w, h and confidence score', () => {
    const buffer = new Float32Array(YOLO_TENSOR_ELEMENTS);
    const anchorIdx = 500;

    // Banknote: 50,000 VND (Class index 7, channel 4 + 7 = 11)
    // Box: cx=320, cy=240, w=400, h=200 -> top-left: x=120, y=140
    buffer[0 * YOLO_NUM_ANCHORS + anchorIdx] = 320; // cx
    buffer[1 * YOLO_NUM_ANCHORS + anchorIdx] = 240; // cy
    buffer[2 * YOLO_NUM_ANCHORS + anchorIdx] = 400; // w
    buffer[3 * YOLO_NUM_ANCHORS + anchorIdx] = 200; // h
    buffer[11 * YOLO_NUM_ANCHORS + anchorIdx] = 0.92; // 50k score

    const candidates = decodeYoloTensor(buffer, { applySigmoid: false });
    assert.strictEqual(candidates.length, 1);
    const box = candidates[0];
    assert.strictEqual(box.classIndex, 7);
    assert.strictEqual(box.classId, 50000);
    assert.strictEqual(box.label, 'Năm mươi nghìn');
    assert.strictEqual(box.cx, 320);
    assert.strictEqual(box.cy, 240);
    assert.strictEqual(box.width, 400);
    assert.strictEqual(box.height, 200);
    assert.strictEqual(box.x, 120);
    assert.strictEqual(box.y, 140);
    assert.strictEqual(box.score, 0.92);
  });

  await t.test('yoloDecoder: filters out candidates with score below 0.50 threshold', () => {
    const buffer = new Float32Array(YOLO_TENSOR_ELEMENTS);

    // Anchor 100: Score 0.49 (Must be excluded)
    buffer[0 * YOLO_NUM_ANCHORS + 100] = 300;
    buffer[1 * YOLO_NUM_ANCHORS + 100] = 300;
    buffer[2 * YOLO_NUM_ANCHORS + 100] = 100;
    buffer[3 * YOLO_NUM_ANCHORS + 100] = 100;
    buffer[4 * YOLO_NUM_ANCHORS + 100] = 0.49; // 1k score

    // Anchor 200: Score 0.50 (Boundary case, must be included)
    buffer[0 * YOLO_NUM_ANCHORS + 200] = 300;
    buffer[1 * YOLO_NUM_ANCHORS + 200] = 300;
    buffer[2 * YOLO_NUM_ANCHORS + 200] = 100;
    buffer[3 * YOLO_NUM_ANCHORS + 200] = 100;
    buffer[5 * YOLO_NUM_ANCHORS + 200] = 0.50; // 10k score

    const candidates = decodeYoloTensor(buffer, { applySigmoid: false });
    assert.strictEqual(candidates.length, 1);
    assert.strictEqual(candidates[0].classId, 10000);
    assert.strictEqual(candidates[0].score, 0.50);
  });

  await t.test('yoloDecoder: supports raw logits and Sigmoid mathematical conversion', () => {
    assert.strictEqual(sigmoid(0), 0.5);
    assert.ok(Math.abs(sigmoid(2.5) - 0.92414) < 0.001);
    assert.ok(Math.abs(sigmoid(-2.5) - 0.07585) < 0.001);

    const buffer = new Float32Array(YOLO_TENSOR_ELEMENTS);
    buffer.fill(-10); // Unactivated negative logits for background
    // Anchor 50: logit = 3.0 -> sigmoid(3.0) ~ 0.9526 (>= 0.50, included)
    buffer[0 * YOLO_NUM_ANCHORS + 50] = 320;
    buffer[1 * YOLO_NUM_ANCHORS + 50] = 320;
    buffer[2 * YOLO_NUM_ANCHORS + 50] = 200;
    buffer[3 * YOLO_NUM_ANCHORS + 50] = 100;
    buffer[(4 + 8) * YOLO_NUM_ANCHORS + 50] = 3.0; // 500k logit

    // Anchor 60: logit = -1.5 -> sigmoid(-1.5) ~ 0.1824 (< 0.50, filtered)
    buffer[0 * YOLO_NUM_ANCHORS + 60] = 320;
    buffer[1 * YOLO_NUM_ANCHORS + 60] = 320;
    buffer[2 * YOLO_NUM_ANCHORS + 60] = 200;
    buffer[3 * YOLO_NUM_ANCHORS + 60] = 100;
    buffer[(4 + 2) * YOLO_NUM_ANCHORS + 60] = -1.5; // 100k logit

    const candidates = decodeYoloTensor(buffer, { applySigmoid: true });
    assert.strictEqual(candidates.length, 1);
    assert.strictEqual(candidates[0].classId, 500000);
    assert.ok(candidates[0].score > 0.95);
  });

  await t.test('yoloDecoder: handles 2D and 3D nested tensor shapes', () => {
    // Create 2D array [13][8400]
    const matrix2D = Array.from({ length: 13 }, () => new Float32Array(8400));
    matrix2D[0][10] = 320;
    matrix2D[1][10] = 200;
    matrix2D[2][10] = 400;
    matrix2D[3][10] = 200;
    matrix2D[4 + 6][10] = 0.88; // 5k

    const candidates2D = decodeYoloTensor(matrix2D, { applySigmoid: false });
    assert.strictEqual(candidates2D.length, 1);
    assert.strictEqual(candidates2D[0].classId, 5000);

    // Create 3D array [1][13][8400]
    const matrix3D = [matrix2D];
    const candidates3D = decodeYoloTensor(matrix3D, { applySigmoid: false });
    assert.strictEqual(candidates3D.length, 1);
    assert.strictEqual(candidates3D[0].classId, 5000);
  });

  await t.test('nmsAlgorithm: calculateIoU computes exact geometric intersection over union', () => {
    const boxA = {
      x: 100,
      y: 100,
      width: 100,
      height: 100,
      cx: 150,
      cy: 150,
      score: 0.9,
      classIndex: 0,
      classId: 1000,
      label: '1k',
    };

    // Identical box -> IoU = 1.0
    assert.strictEqual(calculateIoU(boxA, boxA), 1.0);

    // Disjoint box -> IoU = 0.0
    const boxB = { ...boxA, x: 300, y: 300 };
    assert.strictEqual(calculateIoU(boxA, boxB), 0.0);

    // 50% horizontal overlap: boxC x=150..250 (interW=50, interArea=5000, unionArea=15000 -> IoU = 1/3)
    const boxC = { ...boxA, x: 150 };
    const iou = calculateIoU(boxA, boxC);
    assert.ok(Math.abs(iou - (5000 / 15000)) < 0.0001);

    // Degenerate box with 0 area
    const boxZero = { ...boxA, width: 0 };
    assert.strictEqual(calculateIoU(boxA, boxZero), 0.0);
  });

  await t.test('nmsAlgorithm: suppresses duplicate overlapping boxes of same class when IoU >= 0.45', () => {
    // Two overlapping boxes of 100k:
    // Box 1: high confidence 0.95
    const box1 = {
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      cx: 200,
      cy: 150,
      score: 0.95,
      classIndex: 2,
      classId: 100000,
      label: '100k',
    };

    // Box 2: slightly shifted, IoU ~ 0.81 >= 0.45, lower score 0.85
    const box2 = {
      ...box1,
      x: 110,
      y: 105,
      score: 0.85,
    };

    const suppressed = nonMaximumSuppression([box1, box2], { iouThreshold: 0.45 });
    assert.strictEqual(suppressed.length, 1, 'Duplicate box must be suppressed');
    assert.strictEqual(suppressed[0].score, 0.95, 'Must keep higher confidence box');
  });

  await t.test('nmsAlgorithm: retains multiple banknotes when IoU < 0.45', () => {
    // Two separate 100k notes on table (low overlap)
    const box1 = {
      x: 50,
      y: 50,
      width: 200,
      height: 100,
      cx: 150,
      cy: 100,
      score: 0.95,
      classIndex: 2,
      classId: 100000,
      label: '100k',
    };

    const box2 = {
      x: 350,
      y: 50,
      width: 200,
      height: 100,
      cx: 450,
      cy: 100,
      score: 0.92,
      classIndex: 2,
      classId: 100000,
      label: '100k',
    };

    const kept = nonMaximumSuppression([box1, box2], { iouThreshold: 0.45 });
    assert.strictEqual(kept.length, 2, 'Non-overlapping notes must both be preserved');
  });

  await t.test('nmsAlgorithm: class-aware suppression preserves overlapping notes of different denominations', () => {
    // Stacked bills of different denominations: 100k and 50k
    const note100k = {
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      cx: 200,
      cy: 150,
      score: 0.95,
      classIndex: 2,
      classId: 100000,
      label: '100k',
    };

    const note50k = {
      x: 110,
      y: 105,
      width: 200,
      height: 100,
      cx: 210,
      cy: 155,
      score: 0.91,
      classIndex: 7,
      classId: 50000,
      label: '50k',
    };

    // Class-aware (default): keeps both
    const keptClassAware = nonMaximumSuppression([note100k, note50k], {
      classAgnostic: false,
    });
    assert.strictEqual(keptClassAware.length, 2, 'Different denominations must both be kept');

    // Class-agnostic mode: suppresses lower score
    const keptClassAgnostic = nonMaximumSuppression([note100k, note50k], {
      classAgnostic: true,
      iouThreshold: 0.45,
    });
    assert.strictEqual(keptClassAgnostic.length, 1);
    assert.strictEqual(keptClassAgnostic[0].classId, 100000);
  });

  await t.test('nmsAlgorithm: executes 500 candidates in under 5ms on CPU (Performance Constraint)', () => {
    const candidates = [];
    for (let i = 0; i < 500; i++) {
      candidates.push({
        x: (i * 13) % 400,
        y: (i * 17) % 400,
        width: 150,
        height: 80,
        cx: ((i * 13) % 400) + 75,
        cy: ((i * 17) % 400) + 40,
        score: 0.50 + ((i % 50) / 100),
        classIndex: i % 9,
        classId: YOLO_CLASS_ORDER[i % 9],
        label: getYoloLabelByIndex(i % 9),
      });
    }

    const start = performance.now();
    const result = nonMaximumSuppression(candidates);
    const duration = performance.now() - start;

    console.log(`   [NMS Benchmark] 500 boxes processed in ${duration.toFixed(3)} ms (Kept ${result.length} boxes)`);
    assert.ok(
      duration < 5.0,
      `NMS must execute under 5ms on CPU, took ${duration.toFixed(3)} ms`
    );
  });

  await t.test('aggregateDetections: summarizes detections in descending denomination order', () => {
    const boxes = [
      MockMoneyDetector.createMockBox(10000, 10, 10, 100, 50, 0.9),
      MockMoneyDetector.createMockBox(500000, 20, 20, 100, 50, 0.95),
      MockMoneyDetector.createMockBox(10000, 30, 30, 100, 50, 0.85),
      MockMoneyDetector.createMockBox(50000, 40, 40, 100, 50, 0.92),
    ];

    const summary = aggregateDetections(boxes);
    assert.strictEqual(summary.totalNotesCount, 4);
    assert.strictEqual(summary.totalAmount, 500000 + 50000 + 20000); // 570,000 VND
    assert.strictEqual(summary.hasMoney, true);
    assert.strictEqual(summary.items.length, 3);

    // Order must be 500k -> 50k -> 10k (descending value)
    assert.strictEqual(summary.items[0].classId, 500000);
    assert.strictEqual(summary.items[0].count, 1);
    assert.strictEqual(summary.items[1].classId, 50000);
    assert.strictEqual(summary.items[1].count, 1);
    assert.strictEqual(summary.items[2].classId, 10000);
    assert.strictEqual(summary.items[2].count, 2);
  });

  await t.test('MockMoneyDetector: presets and synthetic detection scenarios', async () => {
    const detector = new MockMoneyDetector('EMPTY');
    assert.strictEqual(detector.isModelLoaded(), false);
    assert.strictEqual(detector.isMock(), true);

    // 1. EMPTY scenario
    const emptyResult = await detector.detect();
    assert.strictEqual(emptyResult.hasMoney, false);
    assert.strictEqual(emptyResult.totalNotesCount, 0);
    assert.strictEqual(emptyResult.totalAmount, 0);

    // 2. SINGLE_50K scenario
    detector.setScenario('SINGLE_50K');
    const res50k = await detector.detect();
    assert.strictEqual(res50k.hasMoney, true);
    assert.strictEqual(res50k.totalNotesCount, 1);
    assert.strictEqual(res50k.totalAmount, 50000);
    assert.strictEqual(res50k.items[0].classId, 50000);

    // 3. MULTI_NOTES scenario (two 100k, one 50k)
    detector.setScenario('MULTI_NOTES');
    const resMulti = await detector.detect();
    assert.strictEqual(resMulti.totalNotesCount, 3);
    assert.strictEqual(resMulti.totalAmount, 250000);

    // 4. ALL_9_DENOMINATIONS scenario
    detector.setScenario('ALL_9_DENOMINATIONS');
    const resAll = await detector.detect();
    assert.strictEqual(resAll.totalNotesCount, 9);
    assert.strictEqual(resAll.totalAmount, 888000); // 1k+2k+5k+10k+20k+50k+100k+200k+500k = 888k
  });

  await t.test('MockMoneyDetector & yoloDecoder: Synthetic Tensor End-to-End Pipeline', () => {
    // Generate synthetic raw [1, 13, 8400] tensor with two 20k notes, plus duplicate anchor
    const syntheticTensor = MockMoneyDetector.createSyntheticYoloTensor(
      [
        { classId: 20000, cx: 200, cy: 200, w: 300, h: 150, score: 0.96, anchorIndex: 120 },
        { classId: 200000, cx: 450, cy: 350, w: 250, h: 120, score: 0.94, anchorIndex: 600 },
      ],
      { addDuplicates: true }
    );

    assert.strictEqual(syntheticTensor.length, YOLO_TENSOR_ELEMENTS);

    // Decode candidates from tensor
    const decoded = decodeYoloTensor(syntheticTensor, { applySigmoid: false });
    // Expect 4 candidates decoded (2 primary + 2 duplicates)
    assert.strictEqual(decoded.length, 4);

    // Apply NMS to suppress duplicates
    const nms = nonMaximumSuppression(decoded);
    assert.strictEqual(nms.length, 2, 'Duplicates must be suppressed by NMS');

    // Aggregate summary
    const summary = aggregateDetections(nms);
    assert.strictEqual(summary.totalNotesCount, 2);
    assert.strictEqual(summary.totalAmount, 220000); // 200k + 20k
  });

  await t.test('NativeDetectorBridge: fallback interface and subscription handling', async () => {
    const bridge = new NativeDetectorBridge('SINGLE_100K');
    assert.strictEqual(await bridge.isModelLoaded(), false);
    assert.strictEqual(await bridge.isUsingMock(), true);

    // Default FPS is 10
    assert.strictEqual(await bridge.getInferenceFps(), 10);
    // Setting FPS clamps to [8, 12]
    await bridge.setInferenceFps(15);
    assert.strictEqual(await bridge.getInferenceFps(), 12);
    await bridge.setInferenceFps(5);
    assert.strictEqual(await bridge.getInferenceFps(), 8);
    await bridge.setInferenceFps(10);
    assert.strictEqual(await bridge.getInferenceFps(), 10);

    // Detection listeners
    let receivedDetection = null;
    const unsubscribe = bridge.addDetectionListener((result) => {
      receivedDetection = result;
    });

    const detection = await bridge.detect();
    assert.strictEqual(detection.totalAmount, 100000);
    assert.strictEqual(receivedDetection?.totalAmount, 100000);

    // Unsubscribe
    unsubscribe();
    bridge.destroy();
  });

  await t.test('Edge Cases: yoloDecoder safely handles null, undefined and invalid buffer sizes', () => {
    assert.deepStrictEqual(decodeYoloTensor(null), []);
    assert.deepStrictEqual(decodeYoloTensor(undefined), []);
    assert.deepStrictEqual(decodeYoloTensor(new Float32Array(0)), []);
    assert.deepStrictEqual(decodeYoloTensor([]), []);
    assert.deepStrictEqual(decodeYoloTensor([[]]), []);
  });

  await t.test('Edge Cases: yoloDecoder clamps out-of-boundary candidate box coordinates', () => {
    const buffer = new Float32Array(YOLO_TENSOR_ELEMENTS);
    buffer.fill(-10);
    // Anchor 0 placed at border: cx=0, cy=0, w=200, h=200 -> raw top-left (-100, -100)
    buffer[0 * YOLO_NUM_ANCHORS + 0] = 0;
    buffer[1 * YOLO_NUM_ANCHORS + 0] = 0;
    buffer[2 * YOLO_NUM_ANCHORS + 0] = 200;
    buffer[3 * YOLO_NUM_ANCHORS + 0] = 200;
    buffer[4 * YOLO_NUM_ANCHORS + 0] = 0.95; // 1k

    const candidates = decodeYoloTensor(buffer, { applySigmoid: false, clampCoords: true });
    assert.strictEqual(candidates.length, 1);
    assert.ok(candidates[0].x >= 0, 'x must be clamped >= 0');
    assert.ok(candidates[0].y >= 0, 'y must be clamped >= 0');
    assert.ok(candidates[0].x + candidates[0].width <= 640, 'Box must not exceed width 640');
    assert.ok(candidates[0].y + candidates[0].height <= 640, 'Box must not exceed height 640');
    assert.strictEqual(candidates[0].x, 0, 'Left clipped to 0');
    assert.strictEqual(candidates[0].y, 0, 'Top clipped to 0');
    assert.strictEqual(candidates[0].width, 100, 'Exact visible width must be 100');
    assert.strictEqual(candidates[0].height, 100, 'Exact visible height must be 100');
    assert.strictEqual(candidates[0].cx, 50, 'Clamped center x must be 50');
    assert.strictEqual(candidates[0].cy, 50, 'Clamped center y must be 50');
  });

  await t.test('yoloDecoder: supports channels-last layout [8400, 13]', () => {
    const buffer = new Float32Array(YOLO_TENSOR_ELEMENTS);
    const anchorIdx = 42;
    // channels_last: index = anchor * 13 + channel
    buffer[anchorIdx * 13 + 0] = 300; // cx
    buffer[anchorIdx * 13 + 1] = 200; // cy
    buffer[anchorIdx * 13 + 2] = 100; // w
    buffer[anchorIdx * 13 + 3] = 50;  // h
    buffer[anchorIdx * 13 + (4 + 4)] = 0.95; // 20k score

    const candidates = decodeYoloTensor(buffer, { layout: 'channels_last', applySigmoid: false });
    assert.strictEqual(candidates.length, 1);
    assert.strictEqual(candidates[0].classId, 20000);
    assert.strictEqual(candidates[0].cx, 300);
    assert.strictEqual(candidates[0].cy, 200);
    assert.strictEqual(candidates[0].width, 100);
    assert.strictEqual(candidates[0].height, 50);
  });

  await t.test('Edge Cases: decoder and IoU safely reject NaN, Infinity, and degenerate values', () => {
    const buffer = new Float32Array(YOLO_TENSOR_ELEMENTS);
    // Anchor with NaN coordinates
    buffer[0 * YOLO_NUM_ANCHORS + 10] = NaN;
    buffer[1 * YOLO_NUM_ANCHORS + 10] = 100;
    buffer[2 * YOLO_NUM_ANCHORS + 10] = 100;
    buffer[3 * YOLO_NUM_ANCHORS + 10] = 50;
    buffer[4 * YOLO_NUM_ANCHORS + 10] = 0.9;

    // Anchor with Infinite width
    buffer[0 * YOLO_NUM_ANCHORS + 20] = 100;
    buffer[1 * YOLO_NUM_ANCHORS + 20] = 100;
    buffer[2 * YOLO_NUM_ANCHORS + 20] = Infinity;
    buffer[3 * YOLO_NUM_ANCHORS + 20] = 50;
    buffer[4 * YOLO_NUM_ANCHORS + 20] = 0.9;

    const candidates = decodeYoloTensor(buffer, { applySigmoid: false });
    assert.strictEqual(candidates.length, 0, 'Must ignore NaN and Infinity coordinates');

    // IoU with NaN box
    const nanBox = { x: NaN, y: 10, width: 100, height: 50, cx: 50, cy: 35, score: 0.9, classIndex: 0, classId: 1000, label: '1k' };
    const validBox = { x: 10, y: 10, width: 100, height: 50, cx: 60, cy: 35, score: 0.9, classIndex: 0, classId: 1000, label: '1k' };
    assert.strictEqual(calculateIoU(nanBox, validBox), 0);
  });

  await t.test('MockMoneyDetector: all 9 individual denomination presets generate valid detections', async () => {
    const denoms = [1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000];
    const scenarios = [
      'SINGLE_1K',
      'SINGLE_2K',
      'SINGLE_5K',
      'SINGLE_10K',
      'SINGLE_20K',
      'SINGLE_50K',
      'SINGLE_100K',
      'SINGLE_200K',
      'SINGLE_500K',
    ];

    const detector = new MockMoneyDetector();
    for (let i = 0; i < denoms.length; i++) {
      detector.setScenario(scenarios[i]);
      const res = await detector.detect();
      assert.strictEqual(res.hasMoney, true);
      assert.strictEqual(res.totalNotesCount, 1);
      assert.strictEqual(res.totalAmount, denoms[i]);
      assert.strictEqual(res.items[0].classId, denoms[i]);
      assert.strictEqual(res.boxes[0].classId, denoms[i]);
      assert.ok(res.boxes[0].score >= 0.90);
    }
  });

  await t.test('Edge Cases: nmsAlgorithm and aggregateDetections handle boundary conditions', () => {
    // Empty inputs
    assert.deepStrictEqual(nonMaximumSuppression([]), []);
    assert.deepStrictEqual(aggregateDetections([]), {
      items: [],
      boxes: [],
      totalAmount: 0,
      totalNotesCount: 0,
      hasMoney: false,
    });

    // Single item returns directly
    const single = [MockMoneyDetector.createMockBox(50000, 10, 10, 100, 50, 0.9)];
    assert.strictEqual(nonMaximumSuppression(single).length, 1);

    // Degenerate zero/negative dimensions
    const degenerateA = { ...single[0], width: 0, height: 50 };
    const degenerateB = { ...single[0], width: 100, height: -10 };
    assert.strictEqual(calculateIoU(degenerateA, degenerateB), 0);

    // Non-suppressed due to maxDetections limit
    const twoSeparate = [
      MockMoneyDetector.createMockBox(10000, 0, 0, 50, 50, 0.99),
      MockMoneyDetector.createMockBox(10000, 200, 200, 50, 50, 0.98),
    ];
    const limited = nonMaximumSuppression(twoSeparate, { maxDetections: 1 });
    assert.strictEqual(limited.length, 1, 'Respects maxDetections limit');
  });
});

test('11. 5-Frame Temporal Debounce & End-to-End System Integration', async (t) => {
  await t.test('Default filter options match specification (windowSize=5, minConsensus=4, emptyThreshold=3)', () => {
    const filter = new TemporalDebounceFilter();
    const opts = filter.getOptions();
    assert.strictEqual(opts.windowSize, 5, 'Sliding window buffer must be 5 frames');
    assert.strictEqual(opts.minConsensus, 4, 'Minimum consensus must be 4 frames (80%)');
    assert.strictEqual(opts.emptyThreshold, 3, 'Empty threshold must be 3 frames');
    assert.strictEqual(filter.getState(), 'EMPTY');
    assert.strictEqual(filter.getStableSignature(), 'EMPTY');
    assert.deepStrictEqual(filter.getStableItems(), []);
  });

  await t.test('Canonical signature and item aggregation are deterministic and invariant', () => {
    assert.strictEqual(computeDebounceSignature([]), 'EMPTY');
    assert.strictEqual(computeDebounceSignature(null), 'EMPTY');
    assert.strictEqual(computeDebounceSignature(undefined), 'EMPTY');

    const single50k = [{ classId: 50000, count: 1, label: '50k', totalAmount: 50000 }];
    assert.strictEqual(computeDebounceSignature(single50k), '50000:1');

    // Order invariant
    const multiA = [
      { classId: 100000, count: 2, label: '100k', totalAmount: 200000 },
      { classId: 50000, count: 1, label: '50k', totalAmount: 50000 },
    ];
    const multiB = [
      { classId: 50000, count: 1, label: '50k', totalAmount: 50000 },
      { classId: 100000, count: 2, label: '100k', totalAmount: 200000 },
    ];
    assert.strictEqual(computeDebounceSignature(multiA), '50000:1|100000:2');
    assert.strictEqual(computeDebounceSignature(multiB), '50000:1|100000:2');

    // Aggregates duplicates of same class
    const dup = [
      { classId: 20000, count: 1, label: '20k', totalAmount: 20000 },
      { classId: 20000, count: 2, label: '20k', totalAmount: 40000 },
    ];
    const aggregated = aggregateDebounceItems(dup);
    assert.strictEqual(aggregated.length, 1);
    assert.strictEqual(aggregated[0].classId, 20000);
    assert.strictEqual(aggregated[0].count, 3);
    assert.strictEqual(aggregated[0].totalAmount, 60000);
  });

  await t.test('Anti-Jitter: 1-2 noise frames do not change stable state', () => {
    const filter = new TemporalDebounceFilter();
    const frame50k = [{ classId: 50000, count: 1, label: 'Năm mươi nghìn', totalAmount: 50000 }];
    const noise20k = [{ classId: 20000, count: 1, label: 'Hai mươi nghìn', totalAmount: 20000 }];

    // Build 50k consensus (4 frames)
    filter.process(frame50k);
    filter.process(frame50k);
    filter.process(frame50k);
    const r4 = filter.process(frame50k);
    assert.strictEqual(r4.state, 'STABLE');
    assert.strictEqual(r4.stateChanged, true);
    assert.strictEqual(r4.signature, '50000:1');
    assert.strictEqual(r4.totalAmount, 50000);

    // Frame 5: steady 50k
    const r5 = filter.process(frame50k);
    assert.strictEqual(r5.state, 'STABLE');
    assert.strictEqual(r5.stateChanged, false);

    // Inject 1st noise frame (20k)
    // Window: [50k, 50k, 50k, 50k, 20k] -> 50k has 4/5 votes (80%)
    const rNoise1 = filter.process(noise20k);
    assert.strictEqual(rNoise1.state, 'STABLE', '50k maintains 4/5 consensus despite 1 noise frame');
    assert.strictEqual(rNoise1.stateChanged, false, 'Must NOT trigger state change on 1 noise frame');
    assert.strictEqual(rNoise1.signature, '50000:1');
    assert.strictEqual(rNoise1.totalAmount, 50000);

    // Inject 2nd noise frame (20k)
    // Window: [50k, 50k, 50k, 20k, 20k] -> 50k has 3/5 votes, 20k has 2/5 votes
    const rNoise2 = filter.process(noise20k);
    assert.strictEqual(rNoise2.state, 'STABILIZING', 'Enters STABILIZING when votes drop below 4');
    assert.strictEqual(rNoise2.stateChanged, false, 'Must NOT trigger false state change to 20k');
    assert.strictEqual(rNoise2.signature, '50000:1', 'Maintains previous stable signature during jitter');
    assert.strictEqual(rNoise2.totalAmount, 50000, 'Maintains previous stable amount');

    // 50k resumes: Frame 8 is 50k
    // Window: [50k, 50k, 20k, 20k, 50k] -> 3/5
    const rResume1 = filter.process(frame50k);
    assert.strictEqual(rResume1.state, 'STABILIZING');
    assert.strictEqual(rResume1.stateChanged, false);

    // Frame 9: 50k -> Window: [50k, 20k, 20k, 50k, 50k] -> 3/5
    const rResume2 = filter.process(frame50k);
    assert.strictEqual(rResume2.state, 'STABILIZING');
    assert.strictEqual(rResume2.stateChanged, false);

    // Frame 10: 50k -> Window: [20k, 20k, 50k, 50k, 50k] -> 3/5
    const rResume3 = filter.process(frame50k);
    assert.strictEqual(rResume3.state, 'STABILIZING');

    // Frame 11: 50k -> Window: [20k, 50k, 50k, 50k, 50k] -> 4/5 votes!
    const rResume4 = filter.process(frame50k);
    assert.strictEqual(rResume4.state, 'STABLE', 'Restores STABLE 50k');
    assert.strictEqual(rResume4.stateChanged, false, 'Re-stabilizing same denomination does NOT fire stateChanged');
    assert.strictEqual(rResume4.signature, '50000:1');
  });

  await t.test('Tremor dropout: 50k -> miss -> 50k -> 50k -> 50k concludes 50k stable', () => {
    const filter = new TemporalDebounceFilter();
    const frame50k = [{ classId: 50000, count: 1, label: 'Năm mươi nghìn', totalAmount: 50000 }];
    const miss = [];

    // Frame 1: 50k
    filter.process(frame50k);
    // Frame 2: Miss (dropped frame / blurred camera)
    filter.process(miss);
    // Frame 3: 50k
    filter.process(frame50k);
    // Frame 4: 50k
    filter.process(frame50k);
    // Frame 5: 50k
    const r5 = filter.process(frame50k);

    assert.strictEqual(r5.state, 'STABLE', 'Must conclude STABLE');
    assert.strictEqual(r5.stateChanged, true, 'Achieves first consensus at frame 5');
    assert.strictEqual(r5.signature, '50000:1');
    assert.strictEqual(r5.consensusCount, 4, '4 out of 5 frames match 50k');
  });

  await t.test('Reaching 4/5 consensus triggers stateChanged to STABLE', () => {
    const filter = new TemporalDebounceFilter();
    const frame100k = [{ classId: 100000, count: 1, label: 'Một trăm nghìn', totalAmount: 100000 }];

    const r1 = filter.process(frame100k);
    assert.strictEqual(r1.state, 'STABILIZING');
    assert.strictEqual(r1.stateChanged, false);

    const r2 = filter.process(frame100k);
    assert.strictEqual(r2.state, 'STABILIZING');
    assert.strictEqual(r2.stateChanged, false);

    const r3 = filter.process(frame100k);
    assert.strictEqual(r3.state, 'STABILIZING');
    assert.strictEqual(r3.stateChanged, false);

    const r4 = filter.process(frame100k);
    assert.strictEqual(r4.state, 'STABLE');
    assert.strictEqual(r4.stateChanged, true);
    assert.strictEqual(r4.signature, '100000:1');
    assert.strictEqual(r4.totalAmount, 100000);
    assert.strictEqual(r4.consensusCount, 4);

    const r5 = filter.process(frame100k);
    assert.strictEqual(r5.state, 'STABLE');
    assert.strictEqual(r5.stateChanged, false, 'No change on 5th frame');
    assert.strictEqual(r5.consensusCount, 5);
  });

  await t.test('Multi-banknote combination achieves stable consensus across 5 frames', () => {
    const filter = new TemporalDebounceFilter();
    const multiItems = [
      { classId: 100000, count: 2, label: 'Một trăm nghìn', totalAmount: 200000 },
      { classId: 50000, count: 1, label: 'Năm mươi nghìn', totalAmount: 50000 },
    ];

    for (let i = 0; i < 3; i++) {
      filter.process(multiItems);
    }
    const r4 = filter.process(multiItems);

    assert.strictEqual(r4.state, 'STABLE');
    assert.strictEqual(r4.stateChanged, true);
    assert.strictEqual(r4.signature, '50000:1|100000:2');
    assert.strictEqual(r4.totalAmount, 250000);
    assert.strictEqual(r4.totalNotesCount, 3);
  });

  await t.test('Withdrawal (rút tiền ra): 3 consecutive empty frames trigger immediate EMPTY transition', () => {
    const filter = new TemporalDebounceFilter();
    const frame500k = [{ classId: 500000, count: 1, label: 'Năm trăm nghìn', totalAmount: 500000 }];

    // Stabilize with 500k
    for (let i = 0; i < 4; i++) {
      filter.process(frame500k);
    }
    assert.strictEqual(filter.getState(), 'STABLE');
    assert.strictEqual(filter.getStableSignature(), '500000:1');

    // Withdraw money: frame 1 empty
    const e1 = filter.process([]);
    assert.strictEqual(e1.consecutiveEmptyFrames, 1);
    assert.strictEqual(e1.state, 'STABLE', '1 empty frame does not drop stable state');
    assert.strictEqual(e1.stateChanged, false);

    // Frame 2 empty
    const e2 = filter.process([]);
    assert.strictEqual(e2.consecutiveEmptyFrames, 2);
    assert.strictEqual(e2.state, 'STABILIZING');
    assert.strictEqual(e2.stateChanged, false);

    // Frame 3 empty: consecutiveEmptyFrames = 3 >= emptyThreshold
    const e3 = filter.process([]);
    assert.strictEqual(e3.consecutiveEmptyFrames, 3);
    assert.strictEqual(e3.state, 'EMPTY', '3 empty frames triggers transition to EMPTY');
    assert.strictEqual(e3.stateChanged, true, 'stateChanged must be true for withdrawal');
    assert.strictEqual(e3.isEmptied, true, 'isEmptied must be true');
    assert.strictEqual(e3.signature, 'EMPTY');
    assert.strictEqual(e3.items.length, 0);
    assert.strictEqual(e3.totalAmount, 0);
    assert.strictEqual(e3.hasMoney, false);

    // Subsequent empty frame 4: should NOT spam stateChanged
    const e4 = filter.process([]);
    assert.strictEqual(e4.state, 'EMPTY');
    assert.strictEqual(e4.stateChanged, false, 'No repeated stateChanged on continuous empty frames');
    assert.strictEqual(e4.isEmptied, false);
  });

  await t.test('Re-insertion after withdrawal transitions back from EMPTY to STABLE', () => {
    const filter = new TemporalDebounceFilter();
    const frame50k = [{ classId: 50000, count: 1, label: '50k', totalAmount: 50000 }];
    const frame200k = [{ classId: 200000, count: 1, label: '200k', totalAmount: 200000 }];

    // 50k stable
    for (let i = 0; i < 4; i++) filter.process(frame50k);
    assert.strictEqual(filter.getState(), 'STABLE');

    // Pull out money (3 empty frames)
    for (let i = 0; i < 3; i++) filter.process([]);
    assert.strictEqual(filter.getState(), 'EMPTY');

    // Now insert 200k
    filter.process(frame200k);
    filter.process(frame200k);
    filter.process(frame200k);
    const r4 = filter.process(frame200k);

    assert.strictEqual(r4.state, 'STABLE');
    assert.strictEqual(r4.stateChanged, true);
    assert.strictEqual(r4.signature, '200000:1');
    assert.strictEqual(r4.totalAmount, 200000);
  });

  await t.test('Rapid alternation between two bills does not flutter or trigger false consensus', () => {
    const filter = new TemporalDebounceFilter();
    const frame10k = [{ classId: 10000, count: 1, label: '10k', totalAmount: 10000 }];
    const frame20k = [{ classId: 20000, count: 1, label: '20k', totalAmount: 20000 }];

    // Alternating 10k, 20k, 10k, 20k, 10k -> max votes for 10k is 3, 20k is 2
    filter.process(frame10k);
    filter.process(frame20k);
    filter.process(frame10k);
    filter.process(frame20k);
    const r5 = filter.process(frame10k);

    assert.strictEqual(r5.state, 'STABILIZING', 'Must remain STABILIZING without consensus');
    assert.strictEqual(r5.stateChanged, false);
    assert.strictEqual(r5.signature, 'EMPTY');
  });

  await t.test('forceStable and reset correctly override and clear filter state', () => {
    const filter = new TemporalDebounceFilter();
    const frame50k = [{ classId: 50000, count: 1, label: '50k', totalAmount: 50000 }];

    const forced = filter.forceStable(frame50k);
    assert.strictEqual(forced.state, 'STABLE');
    assert.strictEqual(forced.stateChanged, true, 'Transition from EMPTY to 50k sets stateChanged=true');
    assert.strictEqual(forced.isEmptied, false);
    assert.strictEqual(forced.signature, '50000:1');
    assert.strictEqual(forced.totalAmount, 50000);
    assert.strictEqual(filter.getState(), 'STABLE');

    // Forcing same note again does NOT set stateChanged
    const forcedSame = filter.forceStable(frame50k);
    assert.strictEqual(forcedSame.stateChanged, false, 'Forcing identical note does not trigger stateChanged');
    assert.strictEqual(forcedSame.isEmptied, false);

    // Forcing empty from stable note triggers isEmptied and stateChanged
    const forcedEmpty = filter.forceStable([]);
    assert.strictEqual(forcedEmpty.state, 'EMPTY');
    assert.strictEqual(forcedEmpty.stateChanged, true, 'Transition from 50k to empty sets stateChanged=true');
    assert.strictEqual(forcedEmpty.isEmptied, true, 'Transition from 50k to empty sets isEmptied=true');

    // Forcing empty again when already empty does NOT re-trigger isEmptied
    const forcedEmptyAgain = filter.forceStable([]);
    assert.strictEqual(forcedEmptyAgain.stateChanged, false);
    assert.strictEqual(forcedEmptyAgain.isEmptied, false);

    filter.reset();
    assert.strictEqual(filter.getState(), 'EMPTY');
    assert.strictEqual(filter.getStableSignature(), 'EMPTY');
    assert.strictEqual(filter.getWindow().length, 0);
  });

  await t.test('Custom filter options (windowSize=3, minConsensus=2, emptyThreshold=2)', () => {
    const filter = new TemporalDebounceFilter({
      windowSize: 3,
      minConsensus: 2,
      emptyThreshold: 2,
    });
    const frame5k = [{ classId: 5000, count: 1, label: '5k', totalAmount: 5000 }];

    // 2 frames achieves consensus
    filter.process(frame5k);
    const r2 = filter.process(frame5k);
    assert.strictEqual(r2.state, 'STABLE');
    assert.strictEqual(r2.stateChanged, true);

    // 2 empty frames triggers withdrawal
    filter.process([]);
    const e2 = filter.process([]);
    assert.strictEqual(e2.state, 'EMPTY');
    assert.strictEqual(e2.stateChanged, true);
  });

  await t.test('End-to-End Simulation Loop: MockMoneyDetector -> Debounce -> Audio Controller pipeline', async () => {
    const simulatedDriver = new SimulatedAudioDriver();
    const hapticNotifier = new DefaultHapticNotifier();
    const audioController = new SmartPreemptionController({
      driver: simulatedDriver,
      hapticNotifier,
      cooldownMs: 1500,
      interClipGapMs: 10,
    });
    const debounceFilter = new TemporalDebounceFilter();
    const mockDetector = new MockMoneyDetector('SINGLE_50K');

    let currentUIState = {
      items: [],
      hasMoney: false,
      totalAmount: 0,
      announcementCount: 0,
    };

    // Callback representing the UI / Money State hook
    const handleDetectionFrame = async (rawDetection) => {
      const debounced = debounceFilter.process(rawDetection);
      if (debounced.stateChanged) {
        if (debounced.isEmptied) {
          currentUIState = {
            items: [],
            hasMoney: false,
            totalAmount: 0,
            announcementCount: currentUIState.announcementCount,
          };
          await audioController.handleDetectionUpdate([]);
        } else {
          currentUIState = {
            items: debounced.items,
            hasMoney: true,
            totalAmount: debounced.totalAmount,
            announcementCount: currentUIState.announcementCount + 1,
          };
          await audioController.handleDetectionUpdate(debounced.items);
        }
      }
    };

    // Feed 3 frames from detector (under 4 consensus threshold)
    for (let i = 0; i < 3; i++) {
      const raw = await mockDetector.detect();
      await handleDetectionFrame(raw);
    }
    assert.strictEqual(currentUIState.hasMoney, false, 'UI remains empty before consensus');
    assert.strictEqual(simulatedDriver.getPlayedClips().length, 0, 'No audio played before consensus');

    // 4th frame reaches consensus
    const raw4 = await mockDetector.detect();
    await handleDetectionFrame(raw4);

    assert.strictEqual(currentUIState.hasMoney, true, 'UI state updates on consensus');
    assert.strictEqual(currentUIState.totalAmount, 50000);
    assert.strictEqual(currentUIState.announcementCount, 1);

    // Wait for audio sequence to finish playing
    await new Promise(r => setTimeout(r, 60));
    assert.ok(
      simulatedDriver.getPlayedClips().includes('vnd_50k'),
      'Audio controller announced 50k clip'
    );

    // Frame 5: steady 50k (cooldown suppresses audio replay)
    const historyLenBefore = simulatedDriver.getPlayedClips().length;
    const raw5 = await mockDetector.detect();
    await handleDetectionFrame(raw5);
    assert.strictEqual(simulatedDriver.getPlayedClips().length, historyLenBefore, 'No duplicate audio played');

    // Jitter: Inject 1 noise frame (10k)
    mockDetector.setScenario('SINGLE_10K');
    const rawNoise = await mockDetector.detect();
    await handleDetectionFrame(rawNoise);
    assert.strictEqual(currentUIState.totalAmount, 50000, 'UI amount does not jitter on single 10k frame');

    // Withdrawal: User pulls money out
    mockDetector.setScenario('EMPTY');
    for (let i = 0; i < 3; i++) {
      const emptyRaw = await mockDetector.detect();
      await handleDetectionFrame(emptyRaw);
    }

    assert.strictEqual(currentUIState.hasMoney, false, 'UI cleared to empty after 3 frames');
    assert.strictEqual(currentUIState.totalAmount, 0);
    assert.ok(
      simulatedDriver.getPlayedClips().includes('empty'),
      'Audio controller played empty.wav earcon on withdrawal'
    );
    assert.strictEqual(hapticNotifier.removedCount, 1, 'Haptic feedback emitted on money removal');

    // Single Tap on empty: announces empty
    await audioController.handleSingleTap(currentUIState.items);
    const playedClips = simulatedDriver.getPlayedClips();
    assert.strictEqual(
      playedClips[playedClips.length - 1],
      'empty',
      'Single tap on empty replays empty earcon'
    );

    audioController.destroy();
    debounceFilter.destroy();
  });

  await t.test('NativeDetectorBridge resetDebounceFilter and getDebounceState fallback safely', async () => {
    const bridge = new NativeDetectorBridge();
    const resetResult = await bridge.resetDebounceFilter();
    assert.strictEqual(resetResult, true);

    const debounceState = await bridge.getDebounceState();
    assert.strictEqual(debounceState.state, 'EMPTY');
    assert.strictEqual(debounceState.signature, 'EMPTY');

    bridge.destroy();
  });

  await t.test('Edge Cases: TemporalDebounceFilter safely handles empty, null, undefined, and malformed frames', () => {
    const filter = new TemporalDebounceFilter();

    // Null and undefined
    const resNull = filter.process(null);
    assert.strictEqual(resNull.state, 'EMPTY');
    assert.strictEqual(resNull.stateChanged, false);

    const resUndef = filter.process(undefined);
    assert.strictEqual(resUndef.state, 'EMPTY');

    // Malformed object
    const resMalformed = filter.process({});
    assert.strictEqual(resMalformed.state, 'EMPTY');

    // Items with zero or negative counts
    const zeroItem = filter.process([{ classId: 50000, count: 0, label: '50k', totalAmount: 0 }]);
    assert.strictEqual(zeroItem.signature, 'EMPTY');

    const negItem = filter.process([{ classId: 50000, count: -1, label: '50k', totalAmount: -50000 }]);
    assert.strictEqual(negItem.signature, 'EMPTY');

    // Add listener and destroy
    let listenerCalled = false;
    const unsub = filter.addListener(() => { listenerCalled = true; });
    filter.process([]);
    assert.strictEqual(listenerCalled, true);
    unsub();

    filter.destroy();
    assert.strictEqual(filter.getState(), 'EMPTY');
  });

  await t.test('Note count change (1x 50k -> 2x 50k) requires 4/5 consensus before updating count', () => {
    const filter = new TemporalDebounceFilter();
    const one50k = [{ classId: 50000, count: 1, label: '50k', totalAmount: 50000 }];
    const two50k = [{ classId: 50000, count: 2, label: '50k', totalAmount: 100000 }];

    // Stabilize with 1x 50k
    for (let i = 0; i < 4; i++) filter.process(one50k);
    assert.strictEqual(filter.getStableSignature(), '50000:1');

    // Introduce 2x 50k: frames 1, 2, 3 do not trigger change
    filter.process(two50k);
    filter.process(two50k);
    const r3 = filter.process(two50k);
    assert.strictEqual(r3.state, 'STABILIZING');
    assert.strictEqual(r3.stateChanged, false);
    assert.strictEqual(r3.totalNotesCount, 1, 'Still retains 1 note until consensus');

    // 4th frame reaches consensus
    const r4 = filter.process(two50k);
    assert.strictEqual(r4.state, 'STABLE');
    assert.strictEqual(r4.stateChanged, true);
    assert.strictEqual(r4.totalNotesCount, 2);
    assert.strictEqual(r4.totalAmount, 100000);
    assert.strictEqual(r4.signature, '50000:2');
  });

  await t.test('Stress Test: 100 frames with 20% random intermittent jitter preserves stable detection', () => {
    const filter = new TemporalDebounceFilter();
    const validBill = [{ classId: 100000, count: 1, label: '100k', totalAmount: 100000 }];
    const jitterBills = [
      [{ classId: 10000, count: 1, label: '10k', totalAmount: 10000 }],
      [{ classId: 20000, count: 1, label: '20k', totalAmount: 20000 }],
      [],
    ];

    // Seed 4 frames to stabilize
    for (let i = 0; i < 4; i++) filter.process(validBill);
    assert.strictEqual(filter.getStableSignature(), '100000:1');

    let stateFlips = 0;
    // Run 100 frames where every 5th frame is jitter
    for (let i = 0; i < 100; i++) {
      const isJitter = i % 5 === 0;
      const frame = isJitter ? jitterBills[i % jitterBills.length] : validBill;
      const res = filter.process(frame);
      if (res.stateChanged) {
        stateFlips++;
      }
      assert.strictEqual(
        filter.getStableSignature(),
        '100000:1',
        `Stable signature must never flip on isolated jitter at frame ${i}`
      );
    }

    assert.strictEqual(stateFlips, 0, 'Zero state flips should occur under isolated periodic jitter');
  });

  await t.test('calculateAddedItemsDelta: correctly computes positive additions and ignores removals/withdrawals', () => {
    // 1. Initial banknote presentation: empty -> 1x 50k
    const d1 = calculateAddedItemsDelta([], [{ classId: 50000, count: 1, label: '50k', totalAmount: 50000 }]);
    assert.strictEqual(d1.addedAmount, 50000);
    assert.strictEqual(d1.addedCount, 1);
    assert.strictEqual(d1.addedItems.length, 1);
    assert.strictEqual(d1.addedItems[0].classId, 50000);

    // 2. Second note added: 1x 50k -> 1x 50k + 1x 100k
    const prev2 = [{ classId: 50000, count: 1, label: '50k', totalAmount: 50000 }];
    const next2 = [
      { classId: 50000, count: 1, label: '50k', totalAmount: 50000 },
      { classId: 100000, count: 1, label: '100k', totalAmount: 100000 },
    ];
    const d2 = calculateAddedItemsDelta(prev2, next2);
    assert.strictEqual(d2.addedAmount, 100000, 'Must only add 100k (delta), NOT total 150k');
    assert.strictEqual(d2.addedCount, 1, 'Must only add 1 new note');
    assert.strictEqual(d2.addedItems[0].classId, 100000);

    // 3. Note removed: 1x 50k + 1x 100k -> 1x 100k (user removes 50k note)
    const prev3 = next2;
    const next3 = [{ classId: 100000, count: 1, label: '100k', totalAmount: 100000 }];
    const d3 = calculateAddedItemsDelta(prev3, next3);
    assert.strictEqual(d3.addedAmount, 0, 'Removing notes must NOT increase wallet amount');
    assert.strictEqual(d3.addedCount, 0, 'Removing notes must NOT increase wallet note count');
    assert.strictEqual(d3.addedItems.length, 0);

    // 4. Complete withdrawal: 1x 100k -> []
    const d4 = calculateAddedItemsDelta(next3, []);
    assert.strictEqual(d4.addedAmount, 0);
    assert.strictEqual(d4.addedCount, 0);

    // 5. Presenting new note after withdrawal: [] -> 1x 20k
    const d5 = calculateAddedItemsDelta([], [{ classId: 20000, count: 1, label: '20k', totalAmount: 20000 }]);
    assert.strictEqual(d5.addedAmount, 20000);
    assert.strictEqual(d5.addedCount, 1);

    // 6. Quantity increase of same denomination: 1x 50k -> 3x 50k
    const prev6 = [{ classId: 50000, count: 1, label: '50k', totalAmount: 50000 }];
    const next6 = [{ classId: 50000, count: 3, label: '50k', totalAmount: 150000 }];
    const d6 = calculateAddedItemsDelta(prev6, next6);
    assert.strictEqual(d6.addedAmount, 100000, 'Adding 2 more 50k notes equals +100k');
    assert.strictEqual(d6.addedCount, 2);
  });

  await t.test('Sanitization: aggregateDebounceItems and computeDebounceSignature clamp float counts and reject NaN/negative/Infinity', () => {
    // Float count 1.9 -> Math.floor to 1
    const floatItem = [{ classId: 50000, count: 1.9, label: '50k', totalAmount: 50000 }];
    const aggFloat = aggregateDebounceItems(floatItem);
    assert.strictEqual(aggFloat.length, 1);
    assert.strictEqual(aggFloat[0].count, 1, 'Float count must be floored to integer 1');
    assert.strictEqual(computeDebounceSignature(floatItem), '50000:1');

    // NaN count and Infinity count
    const nanItem = [{ classId: 20000, count: NaN, label: '20k', totalAmount: 20000 }];
    assert.deepStrictEqual(aggregateDebounceItems(nanItem), []);
    assert.strictEqual(computeDebounceSignature(nanItem), 'EMPTY');

    const infItem = [{ classId: 20000, count: Infinity, label: '20k', totalAmount: 20000 }];
    assert.deepStrictEqual(aggregateDebounceItems(infItem), []);
    assert.strictEqual(computeDebounceSignature(infItem), 'EMPTY');

    // Negative count
    const negItem = [{ classId: 10000, count: -5, label: '10k', totalAmount: -50000 }];
    assert.deepStrictEqual(aggregateDebounceItems(negItem), []);
    assert.strictEqual(computeDebounceSignature(negItem), 'EMPTY');

    // Non-finite classId
    const badClass = [{ classId: NaN, count: 1, label: 'NaN', totalAmount: 0 }];
    assert.deepStrictEqual(aggregateDebounceItems(badClass), []);
    assert.strictEqual(computeDebounceSignature(badClass), 'EMPTY');
  });

  await t.test('TemporalDebounceFilter: supports event wrapper with nativeEvent.items seamlessly', () => {
    const filter = new TemporalDebounceFilter();
    const eventObject = {
      nativeEvent: {
        items: [{ classId: 100000, count: 1, label: '100k', totalAmount: 100000 }],
        timestamp: 1700000000000,
      },
    };

    // Feed 4 frames using nativeEvent wrapper
    for (let i = 0; i < 3; i++) filter.process(eventObject);
    const r4 = filter.process(eventObject);

    assert.strictEqual(r4.state, 'STABLE');
    assert.strictEqual(r4.stateChanged, true);
    assert.strictEqual(r4.signature, '100000:1');
    assert.strictEqual(r4.totalAmount, 100000);
  });

  await t.test('End-to-End Session Wallet & Hybrid Preemption Speech Lifecycle (Ticket 06 Spec)', async () => {
    const simulatedDriver = new SimulatedAudioDriver();
    const hapticNotifier = new DefaultHapticNotifier();
    const audioController = new SmartPreemptionController({
      driver: simulatedDriver,
      hapticNotifier,
      cooldownMs: 1500,
      interClipGapMs: 10,
    });
    const debounceFilter = new TemporalDebounceFilter();

    let wallet = {
      totalAmount: 0,
      totalNotesCount: 0,
      history: [],
    };
    let previousStableItems = [];
    let currentUIState = { items: [], hasMoney: false };

    const processIncomingFrame = async (frame) => {
      const debounced = debounceFilter.process(frame);
      if (debounced.stateChanged) {
        if (debounced.isEmptied) {
          previousStableItems = [];
          currentUIState = { items: [], hasMoney: false };
          await audioController.handleDetectionUpdate([]);
        } else {
          currentUIState = { items: debounced.items, hasMoney: true };
          const { addedItems, addedAmount, addedCount } = calculateAddedItemsDelta(
            previousStableItems,
            debounced.items
          );
          previousStableItems = [...debounced.items];

          if (addedCount > 0) {
            wallet.totalAmount += addedAmount;
            wallet.totalNotesCount += addedCount;
            wallet.history.push(...addedItems);
          }
          await audioController.handleDetectionUpdate(debounced.items);
        }
      }
      return debounced;
    };

    // 1. Present 1x 50k note (requires 4 frames for consensus)
    const frame50k = [{ classId: 50000, count: 1, label: 'Năm mươi nghìn', totalAmount: 50000 }];
    for (let i = 0; i < 4; i++) {
      await processIncomingFrame(frame50k);
    }
    assert.strictEqual(currentUIState.hasMoney, true);
    assert.strictEqual(wallet.totalAmount, 50000, 'Wallet has 50k');
    assert.strictEqual(wallet.totalNotesCount, 1, 'Wallet has 1 note');

    await new Promise(r => setTimeout(r, 60));
    assert.ok(simulatedDriver.getPlayedClips().includes('vnd_50k'));

    // 2. Add 1x 100k note alongside 50k (now 50k + 100k in frame)
    const frameMulti = [
      { classId: 100000, count: 1, label: 'Một trăm nghìn', totalAmount: 100000 },
      { classId: 50000, count: 1, label: 'Năm mươi nghìn', totalAmount: 50000 },
    ];
    for (let i = 0; i < 4; i++) {
      await processIncomingFrame(frameMulti);
    }
    assert.strictEqual(wallet.totalAmount, 150000, 'Wallet must be 150k (50k + 100k), NOT 200k!');
    assert.strictEqual(wallet.totalNotesCount, 2, 'Wallet must have 2 notes, NOT 3!');

    // 3. User removes 50k note, leaving only 100k in view
    const frame100kOnly = [{ classId: 100000, count: 1, label: 'Một trăm nghìn', totalAmount: 100000 }];
    for (let i = 0; i < 4; i++) {
      await processIncomingFrame(frame100kOnly);
    }
    assert.strictEqual(wallet.totalAmount, 150000, 'Removing 50k note must NOT increase wallet (remains 150k)!');
    assert.strictEqual(wallet.totalNotesCount, 2, 'Notes count remains 2!');

    // 4. Sudden withdrawal: user pulls all money out (3 empty frames)
    for (let i = 0; i < 3; i++) {
      await processIncomingFrame([]);
    }
    assert.strictEqual(currentUIState.hasMoney, false, 'UI cleared to empty');
    assert.strictEqual(wallet.totalAmount, 150000, 'Wallet preserved after withdrawal');
    assert.strictEqual(hapticNotifier.removedCount, 1, 'Haptic triggered on withdrawal');

    // 5. Present new 200k note after withdrawal
    const frame200k = [{ classId: 200000, count: 1, label: 'Hai trăm nghìn', totalAmount: 200000 }];
    for (let i = 0; i < 4; i++) {
      await processIncomingFrame(frame200k);
    }
    assert.strictEqual(wallet.totalAmount, 350000, 'Wallet accumulated +200k -> 350k');
    assert.strictEqual(wallet.totalNotesCount, 3, 'Wallet note count is 3');

    // 6. Two-finger double tap: reset wallet
    wallet = { totalAmount: 0, totalNotesCount: 0, history: [] };
    previousStableItems = [];
    debounceFilter.reset();
    await audioController.handleTwoFingerDoubleTap();
    assert.strictEqual(wallet.totalAmount, 0, 'Wallet reset to 0');
    assert.strictEqual(wallet.totalNotesCount, 0, 'Notes count reset to 0');
    assert.strictEqual(debounceFilter.getState(), 'EMPTY');

    audioController.destroy();
    debounceFilter.destroy();
  });

  await t.test('Frame Deduplication: duplicate frames with identical timestamp do not double-advance consensus', () => {
    const filter = new TemporalDebounceFilter();
    let lastProcessedTimestamp = 0;
    let framesProcessedByFilter = 0;

    const simulateDispatch = (frame) => {
      const ts = frame?.timestamp || 0;
      if (ts !== 0 && ts === lastProcessedTimestamp) {
        return; // Deduplicated
      }
      if (ts !== 0) {
        lastProcessedTimestamp = ts;
      }
      framesProcessedByFilter++;
      filter.process(frame);
    };

    const frameA = {
      items: [{ classId: 50000, count: 1, label: '50k', totalAmount: 50000 }],
      timestamp: 1000,
    };

    // Dispatch frameA twice (simulating dual-channel event broadcast from CameraView + Bridge)
    simulateDispatch(frameA);
    simulateDispatch(frameA);

    assert.strictEqual(framesProcessedByFilter, 1, 'Only 1 frame processed due to deduplication');
    assert.strictEqual(filter.getWindow().length, 1);
    assert.strictEqual(filter.getState(), 'STABILIZING', 'Must NOT declare consensus prematurely');

    // Send 3 more distinct frames
    simulateDispatch({ ...frameA, timestamp: 1100 });
    simulateDispatch({ ...frameA, timestamp: 1200 });
    simulateDispatch({ ...frameA, timestamp: 1300 });

    assert.strictEqual(framesProcessedByFilter, 4);
    assert.strictEqual(filter.getState(), 'STABLE', 'Reaches STABLE on 4 distinct frames');
  });
});

test('12. Universal Release APK Packaging, Zero-Network Architecture & Keystore Security', async (t) => {
  const projectRoot = process.cwd();

  await t.test('Criterion 1: Zero-Network Manifest Architecture (Zero INTERNET, strictly CAMERA, VIBRATE, FLASHLIGHT)', () => {
    const res = checkZeroNetworkManifest(projectRoot);
    assert.strictEqual(res.passed, true, res.reason);
    assert.match(res.details, /Zero-Network architecture confirmed/);
  });

  await t.test('Criterion 2: Standard Release Keystore (Valid PKCS12 file, RSA 4096-bit, alias moneyvision)', () => {
    const res = checkReleaseKeystore(projectRoot);
    assert.strictEqual(res.passed, true, res.reason);
    assert.strictEqual(res.keySize, 4096);
  });

  await t.test('Criterion 3: Universal Dual-ABI Architecture (armeabi-v7a for Android 9 32-bit and arm64-v8a for 64-bit)', () => {
    const res = checkAbiFilters(projectRoot);
    assert.strictEqual(res.passed, true, res.reason);
    assert.deepStrictEqual(res.abis, ['armeabi-v7a', 'arm64-v8a']);
  });

  await t.test('Criterion 4: Disabled ABI Splits (splits.abi.enable = false produces unified Universal APK)', () => {
    const res = checkSplitsAbiDisabled(projectRoot);
    assert.strictEqual(res.passed, true, res.reason);
  });

  await t.test('Criterion 5: OS & SDK Level Boundaries (minSdkVersion = 28 / Android 9.0 Pie, targetSdkVersion = 34 / Android 14)', () => {
    const res = checkSdkVersions(projectRoot);
    assert.strictEqual(res.passed, true, res.reason);
    assert.strictEqual(res.minSdkVersion, 28);
    assert.strictEqual(res.targetSdkVersion, 34);
  });

  await t.test('Criterion 6: Multi-Scheme Release Signing (v1 JAR, v2 APK Sig Block, and v3 Key Rotation enabled)', () => {
    const res = checkSigningConfigSchemes(projectRoot);
    assert.strictEqual(res.passed, true, res.reason);
  });

  await t.test('Criterion 7: ProGuard & R8 Optimization Rules (Protects TFLite, CameraX, JNI native methods, and MoneyVision)', () => {
    const res = checkProguardRules(projectRoot);
    assert.strictEqual(res.passed, true, res.reason);
  });

  await t.test('Criterion 8: Offline Voice Assets Completeness (Exactly 24 audio files in res/raw, non-empty)', () => {
    const res = checkAudioAssetsInRaw(projectRoot);
    assert.strictEqual(res.passed, true, res.reason);
    assert.strictEqual(res.totalFiles, 24);
  });

  await t.test('Criterion 9: Model Asset Readiness (assets/models directory configured with yolo26_money_quant.tflite spec)', () => {
    const res = checkModelAssetsReady(projectRoot);
    assert.strictEqual(res.passed, true, res.reason);
  });

  await t.test('Criterion 10: Native Android Module Registrations (MoneyAudioPackage, MoneyCameraPackage, MoneyDetectorPackage in MainApplication)', () => {
    const res = checkMainApplicationPackages(projectRoot);
    assert.strictEqual(res.passed, true, res.reason);
    assert.strictEqual(res.packages.length, 3);
  });

  await t.test('Full Criteria Pipeline: verifyAllCriteria passes 10/10 with 0 failures', () => {
    const res = verifyAllCriteria(projectRoot);
    assert.strictEqual(res.allPassed, true);
    assert.strictEqual(res.passedCount, 10);
    assert.strictEqual(res.failedCount, 0);
  });

  await t.test('Automated Release APK Packaging: buildReleaseApk produces valid signed Universal APK', async () => {
    const buildResult = await buildReleaseApk({ projectRoot });
    assert.strictEqual(buildResult.success, true);
    assert.ok(fs.existsSync(buildResult.apkPath), 'Release APK must exist on filesystem');
    assert.ok(fs.existsSync(buildResult.sha256Path), 'SHA-256 checksum file must exist');
    assert.ok(buildResult.fileSizeBytes > 100000, 'APK size must be substantial (>100KB)');
    assert.strictEqual(buildResult.inspection.passed, true, 'Inspected APK must pass all checks');
  });

  await t.test('APK Package File Structure: Valid ZIP magic, entries count, and EOCD record', () => {
    const apkPath = path.join(projectRoot, 'release', 'com.nckh.moneyvision-v1.0.0-universal-release.apk');
    const inspection = inspectApkPackage(apkPath);
    assert.strictEqual(inspection.exists, true);
    assert.strictEqual(inspection.passed, true);
    assert.strictEqual(inspection.hasManifest, true, 'AndroidManifest.xml must be present');
    assert.strictEqual(inspection.hasArmeabi, true, 'lib/armeabi-v7a/ must be present');
    assert.strictEqual(inspection.hasArm64, true, 'lib/arm64-v8a/ must be present');
    assert.strictEqual(inspection.hasAudio, true, 'Embedded audio assets must be present');
    assert.strictEqual(inspection.hasMetaInf, true, 'META-INF signatures must be present');
    assert.strictEqual(inspection.hasSigBlock, true, 'APK Sig Block 42 must be present');
  });

  await t.test('APK Signature Schemes: verifies presence of v1 (MANIFEST.MF, CERT.SF, CERT.RSA) and v2/v3 signing block', () => {
    const apkPath = path.join(projectRoot, 'release', 'com.nckh.moneyvision-v1.0.0-universal-release.apk');
    const inspection = inspectApkPackage(apkPath);
    const entryNames = inspection.entries;
    assert.ok(entryNames.includes('META-INF/MANIFEST.MF'), 'v1 MANIFEST.MF present');
    assert.ok(entryNames.includes('META-INF/CERT.SF'), 'v1 CERT.SF present');
    assert.ok(entryNames.includes('META-INF/CERT.RSA'), 'v1 CERT.RSA present');
    assert.strictEqual(inspection.hasSigBlock, true, 'v2/v3 Signing Block attached');
  });

  await t.test('Anti-Virus False Positive & Anti-Spyware Immunity: Zero network permissions, no external socket dependencies', () => {
    const manifestPath = path.join(projectRoot, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
    const uncommented = manifestContent.replace(/<!--[\s\S]*?-->/g, '');
    assert.strictEqual(/android\.permission\.INTERNET/i.test(uncommented), false);
    assert.strictEqual(/android\.permission\.ACCESS_NETWORK_STATE/i.test(uncommented), false);
    assert.strictEqual(/android\.permission\.ACCESS_WIFI_STATE/i.test(uncommented), false);
    assert.strictEqual(/android\.permission\.RECEIVE_BOOT_COMPLETED/i.test(uncommented), false);
  });

  await t.test('Packaging Engine Invariant: buildUniversalApkArchive creates readable APK archive', () => {
    const testEntries = [
      { name: 'AndroidManifest.xml', data: Buffer.from('<manifest/>') },
      { name: 'lib/armeabi-v7a/libtest.so', data: Buffer.from('test-arm') },
      { name: 'lib/arm64-v8a/libtest.so', data: Buffer.from('test-arm64') },
      { name: 'res/raw/test.wav', data: Buffer.from('RIFF') },
      { name: 'META-INF/MANIFEST.MF', data: Buffer.from('Manifest-Version: 1.0\r\n') },
    ];
    const zipBuf = buildUniversalApkArchive(testEntries);
    assert.strictEqual(zipBuf.readUInt32LE(0), 0x04034b50, 'Must begin with PK local header magic');
    assert.ok(zipBuf.includes(Buffer.from('APK Sig Block 42')), 'Must include APK Sig Block 42');
  });

  await t.test('Defensive Verification: inspectApkPackage safely rejects non-existent or truncated files', () => {
    const nonExistent = inspectApkPackage(path.join(projectRoot, 'release', 'non-existent.apk'));
    assert.strictEqual(nonExistent.exists, false);
    assert.strictEqual(nonExistent.passed, false);

    const tempTruncated = path.join(projectRoot, 'release', 'truncated.apk');
    try {
      fs.writeFileSync(tempTruncated, Buffer.from([1, 2, 3, 4]));
      const truncatedRes = inspectApkPackage(tempTruncated);
      assert.strictEqual(truncatedRes.passed, false);
    } finally {
      if (fs.existsSync(tempTruncated)) fs.unlinkSync(tempTruncated);
    }
  });

  await t.test('Defensive Verification: checkAudioAssetsInRaw detects missing audio file if removed', () => {
    assert.strictEqual(REQUIRED_RAW_AUDIO_FILES.length, 24);
    assert.ok(REQUIRED_RAW_AUDIO_FILES.includes('vnd_1k.mp3'));
    assert.ok(REQUIRED_RAW_AUDIO_FILES.includes('vnd_500k.mp3'));
    assert.ok(REQUIRED_RAW_AUDIO_FILES.includes('qty_1.mp3'));
    assert.ok(REQUIRED_RAW_AUDIO_FILES.includes('tick.wav'));
    assert.ok(REQUIRED_RAW_AUDIO_FILES.includes('wallet_reset.wav'));
  });

  await t.test('Prerequisites Check: checkAndroidSdkPath and checkAllPrerequisites validate all 4 packaging prerequisites', () => {
    const sdkRes = checkAndroidSdkPath(projectRoot);
    assert.strictEqual(typeof sdkRes.found, 'boolean');
    assert.strictEqual(typeof sdkRes.details, 'string');

    const prereqs = checkAllPrerequisites(projectRoot);
    assert.strictEqual(prereqs.allReady, true);
    assert.ok(prereqs.prerequisites.keystore.passed, 'Keystore prerequisite ready');
    assert.ok(prereqs.prerequisites.audio.passed, 'Audio prerequisite ready');
    assert.ok(prereqs.prerequisites.models.passed, 'Models prerequisite ready');
    assert.strictEqual(typeof prereqs.prerequisites.sdk.found, 'boolean');
  });

  await t.test('Defensive Verification: checkReleaseKeystore rejects bad passwords and invalid credentials', () => {
    const badPassRes = checkReleaseKeystore(projectRoot, 'definitely_wrong_password_12345');
    assert.strictEqual(badPassRes.passed, false, 'Keystore must reject invalid password');
    assert.match(badPassRes.reason, /Keytool inspection failed|password|corrupted/i);
  });

  await t.test('Defensive Verification: checkZeroNetworkManifest rejects unauthorized network permissions', () => {
    const testManifestDir = path.join(projectRoot, 'release', '__test_manifest__');
    const testAppDir = path.join(testManifestDir, 'android', 'app', 'src', 'main');
    fs.mkdirSync(testAppDir, { recursive: true });
    try {
      const maliciousXml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
        <uses-permission android:name="android.permission.CAMERA" />
        <uses-permission android:name="android.permission.VIBRATE" />
        <uses-permission android:name="android.permission.FLASHLIGHT" />
        <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
      </manifest>`;
      fs.writeFileSync(path.join(testAppDir, 'AndroidManifest.xml'), maliciousXml);
      const res = checkZeroNetworkManifest(testManifestDir);
      assert.strictEqual(res.passed, false, 'Must reject ACCESS_NETWORK_STATE');
      assert.match(res.reason, /SECURITY RISK.*ACCESS_NETWORK_STATE/);
    } finally {
      if (fs.existsSync(testManifestDir)) {
        fs.rmSync(testManifestDir, { recursive: true, force: true });
      }
    }
  });

  await t.test('APK Alignment (zipalign): buildUniversalApkArchive enforces 4-byte resource and 4096-byte .so alignment', () => {
    const apkPath = path.join(projectRoot, 'release', 'com.nckh.moneyvision-v1.0.0-universal-release.apk');
    const buf = fs.readFileSync(apkPath);
    const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const cdOffset = buf.readUInt32LE(eocd + 16);
    const cdSize = buf.readUInt32LE(eocd + 12);

    let cur = cdOffset;
    let checkedSoCount = 0;
    let checkedResourceCount = 0;

    while (cur < cdOffset + cdSize) {
      const magic = buf.readUInt32LE(cur);
      if (magic !== 0x02014b50) break;
      const method = buf.readUInt16LE(cur + 10);
      const fnLen = buf.readUInt16LE(cur + 28);
      const extraLen = buf.readUInt16LE(cur + 30);
      const commentLen = buf.readUInt16LE(cur + 32);
      const localOffset = buf.readUInt32LE(cur + 42);
      const name = buf.toString('utf8', cur + 46, cur + 46 + fnLen);

      const localExtraLen = buf.readUInt16LE(localOffset + 28);
      const dataOffset = localOffset + 30 + fnLen + localExtraLen;

      if (name.endsWith('.so')) {
        assert.strictEqual(dataOffset % 4096, 0, `Shared library ${name} must be 4096-byte page aligned (offset ${dataOffset})`);
        checkedSoCount++;
      } else if (method === 0) {
        assert.strictEqual(dataOffset % 4, 0, `Uncompressed file ${name} must be 4-byte aligned (offset ${dataOffset})`);
        checkedResourceCount++;
      }

      cur += 46 + fnLen + extraLen + commentLen;
    }

    assert.ok(checkedSoCount >= 2, 'Must align both armeabi-v7a and arm64-v8a .so binaries');
    assert.ok(checkedResourceCount >= 25, 'Must align uncompressed audio and resource tables');
  });

  await t.test('APK Signature Schemes: inspectApkPackage validates v1, v2, and v3 schemes structurally', () => {
    const apkPath = path.join(projectRoot, 'release', 'com.nckh.moneyvision-v1.0.0-universal-release.apk');
    const inspection = inspectApkPackage(apkPath);
    assert.strictEqual(inspection.hasV1Sig, true, 'v1 JAR Scheme verified');
    assert.strictEqual(inspection.hasV2Sig, true, 'v2 APK Sig Block scheme verified');
    assert.strictEqual(inspection.hasV3Sig, true, 'v3 Key-Rotation scheme verified');
    assert.strictEqual(inspection.hasSigBlock, true, 'APK Sig Block verified');
  });

  await t.test('Build Modes & Helper: findGradleExecutable and ensureLocalProperties operate safely', () => {
    const gradleCmd = findGradleExecutable(projectRoot);
    // Returns string path, command name, or null if not installed; should never throw
    assert.ok(gradleCmd === null || typeof gradleCmd === 'string');

    const localPropsOk = ensureLocalProperties(projectRoot);
    assert.strictEqual(typeof localPropsOk, 'boolean');
    assert.ok(fs.existsSync(path.join(projectRoot, 'android', 'local.properties')), 'local.properties exists');
  });

  await t.test('Automated Packaging Mode: buildReleaseApk supports mode options (auto, offline, verifyOnly)', async () => {
    const verifyOnlyResult = await buildReleaseApk({ projectRoot, verifyOnly: true });
    assert.strictEqual(verifyOnlyResult.success, true);
    assert.strictEqual(verifyOnlyResult.verifyResult.allPassed, true);
    assert.strictEqual(verifyOnlyResult.prerequisites.allReady, true);

    const offlineResult = await buildReleaseApk({ projectRoot, mode: 'offline' });
    assert.strictEqual(offlineResult.success, true);
    assert.strictEqual(offlineResult.mode, 'offline');
    assert.ok(fs.existsSync(offlineResult.apkPath));
  });
});

test('13. Real Vietnamese Audio Payload, YOLO26n INT8 TFLite Model & SDK Cryptographic APK Verification', async (t) => {
  const projectRoot = process.cwd();

  await t.test('Audio Payload Integrity: isRealAudioPayload rejects zero-filled MP3/WAV stubs and validates all 24 real audio assets', () => {
    // 1. Reject fake zero-filled MP3 (4-byte header + 0x00 bytes)
    const fakeMp3 = Buffer.alloc(5004, 0);
    fakeMp3[0] = 0xff;
    fakeMp3[1] = 0xfb;
    fakeMp3[2] = 0x90;
    fakeMp3[3] = 0xc2;
    assert.strictEqual(isRealAudioPayload(fakeMp3), false, 'Must reject zero-filled MP3 stub');

    // 2. Reject fake zero-filled WAV (44-byte RIFF header + 0x00 PCM)
    const fakeWav = Buffer.alloc(44 + 4096, 0);
    fakeWav.write('RIFF', 0);
    fakeWav.write('WAVE', 8);
    assert.strictEqual(isRealAudioPayload(fakeWav), false, 'Must reject silent zero-filled WAV');

    // 3. Verify all 24 real audio files in res/raw, android/app/src/main/assets/audio, and src/assets/audio
    const dirs = [
      path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'raw'),
      path.join(projectRoot, 'android', 'app', 'src', 'main', 'assets', 'audio'),
      path.join(projectRoot, 'src', 'assets', 'audio'),
    ];
    for (const dir of dirs) {
      for (const file of REQUIRED_RAW_AUDIO_FILES) {
        const fullPath = path.join(dir, file);
        assert.ok(fs.existsSync(fullPath), `Audio file must exist: ${fullPath}`);
        const buf = fs.readFileSync(fullPath);
        const format = file.endsWith('.mp3') ? 'mp3' : 'wav';
        assert.strictEqual(
          isRealAudioPayload(buf),
          true,
          `Audio file ${fullPath} must contain non-silent real ${format.toUpperCase()} audio`
        );
        if (format === 'mp3') {
          assert.ok(buf.length > 7000, `Vietnamese voice MP3 ${file} must be > 7KB (got ${buf.length} bytes)`);
        } else {
          assert.ok(buf.length > 10000, `44.1kHz PCM WAV earcon ${file} must be > 10KB (got ${buf.length} bytes)`);
        }
      }
    }
  });

  await t.test('YOLO26n INT8 TFLite Decoder: handles normalized [0..1] coordinates (_NormalizeCoords) and INT8 dequantized probabilities [0.0..1.0615] without false sigmoid on 0.0 background', () => {
    const numAnchors = YOLO_NUM_ANCHORS;
    const tensor = new Float32Array(YOLO_TOTAL_CHANNELS * numAnchors);

    // Simulate INT8 dequantized output from yolo26_money_quant.tflite:
    // - Background anchors have dequantized probability 0.0
    // - Anchor #42 has normalized coords [cx=0.5, cy=0.5, w=0.4, h=0.25]
    //   and INT8 max dequantized score 255 * 0.004162984 = 1.06156 (> 1.0!) for class index 8 (500,000 VND)
    const anchorIdx = 42;
    tensor[0 * numAnchors + anchorIdx] = 0.5;  // normalized cx -> 320px
    tensor[1 * numAnchors + anchorIdx] = 0.5;  // normalized cy -> 320px
    tensor[2 * numAnchors + anchorIdx] = 0.4;  // normalized w  -> 256px
    tensor[3 * numAnchors + anchorIdx] = 0.25; // normalized h  -> 160px
    tensor[(4 + 8) * numAnchors + anchorIdx] = 1.06156; // 500k class score slightly > 1.0 due to INT8 scale

    const boxes = decodeYoloTensor(tensor, {
      scoreThreshold: 0.45,
      iouThreshold: 0.5,
      applySigmoid: 'auto',
    });

    // Must detect ONLY anchor #42 (and NOT apply sigmoid(0.0)=0.50 to the other 8,399 background anchors!)
    assert.strictEqual(boxes.length, 1, `Expected exactly 1 detection, got ${boxes.length}`);
    assert.strictEqual(boxes[0].classId, 500000);
    assert.strictEqual(boxes[0].score, 1.0, 'Score > 1.0 from INT8 scale must be clamped to 1.0');
    assert.ok(Math.abs(boxes[0].cx - 320) < 0.01, `Normalized cx=0.5 must scale to 320px (got ${boxes[0].cx})`);
    assert.ok(Math.abs(boxes[0].cy - 320) < 0.01, `Normalized cy=0.5 must scale to 320px (got ${boxes[0].cy})`);
    assert.ok(Math.abs(boxes[0].width - 256) < 0.01, `Normalized width=0.4 must scale to 256px (got ${boxes[0].width})`);
    assert.ok(Math.abs(boxes[0].height - 160) < 0.01, `Normalized height=0.25 must scale to 160px (got ${boxes[0].height})`);
  });

  await t.test('YOLO26n TFLite Model Asset: yolo26_money_quant.tflite is synchronized, has valid TFL3 FlatBuffer header, and is stored uncompressed in Universal APK', () => {
    const syncedPath = ensureModelAssetsSync(projectRoot);
    assert.ok(syncedPath && fs.existsSync(syncedPath), 'yolo26_money_quant.tflite must exist');

    const srcModelPath = path.join(projectRoot, 'src', 'assets', 'models', 'yolo26_money_quant.tflite');
    const androidModelPath = path.join(projectRoot, 'android', 'app', 'src', 'main', 'assets', 'models', 'yolo26_money_quant.tflite');
    assert.ok(fs.existsSync(srcModelPath), 'src/assets/models/yolo26_money_quant.tflite must exist');
    assert.ok(fs.existsSync(androidModelPath), 'android/app/src/main/assets/models/yolo26_money_quant.tflite must exist');

    const modelBuf = fs.readFileSync(androidModelPath);
    assert.strictEqual(modelBuf.toString('ascii', 4, 8), 'TFL3', 'Must have TFL3 FlatBuffer magic identifier');
    assert.ok(modelBuf.length > 2500000, `Model size must be ~2.88MB (got ${modelBuf.length} bytes)`);

    // Verify model is embedded inside the release APK with STORE (method === 0) and 4-byte alignment
    const apkPath = path.join(projectRoot, 'release', 'com.nckh.moneyvision-v1.0.0-universal-release.apk');
    const apkBuf = fs.readFileSync(apkPath);
    assert.ok(apkBuf.length > 3200000, `Universal APK with embedded TFLite model must be > 3.2MB (got ${apkBuf.length} bytes)`);

    const eocd = apkBuf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const cdOffset = apkBuf.readUInt32LE(eocd + 16);
    const cdSize = apkBuf.readUInt32LE(eocd + 12);

    let cur = cdOffset;
    let foundModelInApk = false;
    let foundClassesDex = false;
    let foundResourcesArsc = false;

    while (cur < cdOffset + cdSize) {
      if (apkBuf.readUInt32LE(cur) !== 0x02014b50) break;
      const method = apkBuf.readUInt16LE(cur + 10);
      const uncompSize = apkBuf.readUInt32LE(cur + 24);
      const fnLen = apkBuf.readUInt16LE(cur + 28);
      const extraLen = apkBuf.readUInt16LE(cur + 30);
      const commentLen = apkBuf.readUInt16LE(cur + 32);
      const localOffset = apkBuf.readUInt32LE(cur + 42);
      const name = apkBuf.toString('utf8', cur + 46, cur + 46 + fnLen);

      const localExtraLen = apkBuf.readUInt16LE(localOffset + 28);
      const dataOffset = localOffset + 30 + fnLen + localExtraLen;

      if (name === 'assets/models/yolo26_money_quant.tflite') {
        foundModelInApk = true;
        assert.strictEqual(method, 0, 'yolo26_money_quant.tflite must be stored uncompressed (method=0) for Android AssetManager.openFd mmap');
        assert.strictEqual(dataOffset % 4, 0, 'yolo26_money_quant.tflite must be 4-byte aligned');
        assert.strictEqual(uncompSize, modelBuf.length, 'Embedded model size must match source model size exactly');
      } else if (name === 'classes.dex') {
        foundClassesDex = true;
        assert.ok(uncompSize > 10000, `Compiled classes.dex must contain full Android runtime bytecode (got ${uncompSize} bytes)`);
      } else if (name === 'resources.arsc') {
        foundResourcesArsc = true;
        assert.strictEqual(method, 0, 'resources.arsc must be stored uncompressed (method=0)');
        assert.ok(uncompSize > 1000, `Compiled resources.arsc must contain full resource table (got ${uncompSize} bytes)`);
      }

      cur += 46 + fnLen + extraLen + commentLen;
    }

    assert.strictEqual(foundModelInApk, true, 'assets/models/yolo26_money_quant.tflite must be present in APK');
    assert.strictEqual(foundClassesDex, true, 'classes.dex must be present in APK');
    assert.strictEqual(foundResourcesArsc, true, 'resources.arsc must be present in APK');
  });

  await t.test('Android SDK Cryptographic & Badging Verification: apksigner verify and aapt2 dump badging pass on Universal Release APK', () => {
    const sdkRes = checkAndroidSdkPath(projectRoot);
    if (!sdkRes.found) return;
    const tools = locateAndroidSdkTools(sdkRes.path);
    if (!tools) return;

    const apkPath = path.join(projectRoot, 'release', 'com.nckh.moneyvision-v1.0.0-universal-release.apk');

    // 1. Verify with aapt2 dump badging (proves binary AndroidManifest.xml and resources.arsc are valid for Android PackageParser)
    const badgingOut = execFileSync(tools.aapt2, ['dump', 'badging', apkPath], { encoding: 'utf8' });
    assert.match(badgingOut, /package:\s+name='com\.nckh\.moneyvision'\s+versionCode='1'\s+versionName='1\.0\.0'/);
    assert.match(badgingOut, /(?:minSdkVersion|sdkVersion):'28'/);
    assert.match(badgingOut, /targetSdkVersion:'34'/);
    assert.match(badgingOut, /launchable-activity:\s+name='com\.nckh\.moneyvision\.MainActivity'/);
    assert.strictEqual(/android\.permission\.INTERNET/.test(badgingOut), false, 'Zero INTERNET permission in compiled binary manifest');

    // 2. Verify with apksigner verify --verbose (proves cryptographic v1 + v2 + v3 signatures are valid)
    if (tools.apksigner) {
      const verifyArgs = ['verify', '--min-sdk-version', '18', '--verbose', apkPath];
      const sigOut =
        process.platform === 'win32'
          ? execFileSync('cmd.exe', ['/c', tools.apksigner, ...verifyArgs], { encoding: 'utf8' })
          : execFileSync(tools.apksigner, verifyArgs, { encoding: 'utf8' });
      assert.match(sigOut, /Verifies/);
      assert.match(sigOut, /Verified using v1 scheme \(JAR signing\):\s*true/);
      assert.match(sigOut, /Verified using v2 scheme \(APK Signature Scheme v2\):\s*true/);
      assert.match(sigOut, /Verified using v3 scheme \(APK Signature Scheme v3\):\s*true/);
    }
  });

  await t.test('YOLO26n Tensor-Level Coordinate Normalization: rejects degenerate < 2px noise anchors in pixel-coordinate tensors without falsely scaling by 640', () => {
    const numAnchors = YOLO_NUM_ANCHORS;
    const tensor = new Float32Array(YOLO_TOTAL_CHANNELS * numAnchors);

    // Anchor #10: valid pixel-space detection [cx=320, cy=240, w=200, h=100], class 2 (100,000 VND) score=0.92
    const validAnchor = 10;
    tensor[0 * numAnchors + validAnchor] = 320.0;
    tensor[1 * numAnchors + validAnchor] = 240.0;
    tensor[2 * numAnchors + validAnchor] = 200.0;
    tensor[3 * numAnchors + validAnchor] = 100.0;
    tensor[(4 + 2) * numAnchors + validAnchor] = 0.92;

    // Anchor #99: degenerate tiny noise box in pixel-coordinate tensor [cx=0.8, cy=0.7, w=0.5, h=0.4], class 8 (500,000 VND) score=0.95
    // Under a buggy per-anchor <= 1.5 heuristic, this would be multiplied by 640 into a 320x256px false positive!
    const noiseAnchor = 99;
    tensor[0 * numAnchors + noiseAnchor] = 0.8;
    tensor[1 * numAnchors + noiseAnchor] = 0.7;
    tensor[2 * numAnchors + noiseAnchor] = 0.5;
    tensor[3 * numAnchors + noiseAnchor] = 0.4;
    tensor[(4 + 8) * numAnchors + noiseAnchor] = 0.95;

    const boxes = decodeYoloTensor(tensor, {
      scoreThreshold: 0.45,
      iouThreshold: 0.5,
      applySigmoid: 'auto',
    });

    assert.strictEqual(boxes.length, 1, `Degenerate <2px noise anchor must be rejected, leaving 1 valid box (got ${boxes.length})`);
    assert.strictEqual(boxes[0].classId, 100000);
    assert.strictEqual(boxes[0].width, 200.0);
    assert.strictEqual(boxes[0].height, 100.0);
  });

  await t.test('LiteRT / TensorFlow Lite Native JNI & Bytecode Integration: Universal APK embeds real libtensorflowlite_jni.so (arm64-v8a & armeabi-v7a) and Interpreter in classes.dex', () => {
    const apkPath = path.join(projectRoot, 'release', 'com.nckh.moneyvision-v1.0.0-universal-release.apk');
    const apkBuf = fs.readFileSync(apkPath);
    const eocd = apkBuf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const cdOffset = apkBuf.readUInt32LE(eocd + 16);
    const cdSize = apkBuf.readUInt32LE(eocd + 12);

    let cur = cdOffset;
    let arm64Tflite = null;
    let armv7Tflite = null;
    let classesDexInfo = null;

    while (cur < cdOffset + cdSize) {
      if (apkBuf.readUInt32LE(cur) !== 0x02014b50) break;
      const method = apkBuf.readUInt16LE(cur + 10);
      const compSize = apkBuf.readUInt32LE(cur + 20);
      const uncompSize = apkBuf.readUInt32LE(cur + 24);
      const fnLen = apkBuf.readUInt16LE(cur + 28);
      const extraLen = apkBuf.readUInt16LE(cur + 30);
      const commentLen = apkBuf.readUInt16LE(cur + 32);
      const localOffset = apkBuf.readUInt32LE(cur + 42);
      const name = apkBuf.toString('utf8', cur + 46, cur + 46 + fnLen);
      const localExtraLen = apkBuf.readUInt16LE(localOffset + 28);
      const dataOffset = localOffset + 30 + fnLen + localExtraLen;

      if (name === 'lib/arm64-v8a/libtensorflowlite_jni.so') {
        arm64Tflite = { method, uncompSize, dataOffset };
      } else if (name === 'lib/armeabi-v7a/libtensorflowlite_jni.so') {
        armv7Tflite = { method, uncompSize, dataOffset };
      } else if (name === 'classes.dex') {
        classesDexInfo = { method, compSize, uncompSize, dataOffset };
      }
      cur += 46 + fnLen + extraLen + commentLen;
    }

    assert.ok(arm64Tflite, 'lib/arm64-v8a/libtensorflowlite_jni.so must be embedded in Universal APK');
    assert.strictEqual(arm64Tflite.method, 0, 'arm64-v8a libtensorflowlite_jni.so must be stored uncompressed (method=0)');
    assert.strictEqual(arm64Tflite.dataOffset % 4096, 0, 'arm64-v8a libtensorflowlite_jni.so must be 4096-byte aligned');
    assert.ok(arm64Tflite.uncompSize > 1000000, `arm64-v8a libtensorflowlite_jni.so must be real native binary (>1MB, got ${arm64Tflite.uncompSize})`);

    assert.ok(armv7Tflite, 'lib/armeabi-v7a/libtensorflowlite_jni.so must be embedded in Universal APK');
    assert.strictEqual(armv7Tflite.method, 0, 'armeabi-v7a libtensorflowlite_jni.so must be stored uncompressed (method=0)');
    assert.strictEqual(armv7Tflite.dataOffset % 4096, 0, 'armeabi-v7a libtensorflowlite_jni.so must be 4096-byte aligned');
    assert.ok(armv7Tflite.uncompSize > 500000, `armeabi-v7a libtensorflowlite_jni.so must be real native binary (>500KB, got ${armv7Tflite.uncompSize})`);

    assert.ok(classesDexInfo, 'classes.dex must exist in Universal APK');
    assert.ok(classesDexInfo.uncompSize > 100000, `classes.dex must include LiteRT + MoneyVision runtime (>100KB, got ${classesDexInfo.uncompSize})`);
  });

  await t.test('Android Native Audio Module Safety: MoneyAudioModule avoids premature FileDescriptor closure and routes to USAGE_MEDIA', () => {
    const ktPath = path.join(
      projectRoot,
      'android',
      'app',
      'src',
      'main',
      'java',
      'com',
      'nckh',
      'moneyvision',
      'audio',
      'MoneyAudioModule.kt'
    );
    const ktContent = fs.readFileSync(ktPath, 'utf8');

    // Must NOT wrap afd.fileDescriptor inside FileInputStream(afd.fileDescriptor).use (which closes the FD before setDataSource)
    assert.strictEqual(
      /FileInputStream\s*\(\s*afd\.fileDescriptor\s*\)\.use/.test(ktContent),
      false,
      'MoneyAudioModule.kt must not close afd.fileDescriptor via FileInputStream.use before MediaPlayer.setDataSource'
    );
    assert.match(ktContent, /AudioAttributes\.USAGE_MEDIA/, 'MoneyAudioModule.kt must route audio to USAGE_MEDIA');
    assert.match(ktContent, /pendingTtsAction/, 'MoneyAudioModule.kt must queue early TTS requests before onInit completes');
  });
});

test('14. Author & Independent Ownership Attribution (Nguyễn Quang Toàn)', async (t) => {
  const projectRoot = process.cwd();

  await t.test('Author Constants & Theme Synchronization: AUTHOR_INFO and THEME.author define Nguyễn Quang Toàn ownership and WCAG AAA texts', () => {
    assert.strictEqual(AUTHOR_INFO.authorName, 'Nguyễn Quang Toàn');
    assert.strictEqual(AUTHOR_INFO.ownershipRole, 'Chủ sở hữu & Nhà phát triển độc lập');
    assert.strictEqual(
      AUTHOR_INFO.fullAttribution,
      'Nguyễn Quang Toàn - Chủ sở hữu & Phát triển độc lập'
    );
    assert.strictEqual(
      AUTHOR_INFO.fixedBannerText,
      'Tác giả & Sở hữu độc lập: Nguyễn Quang Toàn'
    );
    assert.strictEqual(
      AUTHOR_INFO.copyrightNotice,
      '© 2026 Nguyễn Quang Toàn - Sở hữu & Phát triển độc lập'
    );
    assert.strictEqual(
      AUTHOR_INFO.technicalSummary,
      'Ứng dụng AI trợ năng nhận diện tiền Việt Nam Đồng 100% Offline (YOLO26 TFLite).'
    );
    assert.strictEqual(
      AUTHOR_INFO.spokenAnnouncement,
      'Ứng dụng thuộc sở hữu và phát triển độc lập bởi Nguyễn Quang Toàn'
    );
    assert.strictEqual(THEME.author, AUTHOR_INFO);

    // WCAG AAA Contrast verification for Author Banner & Copyright Modal colors (#FFE600 and #FFFFFF on #000000)
    const yellowOnBlack = calculateContrastRatio(THEME.colors.primaryYellow, THEME.colors.background);
    const whiteOnBlack = calculateContrastRatio(THEME.colors.secondaryWhite, THEME.colors.background);
    assert.ok(yellowOnBlack >= 7.0, `Author Header/Modal Yellow on Black contrast (${yellowOnBlack.toFixed(2)}:1) must exceed WCAG AAA 7.0:1`);
    assert.ok(whiteOnBlack >= 7.0, `Author Modal White on Black contrast (${whiteOnBlack.toFixed(2)}:1) must exceed WCAG AAA 7.0:1`);
  });

  await t.test('Vietnamese Voice & Haptic Behavior: handleAuthorInfoAnnouncement speaks ownership message on demand with haptic feedback without delaying startup', async () => {
    const simDriver = new SimulatedAudioDriver(5);
    const hapticNotifier = new DefaultHapticNotifier();
    const controller = new SmartPreemptionController({
      driver: simDriver,
      hapticNotifier,
      interClipGapMs: 5,
    });

    // Verify startup flow does NOT automatically trigger author speech
    assert.strictEqual(simDriver.getSpokenTexts().length, 0, 'Startup must not speak author announcement automatically');

    // Trigger author info announcement (as when user opens Author & Copyright Modal or taps Nghe đọc)
    const spoken = await controller.handleAuthorInfoAnnouncement();
    assert.strictEqual(
      spoken,
      'Ứng dụng thuộc sở hữu và phát triển độc lập bởi Nguyễn Quang Toàn'
    );
    assert.strictEqual(hapticNotifier.detectedCount, 1, 'Must trigger tactile confirmation haptic when announcing author info');
    assert.deepStrictEqual(simDriver.getPlayedClips(), ['tick'], 'Must play tactile tick earcon before speaking author attribution');
    assert.deepStrictEqual(simDriver.getSpokenTexts(), [
      'Ứng dụng thuộc sở hữu và phát triển độc lập bởi Nguyễn Quang Toàn',
    ]);

    // Verify custom text override and preemption of ongoing detection audio
    simDriver.clearHistory();
    const customSpoken = await controller.handleAuthorInfoAnnouncement(
      'Tác giả Nguyễn Quang Toàn'
    );
    assert.strictEqual(customSpoken, 'Tác giả Nguyễn Quang Toàn');
    assert.strictEqual(hapticNotifier.detectedCount, 2);
    assert.deepStrictEqual(simDriver.getSpokenTexts(), ['Tác giả Nguyễn Quang Toàn']);
    controller.destroy();
  });

  await t.test('System & Source Metadata Verification: checkAuthorAndCopyrightMetadata validates package.json, AndroidManifest, strings.xml, UI components, MainActivity.java, and docs', () => {
    const res = checkAuthorAndCopyrightMetadata(projectRoot);
    assert.strictEqual(res.passed, true, `Author metadata check failed: ${res.reason}`);

    const verifyRes = verifyAllCriteria(projectRoot);
    assert.strictEqual(verifyRes.allPassed, true);
    assert.ok(verifyRes.authorCheck, 'verifyAllCriteria must include authorCheck result');
    assert.strictEqual(verifyRes.authorCheck.passed, true);
  });

  await t.test('Defensive Verification: checkAuthorAndCopyrightMetadata rejects missing or altered author attribution', () => {
    const tempDir = path.join(projectRoot, 'release', '__test_author_meta__');
    fs.mkdirSync(tempDir, { recursive: true });
    try {
      // Missing package.json entirely
      const missingPkgRes = checkAuthorAndCopyrightMetadata(tempDir);
      assert.strictEqual(missingPkgRes.passed, false);
      assert.match(missingPkgRes.reason, /package\.json missing/i);

      // Present package.json but without Nguyễn Quang Toàn
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'test', author: 'Someone Else' }),
        'utf8'
      );
      const wrongAuthorRes = checkAuthorAndCopyrightMetadata(tempDir);
      assert.strictEqual(wrongAuthorRes.passed, false);
      assert.match(wrongAuthorRes.reason, /package\.json author field missing Nguyễn Quang Toàn/i);
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  await t.test('GestureCanvas Touch Pass-Through: child buttons (Author Modal button) are not blocked by PanResponder capture', () => {
    const gestureCanvasPath = path.join(projectRoot, 'src', 'components', 'GestureCanvas.tsx');
    const content = fs.readFileSync(gestureCanvasPath, 'utf8');
    assert.match(
      content,
      /onStartShouldSetPanResponderCapture:\s*\(\)\s*=>\s*false/,
      'GestureCanvas must set onStartShouldSetPanResponderCapture to false so child buttons receive taps'
    );
  });

  await t.test('Rapid Repeated Taps & Interruption Safety: handleAuthorInfoAnnouncement debounces overlapping taps and aborts TTS if tick is interrupted', async () => {
    const simDriver = new SimulatedAudioDriver(25);
    const hapticNotifier = new DefaultHapticNotifier();
    const controller = new SmartPreemptionController({
      driver: simDriver,
      hapticNotifier,
      interClipGapMs: 5,
    });

    // 1. Rapid double-tap on Author Info button (2nd tap fires 5ms after 1st tap while 25ms tick is playing)
    const p1 = controller.handleAuthorInfoAnnouncement('Lần chạm 1');
    await new Promise((r) => setTimeout(r, 5));
    assert.strictEqual(controller.isSpeaking(), true, 'Controller must report isSpeaking() === true during author announcement');
    const p2 = controller.handleAuthorInfoAnnouncement('Lần chạm 2');

    await Promise.all([p1, p2]);
    // Only the 2nd tap should have spoken its text; the 1st tap's interrupted tick must NOT leak a duplicate speakText
    assert.deepStrictEqual(
      simDriver.getSpokenTexts(),
      ['Lần chạm 2'],
      'Interrupted first tap must not speak after its tick earcon was cancelled'
    );
    assert.strictEqual(controller.isSpeaking(), false, 'Controller must reset isSpeaking() to false after completion');

    // 2. Interruption by empty frame (handleDetectionUpdate([])) mid-tick aborts author TTS
    simDriver.clearHistory();
    const p3 = controller.handleAuthorInfoAnnouncement('Bị ngắt giữa chừng');
    await new Promise((r) => setTimeout(r, 5));
    await controller.handleDetectionUpdate([]);
    await p3;
    assert.deepStrictEqual(
      simDriver.getSpokenTexts(),
      [],
      'Author TTS must not fire if interrupted by empty frame during tick'
    );

    // 3. NativeAudioDriver fallback delegates speakText when native module is absent
    const nativeDriver = new NativeAudioDriver();
    await assert.doesNotReject(async () => {
      await nativeDriver.speakText(AUTHOR_INFO.spokenAnnouncement);
    });
    nativeDriver.destroy();
    controller.destroy();
  });

  await t.test('Dialog & Camera Frame Guard: useMoneyState and MainActivity.java prevent background camera frames from cutting off Author Dialog', () => {
    const useMoneyStateContent = fs.readFileSync(
      path.join(projectRoot, 'src', 'hooks', 'useMoneyState.ts'),
      'utf8'
    );
    assert.match(
      useMoneyStateContent,
      /if\s*\(\s*isAuthorModalVisibleRef\.current\s*\)/,
      'useMoneyState.ts must guard handleMoneyDetected while Author modal is open'
    );

    const sdkBuilderContent = fs.readFileSync(
      path.join(projectRoot, 'scripts', 'android-sdk-builder.mjs'),
      'utf8'
    );
    assert.match(
      sdkBuilderContent,
      /if\s*\(\s*!finished\s*\)\s*return;/,
      'MainActivity.announceAuthorVoice must check if (!finished) return before speaking TTS'
    );
    assert.match(
      sdkBuilderContent,
      /activeAuthorDialog\s*!=\s*null\s*&&\s*activeAuthorDialog\.isShowing\(\)/,
      'MainActivity.processCameraFrame must guard against interrupting activeAuthorDialog'
    );
  });

  await t.test('Compiled Universal Release APK Attribution & In-Place Update Keystore Preservation', () => {
    // 1. Keystore preservation check
    const keystoreRes = checkReleaseKeystore(projectRoot);
    assert.strictEqual(keystoreRes.passed, true, keystoreRes.reason);

    // 2. Verify compiled APK binary manifest & resources contain author attribution
    const apkPath = path.join(projectRoot, 'release', 'com.nckh.moneyvision-v1.0.0-universal-release.apk');
    assert.ok(fs.existsSync(apkPath), 'Universal Release APK must exist');

    const sdkRes = checkAndroidSdkPath(projectRoot);
    if (sdkRes.found) {
      const tools = locateAndroidSdkTools(sdkRes.path);
      if (tools && tools.aapt2) {
        const xmltreeOut = execFileSync(
          tools.aapt2,
          ['dump', 'xmltree', apkPath, '--file', 'AndroidManifest.xml'],
          { encoding: 'utf8' }
        );
        assert.match(
          xmltreeOut,
          /com\.nckh\.moneyvision\.AUTHOR/,
          'Compiled AndroidManifest.xml in APK must contain com.nckh.moneyvision.AUTHOR meta-data'
        );
        assert.match(
          xmltreeOut,
          /com\.nckh\.moneyvision\.COPYRIGHT/,
          'Compiled AndroidManifest.xml in APK must contain com.nckh.moneyvision.COPYRIGHT meta-data'
        );

        const stringsDump = execFileSync(
          tools.aapt2,
          ['dump', 'strings', apkPath],
          { encoding: 'utf8' }
        );
        assert.match(
          stringsDump,
          /Nguyễn Quang Toàn/,
          'Compiled resources.arsc string pool in APK must contain Nguyễn Quang Toàn'
        );
      }
    }
  });
});

test('15. Ticket 08: 4-Layer Anti-Strobe Smart Torch & Optical Reflection Guard', async (t) => {
  const projectRoot = process.cwd();

  await t.test('Anti-Strobe Constants & Thresholds match Ticket 08 specification', () => {
    assert.strictEqual(MIN_TORCH_ON_HOLD_MS, 12000);
    assert.strictEqual(POST_TORCH_BASELINE_WINDOW_MS, 450);
    assert.strictEqual(HIGH_RESTORE_LIGHT_THRESHOLD_LUX, 175);
    assert.strictEqual(POST_TORCH_DELTA_LUX, 55);
    assert.strictEqual(RESTORE_SUSTAIN_DURATION_MS, 3000);
    assert.strictEqual(AMBIENT_SENSOR_RESTORE_LUX, 85);
    assert.strictEqual(SPECULAR_GLARE_PIXEL_THRESHOLD, 230);
    assert.strictEqual(MAX_GLARE_RATIO_FOR_RESTORE, 0.08);
    assert.strictEqual(MAX_CENTER_TO_BORDER_RATIO, 1.30);
    assert.strictEqual(OSCILLATION_WINDOW_MS, 30000);
    assert.strictEqual(OSCILLATION_MAX_CYCLES, 2);
    assert.strictEqual(OSCILLATION_LATCH_DURATION_MS, 60000);
  });

  await t.test('analyzeYPlaneSpatialProfile distinguishes uniform ambient light from close-range LED hotspot and specular glare', () => {
    // 1. Uniform bright room (190 lux across entire 8x8 frame)
    const uniformBright = new Uint8Array(64).fill(190);
    const uniformProfile = analyzeYPlaneSpatialProfile(uniformBright, 8, 8);
    assert.strictEqual(uniformProfile.averageLuma, 190);
    assert.strictEqual(uniformProfile.centerLuma, 190);
    assert.strictEqual(uniformProfile.borderLuma, 190);
    assert.strictEqual(uniformProfile.glareRatio, 0);
    assert.strictEqual(uniformProfile.centerToBorderRatio, 1.0);
    assert.strictEqual(uniformProfile.isCloseRangeReflection, false);

    // 2. Close-range banknote reflection: dark border (40 lux) but bright specular center (245 lux > 230 glare)
    const reflectionFrame = new Uint8Array(64).fill(40);
    for (let r = 2; r < 6; r++) {
      for (let c = 2; c < 6; c++) {
        reflectionFrame[r * 8 + c] = 245;
      }
    }
    const reflectionProfile = analyzeYPlaneSpatialProfile(reflectionFrame, 8, 8);
    assert.ok(reflectionProfile.centerLuma > 240);
    assert.strictEqual(reflectionProfile.borderLuma, 40);
    assert.strictEqual(reflectionProfile.glareRatio, 16 / 64); // 0.25 >= 0.08
    assert.ok(reflectionProfile.centerToBorderRatio > 5.0);
    assert.strictEqual(reflectionProfile.isCloseRangeReflection, true);
    assert.strictEqual(
      isOpticalReflectionLikely(
        reflectionProfile.averageLuma,
        90,
        reflectionProfile.glareRatio,
        reflectionProfile.centerToBorderRatio
      ),
      true
    );

    // 3. Edge case safety on null / empty / invalid dimensions
    const emptyProfile = analyzeYPlaneSpatialProfile(null, 0, 0);
    assert.strictEqual(emptyProfile.averageLuma, 0);
    assert.strictEqual(emptyProfile.isCloseRangeReflection, false);
  });

  await t.test('Close-Range Reflection Strobe Prevention: jump from 15 lux to 180 lux after auto-torch ON does NOT turn off torch', () => {
    const controller = new SmartTorchController();

    // 1. Dark scene (15 lux) for 1000ms triggers auto TURN_ON
    controller.onLuminanceSample(15, 1000);
    const onAction = controller.onLuminanceSample(15, 2000);
    assert.strictEqual(onAction.action, 'TURN_ON');
    assert.strictEqual(controller.getState().isTorchOn, true);

    // 2. 66ms later (t = 2066ms): LED light reflects off close banknote, jumping avgLux from 15 to 180 lux!
    const reflect1 = controller.onLuminanceSample(180, 2066);
    assert.strictEqual(reflect1.action, 'NO_OP', 'Must NOT turn off when reflected light jumps to 180 lux');
    assert.strictEqual(controller.getState().isTorchOn, true);
    assert.strictEqual(controller.getPostTorchBaselineLuma(), 180);

    // 3. Reflection continues at 180-210 lux even past the 12-second hold window (e.g. t = 5s, 15s, 20s, 30s)
    // Required threshold is Math.max(175, 180 + 55) = 235 lux
    for (const ts of [2400, 3000, 5000, 10000, 15000, 20000, 25000, 30000]) {
      const action = controller.onLuminanceSample(185, ts);
      assert.strictEqual(
        action.action,
        'NO_OP',
        `Torch must remain ON under 185 lux self-reflection at t=${ts}ms`
      );
      assert.strictEqual(controller.getState().isTorchOn, true);
    }

    // 4. Only when true ambient light exceeds Math.max(175, 180 + 55) = 235 lux continuously for >= 3000ms does it turn OFF
    assert.strictEqual(controller.onLuminanceSample(240, 31000).action, 'NO_OP');
    assert.strictEqual(controller.onLuminanceSample(240, 33000).action, 'NO_OP');
    const genuineOff = controller.onLuminanceSample(240, 34000);
    assert.strictEqual(genuineOff.action, 'TURN_OFF');
    assert.strictEqual(controller.getState().isTorchOn, false);
  });

  await t.test('Minimum Torch ON Hold Duration (12s): keeps torch ON for at least 12,000ms even under bright recovery', () => {
    const controller = new SmartTorchController();

    // Auto turn ON at t = 2000ms
    controller.onLuminanceSample(12, 1000);
    const turnOn = controller.onLuminanceSample(12, 2000);
    assert.strictEqual(turnOn.action, 'TURN_ON');

    // Capture post-torch baseline at t = 2300ms (80 lux) -> requiredYThreshold = Math.max(175, 80 + 55) = 175 lux
    controller.onLuminanceSample(80, 2300);
    assert.strictEqual(controller.getPostTorchBaselineLuma(), 80);

    // Room light turns on brightly (200 lux >= 175 lux) at t = 3000ms (only 1s after torch ON)
    // Even after 3s, 6s, 9s, 11.9s of continuous 200 lux, torch MUST remain ON until t = 14,000ms (2000 + 12000)!
    for (const ts of [3000, 5000, 7000, 10000, 12000, 13999]) {
      const holdAction = controller.onLuminanceSample(200, ts);
      assert.strictEqual(
        holdAction.action,
        'NO_OP',
        `Torch must be held ON at t=${ts}ms (< 12000ms since turn-on at 2000ms)`
      );
      assert.strictEqual(holdAction.guardReason, 'MIN_HOLD_COOLDOWN');
      assert.strictEqual(controller.getState().isTorchOn, true);
    }

    // At t = 14000ms (exact 12,000ms hold elapsed, and 200 lux has already been sustained for 11,000ms >= 3,000ms): turns OFF!
    const offAction = controller.onLuminanceSample(200, 14000);
    assert.strictEqual(offAction.action, 'TURN_OFF');
    assert.strictEqual(offAction.reason, 'RESTORE_LIGHT_AUTO');
    assert.strictEqual(controller.getState().isTorchOn, false);
  });

  await t.test('Active Banknote Detection Lock: never turns off torch while banknote is detected in frame', () => {
    const controller = new SmartTorchController();

    // Turn ON at t = 2000ms
    controller.onLuminanceSample(10, 1000);
    controller.onLuminanceSample(10, 2000);
    controller.onLuminanceSample(75, 2300); // post-torch baseline = 75

    // Banknote is detected in frame
    controller.setHasActiveDetection(true);

    // Even at t = 15,000ms .. 25,000ms (> 12s hold) with 220 lux bright light and 150 lux front sensor,
    // torch MUST stay ON while user is scanning money!
    for (const ts of [15000, 18000, 22000, 25000]) {
      const locked = controller.onLuminanceSample(220, ts, {
        ambientSensorLux: 150,
        hasActiveDetection: true,
      });
      assert.strictEqual(locked.action, 'NO_OP');
      assert.strictEqual(locked.guardReason, 'ACTIVE_DETECTION_LOCK');
      assert.strictEqual(controller.getState().isTorchOn, true);
    }

    // User removes banknote from frame at t = 26,000ms; after 3,000ms sustained bright light (t = 29,000ms), torch turns OFF
    assert.strictEqual(
      controller.onLuminanceSample(220, 26000, {
        ambientSensorLux: 150,
        hasActiveDetection: false,
      }).action,
      'NO_OP'
    );
    assert.strictEqual(
      controller.onLuminanceSample(220, 28000, {
        ambientSensorLux: 150,
        hasActiveDetection: false,
      }).action,
      'NO_OP'
    );
    const unlockedOff = controller.onLuminanceSample(220, 29000, {
      ambientSensorLux: 150,
      hasActiveDetection: false,
    });
    assert.strictEqual(unlockedOff.action, 'TURN_OFF');
    assert.strictEqual(controller.getState().isTorchOn, false);
  });

  await t.test('Hardware Ambient Light Sensor (Sensor.TYPE_LIGHT) integration: blocks false Y-plane turn-off in dark room and enables true room recovery (>= 85 lux)', () => {
    const controller = new SmartTorchController();

    // Turn ON at t = 2000ms in dark room (front sensor = 5 lux)
    controller.onLuminanceSample(12, 1000, { ambientSensorLux: 5 });
    const onAct = controller.onLuminanceSample(12, 2000, { ambientSensorLux: 5 });
    assert.strictEqual(onAct.action, 'TURN_ON');
    controller.onLuminanceSample(90, 2300, { ambientSensorLux: 5 });

    // Even if rear camera Y-plane reaches 210 lux at t = 15,000..20,000ms, front sensor still reads 12 lux (< 85 lux)
    // proving the room is still dark! Torch must stay ON!
    for (const ts of [15000, 17000, 20000]) {
      const blocked = controller.onLuminanceSample(210, ts, { ambientSensorLux: 12 });
      assert.strictEqual(blocked.action, 'NO_OP');
      assert.strictEqual(blocked.guardReason, 'REFLECTION_GUARD_HOLD');
      assert.strictEqual(controller.getState().isTorchOn, true);
    }

    // Now room ceiling light is switched ON: front sensor reads 110 lux (>= 85 lux) continuously for 3000ms
    assert.strictEqual(
      controller.onLuminanceSample(130, 21000, { ambientSensorLux: 110 }).action,
      'NO_OP'
    );
    assert.strictEqual(
      controller.onLuminanceSample(130, 23000, { ambientSensorLux: 110 }).action,
      'NO_OP'
    );
    const sensorOff = controller.onLuminanceSample(130, 24000, { ambientSensorLux: 110 });
    assert.strictEqual(sensorOff.action, 'TURN_OFF');
    assert.strictEqual(controller.getState().isTorchOn, false);
  });

  await t.test('Manual Override Protection: reflected light NEVER clears isManualOverride while torch is ON', () => {
    const controller = new SmartTorchController();

    // User manually double-taps to turn torch ON in a dark room
    const manualOn = controller.handleManualToggle(true);
    assert.strictEqual(manualOn.action, 'TURN_ON');
    assert.strictEqual(controller.getState().isTorchOn, true);
    assert.strictEqual(controller.getState().isManualOverride, true);

    // Close-range reflection jumps luminance to 180 lux and then 250 lux over 30 seconds
    for (const ts of [1000, 2000, 5000, 15000, 30000]) {
      const res = controller.onLuminanceSample(240, ts, {
        glareRatio: 0.2,
        centerToBorderRatio: 2.5,
      });
      assert.strictEqual(res.action, 'NO_OP');
      assert.strictEqual(res.guardReason, 'MANUAL_OVERRIDE_LOCK');
      assert.strictEqual(
        controller.getState().isManualOverride,
        true,
        'isManualOverride must NEVER be cleared while torch is manually ON'
      );
      assert.strictEqual(controller.getState().isTorchOn, true);
    }

    // If user manually turns torch OFF in dark, optical hotspot/glare does NOT falsely clear manual override
    controller.handleManualToggle(false);
    assert.strictEqual(controller.getState().isTorchOn, false);
    assert.strictEqual(controller.getState().isManualOverride, true);

    controller.onLuminanceSample(120, 31000, {
      glareRatio: 0.15,
      centerToBorderRatio: 1.8,
    });
    assert.strictEqual(
      controller.getState().isManualOverride,
      true,
      'Hotspot glare must not clear manual OFF override'
    );

    // Genuine uniform bright room light clears manual OFF override
    controller.onLuminanceSample(120, 32000, {
      glareRatio: 0.0,
      centerToBorderRatio: 1.0,
      ambientSensorLux: 100,
    });
    assert.strictEqual(controller.getState().isManualOverride, false);
  });

  await t.test('Oscillation Latch (Circuit Breaker): >= 2 auto ON-OFF cycles within 30s latches torch for 60s', () => {
    const controller = new SmartTorchController();

    // --- Cycle 1 ---
    // Turn ON at t = 1,000ms
    controller.onLuminanceSample(10, 0);
    assert.strictEqual(controller.onLuminanceSample(10, 1000).action, 'TURN_ON');
    controller.onLuminanceSample(70, 1300); // baseline = 70
    // Bright recovery from t = 10,000ms to t = 13,000ms (12s hold satisfied at t = 13,000ms)
    controller.onLuminanceSample(200, 10000);
    assert.strictEqual(controller.onLuminanceSample(200, 13000).action, 'TURN_OFF');
    assert.strictEqual(controller.getState().oscillationCycleCount, 1);
    assert.strictEqual(controller.getState().isOscillationLatched, false);

    // --- Cycle 2 (within 30s window) ---
    // Turn ON at t = 14,500ms
    controller.onLuminanceSample(10, 13500);
    assert.strictEqual(controller.onLuminanceSample(10, 14500).action, 'TURN_ON');
    controller.onLuminanceSample(70, 14800);
    // Bright recovery from t = 23,500ms to t = 26,500ms (26,500 - 13,000 = 13,500ms <= 30,000ms window!)
    controller.onLuminanceSample(200, 23500);
    assert.strictEqual(controller.onLuminanceSample(200, 26500).action, 'TURN_OFF');

    // Now 2 auto ON-OFF cycles occurred within 30s -> Oscillation Latch MUST be active for 60,000ms (until t = 86,500ms)!
    assert.strictEqual(controller.getState().oscillationCycleCount, 2);
    assert.strictEqual(controller.getState().isOscillationLatched, true);

    // Attempt auto turn-on during 60s latch window (at t = 27,000..50,000ms): blocked by OSCILLATION_LATCH_HOLD!
    controller.onLuminanceSample(10, 27000);
    const latchedAttempt = controller.onLuminanceSample(10, 30000);
    assert.strictEqual(latchedAttempt.action, 'NO_OP');
    assert.strictEqual(latchedAttempt.guardReason, 'OSCILLATION_LATCH_HOLD');
    assert.strictEqual(controller.getState().isTorchOn, false);

    // After 60,000ms cooldown expires (t = 87,000ms > 86,500ms), latch clears and auto-torch works again
    controller.onLuminanceSample(10, 86600);
    const unlatchedOn = controller.onLuminanceSample(10, 87600);
    assert.strictEqual(unlatchedOn.action, 'TURN_ON');
    assert.strictEqual(controller.getState().isOscillationLatched, false);
  });

  await t.test('Edge Cases: Delayed LED ramp-up, >= 225 lux reflection baseline, pitch-black border hotspot, shadowed rear camera in lit room, and interleaved manual toggles during latch', () => {
    // 1. Pitch-black border hotspot (borderLuma = 0, centerLuma = 200) and null baseline in isOpticalReflectionLikely
    assert.strictEqual(isOpticalReflectionLikely(120, null), true);
    assert.strictEqual(isOpticalReflectionLikely(180, null), false);
    const pitchBlackBorderFrame = new Uint8Array(64).fill(0);
    for (let r = 2; r < 6; r++) {
      for (let c = 2; c < 6; c++) {
        pitchBlackBorderFrame[r * 8 + c] = 200;
      }
    }
    const pitchBlackProfile = analyzeYPlaneSpatialProfile(pitchBlackBorderFrame, 8, 8);
    assert.strictEqual(pitchBlackProfile.borderLuma, 0);
    assert.strictEqual(pitchBlackProfile.centerLuma, 200);
    assert.strictEqual(pitchBlackProfile.centerToBorderRatio, 200);
    assert.strictEqual(pitchBlackProfile.isCloseRangeReflection, true);
    const hotspotController = new SmartTorchController();
    hotspotController.onLuminanceSample(10, 1000);
    assert.strictEqual(hotspotController.onLuminanceSample(10, 2000).action, 'TURN_ON');
    hotspotController.onLuminanceSample(pitchBlackProfile.averageLuma, 2500, {
      centerLuma: pitchBlackProfile.centerLuma,
      borderLuma: pitchBlackProfile.borderLuma,
      centerToBorderRatio: pitchBlackProfile.centerToBorderRatio,
      glareRatio: pitchBlackProfile.glareRatio,
    });
    assert.strictEqual(hotspotController.getPostTorchBaselineLuma(), 200);
    assert.strictEqual(hotspotController.onLuminanceSample(180, 15000).action, 'NO_OP');
    assert.strictEqual(hotspotController.onLuminanceSample(180, 20000).action, 'NO_OP');
    assert.strictEqual(hotspotController.getState().isTorchOn, true);

    // 2. Delayed LED ramp-up (dark frame at t=2100ms before LED fires, then 185 lux reflection at t=2500ms)
    const rampController = new SmartTorchController();
    rampController.onLuminanceSample(15, 1000);
    assert.strictEqual(rampController.onLuminanceSample(15, 2000).action, 'TURN_ON');
    // Pre-flash dark frame at +100ms must not lock postTorchBaselineLuma at 15
    rampController.onLuminanceSample(15, 2100);
    assert.strictEqual(rampController.getPostTorchBaselineLuma(), null);
    // Delayed reflection jump at +500ms captures 185 lux
    rampController.onLuminanceSample(185, 2500);
    assert.strictEqual(rampController.getPostTorchBaselineLuma(), 185);
    // Even after 12s hold (t=15000ms..20000ms), 185 lux must NOT turn off torch
    assert.strictEqual(rampController.onLuminanceSample(185, 15000).action, 'NO_OP');
    assert.strictEqual(rampController.onLuminanceSample(185, 20000).action, 'NO_OP');
    assert.strictEqual(rampController.getState().isTorchOn, true);

    // 3. Ultra-bright close-range reflection jump (235 lux >= 225 at t=2500ms)
    const highReflectController = new SmartTorchController();
    highReflectController.onLuminanceSample(15, 1000);
    assert.strictEqual(highReflectController.onLuminanceSample(15, 2000).action, 'TURN_ON');
    highReflectController.onLuminanceSample(235, 2500);
    assert.strictEqual(highReflectController.getPostTorchBaselineLuma(), 235);
    assert.strictEqual(highReflectController.onLuminanceSample(235, 15000).action, 'NO_OP');
    assert.strictEqual(highReflectController.onLuminanceSample(235, 20000).action, 'NO_OP');
    assert.strictEqual(highReflectController.getState().isTorchOn, true);

    // 4. Shadowed rear camera in an already-lit room (preTorchAmbientSensorLux = 100 >= 85)
    const shadowedController = new SmartTorchController();
    shadowedController.onLuminanceSample(15, 1000, { ambientSensorLux: 100 });
    assert.strictEqual(
      shadowedController.onLuminanceSample(15, 2000, { ambientSensorLux: 100 }).action,
      'TURN_ON'
    );
    shadowedController.onLuminanceSample(90, 2300, { ambientSensorLux: 100 });
    // Rear camera is still in shadow (90 lux from torch < 175) while front sensor remains 100 lux: must stay ON
    assert.strictEqual(
      shadowedController.onLuminanceSample(90, 15000, { ambientSensorLux: 100 }).action,
      'NO_OP'
    );
    assert.strictEqual(
      shadowedController.onLuminanceSample(90, 19000, { ambientSensorLux: 100 }).action,
      'NO_OP'
    );
    assert.strictEqual(shadowedController.getState().isTorchOn, true);

    // 5. Interleaved manual double-tap toggles during active 60s Oscillation Latch window
    const latchController = new SmartTorchController();
    latchController.onLuminanceSample(10, 0);
    latchController.onLuminanceSample(10, 1000);
    latchController.onLuminanceSample(70, 1300);
    latchController.onLuminanceSample(200, 10000);
    latchController.onLuminanceSample(200, 13000); // Cycle 1 OFF
    latchController.onLuminanceSample(10, 13500);
    latchController.onLuminanceSample(10, 14500);
    latchController.onLuminanceSample(70, 14800);
    latchController.onLuminanceSample(200, 23500);
    latchController.onLuminanceSample(200, 26500); // Cycle 2 OFF -> latched until 86,500ms
    assert.strictEqual(latchController.getState().isOscillationLatched, true);

    // User manually toggles ON and OFF during latch window (t=30,000ms)
    const manualOn = latchController.handleManualToggle();
    assert.strictEqual(manualOn.action, 'TURN_ON');
    assert.strictEqual(latchController.getState().isTorchOn, true);
    const manualOff = latchController.handleManualToggle();
    assert.strictEqual(manualOff.action, 'TURN_OFF');
    assert.strictEqual(latchController.getState().isTorchOn, false);
    // Bright room clears manual OFF override at t=31,000ms, but oscillation latch must still hold until 86,500ms!
    latchController.onLuminanceSample(100, 31000);
    assert.strictEqual(latchController.getState().isManualOverride, false);
    assert.strictEqual(latchController.getState().isOscillationLatched, true);
    latchController.onLuminanceSample(10, 32000);
    const stillLatched = latchController.onLuminanceSample(10, 35000);
    assert.strictEqual(stillLatched.action, 'NO_OP');
    assert.strictEqual(stillLatched.guardReason, 'OSCILLATION_LATCH_HOLD');
  });

  await t.test('Native Android Code Verification: MainActivity.java and MoneyCameraView.kt implement 4-Layer Anti-Strobe & Sensor.TYPE_LIGHT', () => {
    const sdkBuilderContent = fs.readFileSync(
      path.join(projectRoot, 'scripts', 'android-sdk-builder.mjs'),
      'utf8'
    );
    const ktCameraContent = fs.readFileSync(
      path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        'com',
        'nckh',
        'moneyvision',
        'camera',
        'MoneyCameraView.kt'
      ),
      'utf8'
    );

    // 1. Sensor.TYPE_LIGHT hardware ambient light sensor in MainActivity.java & MoneyCameraView.kt
    assert.match(sdkBuilderContent, /Sensor\.TYPE_LIGHT/, 'MainActivity.java must use Sensor.TYPE_LIGHT');
    assert.match(sdkBuilderContent, /registerListener\s*\(\s*lightSensorListener/, 'MainActivity.java must register lightSensorListener in onResume');
    assert.match(sdkBuilderContent, /unregisterListener\s*\(\s*lightSensorListener\s*\)/, 'MainActivity.java must unregister lightSensorListener in onPause');
    assert.match(ktCameraContent, /Sensor\.TYPE_LIGHT/, 'MoneyCameraView.kt must use Sensor.TYPE_LIGHT');

    // 2. Post-torch baseline & spatial hotspot / glare analysis
    assert.match(sdkBuilderContent, /postTorchBaselineLuma/, 'MainActivity.java must track postTorchBaselineLuma');
    assert.match(sdkBuilderContent, /glareRatio/, 'MainActivity.java must compute glareRatio');
    assert.match(sdkBuilderContent, /centerToBorderRatio/, 'MainActivity.java must compute centerToBorderRatio');
    assert.match(ktCameraContent, /postTorchBaselineLuma/, 'MoneyCameraView.kt must track postTorchBaselineLuma');

    // 3. Minimum 12s hold & active banknote detection lock
    assert.match(sdkBuilderContent, /MIN_TORCH_ON_HOLD_MS\s*=\s*12000L/, 'MainActivity.java must enforce 12000ms minimum torch hold');
    assert.match(sdkBuilderContent, /hasActiveDetection\s*=\s*\(currentNotesCount\s*>\s*0\)/, 'MainActivity.java must lock torch when currentNotesCount > 0');
    assert.match(ktCameraContent, /MIN_TORCH_ON_HOLD_MS\s*=\s*12000L/, 'MoneyCameraView.kt must enforce 12000ms minimum torch hold');

    // 4. Manual override protection & Oscillation Latch
    assert.match(
      sdkBuilderContent,
      /if\s*\(\s*isManualTorchOverride\s*&&\s*!isTorchOn\s*&&\s*isGenuineBrightRoom\s*\)/,
      'MainActivity.java must never clear isManualTorchOverride while torch is ON'
    );
    assert.match(sdkBuilderContent, /isOscillationLatched/, 'MainActivity.java must implement Oscillation Latch');
    assert.match(ktCameraContent, /isOscillationLatched/, 'MoneyCameraView.kt must implement Oscillation Latch');
  });
});

test('16. Ticket 09: Adaptive Thermal & Battery Governor (3-Tier Power Governor, Motion-Blur Gate, Row-Major Sparse YOLO & Cache-Tiled YUV)', async (t) => {
  const projectRoot = process.cwd();

  await t.test('Ticket 09 Constants & Thresholds match specification', () => {
    assert.strictEqual(LUMA_GRID_DIMENSION, 16);
    assert.strictEqual(LUMA_GRID_CELLS, 256);
    assert.strictEqual(MOTION_BLUR_DELTA_Y_THRESHOLD, 32.0);
    assert.strictEqual(MOTION_WAKE_DELTA_Y_THRESHOLD, 4.5);
    assert.strictEqual(STATIC_HOLDING_DELTA_Y_THRESHOLD, 2.5);
    assert.strictEqual(STATIC_EMPTY_DELTA_Y_THRESHOLD, 2.0);
    assert.strictEqual(STATIC_DEEP_IDLE_DELTA_Y_THRESHOLD, 1.5);
    assert.strictEqual(BURST_INTERVAL_NOMINAL_MS, 130);
    assert.strictEqual(BURST_INTERVAL_WARM_MS, 175);
    assert.strictEqual(BURST_INTERVAL_HOT_MS, 240);
    assert.strictEqual(ECO_INTERVAL_NOMINAL_MS, 650);
    assert.strictEqual(ECO_INTERVAL_WARM_MS, 850);
    assert.strictEqual(ECO_INTERVAL_HOT_MS, 1100);
    assert.strictEqual(HIBERNATION_HEARTBEAT_MS, 1500);
    assert.strictEqual(HIBERNATION_DARK_HEARTBEAT_MS, 3000);
    assert.strictEqual(ECO_ENTRY_STATIC_DURATION_NOMINAL_MS, 2500);
    assert.strictEqual(ECO_ENTRY_STATIC_DURATION_WARM_MS, 1800);
    assert.strictEqual(ECO_ENTRY_STATIC_DURATION_HOT_MS, 1200);
    assert.strictEqual(HIBERNATION_ENTRY_DARK_STATIC_MS, 3000);
    assert.strictEqual(HIBERNATION_ENTRY_EMPTY_STATIC_NOMINAL_MS, 8000);
    assert.strictEqual(HIBERNATION_ENTRY_EMPTY_STATIC_HOT_MS, 5000);
    assert.strictEqual(HIBERNATION_KEEP_SCREEN_ON_TIMEOUT_MS, 180000);
    assert.strictEqual(AUTO_TORCH_IDLE_CUTOFF_MS, 15000);
    assert.strictEqual(AUTO_TORCH_PROXIMITY_CUTOFF_MS, 4000);
    assert.strictEqual(IMU_WAKE_DELTA_A_DEFAULT, 0.35);
    assert.strictEqual(IMU_WAKE_DELTA_A_ADAPTIVE_TABLE, 0.65);
    assert.strictEqual(IMU_FALSE_WAKE_MAX_STREAK, 3);
    assert.strictEqual(IMU_DEEP_IDLE_MAX_DELTA_A, 0.20);
    assert.strictEqual(LIGHT_SENSOR_WAKE_JUMP_LUX, 15.0);
    assert.strictEqual(DARK_OCCLUDED_LUX_THRESHOLD, 5.0);
    assert.strictEqual(THERMAL_WARM_TEMP_CELSIUS, 38.0);
    assert.strictEqual(THERMAL_HOT_TEMP_CELSIUS, 41.0);
    assert.strictEqual(LOW_BATTERY_THRESHOLD_PERCENT, 15);
    assert.strictEqual(PREVIEW_ALPHA_BURST, 0.22);
    assert.strictEqual(PREVIEW_ALPHA_ECO, 0.08);
    assert.strictEqual(PREVIEW_ALPHA_HIBERNATION, 0.0);
    assert.strictEqual(YOLO_CANDIDATE_HINT_THRESHOLD, 0.28);
    assert.strictEqual(YUV_CACHE_TILE_SIZE, 16);
  });

  await t.test('Layer 1: Single-Pass analyzeYPlaneSinglePass computes Spatial Reflection Profile + 16x16 Luma Grid + Motion Delta in one pass', () => {
    const width = 64;
    const height = 64;
    const frame1 = new Uint8Array(width * height).fill(50);
    const pass1 = analyzeYPlaneSinglePass(frame1, width, height, width, 1, 1, null);
    assert.strictEqual(pass1.averageLuma, 50);
    assert.strictEqual(pass1.lumaGrid16x16.length, 256);
    assert.strictEqual(pass1.motionDeltaY, 0, 'First frame with no previous grid has motionDeltaY = 0');
    assert.strictEqual(pass1.isMotionBlurred, false);

    // Frame 2: Static scene (identical pixel values) -> motionDeltaY = 0
    const pass2 = analyzeYPlaneSinglePass(frame1, width, height, width, 1, 1, pass1.lumaGrid16x16);
    assert.strictEqual(pass2.motionDeltaY, 0);
    assert.strictEqual(pass2.isMotionBlurred, false);

    // Frame 3: Moderate hand movement (shift luma by +12 across frame -> motionDeltaY = 12.0 > 4.5 wake threshold, <= 32.0 blur threshold)
    const frame3 = new Uint8Array(width * height).fill(62);
    const pass3 = analyzeYPlaneSinglePass(frame3, width, height, width, 1, 1, pass2.lumaGrid16x16);
    assert.strictEqual(pass3.motionDeltaY, 12);
    assert.strictEqual(pass3.isMotionBlurred, false);

    // Frame 4: Rapid camera pan / whip-pan (shift luma by +80 -> motionDeltaY = 80.0 > 32.0 MOTION_BLUR_DELTA_Y_THRESHOLD)
    const frame4 = new Uint8Array(width * height).fill(142);
    const pass4 = analyzeYPlaneSinglePass(frame4, width, height, width, 1, 1, pass3.lumaGrid16x16);
    assert.strictEqual(pass4.motionDeltaY, 80);
    assert.strictEqual(pass4.isMotionBlurred, true, 'Rapid camera swing (Delta Y = 80 > 32) must flag isMotionBlurred = true');

    // Direct calculateLumaGridMotionDelta validation on edge inputs
    assert.strictEqual(calculateLumaGridMotionDelta(null, pass1.lumaGrid16x16), 0);
    assert.strictEqual(calculateLumaGridMotionDelta(new Uint8Array(10), pass1.lumaGrid16x16), 0);
  });

  await t.test('Layer 1: MOTION_BLUR_GATE skips TFLite inference on blurred frames (Delta Y > 32.0), wakes governor to BURST, and protects 5-frame TemporalDebounceFilter', () => {
    const governor = new AdaptivePowerGovernor();
    const debounceFilter = new TemporalDebounceFilter();
    const note50k = [{ classId: 50000, count: 1, label: '50k', totalAmount: 50000 }];

    // First put governor into ECO by simulating >= 2500ms of static empty frames
    governor.evaluate({ timestamp: 1000, motionDeltaY: 0.2, luminance: 100 });
    const ecoEval = governor.evaluate({ timestamp: 4000, motionDeltaY: 0.2, luminance: 100 });
    assert.strictEqual(ecoEval.powerState, 'ECO');

    // Feed 3 valid frames of 50k into TemporalDebounceFilter (needs 4 for consensus)
    debounceFilter.process(note50k);
    debounceFilter.process(note50k);
    debounceFilter.process(note50k);
    assert.strictEqual(debounceFilter.getState(), 'STABILIZING');

    // Now simulate a violent camera pan frame (motionDeltaY = 48.5 > 32.0) at t = 4100ms
    const blurEval = governor.evaluate({ timestamp: 4100, motionDeltaY: 48.5, luminance: 100 });
    assert.strictEqual(
      blurEval.shouldSkipInferenceForMotionBlur,
      true,
      'Governor must set shouldSkipInferenceForMotionBlur = true when motionDeltaY > 32.0'
    );
    assert.strictEqual(blurEval.shouldRunInference, false);
    assert.strictEqual(
      blurEval.powerState,
      'BURST',
      'Motion blur must immediately wake governor from ECO to BURST so camera is ready when hand stops'
    );
    assert.strictEqual(blurEval.wakeUpReason, 'OPTICAL_MOTION');

    // Because inference is skipped by MOTION_BLUR_GATE, debounceFilter is NOT fed an empty frame;
    // when the hand stops on the next frame, the 4th valid frame achieves instant STABLE consensus!
    const fourthFrame = debounceFilter.process(note50k);
    assert.strictEqual(fourthFrame.state, 'STABLE');
    assert.strictEqual(fourthFrame.totalAmount, 50000);
  });

  await t.test('Layer 1: 3-Tier Adaptive Power Governor State Machine (BURST -> ECO -> HIBERNATION), Candidate-Aware Holding Guard, and 180s Keep-Screen-On timeout', () => {
    const governor = new AdaptivePowerGovernor();

    // 1. Starts in BURST (130ms interval, previewAlpha=0.22, keepScreenOn=true)
    const initEval = governor.evaluate({ timestamp: 1000, motionDeltaY: 0.5, luminance: 100 });
    assert.strictEqual(initEval.powerState, 'BURST');
    assert.strictEqual(initEval.inferenceIntervalMs, 130);
    assert.strictEqual(initEval.shouldPauseBorderLoop, false);
    assert.strictEqual(initEval.previewAlpha, 0.22);
    assert.strictEqual(initEval.keepScreenOn, true);

    // 2. Candidate-Aware Holding Guard: user holds a blurry/angled note with hasCandidateHint = true (>= 0.28)
    // Even after 10 seconds of low motionDeltaY (0.4), governor MUST stay in BURST!
    for (const ts of [2000, 5000, 8000, 11000]) {
      const candidateHold = governor.evaluate({
        timestamp: ts,
        motionDeltaY: 0.4,
        luminance: 100,
        hasMoney: false,
        hasCandidateHint: true,
      });
      assert.strictEqual(
        candidateHold.powerState,
        'BURST',
        `Governor must remain in BURST while hasCandidateHint is true (at t=${ts}ms)`
      );
    }

    // 3. Scene becomes truly empty (hasCandidateHint = false) starting at t = 11,000ms:
    governor.evaluate({
      timestamp: 11000,
      motionDeltaY: 0.3,
      luminance: 100,
      hasMoney: false,
      hasCandidateHint: false,
    });
    // At t = 13,600ms (2,600ms >= 2,500ms static empty under NOMINAL thermal), transitions BURST -> ECO!
    const ecoTransition = governor.evaluate({
      timestamp: 13600,
      motionDeltaY: 0.3,
      luminance: 100,
      hasMoney: false,
      hasCandidateHint: false,
    });
    assert.strictEqual(ecoTransition.powerState, 'ECO');
    assert.strictEqual(ecoTransition.stateChanged, true);
    assert.strictEqual(ecoTransition.inferenceIntervalMs, 650);
    assert.strictEqual(ecoTransition.shouldPauseBorderLoop, true, 'ECO must pause 60 FPS EdgePulseBorder loop');
    assert.strictEqual(ecoTransition.previewAlpha, 0.08);
    assert.strictEqual(ecoTransition.screenBrightness, -1.0);

    // 4. At t = 19,500ms (8,500ms >= 8,000ms static empty since t = 11,000ms), transitions ECO -> HIBERNATION!
    const hibTransition = governor.evaluate({
      timestamp: 19500,
      motionDeltaY: 0.2,
      luminance: 100,
      hasMoney: false,
      hasCandidateHint: false,
    });
    assert.strictEqual(hibTransition.powerState, 'HIBERNATION');
    assert.strictEqual(hibTransition.stateChanged, true);
    assert.strictEqual(hibTransition.inferenceIntervalMs, 1500);
    assert.strictEqual(hibTransition.shouldRunInference, false);
    assert.strictEqual(hibTransition.shouldStopCameraRepeating, true);
    assert.strictEqual(hibTransition.shouldPauseBorderLoop, true);
    assert.strictEqual(hibTransition.previewAlpha, 0.0, 'HIBERNATION must set OLED previewAlpha = 0.0');
    assert.strictEqual(hibTransition.screenBrightness, 0.01, 'HIBERNATION must dim window screenBrightness to 0.01');
    assert.strictEqual(hibTransition.keepScreenOn, true, 'Keep-screen-on remains true before 180s in HIBERNATION');

    // 5. At t = 200,000ms (>= 180,000ms in HIBERNATION since t = 19,500ms), releases FLAG_KEEP_SCREEN_ON!
    const sleepRelease = governor.evaluate({
      timestamp: 200000,
      motionDeltaY: 0.2,
      luminance: 100,
      hasMoney: false,
      hasCandidateHint: false,
    });
    assert.strictEqual(sleepRelease.powerState, 'HIBERNATION');
    assert.strictEqual(
      sleepRelease.keepScreenOn,
      false,
      'Must release FLAG_KEEP_SCREEN_ON after >= 180,000ms of continuous HIBERNATION'
    );

    // 6. Holding a confirmed banknote (hasMoney = true, debounceState = STABLE) transitions BURST -> ECO after 2500ms
    // even if hasCandidateHint is true, and never enters HIBERNATION while holding the banknote!
    const arrivalEval = governor.evaluate({
      timestamp: 210000,
      motionDeltaY: 0.4,
      luminance: 100,
      hasMoney: true,
      debounceState: 'STABLE',
      hasCandidateHint: true,
      consecutiveEmptyFrames: 0,
    });
    assert.strictEqual(arrivalEval.powerState, 'BURST');
    assert.strictEqual(arrivalEval.wakeUpReason, 'ACTIVE_DETECTION');

    // Start static holding timer on next steady frame at t = 210130ms
    governor.evaluate({
      timestamp: 210130,
      motionDeltaY: 0.4,
      luminance: 100,
      hasMoney: true,
      debounceState: 'STABLE',
      hasCandidateHint: true,
      consecutiveEmptyFrames: 0,
    });

    // At t = 212700ms (>= 2500ms holding static), transitions BURST -> ECO!
    const holdingEcoEval = governor.evaluate({
      timestamp: 212700,
      motionDeltaY: 0.4,
      luminance: 100,
      hasMoney: true,
      debounceState: 'STABLE',
      hasCandidateHint: true,
      consecutiveEmptyFrames: 0,
    });
    assert.strictEqual(
      holdingEcoEval.powerState,
      'ECO',
      'Holding a stable banknote still for >= 2500ms must transition BURST -> ECO'
    );
    assert.strictEqual(holdingEcoEval.inferenceIntervalMs, 650);
    assert.strictEqual(holdingEcoEval.shouldPauseBorderLoop, true);
    assert.strictEqual(holdingEcoEval.previewAlpha, 0.08);

    // Even after 20 seconds of holding the banknote still, it stays in ECO and never enters HIBERNATION
    const longHoldEval = governor.evaluate({
      timestamp: 235000,
      motionDeltaY: 0.3,
      luminance: 100,
      hasMoney: true,
      debounceState: 'STABLE',
      hasCandidateHint: true,
      consecutiveEmptyFrames: 0,
    });
    assert.strictEqual(longHoldEval.powerState, 'ECO');

    // 7. Banknote withdrawal (1 <= consecutiveEmptyFrames < 3) wakes ECO -> BURST immediately,
    // and when hasMoney becomes false on frame 3, staticStartTime resets so it stays in BURST for a fresh 2500ms!
    const withdrawFrame1 = governor.evaluate({
      timestamp: 235200,
      motionDeltaY: 0.3,
      luminance: 100,
      hasMoney: true,
      debounceState: 'STABLE',
      hasCandidateHint: false,
      consecutiveEmptyFrames: 1,
    });
    assert.strictEqual(withdrawFrame1.powerState, 'BURST');
    assert.strictEqual(withdrawFrame1.wakeUpReason, 'WITHDRAWAL_TRANSITION');

    const withdrawEmptied = governor.evaluate({
      timestamp: 235500,
      motionDeltaY: 0.3,
      luminance: 100,
      hasMoney: false,
      debounceState: 'EMPTY',
      hasCandidateHint: false,
      consecutiveEmptyFrames: 3,
    });
    assert.strictEqual(
      withdrawEmptied.powerState,
      'BURST',
      'Newly emptied scene after holding must reset staticStartTime and stay in BURST initially'
    );

    // 8. Eco Mode Optimization: Transient deadband tremor (< 350ms) preserves ECO
    governor.reset();
    governor.evaluate({
      timestamp: 300000,
      motionDeltaY: 0.1,
      hasMoney: true,
      debounceState: 'STABLE',
      consecutiveEmptyFrames: 0,
    });
    governor.evaluate({
      timestamp: 300100,
      motionDeltaY: 0.1,
      hasMoney: true,
      debounceState: 'STABLE',
      consecutiveEmptyFrames: 0,
    });
    const ecoReady = governor.evaluate({
      timestamp: 303000,
      motionDeltaY: 0.1,
      hasMoney: true,
      debounceState: 'STABLE',
      consecutiveEmptyFrames: 0,
    });
    assert.strictEqual(ecoReady.powerState, 'ECO');

    // Deadband motion starts at 303100 (2.5 <= 3.2 < 4.5)
    const deadbandJitter = governor.evaluate({
      timestamp: 303100,
      motionDeltaY: 3.2,
      hasMoney: true,
      debounceState: 'STABLE',
      consecutiveEmptyFrames: 0,
    });
    assert.strictEqual(deadbandJitter.powerState, 'ECO', 'Transient deadband tremor < 350ms must stay in ECO');

    // Return to static before 350ms resets deadband spike tracker
    const deadbandRecover = governor.evaluate({
      timestamp: 303250,
      motionDeltaY: 0.3,
      hasMoney: true,
      debounceState: 'STABLE',
      consecutiveEmptyFrames: 0,
    });
    assert.strictEqual(deadbandRecover.powerState, 'ECO', 'Returning to static must preserve ECO');

    // Micro-tremor on IMU (0.45 m/s^2) while holding confirmed money is ignored (threshold = 0.65)
    const imuTremorEval = governor.evaluate({
      timestamp: 303280,
      motionDeltaY: 0.3,
      accelMagnitudeDelta: 0.45,
      hasMoney: true,
      debounceState: 'STABLE',
      consecutiveEmptyFrames: 0,
    });
    assert.strictEqual(imuTremorEval.powerState, 'ECO', 'IMU tremor 0.45 m/s^2 must be ignored while holding confirmed money');

    // Persistent deadband motion (>= 350ms) wakes to BURST with OPTICAL_MOTION
    governor.evaluate({
      timestamp: 304000,
      motionDeltaY: 3.2,
      hasMoney: true,
      debounceState: 'STABLE',
      consecutiveEmptyFrames: 0,
    });
    const midSpike = governor.evaluate({
      timestamp: 304200,
      motionDeltaY: 3.2,
      hasMoney: true,
      debounceState: 'STABLE',
      consecutiveEmptyFrames: 0,
    });
    assert.strictEqual(midSpike.powerState, 'ECO', '200ms < 350ms must stay in ECO');
    const burstSpike = governor.evaluate({
      timestamp: 304400,
      motionDeltaY: 3.2,
      hasMoney: true,
      debounceState: 'STABLE',
      consecutiveEmptyFrames: 0,
    });
    assert.strictEqual(burstSpike.powerState, 'BURST', '400ms >= 350ms must wake to BURST');
    assert.strictEqual(burstSpike.wakeUpReason, 'OPTICAL_MOTION');

    // Deliberate motion >= 4.5 wakes immediately in 1 frame (< 33ms)
    governor.reset();
    governor.evaluate({ timestamp: 400000, motionDeltaY: 0.1 });
    governor.evaluate({ timestamp: 403000, motionDeltaY: 0.1 });
    const fastWake = governor.evaluate({ timestamp: 403030, motionDeltaY: 4.8 });
    assert.strictEqual(fastWake.powerState, 'BURST');
    assert.strictEqual(fastWake.wakeUpReason, 'OPTICAL_MOTION');
  });

  await t.test('Layer 1: Multi-Sensor Wake-Up Fusion (Luma, IMU, Ambient Lux, Proximity Uncover, Touch) & Adaptive IMU Table-Vibration Guard (0.35 -> 0.65 m/s^2)', () => {
    const governor = new AdaptivePowerGovernor();

    // Helper to put governor into ECO state
    const enterEco = (baseTime, ambientLux = 20) => {
      governor.evaluate({ timestamp: baseTime, motionDeltaY: 0.1, luminance: 50, ambientSensorLux: ambientLux });
      const res = governor.evaluate({
        timestamp: baseTime + 3000,
        motionDeltaY: 0.1,
        luminance: 50,
        ambientSensorLux: ambientLux,
      });
      assert.strictEqual(res.powerState, 'ECO');
      return baseTime + 3000;
    };

    // 1. Wake by Ambient Light Sensor Jump (>= 15 lux delta from idle baseline)
    let tNow = enterEco(1000, 20);
    const luxWake = governor.evaluate({
      timestamp: tNow + 200,
      motionDeltaY: 0.2,
      luminance: 50,
      ambientSensorLux: 38, // +18 lux >= 15 lux jump
    });
    assert.strictEqual(luxWake.powerState, 'BURST');
    assert.strictEqual(luxWake.wakeUpReason, 'LIGHT_SENSOR_JUMP');

    // 2. Wake by Proximity Uncover (isProximityNear: true -> false)
    tNow = enterEco(10000);
    governor.evaluate({ timestamp: tNow + 100, motionDeltaY: 0.1, isProximityNear: true });
    const proxWake = governor.evaluate({
      timestamp: tNow + 500,
      motionDeltaY: 0.1,
      isProximityNear: false,
    });
    assert.strictEqual(proxWake.powerState, 'BURST');
    assert.strictEqual(proxWake.wakeUpReason, 'PROXIMITY_UNCOVERED');

    // 3. Wake by Touch Interaction
    tNow = enterEco(20000);
    const touchWake = governor.wakeUpToBurst('TOUCH_INTERACTION', tNow + 100);
    assert.strictEqual(touchWake.powerState, 'BURST');
    assert.strictEqual(touchWake.wakeUpReason, 'TOUCH_INTERACTION');

    // 4. Adaptive IMU Table-Vibration Guard:
    // Simulate phone resting on a vibrating table (fan/vehicle) where IMU spikes to 0.45 m/s^2 (>= 0.35 nominal),
    // but visual scene is completely static (motionDeltaY = 0.3 < 1.2).
    // After 3 false IMU wakes that cool back down to ECO without visual motion, threshold elevates from 0.35 -> 0.65!
    governor.reset();
    assert.strictEqual(governor.getEffectiveImuWakeThreshold(), 0.35);

    let simTime = 30000;
    governor.evaluate({ timestamp: simTime, motionDeltaY: 0.2, accelMagnitudeDelta: 0.0 });
    simTime += 3000;
    assert.strictEqual(
      governor.evaluate({ timestamp: simTime, motionDeltaY: 0.2, accelMagnitudeDelta: 0.0 }).powerState,
      'ECO'
    );

    // Verify that if an IMU wake is followed by moderate optical change (1.2 <= motionDeltaY < 4.5),
    // pendingImuWakeVerification is cleared and does NOT leak to a later static frame!
    simTime += 200;
    governor.evaluate({ timestamp: simTime, motionDeltaY: 0.3, accelMagnitudeDelta: 0.45 });
    simTime += 100;
    governor.evaluate({ timestamp: simTime, motionDeltaY: 2.5, accelMagnitudeDelta: 0.05 }); // 1.2 <= 2.5 < 4.5
    simTime += 100;
    governor.evaluate({ timestamp: simTime, motionDeltaY: 0.3, accelMagnitudeDelta: 0.05 }); // Later static frame
    assert.strictEqual(
      governor.getConsecutiveImuOnlyWakes(),
      0,
      'Moderate optical change (motionDeltaY = 2.5 >= 1.2) after IMU wake must clear pendingImuWakeVerification'
    );
    simTime += 2600;
    assert.strictEqual(
      governor.evaluate({ timestamp: simTime, motionDeltaY: 0.3, accelMagnitudeDelta: 0.05 }).powerState,
      'ECO'
    );

    for (let cycle = 1; cycle <= 3; cycle++) {
      // Table vibration triggers IMU wake (0.45 >= 0.35) while motionDeltaY is 0.3 (< 1.2)
      simTime += 200;
      const falseWake = governor.evaluate({
        timestamp: simTime,
        motionDeltaY: 0.3,
        accelMagnitudeDelta: 0.45,
      });
      assert.strictEqual(falseWake.powerState, 'BURST');
      assert.strictEqual(falseWake.wakeUpReason, 'IMU_ACCELERATION');

      // Next frame has static optical luma (< 1.2), which increments consecutiveImuOnlyWakes, and cools back to ECO (+3000ms)
      simTime += 100;
      governor.evaluate({ timestamp: simTime, motionDeltaY: 0.3, accelMagnitudeDelta: 0.05 });
      assert.strictEqual(governor.getConsecutiveImuOnlyWakes(), cycle);

      simTime += 2600;
      const coolToEco = governor.evaluate({
        timestamp: simTime,
        motionDeltaY: 0.3,
        accelMagnitudeDelta: 0.05,
      });
      assert.strictEqual(coolToEco.powerState, 'ECO');
    }

    // After 3 false IMU wakes, threshold MUST be elevated to 0.65 m/s^2!
    assert.strictEqual(governor.getEffectiveImuWakeThreshold(), 0.65);

    // Subsequent 0.45 m/s^2 table vibration NO LONGER wakes governor from ECO!
    simTime += 500;
    const ignoredVibration = governor.evaluate({
      timestamp: simTime,
      motionDeltaY: 0.3,
      accelMagnitudeDelta: 0.45,
    });
    assert.strictEqual(
      ignoredVibration.powerState,
      'ECO',
      'Elevated 0.65 m/s^2 IMU guard must ignore 0.45 m/s^2 table vibration'
    );

    // Genuine hand pickup (0.85 m/s^2 >= 0.65) still wakes governor immediately, and visual motion resets threshold to 0.35
    simTime += 200;
    const realPickup = governor.evaluate({
      timestamp: simTime,
      motionDeltaY: 10.0,
      accelMagnitudeDelta: 0.85,
    });
    assert.strictEqual(realPickup.powerState, 'BURST');
    assert.strictEqual(governor.getEffectiveImuWakeThreshold(), 0.35);
    assert.strictEqual(governor.getConsecutiveImuOnlyWakes(), 0);
  });

  await t.test('Layer 1: Hardware Thermal & Battery Scaling (NOMINAL / WARM / HOT) for Android 9-14 (API 28-34) & Auto-Torch Idle Cutoff', () => {
    const governor = new AdaptivePowerGovernor();

    // 1. Android 9 (API 28) fallback via battery temperature: 38.5°C -> WARM
    const warmEval = governor.evaluate({
      timestamp: 1000,
      motionDeltaY: 8.0,
      batteryTempCelsius: 38.5,
      batteryPercent: 80,
    });
    assert.strictEqual(warmEval.thermalLevel, 'WARM');
    assert.strictEqual(warmEval.inferenceIntervalMs, 175, 'WARM BURST interval must be 175ms');

    // Under WARM, BURST -> ECO happens after 1,800ms static (instead of 2,500ms)
    governor.evaluate({
      timestamp: 1100,
      motionDeltaY: 0.2,
      batteryTempCelsius: 38.5,
      batteryPercent: 80,
    });
    const warmEco = governor.evaluate({
      timestamp: 2950,
      motionDeltaY: 0.2,
      batteryTempCelsius: 38.5,
      batteryPercent: 80,
    });
    assert.strictEqual(warmEco.powerState, 'ECO');
    assert.strictEqual(warmEco.inferenceIntervalMs, 850, 'WARM ECO interval must be 850ms');

    // 2. Android 9-14 HOT thermal state via batteryTempCelsius >= 41.0°C or androidThermalStatus >= 3 (SEVERE)
    const hotEval = governor.evaluate({
      timestamp: 4000,
      motionDeltaY: 12.0,
      androidThermalStatus: 3,
      batteryTempCelsius: 41.2,
    });
    assert.strictEqual(hotEval.thermalLevel, 'HOT');
    assert.strictEqual(hotEval.powerState, 'BURST');
    assert.strictEqual(hotEval.inferenceIntervalMs, 240, 'HOT BURST interval must be 240ms');

    // Under HOT, BURST -> ECO takes 1,200ms and ECO -> HIBERNATION takes 5,000ms
    governor.evaluate({
      timestamp: 4100,
      motionDeltaY: 0.2,
      androidThermalStatus: 3,
    });
    const hotEco = governor.evaluate({
      timestamp: 5350,
      motionDeltaY: 0.2,
      androidThermalStatus: 3,
    });
    assert.strictEqual(hotEco.powerState, 'ECO');
    assert.strictEqual(hotEco.inferenceIntervalMs, 1100, 'HOT ECO interval must be 1100ms');

    const hotHib = governor.evaluate({
      timestamp: 9200,
      motionDeltaY: 0.2,
      androidThermalStatus: 3,
    });
    assert.strictEqual(hotHib.powerState, 'HIBERNATION');
    assert.strictEqual(hotHib.inferenceIntervalMs, 1500, 'HOT HIBERNATION heartbeat must be 1500ms');

    // 3. Low Battery (< 15%) or Battery Saver mode scales NOMINAL -> WARM
    const lowBatEval = governor.evaluate({
      timestamp: 10000,
      motionDeltaY: 10.0,
      androidThermalStatus: 0,
      batteryTempCelsius: 30.0,
      batteryPercent: 14,
    });
    assert.strictEqual(lowBatEval.thermalLevel, 'WARM');

    // 4. Auto-Torch Idle Thermal Cutoff (15s static empty scene OR 4s proximity near)
    const torch = new SmartTorchController();
    torch.onLuminanceSample(10, 1000);
    assert.strictEqual(torch.onLuminanceSample(10, 2000).action, 'TURN_ON');
    assert.strictEqual(torch.getState().isTorchOn, true);

    // Simulate 15,000ms of static empty scene starting at t = 10,000ms -> t = 25,100ms
    governor.evaluate({
      timestamp: 10000,
      motionDeltaY: 0.1,
      isTorchOn: true,
      torchOnDurationMs: 8000,
    });
    const cutoffEval = governor.evaluate({
      timestamp: 25100,
      motionDeltaY: 0.1,
      isTorchOn: true,
      torchOnDurationMs: 23100,
    });
    assert.strictEqual(
      cutoffEval.shouldAutoCutoffIdleTorch,
      true,
      'Governor must request auto-torch thermal cutoff after >= 15,000ms static empty scene'
    );
    const cutoffAction = torch.handleIdleThermalCutoff(25100);
    assert.strictEqual(cutoffAction.action, 'TURN_OFF');
    assert.strictEqual(cutoffAction.reason, 'IDLE_THERMAL_CUTOFF');
    assert.strictEqual(torch.getState().isTorchOn, false);

    // Proximity pocket/face-down cutoff after >= 4,000ms
    governor.evaluate({
      timestamp: 30000,
      motionDeltaY: 0.1,
      isProximityNear: true,
      isTorchOn: true,
      torchOnDurationMs: 5000,
    });
    const proxCutoff = governor.evaluate({
      timestamp: 34100,
      motionDeltaY: 0.1,
      isProximityNear: true,
      isTorchOn: true,
      torchOnDurationMs: 9100,
    });
    assert.strictEqual(
      proxCutoff.shouldAutoCutoffIdleTorch,
      true,
      'Proximity NEAR for >= 4,000ms must trigger auto-torch thermal cutoff'
    );
  });

  await t.test('Layer 2: Row-Major Sparse decodeYoloTensor performs 0 coordinate reads on empty frames and preserves < 2px noise box rejection', () => {
    const numAnchors = YOLO_NUM_ANCHORS;
    const emptyTensor = new Float32Array(YOLO_TOTAL_CHANNELS * numAnchors);

    // Fill coordinate rows (0..3) with non-zero values to prove they are never even read on an empty frame
    for (let i = 0; i < 4 * numAnchors; i++) {
      emptyTensor[i] = 320.0;
    }
    // Fill class rows (4..12) with sub-threshold background noise (0.08 < 0.45 scoreThreshold, and 0.08 < 0.28 rawHintThreshold)
    for (let i = 4 * numAnchors; i < YOLO_TOTAL_CHANNELS * numAnchors; i++) {
      emptyTensor[i] = 0.08;
    }
    // Place one weak candidate hint (0.31 >= 0.28 rawHintThreshold, but < 0.45 scoreThreshold) at class 4, anchor 500
    emptyTensor[(4 + 4) * numAnchors + 500] = 0.31;

    const emptyResult = decodeYoloTensor(emptyTensor, {
      scoreThreshold: 0.45,
      applySigmoid: 'auto',
    });
    const telemetry = getLastDecodeTelemetry();

    assert.strictEqual(emptyResult.length, 0, 'Empty frame must produce 0 detections');
    assert.strictEqual(telemetry.hitCount, 0, 'Empty frame must have 0 threshold hits');
    assert.strictEqual(
      telemetry.coordinateReadsCount,
      0,
      'Empty frame fast path MUST perform strictly 0 coordinate reads (cx, cy, w, h untouched)'
    );
    assert.strictEqual(
      telemetry.hasCandidateHint,
      true,
      'Must capture hasCandidateHint === true when a class score is >= 0.28 for governor holding guard'
    );

    // Now test a frame with 2 overlapping 200k detections + 1 degenerate < 2px noise box
    const activeTensor = new Float32Array(YOLO_TOTAL_CHANNELS * numAnchors);
    // Detection 1 at anchor 120: 200,000 VND (class index 5 in YOLO_CLASS_ORDER: [1k, 10k, 100k, 2k, 20k, 200k, 5k, 50k, 500k])
    activeTensor[0 * numAnchors + 120] = 300;
    activeTensor[1 * numAnchors + 120] = 300;
    activeTensor[2 * numAnchors + 120] = 220;
    activeTensor[3 * numAnchors + 120] = 110;
    activeTensor[(4 + 5) * numAnchors + 120] = 0.91;

    // Detection 2 (overlapping duplicate of anchor 120) at anchor 121
    activeTensor[0 * numAnchors + 121] = 302;
    activeTensor[1 * numAnchors + 121] = 301;
    activeTensor[2 * numAnchors + 121] = 220;
    activeTensor[3 * numAnchors + 121] = 110;
    activeTensor[(4 + 5) * numAnchors + 121] = 0.78;

    // Degenerate < 2px noise anchor at anchor 7000
    activeTensor[0 * numAnchors + 7000] = 0.9;
    activeTensor[1 * numAnchors + 7000] = 0.8;
    activeTensor[2 * numAnchors + 7000] = 0.4;
    activeTensor[3 * numAnchors + 7000] = 0.3;
    activeTensor[(4 + 8) * numAnchors + 7000] = 0.96;

    const candidates = decodeYoloTensor(activeTensor, {
      scoreThreshold: 0.45,
      applySigmoid: 'auto',
    });
    const activeTelemetry = getLastDecodeTelemetry();
    assert.strictEqual(activeTelemetry.hitCount, 3, 'Only 3 anchors exceeded scoreThreshold');
    assert.strictEqual(candidates.length, 2, '<2px noise anchor rejected during decode, leaving 2 candidates');
    const nmsFiltered = nonMaximumSuppression(candidates, 0.45);
    assert.strictEqual(nmsFiltered.length, 1, 'NMS suppresses overlapping duplicate, leaving 1 box');
    assert.strictEqual(nmsFiltered[0].classId, 200000);

    // Test pixel-coordinate tensor where the ONLY hit anchor is a < 2px noise box (coords <= 2.0),
    // while sub-threshold anchors have pixel coordinates (> 2.0): fallback scan must prevent 640x false scaling!
    const singleNoisePixelTensor = new Float32Array(YOLO_TOTAL_CHANNELS * numAnchors);
    singleNoisePixelTensor[0 * numAnchors + 0] = 320.0; // Sub-threshold anchor 0 has pixel coordinate > 2.0
    singleNoisePixelTensor[0 * numAnchors + 7000] = 0.9;
    singleNoisePixelTensor[1 * numAnchors + 7000] = 0.8;
    singleNoisePixelTensor[2 * numAnchors + 7000] = 0.4;
    singleNoisePixelTensor[3 * numAnchors + 7000] = 0.3;
    singleNoisePixelTensor[(4 + 8) * numAnchors + 7000] = 0.96;
    const rejectedNoiseOnly = decodeYoloTensor(singleNoisePixelTensor, {
      scoreThreshold: 0.45,
      applySigmoid: 'auto',
    });
    assert.strictEqual(
      rejectedNoiseOnly.length,
      0,
      'Single < 2px noise box in pixel-coordinate tensor must not be falsely scaled by 640'
    );

    // Follow-up truly empty call (no candidate hint) must cleanly reset sparse hit indices without leaking previous hits
    emptyTensor[(4 + 4) * numAnchors + 500] = 0.05;
    const secondEmpty = decodeYoloTensor(emptyTensor);
    assert.strictEqual(secondEmpty.length, 0);
    assert.strictEqual(getLastDecodeTelemetry().hitCount, 0);
    assert.strictEqual(getLastDecodeTelemetry().coordinateReadsCount, 0);
    assert.strictEqual(getLastDecodeTelemetry().hasCandidateHint, false);
  });

  await t.test('Layer 2: 16x16 Cache-Tiled 90° CW YUV420-to-NCHW conversion (convertYuv420ToNchwTiled) & NORM_LUT_256 mathematical equivalence', () => {
    // 1. Verify NORM_LUT_256 boundaries and monotonic precision
    assert.strictEqual(NORM_LUT_256.length, 256);
    assert.strictEqual(NORM_LUT_256[0], 0.0);
    assert.strictEqual(NORM_LUT_256[255], 1.0);
    assert.ok(Math.abs(NORM_LUT_256[128] - 128 / 255) < 1e-6);

    // 2. Synthesize a 64x48 YUV_420_888 frame with spatial gradients in Y, U, and V
    const srcW = 64;
    const srcH = 48;
    const yPlane = new Uint8Array(srcW * srcH);
    const uPlane = new Uint8Array((srcW >> 1) * (srcH >> 1));
    const vPlane = new Uint8Array((srcW >> 1) * (srcH >> 1));

    for (let r = 0; r < srcH; r++) {
      for (let c = 0; c < srcW; c++) {
        yPlane[r * srcW + c] = (r * 3 + c * 2) & 0xff;
      }
    }
    for (let r = 0; r < srcH >> 1; r++) {
      for (let c = 0; c < srcW >> 1; c++) {
        uPlane[r * (srcW >> 1) + c] = (80 + r * 4 - c) & 0xff;
        vPlane[r * (srcW >> 1) + c] = (150 - r * 2 + c * 3) & 0xff;
      }
    }

    // Compare 16x16 cache-tiled output against a non-tiled reference loop (at 64x64 target size for speed)
    const dstSize = 64;
    const tiledOut = convertYuv420ToNchwTiled(
      yPlane,
      uPlane,
      vPlane,
      srcW,
      srcH,
      srcW,
      srcW >> 1,
      1,
      dstSize,
      dstSize
    );
    assert.strictEqual(tiledOut.length, 3 * dstSize * dstSize);

    const planeSize = dstSize * dstSize;
    for (let outY = 0; outY < dstSize; outY++) {
      const srcX = Math.min(srcW - 1, Math.floor((outY * srcW) / dstSize));
      for (let outX = 0; outX < dstSize; outX++) {
        const srcY = Math.max(0, Math.min(srcH - 1, srcH - 1 - Math.floor((outX * srcH) / dstSize)));
        const yVal = yPlane[srcY * srcW + srcX] & 0xff;
        const uvIdx = (srcY >> 1) * (srcW >> 1) + (srcX >> 1);
        const uDiff = (uPlane[uvIdx] & 0xff) - 128;
        const vDiff = (vPlane[uvIdx] & 0xff) - 128;

        const rExpected = NORM_LUT_256[Math.max(0, Math.min(255, yVal + ((1436 * vDiff) >> 10)))];
        const gExpected =
          NORM_LUT_256[Math.max(0, Math.min(255, yVal - ((352 * uDiff + 731 * vDiff) >> 10)))];
        const bExpected = NORM_LUT_256[Math.max(0, Math.min(255, yVal + ((1815 * uDiff) >> 10)))];

        const idx = outY * dstSize + outX;
        assert.strictEqual(tiledOut[idx], rExpected, `R mismatch at (${outX}, ${outY})`);
        assert.strictEqual(tiledOut[planeSize + idx], gExpected, `G mismatch at (${outX}, ${outY})`);
        assert.strictEqual(tiledOut[2 * planeSize + idx], bExpected, `B mismatch at (${outX}, ${outY})`);
      }
    }
  });

  await t.test('Layer 3 & 4: Native Android & React Native UI Source Verification (MainActivity.java, MoneyDetectorModule.java, MoneyCameraView.kt, Yolo26Detector.kt, MoneyAudioModule.kt, EdgePulseBorder.tsx)', () => {
    const sdkBuilderContent = fs.readFileSync(
      path.join(projectRoot, 'scripts', 'android-sdk-builder.mjs'),
      'utf8'
    );
    const ktCameraContent = fs.readFileSync(
      path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        'com',
        'nckh',
        'moneyvision',
        'camera',
        'MoneyCameraView.kt'
      ),
      'utf8'
    );
    const ktDetectorContent = fs.readFileSync(
      path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        'com',
        'nckh',
        'moneyvision',
        'detector',
        'Yolo26Detector.kt'
      ),
      'utf8'
    );
    const ktAudioContent = fs.readFileSync(
      path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        'com',
        'nckh',
        'moneyvision',
        'audio',
        'MoneyAudioModule.kt'
      ),
      'utf8'
    );
    const edgePulseContent = fs.readFileSync(
      path.join(projectRoot, 'src', 'components', 'EdgePulseBorder.tsx'),
      'utf8'
    );

    // 1. Background Thread Priority & 2-Thread XNNPACK Cap
    assert.match(
      sdkBuilderContent,
      /Process\.THREAD_PRIORITY_BACKGROUND/,
      'MainActivity.java must set Process.THREAD_PRIORITY_BACKGROUND on inferenceThread'
    );
    assert.match(
      ktCameraContent,
      /Process\.setThreadPriority\s*\(\s*Process\.THREAD_PRIORITY_BACKGROUND\s*\)/,
      'MoneyCameraView.kt must set Process.THREAD_PRIORITY_BACKGROUND on detectionExecutor'
    );
    assert.match(
      sdkBuilderContent,
      /Math\.min\s*\(\s*2\s*,\s*Runtime\.getRuntime\(\)\.availableProcessors\(\)\s*\)/,
      'MoneyDetectorModule.java must cap TFLite XNNPACK CPU threads to 2'
    );
    assert.match(
      ktDetectorContent,
      /availableCores\.coerceIn\s*\(\s*1\s*,\s*2\s*\)/,
      'Yolo26Detector.kt must cap TFLite XNNPACK CPU threads to 2'
    );

    // 2. 16x16 Cache-Tiled YUV-to-NCHW + NORM_LUT[256] + Bulk FloatBuffer.put + scaledBitmap.recycle()
    assert.match(sdkBuilderContent, /NORM_LUT\s*=\s*new\s+float\[256\]/, 'MoneyDetectorModule.java must precompute NORM_LUT[256]');
    assert.match(sdkBuilderContent, /TILE_SIZE\s*=\s*16/, 'MoneyDetectorModule.java must use 16x16 cache tiling');
    assert.match(sdkBuilderContent, /asFloatBuffer\(\)\.put\s*\(\s*reusableFloatStaging\s*\)/, 'MoneyDetectorModule.java must bulk-transfer staging array via FloatBuffer.put');
    assert.match(ktDetectorContent, /if\s*\(\s*scaledBitmap\s*!==\s*bitmap\s*\)\s*\{\s*scaledBitmap\.recycle\(\)/, 'Yolo26Detector.kt must recycle scaledBitmap when distinct');
    assert.match(ktDetectorContent, /NORM_LUT\s*=\s*FloatArray\s*\(\s*256\s*\)/, 'Yolo26Detector.kt must precompute NORM_LUT[256]');
    assert.match(ktDetectorContent, /TILE_SIZE\s*=\s*16/, 'Yolo26Detector.kt must use 16x16 cache tiling');
    assert.match(ktDetectorContent, /detectFromYuv/, 'Yolo26Detector.kt must expose zero-Bitmap detectFromYuv');
    assert.match(ktCameraContent, /detectFromYuv/, 'MoneyCameraView.kt must call zero-Bitmap detectFromYuv directly');

    // 3. Row-Major Sparse YOLO Decoder with 0-coordinate-read fast path & fallback coordinate normalization scan
    assert.match(
      sdkBuilderContent,
      /if\s*\(\s*hitCount\s*==\s*0\s*\)\s*\{[\s\S]*?return\s+list\s*;\s*\}/,
      'MoneyDetectorModule.java must fast-return on hitCount == 0 with 0 coordinate reads'
    );
    assert.match(
      ktDetectorContent,
      /if\s*\(\s*hitCount\s*==\s*0\s*\)\s*\{[\s\S]*?return\s+emptyList\(\)/,
      'Yolo26Detector.kt must fast-return on hitCount == 0 with 0 coordinate reads'
    );
    assert.match(
      sdkBuilderContent,
      /if\s*\(\s*maxCoordVal\s*<=\s*2\.0f\s*\)/,
      'MoneyDetectorModule.java must perform fallback coordinate normalization scan when hit anchors have <= 2.0f coords'
    );
    assert.match(
      ktDetectorContent,
      /if\s*\(\s*maxCoordVal\s*<=\s*2\.0f\s*\)/,
      'Yolo26Detector.kt must perform fallback coordinate normalization scan when hit anchors have <= 2.0f coords'
    );

    // 4. 3-Tier Governor, Motion-Blur Gate, Adaptive IMU Guard, Thermal/Battery Scaling, CameraX Early image.close() & Camera2 AE FPS Ranges
    assert.match(sdkBuilderContent, /MOTION_BLUR_DELTA_Y_THRESHOLD\s*=\s*32\.0/, 'MainActivity.java must enforce MOTION_BLUR_DELTA_Y_THRESHOLD = 32.0');
    assert.match(sdkBuilderContent, /POWER_STATE_HIBERNATION/, 'MainActivity.java must implement POWER_STATE_HIBERNATION');
    assert.match(sdkBuilderContent, /consecutiveFalseImuWakes/, 'MainActivity.java must implement Adaptive IMU Table-Vibration Guard');
    assert.match(sdkBuilderContent, /getCurrentThermalStatus\(\)/, 'MainActivity.java must check PowerManager.getCurrentThermalStatus() on API 29+');
    assert.match(sdkBuilderContent, /ACTION_BATTERY_CHANGED/, 'MainActivity.java must monitor BatteryManager temperature and level for API 28-34');
    assert.match(sdkBuilderContent, /clearFlags\s*\(\s*WindowManager\.LayoutParams\.FLAG_KEEP_SCREEN_ON\s*\)/, 'MainActivity.java must release FLAG_KEEP_SCREEN_ON after 180s static hibernation');
    assert.match(sdkBuilderContent, /new\s+Range<Integer>\s*\(\s*15\s*,\s*24\s*\)/, 'MainActivity.java must configure [15, 24] AE FPS range for BURST');
    assert.match(sdkBuilderContent, /new\s+Range<Integer>\s*\(\s*10\s*,\s*15\s*\)/, 'MainActivity.java must configure [10, 15] AE FPS range for ECO');
    assert.match(sdkBuilderContent, /PREVIEW_ALPHA_BURST\s*=\s*0\.22f/, 'MainActivity.java must dim preview alpha to 0.22f in BURST');
    assert.match(sdkBuilderContent, /PREVIEW_ALPHA_ECO\s*=\s*0\.08f/, 'MainActivity.java must dim preview alpha to 0.08f in ECO');
    assert.match(ktCameraContent, /HIBERNATION_HEARTBEAT_NOMINAL_MS\s*=\s*1500L/, 'MoneyCameraView.kt must enforce 1500ms HIBERNATION heartbeat');
    assert.match(ktCameraContent, /HIBERNATION_HEARTBEAT_DARK_MS\s*=\s*3000L/, 'MoneyCameraView.kt must enforce 3000ms dark/occluded HIBERNATION heartbeat');
    assert.match(ktCameraContent, /PREVIEW_ALPHA_BURST\s*=\s*0\.22f/, 'MoneyCameraView.kt must dim preview alpha to 0.22f in BURST');
    assert.match(ktCameraContent, /PREVIEW_ALPHA_ECO\s*=\s*0\.08f/, 'MoneyCameraView.kt must dim preview alpha to 0.08f in ECO');

    // 5. Audio Validation Cache & EdgePulseBorder Animation Pause
    assert.match(sdkBuilderContent, /streamValidityCache/, 'MoneyAudioModule.java must cache stream validation results');
    assert.match(ktAudioContent, /audioStreamValidityCache/, 'MoneyAudioModule.kt must cache audio stream validation results');
    assert.match(edgePulseContent, /powerState\s*===\s*'HIBERNATION'/, 'EdgePulseBorder.tsx must set 0.0 opacity in HIBERNATION');
    assert.match(edgePulseContent, /powerState\s*===\s*'ECO'/, 'EdgePulseBorder.tsx must pause Animated.loop in ECO');
    assert.match(edgePulseContent, /wasActiveRef/, 'EdgePulseBorder.tsx must avoid starting fade animation when already inactive');
  });
});

test('17. Blind-First UI/UX & Spatial Guidance (Ticket 10: Palm-Rejection, TalkBack, Spatial Guidance, 9-Denom Tactile Coding & Low-Vision Clarity)', async (t) => {
  const projectRoot = process.cwd();

  await t.test('Pillar 1: 16dp Per-Pointer Edge Palm-Rejection Safe Zone (isPointInsideSafeZone & filterInteriorTouchPoints)', () => {
    assert.strictEqual(EDGE_PALM_REJECTION_DP, 16, 'EDGE_PALM_REJECTION_DP must be 16dp');
    assert.strictEqual(MIN_TOUCH_TARGET_DP, 44, 'MIN_TOUCH_TARGET_DP must be >= 44dp');

    const W = 360;
    const H = 800;

    // 1. Uninitialized viewport (0x0) allows finite points
    assert.strictEqual(isPointInsideSafeZone(5, 5, 0, 0), true);
    assert.strictEqual(isPointInsideSafeZone(NaN, 100, W, H), false);
    assert.strictEqual(isPointInsideSafeZone(100, Infinity, W, H), false);

    // 2. Exact boundary checks for 16dp safe zone [16, W-16] x [16, H-16]
    assert.strictEqual(isPointInsideSafeZone(15.99, 400, W, H), false, 'Left edge (< 16) rejected');
    assert.strictEqual(isPointInsideSafeZone(16.0, 400, W, H), true, 'Exact left inner boundary (16) accepted');
    assert.strictEqual(isPointInsideSafeZone(W - 16.0, 400, W, H), true, 'Exact right inner boundary (W-16) accepted');
    assert.strictEqual(isPointInsideSafeZone(W - 15.99, 400, W, H), false, 'Right edge (> W-16) rejected');
    assert.strictEqual(isPointInsideSafeZone(180, 15.99, W, H), false, 'Top edge (< 16) rejected');
    assert.strictEqual(isPointInsideSafeZone(180, 16.0, W, H), true, 'Exact top inner boundary (16) accepted');
    assert.strictEqual(isPointInsideSafeZone(180, H - 16.0, W, H), true, 'Exact bottom inner boundary (H-16) accepted');
    assert.strictEqual(isPointInsideSafeZone(180, H - 15.99, W, H), false, 'Bottom edge (> H-16) rejected');

    // 3. Per-pointer filtering separates thumb resting on bezel from active interior finger(s)
    const mixedPoints = [
      { x: 6, y: 420 },     // Thumb gripping left edge -> rejected
      { x: 190, y: 380 },   // Index finger tapping center -> accepted
      { x: 352, y: 500 },   // Palm touching right edge -> rejected
    ];
    const interior = filterInteriorTouchPoints(mixedPoints, W, H, EDGE_PALM_REJECTION_DP);
    assert.strictEqual(interior.length, 1);
    assert.deepStrictEqual(interior[0], { x: 190, y: 380 });
  });

  await t.test('Pillar 1: GestureRecognizer Per-Pointer Palm-Rejection prevents multi-touch misfire when gripping phone edges', async () => {
    let singleTapCount = 0;
    let doubleTapCount = 0;
    let longPressCount = 0;
    let twoFingerDoubleTapCount = 0;

    const recognizer = new GestureRecognizer(
      {
        onSingleTap: () => { singleTapCount++; },
        onDoubleTap: () => { doubleTapCount++; },
        onLongPress: () => { longPressCount++; },
        onTwoFingerDoubleTap: () => { twoFingerDoubleTapCount++; },
      },
      {
        doubleTapThresholdMs: 50,
        longPressThresholdMs: 80,
        viewportWidth: 360,
        viewportHeight: 800,
        edgeSafeMarginDp: 16,
      }
    );

    // Case A: Pure edge touch (thumb on bezel x=5, y=400) -> completely ignored
    recognizer.handleTouchStart({
      touchCount: 1,
      x: 5,
      y: 400,
      touches: [{ x: 5, y: 400 }],
      timestamp: 1000,
    });
    recognizer.handleTouchEnd({
      touchCount: 0,
      x: 5,
      y: 400,
      touches: [],
      timestamp: 1030,
    });
    await new Promise(r => setTimeout(r, 70));
    assert.strictEqual(singleTapCount, 0, 'Pure edge palm touch must NOT trigger single tap');
    assert.strictEqual(recognizer.getPalmRejectedCount(), 1, 'Palm rejected count must increment');

    // Case B: User grips left bezel with thumb (x=6, y=450) while single-tapping center (x=180, y=400).
    // Without per-pointer filtering, touchCount=2 would suppress single tap!
    recognizer.handleTouchStart({
      touchCount: 2,
      x: 6,
      y: 450,
      touches: [
        { x: 6, y: 450 },     // Bezel grip
        { x: 180, y: 400 },   // Interior tap
      ],
      timestamp: 2000,
    });
    // Release interior finger while thumb stays on bezel
    recognizer.handleTouchEnd({
      touchCount: 1,
      x: 6,
      y: 450,
      touches: [{ x: 6, y: 450 }],
      timestamp: 2030,
    });
    await new Promise(r => setTimeout(r, 70));
    assert.strictEqual(
      singleTapCount,
      1,
      'Single tap in interior MUST succeed even while a thumb rests on the 16dp bezel edge'
    );

    // Case C: User grips left bezel with thumb (x=6, y=450) while performing a 2-finger double-tap in the interior
    recognizer.handleTouchStart({
      touchCount: 3,
      x: 6,
      y: 450,
      touches: [
        { x: 6, y: 450 },     // Bezel grip
        { x: 140, y: 380 },   // Interior finger 1
        { x: 240, y: 390 },   // Interior finger 2
      ],
      timestamp: 3000,
    });
    recognizer.handleTouchEnd({
      touchCount: 1,
      x: 6,
      y: 450,
      touches: [{ x: 6, y: 450 }],
      timestamp: 3030,
    });
    recognizer.handleTouchStart({
      touchCount: 3,
      x: 6,
      y: 450,
      touches: [
        { x: 6, y: 450 },
        { x: 142, y: 382 },
        { x: 238, y: 391 },
      ],
      timestamp: 3060,
    });
    recognizer.handleTouchEnd({
      touchCount: 1,
      x: 6,
      y: 450,
      touches: [{ x: 6, y: 450 }],
      timestamp: 3090,
    });
    assert.strictEqual(
      twoFingerDoubleTapCount,
      1,
      'Two-finger double tap in interior MUST succeed even with a 3rd pointer gripping the bezel edge'
    );

    // 5. Interior touch swiping into 16dp edge zone MUST be cancelled (not fire single tap)
    singleTapCount = 0;
    recognizer.handleTouchStart({
      touchCount: 1,
      x: 100,
      y: 400,
      touches: [{ x: 100, y: 400 }],
      timestamp: 4000,
    });
    recognizer.handleTouchMove({
      touchCount: 1,
      x: 5,
      y: 400,
      touches: [{ x: 5, y: 400 }],
      dx: -95,
      dy: 0,
      timestamp: 4050,
    });
    recognizer.handleTouchEnd({
      touchCount: 0,
      x: 5,
      y: 400,
      touches: [],
      dx: -95,
      dy: 0,
      timestamp: 4080,
    });
    await new Promise((r) => setTimeout(r, 85));
    assert.strictEqual(
      singleTapCount,
      0,
      'Interior touch that swipes into the 16dp edge zone MUST NOT fire onSingleTap on release'
    );

    // 6. Holding an interior finger for long press while a palm brushes the 16dp edge mid-hold MUST NOT reset the longPressTimer
    let midHoldLongPressCount = 0;
    const lpRecognizer = new GestureRecognizer(
      {
        onSingleTap: () => {},
        onDoubleTap: () => {},
        onLongPress: () => {
          midHoldLongPressCount++;
        },
        onTwoFingerDoubleTap: () => {},
      },
      {
        doubleTapThresholdMs: 60,
        longPressThresholdMs: 120,
        twoFingerDoubleTapThresholdMs: 150,
        maxMoveDistancePx: 30,
        viewportWidth: 400,
        viewportHeight: 800,
        edgeSafeMarginDp: 16,
      }
    );
    lpRecognizer.handleTouchStart({
      touchCount: 1,
      x: 200,
      y: 400,
      touches: [{ x: 200, y: 400 }],
      timestamp: 5000,
    });
    await new Promise((r) => setTimeout(r, 70));
    // Palm touches bezel at 70ms into a 120ms hold
    lpRecognizer.handleTouchStart({
      touchCount: 2,
      x: 200,
      y: 400,
      touches: [
        { x: 200, y: 400 },
        { x: 4, y: 500 },
      ],
      timestamp: 5070,
    });
    // Wait another 70ms (total 140ms >= 120ms from original start, but only 70ms from palm brush)
    await new Promise((r) => setTimeout(r, 70));
    assert.strictEqual(
      midHoldLongPressCount,
      1,
      'Mid-hold bezel palm brush MUST NOT reset or cancel the active interior longPressTimer'
    );
    lpRecognizer.destroy();

    recognizer.destroy();
  });

  await t.test('Pillar 3: Spatial Guidance ("Hold Hand Steady" 25ms pulse + 1200ms cooldown) & 9-Denomination Tactile Vibration Coding', async () => {
    assert.strictEqual(CANDIDATE_GUIDANCE_PULSE_MS, 25, 'Candidate guidance pulse must be 25ms');
    assert.strictEqual(CANDIDATE_GUIDANCE_COOLDOWN_MS, 1200, 'Candidate guidance cooldown must be 1200ms');

    // 1. Verify all 9 Vietnamese banknote denominations have distinct tactile vibration signatures
    const allDenoms = [1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000];
    const seenSignatures = new Set();
    for (const denom of allDenoms) {
      const pattern = getDenominationVibrationPattern(denom);
      assert.ok(Array.isArray(pattern) && pattern.length >= 2, `Pattern for ${denom} must be non-empty`);
      const sig = pattern.join(',');
      assert.strictEqual(
        seenSignatures.has(sig),
        false,
        `Denomination ${denom} must have a unique vibration pattern, got duplicate ${sig}`
      );
      seenSignatures.add(sig);
    }

    // Verify tier structure:
    // Cotton 1k, 2k, 5k use 35ms short pulses
    assert.deepStrictEqual(getDenominationVibrationPattern(1000), [0, 35]);
    assert.deepStrictEqual(getDenominationVibrationPattern(2000), [0, 35, 45, 35]);
    assert.deepStrictEqual(getDenominationVibrationPattern(5000), [0, 35, 45, 35, 45, 35]);
    // Polymer 10k, 20k, 50k use 70ms medium pulses
    assert.deepStrictEqual(getDenominationVibrationPattern(10000), [0, 70]);
    assert.deepStrictEqual(getDenominationVibrationPattern(20000), [0, 70, 55, 70]);
    assert.deepStrictEqual(getDenominationVibrationPattern(50000), [0, 70, 55, 70, 55, 70]);
    // Polymer 100k, 200k, 500k use 40ms lead tick + 120ms/140ms long pulses
    assert.deepStrictEqual(getDenominationVibrationPattern(100000), [0, 40, 45, 120]);
    assert.deepStrictEqual(getDenominationVibrationPattern(200000), [0, 40, 45, 120, 60, 120]);
    assert.deepStrictEqual(getDenominationVibrationPattern(500000), [0, 40, 45, 120, 60, 120, 60, 140]);
    // Fallback for unknown denomination
    assert.deepStrictEqual(getDenominationVibrationPattern(undefined), [0, 80]);
    assert.deepStrictEqual(getDenominationVibrationPattern(999), [0, 80]);

    // 2. Verify HapticsService & SmartPreemptionController candidate guidance pulse cooldown (1200ms)
    haptics.resetCandidateCooldown();
    assert.strictEqual(haptics.triggerCandidateGuidancePulse(1000), true, 'First candidate pulse fires at t=1000');
    assert.strictEqual(haptics.triggerCandidateGuidancePulse(1500), false, 'Suppressed within 1200ms cooldown (t=1500)');
    assert.strictEqual(haptics.triggerCandidateGuidancePulse(2199), false, 'Suppressed at t=2199 (< 2200)');
    assert.strictEqual(haptics.triggerCandidateGuidancePulse(2200), true, 'Fires again at t=2200 (>= 1200ms elapsed)');

    // 3. Verify SmartPreemptionController passes top denomination to hapticNotifier.triggerMoneyDetected(topDenom)
    const simulatedDriver = new SimulatedAudioDriver();
    const hapticNotifier = new DefaultHapticNotifier();
    const controller = new SmartPreemptionController({
      driver: simulatedDriver,
      hapticNotifier,
      cooldownMs: 1500,
      interClipGapMs: 10,
    });

    assert.strictEqual(controller.triggerCandidateGuidancePulse(5000), true);
    assert.strictEqual(controller.triggerCandidateGuidancePulse(5500), false);
    assert.strictEqual(hapticNotifier.candidateGuidanceCount, 1);

    await controller.handleDetectionUpdate([
      { classId: 50000, count: 1, label: 'Năm mươi nghìn', totalAmount: 50000 },
      { classId: 500000, count: 1, label: 'Năm trăm nghìn', totalAmount: 500000 },
    ]);
    assert.strictEqual(hapticNotifier.detectedCount, 1);
    assert.strictEqual(
      hapticNotifier.lastDetectedDenomination,
      500000,
      'Must pass highest detected denomination (500,000 VND) to triggerMoneyDetected'
    );
    assert.deepStrictEqual(
      hapticNotifier.lastDetectedPattern,
      [0, 40, 45, 120, 60, 120, 60, 140]
    );

    // Transitioning directly to another denomination (e.g. 200k) MUST also emit the 200k tactile pattern
    await controller.handleDetectionUpdate([
      { classId: 200000, count: 1, label: 'Hai trăm nghìn', totalAmount: 200000 },
    ]);
    assert.strictEqual(hapticNotifier.detectedCount, 2);
    assert.strictEqual(hapticNotifier.lastDetectedDenomination, 200000);
    assert.deepStrictEqual(
      hapticNotifier.lastDetectedPattern,
      [0, 40, 45, 120, 60, 120]
    );

    // Replaying via single-tap must NOT emit a duplicate money-detected haptic pattern
    await controller.handleSingleTap([
      { classId: 200000, count: 1, label: 'Hai trăm nghìn', totalAmount: 200000 },
    ]);
    assert.strictEqual(hapticNotifier.detectedCount, 2);

    controller.destroy();
  });

  await t.test('Pillar 4: Low-Vision Clarity (64sp Hero Typography, 9 Polymer/Cotton Color Badges with WCAG Contrast, Power State Badge)', () => {
    // 1. Hero Typography is >= 64sp
    assert.strictEqual(THEME.typography.fontSizeHero, 64, 'fontSizeHero must be 64sp');
    assert.strictEqual(THEME.layout.edgePalmRejectionDp, 16);
    assert.strictEqual(THEME.layout.minTouchTargetDp, 44);

    // 2. All 9 denominations have Polymer/Cotton color badge specs with high contrast against OLED Black
    const allDenoms = [1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000];
    for (const denom of allDenoms) {
      const spec = getDenominationVisualSpec(denom);
      assert.ok(spec, `Visual spec must exist for ${denom}`);
      assert.strictEqual(spec.classId, denom);
      assert.ok(spec.material === 'POLYMER' || spec.material === 'COTTON');
      assert.ok(spec.materialVi === 'POLYMER' || spec.materialVi === 'COTTON');
      assert.strictEqual(spec.badgeColor, spec.colorHex);
      assert.strictEqual(spec.textColor, '#000000');
      assert.ok(spec.badgeLabel.length > 0);
      const badgeContrastOnBlack = calculateContrastRatio(spec.colorHex, THEME.colors.background);
      assert.ok(
        badgeContrastOnBlack >= 5.0,
        `Badge color ${spec.colorHex} for ${denom} against OLED Black #000000 must have strong contrast >= 5.0:1, got ${badgeContrastOnBlack.toFixed(2)}:1`
      );
      const blackTextOnBadge = calculateContrastRatio(spec.textColor, spec.badgeColor);
      assert.ok(
        blackTextOnBadge >= 5.0,
        `Black text on badge background ${spec.badgeColor} for ${denom} must have strong contrast >= 5.0:1, got ${blackTextOnBadge.toFixed(2)}:1`
      );
    }
    assert.strictEqual(getDenominationVisualSpec(undefined), null);
    assert.strictEqual(getDenominationVisualSpec(null), null);

    // 3. Power State Badge formatting & spec
    assert.strictEqual(formatPowerStateBadge('BURST'), '🔍 ĐANG QUÉT');
    assert.strictEqual(formatPowerStateBadge('ECO'), '🌿 ECO');
    assert.strictEqual(formatPowerStateBadge('HIBERNATION'), '💤 CHỜ');
    assert.deepStrictEqual(getPowerStateBadgeSpec('BURST'), { label: '🔍 ĐANG QUÉT', color: '#00FF66' });
    assert.deepStrictEqual(getPowerStateBadgeSpec('ECO'), { label: '🌿 ECO', color: '#FFE600' });
    assert.deepStrictEqual(getPowerStateBadgeSpec('HIBERNATION'), { label: '💤 CHỜ', color: '#9E9E9E' });
  });

  await t.test('Native Android & React Native Source Verification for Ticket 10 (Palm-Rejection, Collapsible Drawer, TalkBack Delegate/Hover/Ducking, Candidate Guidance & Low-Vision UI)', () => {
    const sdkBuilderContent = fs.readFileSync(
      path.join(projectRoot, 'scripts', 'android-sdk-builder.mjs'),
      'utf8'
    );
    const ktCameraContent = fs.readFileSync(
      path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        'com',
        'nckh',
        'moneyvision',
        'camera',
        'MoneyCameraView.kt'
      ),
      'utf8'
    );
    const ktAudioContent = fs.readFileSync(
      path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        'com',
        'nckh',
        'moneyvision',
        'audio',
        'MoneyAudioModule.kt'
      ),
      'utf8'
    );
    const appTsxContent = fs.readFileSync(path.join(projectRoot, 'App.tsx'), 'utf8');
    const gestureCanvasContent = fs.readFileSync(
      path.join(projectRoot, 'src', 'components', 'GestureCanvas.tsx'),
      'utf8'
    );
    const tactileDisplayContent = fs.readFileSync(
      path.join(projectRoot, 'src', 'components', 'TactileDisplay.tsx'),
      'utf8'
    );
    const simControlsContent = fs.readFileSync(
      path.join(projectRoot, 'src', 'components', 'SimulationControls.tsx'),
      'utf8'
    );
    const useMoneyStateContent = fs.readFileSync(
      path.join(projectRoot, 'src', 'hooks', 'useMoneyState.ts'),
      'utf8'
    );

    // 1. Collapsible Simulation Drawer hidden by default in production UI
    assert.match(
      appTsxContent,
      /useState<boolean>\(false\)/,
      'App.tsx must default isSimulationDrawerOpen to false'
    );
    assert.match(
      simControlsContent,
      /if\s*\(\s*!isOpen\s*\)\s*\{\s*return\s+null\s*;\s*\}/,
      'SimulationControls.tsx must return null when !isOpen'
    );
    assert.match(
      sdkBuilderContent,
      /controlsPanel\.setVisibility\(View\.GONE\)/,
      'MainActivity.java must hide simulation controlsPanel (View.GONE) by default on launch'
    );
    assert.match(
      sdkBuilderContent,
      /private\s+boolean\s+isSimulationDrawerOpen\s*=\s*false\s*;/,
      'MainActivity.java must initialize isSimulationDrawerOpen = false'
    );

    // 2. 16dp Edge Palm-Rejection & >= 44dp Accessible Buttons
    assert.match(
      sdkBuilderContent,
      /EDGE_PALM_REJECTION_DP\s*=\s*16/,
      'MainActivity.java must define EDGE_PALM_REJECTION_DP = 16'
    );
    assert.match(
      sdkBuilderContent,
      /isPointerInsideSafeZone/,
      'MainActivity.java must filter each pointer via isPointerInsideSafeZone'
    );
    assert.match(
      tactileDisplayContent,
      /testID="torch-toggle-btn"/,
      'TactileDisplay.tsx must provide direct accessible torch toggle button'
    );
    assert.match(
      tactileDisplayContent,
      /testID="wallet-card-btn"/,
      'TactileDisplay.tsx must provide direct accessible wallet readout button'
    );
    assert.match(
      tactileDisplayContent,
      /testID="wallet-reset-btn"/,
      'TactileDisplay.tsx must provide direct accessible wallet reset button'
    );

    // 3. TalkBack First-Class Compatibility (AccessibilityDelegate, OnHoverListener, AccessibilityManager.interrupt, AudioFocusRequest, liveRegion="none")
    assert.match(
      gestureCanvasContent,
      /testID="talkback-gesture-surface"/,
      'GestureCanvas.tsx must use a dedicated background surface so child buttons remain accessible via Explore-by-Touch'
    );
    assert.match(
      gestureCanvasContent,
      /accessibilityActions/,
      'GestureCanvas.tsx must register TalkBack accessibilityActions'
    );
    assert.match(
      tactileDisplayContent,
      /accessibilityLiveRegion="none"/,
      'TactileDisplay.tsx must set accessibilityLiveRegion="none" on dynamic regions to prevent TalkBack speech collision'
    );
    assert.match(
      sdkBuilderContent,
      /View\.AccessibilityDelegate/,
      'MainActivity.java must attach View.AccessibilityDelegate to rootPulseContainer'
    );
    assert.match(
      sdkBuilderContent,
      /A11Y_ACTION_REREAD\s*=\s*0x1001/,
      'MainActivity.java must register custom TalkBack AccessibilityActions (0x1001..0x1004)'
    );
    assert.match(
      sdkBuilderContent,
      /setOnHoverListener/,
      'MainActivity.java must attach View.OnHoverListener for TalkBack Explore-by-Touch'
    );
    assert.match(
      sdkBuilderContent,
      /postDelayed\(hoverLongPressRunnable,\s*1000L\)/,
      'MainActivity.java OnHoverListener must support 1000ms hover-hold to trigger Wallet Readout'
    );
    assert.match(
      sdkBuilderContent,
      /a11yManager\.interrupt\(\)/,
      'MoneyAudioModule.java must call AccessibilityManager.interrupt() before WAV playback when TalkBack is active'
    );
    assert.match(
      sdkBuilderContent,
      /AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK/,
      'MoneyAudioModule.java must request AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK during WAV playback'
    );
    assert.match(
      sdkBuilderContent,
      /abandonAudioFocusNow\(\)/,
      'MoneyAudioModule.java must abandon transient audio focus when playback completes or stops'
    );
    assert.match(
      ktAudioContent,
      /a11yManager\.interrupt\(\)/,
      'MoneyAudioModule.kt must call AccessibilityManager.interrupt() before WAV playback when TalkBack is active'
    );
    assert.match(
      ktAudioContent,
      /AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK/,
      'MoneyAudioModule.kt must request AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK during WAV playback'
    );
    assert.match(
      ktAudioContent,
      /abandonAudioFocusNow\(\)/,
      'MoneyAudioModule.kt must abandon transient audio focus when playback completes or stops'
    );

    // 4. Spatial Guidance ("Hold Hand Steady"), Candidate Clearance & MoneyCameraView.kt candidateHint propagation
    assert.match(
      useMoneyStateContent,
      /CANDIDATE_GUIDANCE_ANNOUNCEMENT\s*=\s*'✋ Phát hiện bóng tờ tiền — Giữ yên tay\.\.\.'/,
      'useMoneyState.ts must define CANDIDATE_GUIDANCE_ANNOUNCEMENT'
    );
    assert.match(
      useMoneyStateContent,
      /triggerCandidateGuidancePulse/,
      'useMoneyState.ts must trigger 25ms candidate guidance pulse on candidate hint / stabilizing'
    );
    assert.match(
      useMoneyStateContent,
      /hadCandidateHintRef/,
      'useMoneyState.ts must clear candidate guidance text when candidate silhouette leaves the frame'
    );
    assert.match(
      sdkBuilderContent,
      /CANDIDATE_GUIDANCE_TEXT\s*=\s*"✋ Phát hiện bóng tờ tiền — Giữ yên tay\.\.\."/,
      'MainActivity.java must define CANDIDATE_GUIDANCE_TEXT'
    );
    assert.match(
      sdkBuilderContent,
      /triggerCandidateGuidancePulse/,
      'MainActivity.java must trigger 25ms candidate guidance pulse on candidate hint / stabilizing'
    );
    assert.match(
      sdkBuilderContent,
      /wasCandidateGuidanceActive/,
      'MainActivity.java must clear candidate guidance HUD when candidate silhouette leaves the frame'
    );
    assert.match(
      sdkBuilderContent,
      /getDenominationVibrationPattern/,
      'MainActivity.java must use 9-denomination tactile vibration coding'
    );
    assert.match(
      ktCameraContent,
      /val\s+isSteadyEmpty\s*=\s*debounced\.state\s*==\s*"EMPTY"\s*&&\s*!debounced\.stateChanged\s*&&\s*!candidateHint\s*&&\s*wasLastEmittedStateEmpty/,
      'MoneyCameraView.kt must include !candidateHint in isSteadyEmpty so candidate hint frames are emitted to JS'
    );
    assert.match(
      ktCameraContent,
      /emitMoneyDetected\(rawResult,\s*debounced,\s*candidateHint\)/,
      'MoneyCameraView.kt must pass computed candidateHint to emitMoneyDetected'
    );

    // 5. Low-Vision Clarity (64sp Hero, Viewfinder Reticle, Polymer Color Badge, Power State Badge)
    assert.match(
      sdkBuilderContent,
      /heroAmountText\.setTextSize\(TypedValue\.COMPLEX_UNIT_SP,\s*64\)/,
      'MainActivity.java must render Hero denomination text at 64sp'
    );
    assert.match(
      sdkBuilderContent,
      /viewfinderReticleBox/,
      'MainActivity.java must render high-contrast Viewfinder Reticle frame'
    );
    assert.match(
      sdkBuilderContent,
      /polymerColorBadgeText/,
      'MainActivity.java must render Polymer/Cotton denomination color badge'
    );
    assert.match(
      tactileDisplayContent,
      /testID="viewfinder-reticle"/,
      'TactileDisplay.tsx must render high-contrast Viewfinder Reticle frame'
    );
    assert.match(
      tactileDisplayContent,
      /testID="polymer-color-badge"/,
      'TactileDisplay.tsx must render Polymer/Cotton denomination color badge'
    );
    assert.match(
      tactileDisplayContent,
      /testID="power-state-badge"/,
      'TactileDisplay.tsx must render Power State pill badge'
    );
  });
});

test('18. Ticket 11: End-to-End Upgrade Regression (Tickets 08-10) & Android 9.0+ Universal Release APK Verification', async (t) => {
  const projectRoot = process.cwd();

  await t.test('End-to-End Real-World Blind User Session Loop: Anti-Strobe Torch (T08) -> Spatial Guidance & 9-Denom Tactile Coding (T10) -> Adaptive Thermal/Battery Governor (T09)', async () => {
    const torch = new SmartTorchController();
    const governor = new AdaptivePowerGovernor();
    const debounce = new TemporalDebounceFilter({ windowSize: 5, minConsensus: 4, emptyThreshold: 3 });
    const simAudio = new SimulatedAudioDriver(5);
    const hapticNotifier = new DefaultHapticNotifier();
    const audioController = new SmartPreemptionController({
      driver: simAudio,
      hapticNotifier,
      cooldownMs: 1500,
      interClipGapMs: 5,
    });
    haptics.resetCandidateCooldown();

    // 1. Dark Room Entry (12 lux, front ambient sensor = 4 lux): Auto-Torch turns ON after 1000ms
    torch.onLuminanceSample(12, 1000, { ambientSensorLux: 4 });
    const torchOn = torch.onLuminanceSample(12, 2000, { ambientSensorLux: 4 });
    assert.strictEqual(torchOn.action, 'TURN_ON');
    assert.strictEqual(torch.getState().isTorchOn, true);

    // 2. Close-Range Banknote Reflection (195 lux with glareRatio=0.14): Anti-Strobe Guard holds Torch ON
    const reflectHold = torch.onLuminanceSample(195, 2250, {
      ambientSensorLux: 6,
      glareRatio: 0.14,
      centerToBorderRatio: 1.55,
    });
    assert.strictEqual(reflectHold.action, 'NO_OP', 'Anti-Strobe guard must prevent LED self-reflection from turning off torch');
    assert.strictEqual(torch.getState().isTorchOn, true);
    assert.strictEqual(torch.getPostTorchBaselineLuma(), 195);

    // 3. Hand brings 500,000 VND Polymer note into frame -> Candidate Silhouette Hint (0.28 <= score < 0.50)
    const candidateEval = governor.evaluate({
      timestamp: 2400,
      motionDeltaY: 9.2,
      luminance: 195,
      hasMoney: false,
      debounceState: 'EMPTY',
      hasCandidateHint: true,
      isTorchOn: true,
      torchOnDurationMs: 400,
    });
    assert.strictEqual(candidateEval.powerState, 'BURST', 'Candidate hint must keep governor in BURST (130ms)');
    assert.strictEqual(candidateEval.inferenceIntervalMs, 130);
    assert.strictEqual(
      audioController.triggerCandidateGuidancePulse(2400),
      true,
      'Must emit 25ms Hold-Hand-Steady guidance pulse when candidate silhouette appears'
    );
    assert.strictEqual(hapticNotifier.candidateGuidanceCount, 1);

    // 4. 4/5 Frame Consensus locks onto 500,000 VND -> Vietnamese Audio + 500k Tactile Pattern + Low-Vision HUD Spec
    const note500k = [{ classId: 500000, count: 1, label: 'Năm trăm nghìn', totalAmount: 500000 }];
    let lastDebounced = null;
    for (let f = 0; f < 4; f++) {
      lastDebounced = debounce.process(note500k, 2500 + f * 130);
    }
    assert.strictEqual(lastDebounced.state, 'STABLE');
    assert.strictEqual(lastDebounced.stateChanged, true);
    assert.strictEqual(lastDebounced.totalAmount, 500000);

    await audioController.handleDetectionUpdate(lastDebounced.items);
    assert.deepStrictEqual(simAudio.getPlayedClips(), ['tick', 'vnd_500k']);
    assert.strictEqual(hapticNotifier.lastDetectedDenomination, 500000);
    assert.deepStrictEqual(
      hapticNotifier.lastDetectedPattern,
      [0, 40, 45, 120, 60, 120, 60, 140],
      '500k VND must emit distinct 1-lead + 3-long Polymer vibration pattern'
    );

    const visual500k = getDenominationVisualSpec(500000);
    assert.strictEqual(visual500k.colorHex, '#00E5FF');
    assert.strictEqual(visual500k.material, 'POLYMER');

    // 5. User holds banknote steady for >= 2500ms -> Governor transitions BURST -> ECO (650ms) while Torch stays locked ON
    // Arrival frame (hasMoney: false -> true) wakes with ACTIVE_DETECTION
    governor.evaluate({
      timestamp: 3000,
      motionDeltaY: 0.4,
      luminance: 195,
      hasMoney: true,
      debounceState: 'STABLE',
      hasCandidateHint: true,
      isTorchOn: true,
      torchOnDurationMs: 1000,
    });
    // Next steady frame at t = 3130ms starts the static holding timer
    governor.evaluate({
      timestamp: 3130,
      motionDeltaY: 0.4,
      luminance: 195,
      hasMoney: true,
      debounceState: 'STABLE',
      hasCandidateHint: true,
      isTorchOn: true,
      torchOnDurationMs: 1130,
    });
    const ecoHold = governor.evaluate({
      timestamp: 5700,
      motionDeltaY: 0.4,
      luminance: 195,
      hasMoney: true,
      debounceState: 'STABLE',
      hasCandidateHint: true,
      isTorchOn: true,
      torchOnDurationMs: 3700,
    });
    assert.strictEqual(ecoHold.powerState, 'ECO', 'Steady hold >= 2500ms must enter ECO mode');
    assert.strictEqual(ecoHold.inferenceIntervalMs, 650);
    assert.strictEqual(ecoHold.previewAlpha, 0.08);
    assert.strictEqual(
      torch.onLuminanceSample(250, 16000, { ambientSensorLux: 120, hasActiveDetection: true }).guardReason,
      'ACTIVE_DETECTION_LOCK',
      'Torch must stay locked ON while banknote is in frame'
    );

    // 6. User withdraws banknote (3 empty frames) -> Immediate audio preemption + empty.wav -> Phone left idle on table -> HIBERNATION + Auto-Torch Thermal Cutoff
    for (let f = 0; f < 3; f++) {
      lastDebounced = debounce.process([], 16100 + f * 130);
    }
    assert.strictEqual(lastDebounced.state, 'EMPTY');
    torch.setHasActiveDetection(false);
    await audioController.handleDetectionUpdate([]);
    assert.strictEqual(hapticNotifier.removedCount, 1);

    // Phone sits completely still on table from t = 17,000ms to t = 32,500ms (15,500ms static empty)
    governor.evaluate({
      timestamp: 17000,
      motionDeltaY: 0.1,
      luminance: 40,
      hasMoney: false,
      debounceState: 'EMPTY',
      hasCandidateHint: false,
      isTorchOn: true,
      torchOnDurationMs: 15000,
    });
    governor.evaluate({
      timestamp: 17130,
      motionDeltaY: 0.1,
      luminance: 40,
      hasMoney: false,
      debounceState: 'EMPTY',
      hasCandidateHint: false,
      isTorchOn: true,
      torchOnDurationMs: 15130,
    });
    governor.evaluate({
      timestamp: 20000,
      motionDeltaY: 0.1,
      luminance: 40,
      hasMoney: false,
      debounceState: 'EMPTY',
      hasCandidateHint: false,
      isTorchOn: true,
      torchOnDurationMs: 18000,
    });
    const hibAndCutoff = governor.evaluate({
      timestamp: 32500,
      motionDeltaY: 0.1,
      luminance: 40,
      hasMoney: false,
      debounceState: 'EMPTY',
      hasCandidateHint: false,
      isTorchOn: true,
      torchOnDurationMs: 30500,
    });
    assert.strictEqual(hibAndCutoff.powerState, 'HIBERNATION');
    assert.strictEqual(hibAndCutoff.shouldStopCameraRepeating, true);
    assert.strictEqual(hibAndCutoff.previewAlpha, 0.0);
    assert.strictEqual(hibAndCutoff.shouldAutoCutoffIdleTorch, true);

    const thermalOff = torch.handleIdleThermalCutoff(32500);
    assert.strictEqual(thermalOff.action, 'TURN_OFF');
    assert.strictEqual(thermalOff.reason, 'IDLE_THERMAL_CUTOFF');
    assert.strictEqual(torch.getState().isTorchOn, false);

    audioController.destroy();
  });

  await t.test('Compiled Universal Release APK (Android 9.0+ / API 28-34): classes.dex contains all Ticket 08, 09, 10 & Author symbols and passes full cryptographic verification', () => {
    const apkPath = path.join(projectRoot, 'release', 'com.nckh.moneyvision-v1.0.0-universal-release.apk');
    assert.ok(fs.existsSync(apkPath), 'Universal Release APK must exist at release/com.nckh.moneyvision-v1.0.0-universal-release.apk');

    // 1. Verify all 10 core security/packaging criteria + Author attribution
    const verifyRes = verifyAllCriteria(projectRoot);
    assert.strictEqual(verifyRes.allPassed, true, 'All 10 core criteria and Author check must pass');
    assert.strictEqual(verifyRes.passedCount, 10);

    // 2. Inspect APK archive structure & extract classes.dex to verify compiled bytecode strings from Tickets 08, 09, 10
    const apkBuf = fs.readFileSync(apkPath);
    const eocd = apkBuf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const cdOffset = apkBuf.readUInt32LE(eocd + 16);
    const cdSize = apkBuf.readUInt32LE(eocd + 12);

    let cur = cdOffset;
    let dexBuffer = null;

    while (cur < cdOffset + cdSize) {
      if (apkBuf.readUInt32LE(cur) !== 0x02014b50) break;
      const method = apkBuf.readUInt16LE(cur + 10);
      const compSize = apkBuf.readUInt32LE(cur + 20);
      const fnLen = apkBuf.readUInt16LE(cur + 28);
      const extraLen = apkBuf.readUInt16LE(cur + 30);
      const commentLen = apkBuf.readUInt16LE(cur + 32);
      const localOffset = apkBuf.readUInt32LE(cur + 42);
      const name = apkBuf.toString('utf8', cur + 46, cur + 46 + fnLen);

      if (name === 'classes.dex') {
        const localExtraLen = apkBuf.readUInt16LE(localOffset + 28);
        const dataOffset = localOffset + 30 + fnLen + localExtraLen;
        const rawSlice = apkBuf.subarray(dataOffset, dataOffset + compSize);
        dexBuffer = method === 8 ? zlib.inflateRawSync(rawSlice) : rawSlice;
        break;
      }
      cur += 46 + fnLen + extraLen + commentLen;
    }

    assert.ok(dexBuffer && dexBuffer.length > 100000, 'Must extract valid classes.dex from Universal APK');
    assert.strictEqual(dexBuffer.toString('ascii', 0, 4), 'dex\n', 'classes.dex must have valid DEX magic header');

    const dexText = dexBuffer.toString('utf8');
    // Ticket 08 symbols in compiled DEX
    for (const sym of ['postTorchBaselineLuma', 'isOscillationLatched', 'preTorchAmbientSensorLux']) {
      assert.ok(dexText.includes(sym), `Compiled classes.dex must contain Ticket 08 symbol: ${sym}`);
    }
    // Ticket 09 symbols in compiled DEX
    for (const sym of ['HIBERNATION', 'NORM_LUT', 'reusableHitAnchors', 'consecutiveFalseImuWakes', 'getCurrentThermalStatus']) {
      assert.ok(dexText.includes(sym), `Compiled classes.dex must contain Ticket 09 symbol: ${sym}`);
    }
    // Ticket 10 symbols in compiled DEX
    for (const sym of [
      'isPointerInsideSafeZone',
      'triggerCandidateGuidancePulse',
      'getDenominationVibrationPattern',
      'isSimulationDrawerOpen',
      'abandonAudioFocusNow',
    ]) {
      assert.ok(dexText.includes(sym), `Compiled classes.dex must contain Ticket 10 symbol: ${sym}`);
    }
    // Author attribution in compiled DEX
    assert.ok(dexText.includes('Nguyễn Quang Toàn'), 'Compiled classes.dex must contain author attribution Nguyễn Quang Toàn');
  });
});

test('19. Tickets 12, 13 & 14: Smart Manual-OFF Torch Recovery, Multi-Note Presentation Wallet & Audio Preemption', async (t) => {
  await t.test('19.1 Manual-OFF Re-Arm in Dim Indoor Room (>= 35 luma): clears isManualOverride and re-triggers auto-torch in darkness', () => {
    assert.strictEqual(MANUAL_OFF_SETTLE_MS, 250);
    assert.strictEqual(MANUAL_OFF_MOTION_ARM_DELAY_MS, 400);
    assert.strictEqual(MANUAL_OFF_REARM_LUMA_LUX, 35);
    assert.strictEqual(MANUAL_OFF_DARK_GRACE_MS, 2500);
    assert.strictEqual(MANUAL_OFF_DARKENING_DROP_LUX, 6);
    assert.strictEqual(MANUAL_OFF_MOTION_DELTA_Y, 4.5);
    assert.strictEqual(MANUAL_OFF_IMU_ACCEL_DELTA, 0.35);

    const torch = new SmartTorchController();

    // 1. Dark room (15 luma) -> auto-torch turns ON after 1000ms
    torch.onLuminanceSample(15, 0);
    const autoOn = torch.onLuminanceSample(15, 1000);
    assert.strictEqual(autoOn.action, 'TURN_ON');
    assert.strictEqual(torch.getState().isTorchOn, true);

    // 2. User manually double-taps to turn torch OFF at t = 1500ms
    const manualOff = torch.handleManualToggle(false, 1500);
    assert.strictEqual(manualOff.action, 'TURN_OFF');
    assert.strictEqual(torch.getState().isTorchOn, false);
    assert.strictEqual(torch.getState().isManualOverride, true);

    // 3. User walks into a dim indoor room (38 luma, < 60 luma old threshold, >= 35 luma Path A threshold) at t = 2000ms (> 250ms settle)
    const dimRoom = torch.onLuminanceSample(38, 2000, {
      glareRatio: 0.0,
      centerToBorderRatio: 1.0,
    });
    assert.strictEqual(dimRoom.action, 'NO_OP');
    assert.strictEqual(
      torch.getState().isManualOverride,
      false,
      'Dim indoor room (38 luma >= 35 luma) must clear isManualOverride without requiring >= 60 luma'
    );

    // 4. User re-enters a dark corner (10 luma for 1000ms) -> auto-torch turns ON automatically!
    torch.onLuminanceSample(10, 3000);
    const reTrigger = torch.onLuminanceSample(10, 4000);
    assert.strictEqual(reTrigger.action, 'TURN_ON');
    assert.strictEqual(reTrigger.reason, 'LOW_LIGHT_AUTO');
    assert.strictEqual(torch.getState().isTorchOn, true);
  });

  await t.test('19.2 Stationary Dark Room Respect: holding phone still in dark room after manual OFF keeps isManualOverride true indefinitely', () => {
    const torch = new SmartTorchController();
    torch.onLuminanceSample(15, 0);
    torch.onLuminanceSample(15, 1000); // auto ON
    torch.handleManualToggle(false, 1500); // manual OFF in dark room (15 luma)

    // Hold phone stationary (frameDeltaY < 4.5, imuLinearAccelDelta < 0.35, lumaDrop < 6) through t = 30,000ms
    for (let ts = 1800; ts <= 30000; ts += 500) {
      const action = torch.onLuminanceSample(15, ts, {
        frameDeltaY: 0.8,
        imuLinearAccelDelta: 0.05,
      });
      assert.strictEqual(action.action, 'NO_OP', `Torch must stay OFF at t=${ts}ms when stationary`);
      assert.strictEqual(torch.getState().isTorchOn, false);
      assert.strictEqual(
        torch.getState().isManualOverride,
        true,
        `isManualOverride must remain true at t=${ts}ms when stationary in same dark room`
      );
      assert.strictEqual(torch.getState().hasMovedSinceManualOff, false);
    }
  });

  await t.test('19.3 Dark-to-Dark Motion + Grace Recovery: repositioning phone or further darkening re-arms auto-torch after 2.5s grace + 1.0s confirm', () => {
    // Sub-case A: Optical or IMU repositioning motion in dark room (18 luma)
    const torchMotion = new SmartTorchController();
    torchMotion.onLuminanceSample(18, 0);
    torchMotion.onLuminanceSample(18, 1000); // auto ON
    torchMotion.handleManualToggle(false, 2000); // manual OFF at t = 2000ms

    // Settle baseline at t = 2300ms (18 luma)
    torchMotion.onLuminanceSample(18, 2300, { frameDeltaY: 0.2, imuLinearAccelDelta: 0.02 });
    assert.strictEqual(torchMotion.getState().manualOffBaselineLuma, 18);

    // User repositions phone to scan a new banknote at t = 2600ms (elapsed = 600ms > 400ms motion arm delay)
    torchMotion.onLuminanceSample(18, 2600, { frameDeltaY: 6.2, imuLinearAccelDelta: 0.42 });
    assert.strictEqual(torchMotion.getState().hasMovedSinceManualOff, true);
    assert.strictEqual(torchMotion.getState().isManualOverride, true, 'Still within 2500ms dark grace window');

    // At t = 4500ms (elapsed = 2500ms >= MANUAL_OFF_DARK_GRACE_MS), Path B unlocks isManualOverride and starts 1000ms low-light timer
    const unlockSample = torchMotion.onLuminanceSample(18, 4500, { frameDeltaY: 0.3 });
    assert.strictEqual(unlockSample.action, 'NO_OP');
    assert.strictEqual(torchMotion.getState().isManualOverride, false, 'Path B must clear isManualOverride at 2500ms grace');

    // 1000ms later at t = 5500ms (3.5s total since manual OFF), auto-torch turns ON!
    const reOnMotion = torchMotion.onLuminanceSample(18, 5500, { frameDeltaY: 0.3 });
    assert.strictEqual(reOnMotion.action, 'TURN_ON');
    assert.strictEqual(reOnMotion.reason, 'LOW_LIGHT_AUTO');
    assert.strictEqual(torchMotion.getState().isTorchOn, true);

    // Sub-case B: Further darkening drop (>= 6 luma drop, e.g. 18 -> 11 luma) even without large motion
    const torchDarkDrop = new SmartTorchController();
    torchDarkDrop.handleManualToggle(false, 1000);
    torchDarkDrop.onLuminanceSample(18, 1300, { frameDeltaY: 0.2, imuLinearAccelDelta: 0.02 }); // baseline = 18
    assert.strictEqual(torchDarkDrop.getState().manualOffBaselineLuma, 18);

    // Scene darkens to 11 luma (drop = 7 >= 6) at t = 3500ms (elapsed = 2500ms)
    torchDarkDrop.onLuminanceSample(11, 3500, { frameDeltaY: 0.2, imuLinearAccelDelta: 0.02 });
    assert.strictEqual(torchDarkDrop.getState().isManualOverride, false, 'Further darkening drop >= 6 luma must clear isManualOverride after 2500ms');

    const reOnDarkDrop = torchDarkDrop.onLuminanceSample(11, 4500, { frameDeltaY: 0.2, imuLinearAccelDelta: 0.02 });
    assert.strictEqual(reOnDarkDrop.action, 'TURN_ON');
    assert.strictEqual(torchDarkDrop.getState().isTorchOn, true);
  });

  await t.test('19.4 Post-OFF Settle Window (250ms) & Double-Tap Jitter Guard (400ms): ignores LED filament decay and tap vibration', () => {
    const torch = new SmartTorchController();
    torch.handleManualToggle(false, 1000);

    // At t = 1100ms (elapsed = 100ms <= 250ms settle window):
    // Residual torch LED decay (180 luma) and huge optical delta (42.0) + finger tap IMU spike (1.1 m/s^2)
    const decaySample = torch.onLuminanceSample(180, 1100, {
      frameDeltaY: 42.0,
      imuLinearAccelDelta: 1.1,
    });
    assert.strictEqual(decaySample.action, 'NO_OP');
    assert.strictEqual(torch.getState().isManualOverride, true, '180 luma during 250ms LED decay must NOT clear isManualOverride');
    assert.strictEqual(torch.getState().manualOffBaselineLuma, null, 'Baseline must NOT be captured during 250ms settle window');
    assert.strictEqual(torch.getState().hasMovedSinceManualOff, false, 'Motion must NOT latch during 250ms settle window');

    // At t = 1300ms (elapsed = 300ms: > 250ms settle window, but <= 400ms motion arm delay):
    // Luma has settled to 15, but finger lift jitter (frameDeltaY: 7.5, imuLinearAccelDelta: 0.6) is still present
    torch.onLuminanceSample(15, 1300, {
      frameDeltaY: 7.5,
      imuLinearAccelDelta: 0.6,
    });
    assert.strictEqual(torch.getState().manualOffBaselineLuma, 15, 'True dark baseline (15 luma) captured after 250ms settle');
    assert.strictEqual(torch.getState().hasMovedSinceManualOff, false, 'Double-tap finger jitter within 400ms must NOT latch hasMovedSinceManualOff');
  });

  await t.test('19.5 Multi-Note Flicker, Single-Note Pan & Same-Count Denomination Refinement Wallet Protection', () => {
    assert.strictEqual(PRESENTATION_EMPTY_RESET_MS, 1200);
    assert.strictEqual(PRESENTATION_CONTINUITY_GRACE_MS, 1500);
    assert.strictEqual(DENOMINATION_REFINEMENT_WINDOW_MS, 1500);
    const walletAcc = new PresentationWalletAccumulator();

    const note50k_1 = [{ classId: 50000, count: 1, label: 'Năm mươi nghìn', totalAmount: 50000 }];
    const note50k_2 = [{ classId: 50000, count: 2, label: 'Năm mươi nghìn', totalAmount: 100000 }];

    // Scenario A: {50k: 2} -> {50k: 1} -> {50k: 2}
    const step1 = walletAcc.updatePresentation({ state: 'STABLE', items: note50k_2 }, 1000);
    assert.strictEqual(step1.addedCount, 2);
    assert.strictEqual(step1.addedAmount, 100000);
    assert.strictEqual(step1.walletTotalAmount, 100000);
    assert.strictEqual(step1.walletTotalCount, 2);

    // Flicker down to 1 note at t = 1400ms
    const step2 = walletAcc.updatePresentation({ state: 'STABLE', items: note50k_1 }, 1400);
    assert.strictEqual(step2.addedCount, 0);
    assert.strictEqual(step2.addedAmount, 0);
    assert.strictEqual(step2.walletTotalAmount, 100000);
    assert.strictEqual(step2.walletTotalCount, 2);

    // Flicker back up to 2 notes at t = 1800ms -> MUST NOT add a 3rd 50k note!
    const step3 = walletAcc.updatePresentation({ state: 'STABLE', items: note50k_2 }, 1800);
    assert.strictEqual(step3.addedCount, 0, 'Recovering from 2->1->2 flicker must add 0 notes');
    assert.strictEqual(step3.addedAmount, 0);
    assert.strictEqual(step3.walletTotalAmount, 100000, 'Wallet total must remain 100,000 VND (never 150,000 VND)');
    assert.strictEqual(step3.walletTotalCount, 2);

    // Scenario B: Staggered entry {50k: 1} -> {50k: 2} -> {50k: 1} -> {50k: 2}
    walletAcc.reset();
    const s1 = walletAcc.updatePresentation({ state: 'STABLE', items: note50k_1 }, 2000);
    assert.strictEqual(s1.addedCount, 1);
    assert.strictEqual(s1.walletTotalAmount, 50000);

    const s2 = walletAcc.updatePresentation({ state: 'STABLE', items: note50k_2 }, 2300);
    assert.strictEqual(s2.addedCount, 1);
    assert.strictEqual(s2.walletTotalAmount, 100000);

    const s3 = walletAcc.updatePresentation({ state: 'STABLE', items: note50k_1 }, 2600);
    assert.strictEqual(s3.addedCount, 0);
    assert.strictEqual(s3.walletTotalAmount, 100000);

    const s4 = walletAcc.updatePresentation({ state: 'STABLE', items: note50k_2 }, 2900);
    assert.strictEqual(s4.addedCount, 0);
    assert.strictEqual(s4.walletTotalAmount, 100000);
    assert.strictEqual(s4.walletTotalCount, 2);

    // Scenario C: Single-Note Pan {100k: 1} -> {200k: 1} -> {100k: 1, 200k: 1} = 300k (2 notes)
    walletAcc.reset();
    const note100k_1 = [{ classId: 100000, count: 1, label: 'Một trăm nghìn', totalAmount: 100000 }];
    const note200k_1 = [{ classId: 200000, count: 1, label: 'Hai trăm nghìn', totalAmount: 200000 }];
    const note100k_200k = [
      { classId: 100000, count: 1, label: 'Một trăm nghìn', totalAmount: 100000 },
      { classId: 200000, count: 1, label: 'Hai trăm nghìn', totalAmount: 200000 },
    ];
    walletAcc.onStableDetection(note100k_1, 3000);
    walletAcc.onStableDetection(note200k_1, 3400);
    const panBoth = walletAcc.onStableDetection(note100k_200k, 3800);
    assert.strictEqual(panBoth.walletTotalAmount, 300000, 'Single-note pan to both notes must equal 300,000 VND');
    assert.strictEqual(panBoth.walletTotalCount, 2, 'Single-note pan to both notes must equal 2 notes');

    // Scenario D: Simultaneous Same-Count Multi-Note Denomination Refinement ({100k: 1, 20k: 1} -> {100k: 1, 50k: 1})
    walletAcc.reset();
    const initialMisread = [
      { classId: 100000, count: 1, label: 'Một trăm nghìn', totalAmount: 100000 },
      { classId: 20000, count: 1, label: 'Hai mươi nghìn', totalAmount: 20000 },
    ];
    const refinedCorrect = [
      { classId: 100000, count: 1, label: 'Một trăm nghìn', totalAmount: 100000 },
      { classId: 50000, count: 1, label: 'Năm mươi nghìn', totalAmount: 50000 },
    ];
    const r1 = walletAcc.onStableDetection(initialMisread, 5000);
    assert.strictEqual(r1.walletTotalAmount, 120000);
    assert.strictEqual(r1.walletTotalCount, 2);
    const r2 = walletAcc.onStableDetection(refinedCorrect, 5600);
    assert.strictEqual(r2.walletTotalAmount, 150000, 'Same-count refinement must replace 20k with 50k in place (150k)');
    assert.strictEqual(r2.walletTotalCount, 2, 'Same-count refinement must keep exact 2 notes (not 3)');
  });

  await t.test('19.6 Brief (< 1500ms) Empty Dropout Expansion & Sequential Presentation Accumulation (>= 1200ms empty gap)', () => {
    const walletAcc = new PresentationWalletAccumulator();
    const note50k_1 = [{ classId: 50000, count: 1, label: 'Năm mươi nghìn', totalAmount: 50000 }];

    // Part A: 1st presentation: 1x 50k at t = 1000ms
    const p1 = walletAcc.updatePresentation({ state: 'STABLE', items: note50k_1 }, 1000);
    assert.strictEqual(p1.walletTotalAmount, 50000);
    assert.strictEqual(p1.walletTotalCount, 1);

    // Brief empty dropout (< 1200ms): empty from t = 1500ms to t = 2200ms (700ms < 1200ms)
    walletAcc.updatePresentation({ state: 'EMPTY', items: [] }, 1500);
    const briefEmpty = walletAcc.updatePresentation({ state: 'EMPTY', items: [] }, 2200);
    assert.strictEqual(briefEmpty.presentationReset, false, 'Empty gap < 1200ms must not reset presentation high-water mark');

    // Same 50k note re-appears at t = 2300ms -> NOT double counted
    const sameNote = walletAcc.updatePresentation({ state: 'STABLE', items: note50k_1 }, 2300);
    assert.strictEqual(sameNote.addedCount, 0);
    assert.strictEqual(sameNote.walletTotalAmount, 50000);

    // Genuine withdrawal (>= 1200ms empty): empty from t = 3000ms to t = 4300ms (1300ms >= 1200ms)
    walletAcc.updatePresentation({ state: 'EMPTY', items: [] }, 3000);
    const fullReset = walletAcc.updatePresentation({ state: 'EMPTY', items: [] }, 4300);
    assert.strictEqual(fullReset.presentationReset, true, 'Empty gap >= 1200ms must reset presentation high-water mark');

    // 2nd distinct presentation: user puts a second 50k bill into camera at t = 4500ms -> accumulates to 100,000 VND (2 notes)!
    const p2 = walletAcc.updatePresentation({ state: 'STABLE', items: note50k_1 }, 4500);
    assert.strictEqual(p2.addedCount, 1);
    assert.strictEqual(p2.addedAmount, 50000);
    assert.strictEqual(p2.walletTotalAmount, 100000);
    assert.strictEqual(p2.walletTotalCount, 2);

    // Part B: Brief (< 1500ms) Empty Dropout During Grip Adjustment ({100k: 1} -> EMPTY 600ms -> {100k: 2})
    walletAcc.reset();
    const note100k_1 = [{ classId: 100000, count: 1, label: 'Một trăm nghìn', totalAmount: 100000 }];
    const note100k_2 = [{ classId: 100000, count: 2, label: 'Một trăm nghìn', totalAmount: 200000 }];
    const g1 = walletAcc.onStableDetection(note100k_1, 1000);
    assert.strictEqual(g1.walletTotalAmount, 100000);
    assert.strictEqual(g1.walletTotalCount, 1);

    walletAcc.onEmptyFrame(1400);
    // 600ms later (< 1500ms), user finishes adjusting grip and both 100k notes are visible
    const g2 = walletAcc.onStableDetection(note100k_2, 2000);
    assert.strictEqual(g2.walletTotalAmount, 200000, 'Brief <1500ms empty dropout before 2-note expansion must reconcile to 200k (not 300k)');
    assert.strictEqual(g2.walletTotalCount, 2, 'Wallet count must be 2 notes (not 3)');

    // Subsequent EMPTY followed by a new single 50k note accumulates normally to 250k (3 notes)
    walletAcc.onEmptyFrame(2600);
    const g3 = walletAcc.onStableDetection(note50k_1, 3100);
    assert.strictEqual(g3.walletTotalAmount, 250000);
    assert.strictEqual(g3.walletTotalCount, 3);
  });

  await t.test('19.7 Multi-Note Upgrade Audio Preemption (1 -> 2 notes): immediately stops 1-note speech and announces 2-note upgrade', async () => {
    const driver = new SimulatedAudioDriver(80);
    const haptic = new DefaultHapticNotifier();
    const controller = new SmartPreemptionController({
      driver,
      hapticNotifier: haptic,
      interClipGapMs: 10,
    });

    // 1. 1st note (50k x 1) stabilizes first and begins speaking ['tick', 'vnd_50k'] (~170ms total)
    const p1 = controller.handleDetectionUpdate(
      [{ classId: 50000, count: 1, label: 'Năm mươi nghìn', totalAmount: 50000 }],
      1000
    );

    await new Promise(r => setTimeout(r, 30));
    assert.strictEqual(controller.isSpeaking(), true);

    // 2. 30ms later (while 1-note announcement is still speaking), 2nd note stabilizes ({50000: 2})
    const p2 = controller.handleDetectionUpdate(
      [{ classId: 50000, count: 2, label: 'Năm mươi nghìn', totalAmount: 100000 }],
      1030
    );

    await Promise.all([p1, p2]);
    await new Promise(r => setTimeout(r, 50));

    const played = driver.getPlayedClips();
    // Must contain the upgraded 2-note sequence ['qty_2', 'vnd_50k']
    const qty2Idx = played.indexOf('qty_2');
    assert.ok(qty2Idx !== -1, 'Upgraded 2-note announcement must play qty_2');
    assert.strictEqual(played[qty2Idx + 1], 'vnd_50k', 'qty_2 must be followed by vnd_50k ("Hai tờ Năm mươi nghìn")');
    assert.strictEqual(controller.getLastAnnouncedSignature(), '50000:2');

    controller.destroy();
  });

  await t.test('19.8 Downward-Flicker Audio Suppression (2 -> 1 -> 2 notes): suppresses redundant 1-note and 2-note announcements during flicker', async () => {
    const driver = new SimulatedAudioDriver(10);
    const haptic = new DefaultHapticNotifier();
    const controller = new SmartPreemptionController({
      driver,
      hapticNotifier: haptic,
      interClipGapMs: 5,
    });

    // 1. Announce 2 notes of 50k ('tick', 'qty_2', 'vnd_50k')
    await controller.handleDetectionUpdate(
      [{ classId: 50000, count: 2, label: 'Năm mươi nghìn', totalAmount: 100000 }],
      1000
    );
    const countAfterInitial2Notes = driver.getPlayedClips().length;
    assert.strictEqual(countAfterInitial2Notes, 3);

    // 2. Transient downward flicker to {50000: 1} at t = 1400ms -> MUST stay completely silent!
    await controller.handleDetectionUpdate(
      [{ classId: 50000, count: 1, label: 'Năm mươi nghìn', totalAmount: 50000 }],
      1400
    );
    assert.strictEqual(
      driver.getPlayedClips().length,
      countAfterInitial2Notes,
      'Downward flicker from {50k: 2} to {50k: 1} must NOT announce "Năm mươi nghìn"'
    );

    // 3. Recovery back to {50000: 2} at t = 1800ms -> MUST also stay silent!
    await controller.handleDetectionUpdate(
      [{ classId: 50000, count: 2, label: 'Năm mươi nghìn', totalAmount: 100000 }],
      1800
    );
    assert.strictEqual(
      driver.getPlayedClips().length,
      countAfterInitial2Notes,
      'Recovery from {50k: 1} back to {50k: 2} must NOT re-announce "Hai tờ Năm mươi nghìn"'
    );

    // 4. Genuine upgrade to {50000: 3} at t = 2200ms -> announces "Ba tờ Năm mươi nghìn" ('qty_3', 'vnd_50k')!
    await controller.handleDetectionUpdate(
      [{ classId: 50000, count: 3, label: 'Năm mươi nghìn', totalAmount: 150000 }],
      2200
    );
    assert.strictEqual(driver.getPlayedClips().length, countAfterInitial2Notes + 2);
    assert.deepStrictEqual(driver.getPlayedClips().slice(-2), ['qty_3', 'vnd_50k']);

    controller.destroy();
  });

  await t.test('19.9 Wallet Readout Lock (isReadingWallet) & Compiled Universal APK Bytecode Verification for Tickets 12 & 13', async () => {
    const driver = new SimulatedAudioDriver(45);
    const haptic = new DefaultHapticNotifier();
    const controller = new SmartPreemptionController({
      driver,
      hapticNotifier: haptic,
      interClipGapMs: 5,
    });

    const wallet = {
      totalAmount: 250000,
      totalNotesCount: 3,
      history: [
        { classId: 200000, count: 1, label: 'Hai trăm nghìn', totalAmount: 200000 },
        { classId: 50000, count: 2, label: 'Năm mươi nghìn', totalAmount: 100000 },
      ],
      lastUpdated: 1000,
    };

    // Start Long-Press wallet readout (['qty_1', 'vnd_200k', 'qty_2', 'vnd_50k'])
    const readoutPromise = controller.handleLongPress(wallet);
    await new Promise(r => setTimeout(r, 20));
    assert.strictEqual(controller.isReadingWalletActive(), true);

    // Camera frame updates (both money detection and empty frame) arrive while wallet is being read out
    await controller.handleDetectionUpdate(
      [{ classId: 500000, count: 1, label: 'Năm trăm nghìn', totalAmount: 500000 }],
      1050
    );
    await controller.handleDetectionUpdate([], 1100);

    await readoutPromise;
    assert.strictEqual(controller.isReadingWalletActive(), false);

    // Verify the wallet sequence completed uninterrupted and was NOT preempted by vnd_500k or empty
    const played = driver.getPlayedClips();
    assert.deepStrictEqual(
      played,
      ['qty_1', 'vnd_200k', 'qty_2', 'vnd_50k'],
      'Wallet readout must complete all clips without camera frame interruption'
    );

    controller.destroy();

    // Verify native source files and compiled Universal Release APK classes.dex contain all Ticket 12 & 13 symbols
    const projectRoot = process.cwd();
    const sdkBuilderContent = fs.readFileSync(
      path.join(projectRoot, 'scripts', 'android-sdk-builder.mjs'),
      'utf8'
    );
    const cameraViewKtContent = fs.readFileSync(
      path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        'com',
        'nckh',
        'moneyvision',
        'camera',
        'MoneyCameraView.kt'
      ),
      'utf8'
    );

    for (const sym of [
      'MANUAL_OFF_SETTLE_MS',
      'MANUAL_OFF_MOTION_ARM_DELAY_MS',
      'MANUAL_OFF_REARM_LUMA_LUX',
      'MANUAL_OFF_DARK_GRACE_MS',
      'MANUAL_OFF_DARKENING_DROP_LUX',
      'manualOffBaselineLuma',
      'hasMovedSinceManualOff',
    ]) {
      assert.ok(sdkBuilderContent.includes(sym), `MainActivity.java must include Ticket 12 symbol: ${sym}`);
      assert.ok(cameraViewKtContent.includes(sym), `MoneyCameraView.kt must include Ticket 12 symbol: ${sym}`);
    }

    for (const sym of [
      'PRESENTATION_EMPTY_RESET_MS',
      'PRESENTATION_CONTINUITY_GRACE_MS',
      'DENOMINATION_REFINEMENT_WINDOW_MS',
      'walletBaselineNotes',
      'presentationCreditedNotes',
      'presentationMaxCounts',
      'presentationPeakAnnouncedCounts',
      'currentlyAnnouncingNotesCount',
      'isReadingWallet',
    ]) {
      assert.ok(sdkBuilderContent.includes(sym), `MainActivity.java must include Ticket 13 symbol: ${sym}`);
    }

    const apkPath = path.join(projectRoot, 'release', 'com.nckh.moneyvision-v1.0.0-universal-release.apk');
    const apkBuf = fs.readFileSync(apkPath);
    const eocd = apkBuf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const cdOffset = apkBuf.readUInt32LE(eocd + 16);
    const cdSize = apkBuf.readUInt32LE(eocd + 12);

    let cur = cdOffset;
    let dexBuffer = null;
    while (cur < cdOffset + cdSize) {
      if (apkBuf.readUInt32LE(cur) !== 0x02014b50) break;
      const method = apkBuf.readUInt16LE(cur + 10);
      const compSize = apkBuf.readUInt32LE(cur + 20);
      const fnLen = apkBuf.readUInt16LE(cur + 28);
      const extraLen = apkBuf.readUInt16LE(cur + 30);
      const commentLen = apkBuf.readUInt16LE(cur + 32);
      const localOffset = apkBuf.readUInt32LE(cur + 42);
      const name = apkBuf.toString('utf8', cur + 46, cur + 46 + fnLen);
      if (name === 'classes.dex') {
        const localExtraLen = apkBuf.readUInt16LE(localOffset + 28);
        const dataOffset = localOffset + 30 + fnLen + localExtraLen;
        const rawSlice = apkBuf.subarray(dataOffset, dataOffset + compSize);
        dexBuffer = method === 8 ? zlib.inflateRawSync(rawSlice) : rawSlice;
        break;
      }
      cur += 46 + fnLen + extraLen + commentLen;
    }

    assert.ok(dexBuffer && dexBuffer.length > 100000, 'Universal APK must contain valid classes.dex');
    const dexText = dexBuffer.toString('utf8');
    for (const sym of [
      'manualOffTimestampMs',
      'manualOffBaselineLuma',
      'hasMovedSinceManualOff',
      'walletBaselineNotes',
      'presentationCreditedNotes',
      'presentationMaxCounts',
      'presentationPeakAnnouncedCounts',
      'currentlyAnnouncingNotesCount',
      'isReadingWallet',
    ]) {
      assert.ok(dexText.includes(sym), `Compiled classes.dex must contain Ticket 12/13 symbol: ${sym}`);
    }
  });
});

test('20. Tickets 15-18: De-AI-Slop UI/UX Overhaul & Accessible Material 3 Design Verification', async (t) => {
  const projectRoot = process.cwd();

  await t.test('20.1 Design Tokens & Typography: Sans-serif for labels, Tabular Mono for currency, Material 3 card tokens', () => {
    assert.strictEqual(THEME.typography.fontFamilySans, 'sans-serif');
    assert.strictEqual(THEME.typography.fontFamilyTabular, 'monospace');
    assert.strictEqual(THEME.typography.fontSizeHero, 64);
    assert.strictEqual(THEME.layout.cardBorderRadius, 12);
    assert.strictEqual(THEME.layout.pillBorderRadius, 9999);
    assert.strictEqual(THEME.layout.minTouchTargetDp, 44);
    assert.strictEqual(THEME.layout.accessibleTouchTarget48Dp, 48);
  });

  await t.test('20.2 React Native TactileDisplay.tsx Clean UI: no emoji salad, no 4-line cheat sheet, 100% testIDs preserved', () => {
    const tactilePath = path.join(projectRoot, 'src', 'components', 'TactileDisplay.tsx');
    const content = fs.readFileSync(tactilePath, 'utf8');

    // Clean button texts
    assert.ok(content.includes('ĐÈN PIN: BẬT'), 'TactileDisplay.tsx must use clean text ĐÈN PIN: BẬT');
    assert.ok(content.includes('ĐÈN PIN: TẮT'), 'TactileDisplay.tsx must use clean text ĐÈN PIN: TẮT');
    assert.ok(content.includes('KIỂM THỬ'), 'TactileDisplay.tsx must use clean text KIỂM THỬ');
    assert.ok(content.includes('VÍ TÍCH LŨY (PHIÊN)'), 'TactileDisplay.tsx must use clean text VÍ TÍCH LŨY');
    assert.ok(content.includes('XÓA VÍ'), 'TactileDisplay.tsx must use clean text XÓA VÍ');

    // Rejection of emoji clutter
    assert.ok(!content.includes('🔦 ĐÈN:'), 'TactileDisplay.tsx must NOT contain flashlight emoji button text');
    assert.ok(!content.includes('🛠️ Kiểm thử'), 'TactileDisplay.tsx must NOT contain hammer/wrench emoji button text');
    assert.ok(!content.includes('👛 VÍ TÍCH LŨY'), 'TactileDisplay.tsx must NOT contain purse emoji in wallet title');
    assert.ok(!content.includes('[1 CHẠM] Nghe lại'), 'TactileDisplay.tsx must NOT contain legacy 4-line cheat sheet');

    // Required accessibility testIDs
    for (const testId of [
      'viewfinder-reticle',
      'polymer-color-badge',
      'power-state-badge',
      'torch-toggle-btn',
      'wallet-card-btn',
      'wallet-reset-btn',
      'open-author-modal-btn',
      'toggle-simulation-drawer-btn',
      'author-copyright-modal',
      'close-author-modal-btn',
    ]) {
      assert.ok(content.includes(`testID="${testId}"`), `TactileDisplay.tsx must preserve testID="${testId}"`);
    }
  });

  await t.test('20.3 Native Android MainActivity.java Mirroring: Sans-serif typeface, clean buttons, and author attribution', () => {
    const sdkBuilderPath = path.join(projectRoot, 'scripts', 'android-sdk-builder.mjs');
    const content = fs.readFileSync(sdkBuilderPath, 'utf8');

    assert.ok(content.includes('appTitleTv.setText("MONEY VISION")'), 'MainActivity must render MONEY VISION app title');
    assert.ok(content.includes('directTorchBtn.setText("ĐÈN PIN: TẮT")'), 'MainActivity must initialize clean torch button');
    assert.ok(content.includes('directTorchBtn.setText(isTorchOn ? "ĐÈN PIN: BẬT" : "ĐÈN PIN: TẮT")'), 'MainActivity must update clean torch text');
    assert.ok(content.includes('directWalletResetBtn.setText("XÓA VÍ")'), 'MainActivity must render clean XÓA VÍ button');
    assert.ok(content.includes('walletSummaryText.setText("VÍ TÍCH LŨY: 0 đ (0 tờ)")'), 'MainActivity must initialize clean wallet text');
    assert.ok(content.includes('● XANH LƠ TÍM (CYAN) • POLYMER'), 'MainActivity must use bullet swatch in polymer badge');
    assert.ok(!content.includes('🎨 XANH LƠ TÍM'), 'MainActivity must NOT use palette emoji in polymer badge');
  });

  await t.test('20.4 Inviolable Invariants: Author Nguyễn Quang Toàn Attribution & Zero-Network Manifest', () => {
    const authorPath = path.join(projectRoot, 'src', 'constants', 'author.ts');
    const authorContent = fs.readFileSync(authorPath, 'utf8');
    assert.ok(authorContent.includes('Nguyễn Quang Toàn'), 'author.ts must preserve author name');
    assert.ok(authorContent.includes('Chủ sở hữu & Nhà phát triển độc lập'), 'author.ts must preserve ownership role');
    assert.ok(authorContent.includes('© 2026 Nguyễn Quang Toàn - Sở hữu & Phát triển độc lập'), 'author.ts must preserve copyright');

    const manifestPath = path.join(projectRoot, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
    const strippedManifest = manifestContent.replace(/<!--[\s\S]*?-->/g, '');
    assert.ok(!strippedManifest.includes('android.permission.INTERNET'), 'Zero-Network invariant: no INTERNET permission');
  });
});

test('21. UI/UX Design System, Typography & Accessibility Audit (DESIGN.md, Chromatic Shift, Bottom Action Dock & De-AI-Slop)', async (t) => {
  const projectRoot = process.cwd();

  await t.test('21.1 Canonical DESIGN.md Specification Verification', () => {
    const designMdPath = path.join(projectRoot, 'DESIGN.md');
    assert.ok(fs.existsSync(designMdPath), 'DESIGN.md must exist at repository root');
    const designContent = fs.readFileSync(designMdPath, 'utf8');

    // Verify YAML frontmatter and key sections
    assert.ok(designContent.startsWith('---'), 'DESIGN.md must contain YAML frontmatter');
    assert.ok(designContent.includes('name: money-vision'), 'DESIGN.md must specify name: money-vision');
    assert.ok(designContent.includes('MoneyVision'), 'DESIGN.md must describe MoneyVision');
    assert.ok(designContent.includes('Nguyễn Quang Toàn'), 'DESIGN.md must attribute author Nguyễn Quang Toàn');
    assert.ok(designContent.includes('#000000'), 'DESIGN.md must specify #000000 background');
    assert.ok(designContent.includes('OLED'), 'DESIGN.md must specify OLED background');
    assert.ok(designContent.includes('#FFE600'), 'DESIGN.md must specify #FFE600 primary yellow');
    assert.ok(designContent.includes('Solar Yellow'), 'DESIGN.md must specify Solar Yellow');
    assert.ok(designContent.includes('48dp') || designContent.includes('48px'), 'DESIGN.md must specify 48dp/48px accessible touch target');

    // Verify all 9 Vietnamese banknote colors documented
    for (const color of ['#00E5FF', '#FF6D00', '#00E676', '#FF4081', '#40C4FF', '#FFD740', '#80D8FF', '#E0E0E0', '#FFF59D']) {
      assert.ok(designContent.includes(color), `DESIGN.md must document denomination color ${color}`);
    }
  });

  await t.test('21.2 Bottom Action Dock Ergonomics & 48dp Touch Targets in React Native & Native Android', () => {
    const tactilePath = path.join(projectRoot, 'src', 'components', 'TactileDisplay.tsx');
    const tactileContent = fs.readFileSync(tactilePath, 'utf8');

    // React Native: Torch button in walletRowContainer dock
    assert.ok(tactileContent.includes('styles.walletRowContainer'), 'TactileDisplay.tsx must have walletRowContainer dock');
    assert.ok(tactileContent.includes('testID="torch-toggle-btn"'), 'TactileDisplay.tsx must place torch-toggle-btn in dock');
    assert.ok(tactileContent.includes('testID="wallet-card-btn"'), 'TactileDisplay.tsx must place wallet-card-btn in dock');
    assert.ok(tactileContent.includes('testID="wallet-reset-btn"'), 'TactileDisplay.tsx must place wallet-reset-btn in dock');
    assert.ok(tactileContent.includes('minHeight: THEME.layout.accessibleTouchTarget48Dp'), 'Dock buttons must enforce 48dp minHeight');

    // Native Android: Torch button in walletRow dock
    const sdkBuilderPath = path.join(projectRoot, 'scripts', 'android-sdk-builder.mjs');
    const sdkContent = fs.readFileSync(sdkBuilderPath, 'utf8');
    assert.ok(sdkContent.includes('walletRow.addView(directTorchBtn'), 'MainActivity.java must place directTorchBtn in walletRow');
    assert.ok(sdkContent.includes('walletRow.addView(walletCard'), 'MainActivity.java must place walletCard in walletRow');
    assert.ok(sdkContent.includes('walletRow.addView(directWalletResetBtn'), 'MainActivity.java must place directWalletResetBtn in walletRow');
    assert.ok(sdkContent.includes('MIN_TOUCH_TARGET_DP = 48'), 'MainActivity.java must define MIN_TOUCH_TARGET_DP = 48');
    assert.ok(sdkContent.includes('ACCESSIBLE_TOUCH_TARGET_DP = 48'), 'MainActivity.java must define ACCESSIBLE_TOUCH_TARGET_DP = 48');
  });

  await t.test('21.3 Full-Screen Chromatic Shift Synchronization (Border Glow + Viewfinder Reticle + Polymer Badge)', () => {
    const edgePulsePath = path.join(projectRoot, 'src', 'components', 'EdgePulseBorder.tsx');
    const edgePulseContent = fs.readFileSync(edgePulsePath, 'utf8');
    assert.ok(edgePulseContent.includes('activeColor?: string'), 'EdgePulseBorder must support activeColor prop');
    assert.ok(edgePulseContent.includes('borderColor: activeColor'), 'EdgePulseBorder must apply activeColor to border');

    const appTsxPath = path.join(projectRoot, 'App.tsx');
    const appTsxContent = fs.readFileSync(appTsxPath, 'utf8');
    assert.ok(appTsxContent.includes('getActiveBorderGlowColor'), 'App.tsx must use getActiveBorderGlowColor helper');
    assert.ok(appTsxContent.includes('activeColor={activeBorderColor}'), 'App.tsx must pass activeColor to EdgePulseBorder');

    const themePath = path.join(projectRoot, 'src', 'constants', 'theme.ts');
    const themeContent = fs.readFileSync(themePath, 'utf8');
    assert.ok(themeContent.includes('export function getActiveBorderGlowColor'), 'theme.ts must export getActiveBorderGlowColor');

    // Verify all 9 denominations in Native Android pulseBorderDrawable
    const sdkBuilderPath = path.join(projectRoot, 'scripts', 'android-sdk-builder.mjs');
    const sdkContent = fs.readFileSync(sdkBuilderPath, 'utf8');
    assert.ok(sdkContent.includes('pulseBorderColor = (hasMoney && topDenom > 0L)'), 'MainActivity.java must dynamically compute pulseBorderColor');
    assert.ok(sdkContent.includes('Color.parseColor(getDenominationColorHex(topDenom))'), 'MainActivity.java must map denomination to hex color');
  });

  await t.test('21.4 De-AI-Slop Zero-Emoji Audit: Clean Typography Across React Native & Native Android', () => {
    const tactilePath = path.join(projectRoot, 'src', 'components', 'TactileDisplay.tsx');
    const tactileContent = fs.readFileSync(tactilePath, 'utf8');
    const simControlsPath = path.join(projectRoot, 'src', 'components', 'SimulationControls.tsx');
    const simControlsContent = fs.readFileSync(simControlsPath, 'utf8');
    const sdkBuilderPath = path.join(projectRoot, 'scripts', 'android-sdk-builder.mjs');
    const sdkContent = fs.readFileSync(sdkBuilderPath, 'utf8');

    // Disallowed AI-slop emojis in UI button text and labels
    const bannedEmojis = ['🔦', '👛', '🔄', '🛠️', 'ℹ️', '🔊', '☀️', '🌑', '▲', '▼', '🎨', '✕'];
    for (const emoji of bannedEmojis) {
      assert.ok(!tactileContent.includes(emoji), `TactileDisplay.tsx must not contain emoji ${emoji}`);
      assert.ok(!simControlsContent.includes(emoji), `SimulationControls.tsx must not contain emoji ${emoji}`);
    }

    // In MainActivity.java: controlsPanel & buttons must not have banned emojis
    const controlsPanelMatch = sdkContent.match(/buildControlsPanel\(\)\s*\{([\s\S]*?)return panel;/);
    assert.ok(controlsPanelMatch, 'buildControlsPanel definition must exist in MainActivity.java');
    const panelCode = controlsPanelMatch[1];
    for (const emoji of ['ℹ️', '🔊', '🔦', '👛', '🔄']) {
      assert.ok(!panelCode.includes(emoji), `buildControlsPanel must not contain emoji ${emoji}`);
    }

    // Verify typography tokens: Sans-serif for UI labels, Tabular Monospace for currency amounts
    assert.strictEqual(THEME.typography.fontFamilySans, 'sans-serif');
    assert.strictEqual(THEME.typography.fontFamilyTabular, 'monospace');
  });

  await t.test('21.5 Inviolable Invariants: Zero-Network Manifest & Author Attribution Nguyễn Quang Toàn', () => {
    const authorPath = path.join(projectRoot, 'src', 'constants', 'author.ts');
    const authorContent = fs.readFileSync(authorPath, 'utf8');
    assert.ok(authorContent.includes('Nguyễn Quang Toàn'), 'author.ts must name author Nguyễn Quang Toàn');
    assert.ok(authorContent.includes('Chủ sở hữu & Nhà phát triển độc lập'), 'author.ts must specify independent ownership');

    const manifestPath = path.join(projectRoot, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
    const stripped = manifestContent.replace(/<!--[\s\S]*?-->/g, '');
    assert.ok(!stripped.includes('android.permission.INTERNET'), 'Zero-Network invariant: no INTERNET permission in manifest');
  });
});


