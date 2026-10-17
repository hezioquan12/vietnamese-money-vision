import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DENOMINATION_NAMES } from '../types/money.ts';
import type {
  DetectedMoneyItem,
  DetectionState,
  GestureType,
  MoneyClass,
  SessionWalletState,
} from '../types/money.ts';
import { AUTHOR_INFO } from '../constants/author.ts';

import { formatDetectionSummary, formatSpokenVND } from '../utils/formatters.ts';
import { haptics } from '../services/haptics.ts';
import { SmartPreemptionController } from '../services/audio/SmartPreemptionController.ts';
import {
  AdaptivePowerGovernor,
  MOTION_BLUR_DELTA_Y_THRESHOLD,
  STATIC_HOLDING_DELTA_Y_THRESHOLD,
  SmartTorchController,
  cameraBridge,
  type LuminanceSampleContext,
  type PowerState,
  type ThermalLevel,
} from '../services/camera/index.ts';
import {
  PresentationWalletAccumulator,
  TemporalDebounceFilter,
  calculateAddedItemsDelta,
  type DebounceFilterResult,
} from '../services/debounce/index.ts';
import { detectorBridge } from '../services/detector/index.ts';

export const CANDIDATE_GUIDANCE_ANNOUNCEMENT =
  '✋ Phát hiện bóng tờ tiền — Giữ yên tay...';

export interface UseMoneyStateOptions {
  audioController?: SmartPreemptionController;
  smartTorchController?: SmartTorchController;
  debounceFilter?: TemporalDebounceFilter;
  powerGovernor?: AdaptivePowerGovernor;
  walletAccumulator?: PresentationWalletAccumulator;
}

export interface UseMoneyStateReturn {
  detectionState: DetectionState;
  walletState: SessionWalletState;
  isTorchOn: boolean;
  currentLuminance: number;
  isAutoTorchEnabled: boolean;
  isManualOverride: boolean;
  powerState: PowerState;
  thermalLevel: ThermalLevel;
  lastGesture: GestureType | null;
  announcementText: string;
  hasMoney: boolean;
  hasCandidateHint: boolean;
  isAuthorModalVisible: boolean;
  audioController: SmartPreemptionController;
  smartTorchController: SmartTorchController;
  debounceFilter: TemporalDebounceFilter;
  powerGovernor: AdaptivePowerGovernor;
  walletAccumulator: PresentationWalletAccumulator;

  // Gesture & Modal Handlers
  handleSingleTap: () => void;
  handleDoubleTap: () => void;
  handleLongPress: () => void;
  handleTwoFingerDoubleTap: () => void;
  handleOpenAuthorModal: () => void;
  handleCloseAuthorModal: () => void;
  announceAuthorInfo: () => void;

  // Camera, Luminance & Detection Handlers
  handleLuminanceUpdate: (
    luminance: number,
    timestamp?: number,
    context?: LuminanceSampleContext
  ) => void;
  handleNativeTorchChanged: (isOn: boolean) => void;
  handleMoneyDetected: (detection: any) => DebounceFilterResult;
  processRawFrame: (frame: any) => DebounceFilterResult;
  setTorchState: (enabled: boolean) => void;
  setAutoTorchEnabled: (enabled: boolean) => void;
  resetManualOverride: () => void;
  simulateLuminance: (lux: number) => void;

  // Simulation & State Updaters
  simulateDetection: (classId: MoneyClass, count?: number) => void;
  simulateMultiDetection: (items: { classId: MoneyClass; count: number }[]) => void;
  simulateEmptyFrame: () => void;
  toggleTorch: () => void;
  resetWallet: () => void;
}

export function useMoneyState(
  options?: UseMoneyStateOptions
): UseMoneyStateReturn {
  // Instantiate or use provided SmartPreemptionController
  const controllerRef = useRef<SmartPreemptionController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current =
      options?.audioController ??
      new SmartPreemptionController({ hapticNotifier: haptics });
  }
  const audioController = controllerRef.current;

  // Instantiate or use provided SmartTorchController
  const torchControllerRef = useRef<SmartTorchController | null>(null);
  if (!torchControllerRef.current) {
    torchControllerRef.current =
      options?.smartTorchController ?? new SmartTorchController();
  }
  const smartTorch = torchControllerRef.current;

  // Instantiate or use provided TemporalDebounceFilter (5-Frame Sliding Window)
  const filterRef = useRef<TemporalDebounceFilter | null>(null);
  if (!filterRef.current) {
    filterRef.current =
      options?.debounceFilter ?? new TemporalDebounceFilter();
  }
  const debounceFilter = filterRef.current;

  // Instantiate or use provided AdaptivePowerGovernor (Ticket 09)
  const governorRef = useRef<AdaptivePowerGovernor | null>(null);
  if (!governorRef.current) {
    governorRef.current =
      options?.powerGovernor ?? new AdaptivePowerGovernor();
  }
  const powerGovernor = governorRef.current;

  // Instantiate or use provided PresentationWalletAccumulator (Ticket 13)
  const walletAccumulatorRef = useRef<PresentationWalletAccumulator | null>(
    null
  );
  if (!walletAccumulatorRef.current) {
    walletAccumulatorRef.current =
      options?.walletAccumulator ?? new PresentationWalletAccumulator();
  }
  const walletAccumulator = walletAccumulatorRef.current;

  // Current Detection in Camera view
  const [detectionState, setDetectionState] = useState<DetectionState>({
    items: [],
    totalAmount: 0,
    totalNotesCount: 0,
    hasMoney: false,
    timestamp: Date.now(),
  });

  // Accumulated Session Wallet
  const [walletState, setWalletState] = useState<SessionWalletState>({
    totalAmount: 0,
    totalNotesCount: 0,
    history: [],
    lastUpdated: Date.now(),
  });

  // Flashlight / Torch & Power Governor state
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [currentLuminance, setCurrentLuminance] = useState<number>(100);
  const lastCommittedLuminanceRef = useRef<number>(100);
  const lastLuminanceCommitTimeRef = useRef<number>(0);
  const [isAutoTorchEnabled, setIsAutoTorchEnabled] = useState<boolean>(true);
  const [powerState, setPowerState] = useState<PowerState>('BURST');
  const [thermalLevel, setThermalLevel] = useState<ThermalLevel>('NOMINAL');

  // Last gesture performed
  const [lastGesture, setLastGesture] = useState<GestureType | null>(null);

  // Spoken announcement text for screen readers & visual display
  const [announcementText, setAnnouncementText] = useState<string>(
    'Hệ thống sẵn sàng. Quét tiền hoặc chạm màn hình để tương tác.'
  );

  // Ticket 10: Spatial Guidance "Giữ Yên Tay" candidate hint state
  const [hasCandidateHintState, setHasCandidateHintState] =
    useState<boolean>(false);
  const hadCandidateHintRef = useRef<boolean>(false);

  // Author & Copyright Modal visibility
  const [isAuthorModalVisible, setIsAuthorModalVisible] =
    useState<boolean>(false);
  const isAuthorModalVisibleRef = useRef<boolean>(false);

  // Ref trackers for delta wallet calculation & frame deduplication
  const previousStableItemsRef = useRef<DetectedMoneyItem[]>([]);
  const lastProcessedTimestampRef = useRef<number>(0);

  // Core Pipeline: Process incoming frame through 5-Frame Temporal Debounce Filter
  const handleMoneyDetected = useCallback(
    (detection: any): DebounceFilterResult => {
      // Pause camera frame announcements while Author & Copyright modal is open
      if (isAuthorModalVisibleRef.current) {
        const frameTs =
          detection?.timestamp || detection?.nativeEvent?.timestamp || Date.now();
        return {
          state: debounceFilter.getState(),
          stateChanged: false,
          isEmptied: false,
          signature: debounceFilter.getStableSignature(),
          items: debounceFilter.getStableItems(),
          totalAmount: debounceFilter
            .getStableItems()
            .reduce((sum, i) => sum + i.totalAmount, 0),
          totalNotesCount: debounceFilter
            .getStableItems()
            .reduce((sum, i) => sum + i.count, 0),
          hasMoney:
            debounceFilter.getStableItems().length > 0 &&
            debounceFilter.getState() !== 'EMPTY',
          consensusCount: 0,
          windowSize: debounceFilter.getWindow().length,
          consecutiveEmptyFrames: debounceFilter.getConsecutiveEmptyFrames(),
          timestamp: frameTs,
        };
      }

      // Deduplicate frames with identical timestamp if dispatched by multiple listeners
      const frameTimestamp =
        detection?.timestamp || detection?.nativeEvent?.timestamp;
      if (
        frameTimestamp &&
        lastProcessedTimestampRef.current !== 0 &&
        frameTimestamp === lastProcessedTimestampRef.current
      ) {
        return {
          state: debounceFilter.getState(),
          stateChanged: false,
          isEmptied: false,
          signature: debounceFilter.getStableSignature(),
          items: debounceFilter.getStableItems(),
          totalAmount: debounceFilter
            .getStableItems()
            .reduce((sum, i) => sum + i.totalAmount, 0),
          totalNotesCount: debounceFilter
            .getStableItems()
            .reduce((sum, i) => sum + i.count, 0),
          hasMoney:
            debounceFilter.getStableItems().length > 0 &&
            debounceFilter.getState() !== 'EMPTY',
          consensusCount: 0,
          windowSize: debounceFilter.getWindow().length,
          consecutiveEmptyFrames: debounceFilter.getConsecutiveEmptyFrames(),
          timestamp: frameTimestamp,
        };
      }
      if (frameTimestamp) {
        lastProcessedTimestampRef.current = frameTimestamp;
      }

      const rawPayload = detection?.nativeEvent ?? detection;
      const motionDeltaY =
        typeof rawPayload?.motionDeltaY === 'number'
          ? rawPayload.motionDeltaY
          : 0;
      const isMotionBlurred =
        Boolean(rawPayload?.isMotionBlurred) ||
        motionDeltaY > MOTION_BLUR_DELTA_Y_THRESHOLD;

      // Ticket 09 Layer 1: Motion-Blur Gate (skip TFLite / preserve 5-frame debounce window)
      if (isMotionBlurred) {
        const evalTime = frameTimestamp || Date.now();
        powerGovernor.wakeUpToBurst('OPTICAL_MOTION', evalTime);
        setPowerState(powerGovernor.getPowerState());
        return {
          state: debounceFilter.getState(),
          stateChanged: false,
          isEmptied: false,
          signature: debounceFilter.getStableSignature(),
          items: debounceFilter.getStableItems(),
          totalAmount: debounceFilter
            .getStableItems()
            .reduce((sum, i) => sum + i.totalAmount, 0),
          totalNotesCount: debounceFilter
            .getStableItems()
            .reduce((sum, i) => sum + i.count, 0),
          hasMoney:
            debounceFilter.getStableItems().length > 0 &&
            debounceFilter.getState() !== 'EMPTY',
          consensusCount: 0,
          windowSize: debounceFilter.getWindow().length,
          consecutiveEmptyFrames: debounceFilter.getConsecutiveEmptyFrames(),
          timestamp: evalTime,
        };
      }

      const debounced = debounceFilter.process(detection);
      // Ticket 13: Update presentation high-water-mark wallet accumulator on every debounced frame
      const walletUpdate = walletAccumulator.updatePresentation(
        debounced,
        debounced.timestamp
      );
      if (walletUpdate.presentationReset) {
        audioController.resetPresentationPeak();
      }

      const hasCandidateInFrame = Array.isArray(rawPayload)
        ? rawPayload.length > 0
        : Boolean(
            rawPayload?.hasMoney ||
              rawPayload?.hasCandidateHint ||
              (Array.isArray(rawPayload?.items) && rawPayload.items.length > 0) ||
              (Array.isArray(rawPayload?.boxes) && rawPayload.boxes.length > 0)
          );
      const latestWindowFrame =
        debounceFilter.getWindow()[debounceFilter.getWindow().length - 1];
      const hasNewSignatureWhileStable = Boolean(
        debounced.hasMoney &&
          latestWindowFrame &&
          latestWindowFrame.signature !== 'EMPTY' &&
          latestWindowFrame.signature !== debounced.signature
      );
      if (hasNewSignatureWhileStable) {
        powerGovernor.wakeUpToBurst('ACTIVE_DETECTION', debounced.timestamp);
      }
      const hasCandidateHint =
        Boolean(rawPayload?.hasCandidateHint) ||
        (!debounced.hasMoney && hasCandidateInFrame);
      const hasActiveOrCandidate = debounced.hasMoney || hasCandidateInFrame;
      smartTorch.setHasActiveDetection(hasActiveOrCandidate);
      const torchState = smartTorch.getState();

      const effectiveConsecutiveEmpty =
        debounced.state === 'STABLE' &&
        debounced.hasMoney &&
        motionDeltaY < STATIC_HOLDING_DELTA_Y_THRESHOLD
          ? 0
          : debounced.consecutiveEmptyFrames;

      const govEval = powerGovernor.evaluate({
        timestamp: debounced.timestamp,
        motionDeltaY,
        debounceState: debounced.state,
        hasMoney: debounced.hasMoney,
        hasCandidateHint,
        consecutiveEmptyFrames: effectiveConsecutiveEmpty,
        isTorchOn: torchState.isTorchOn,
        isManualTorchOverride: torchState.isManualOverride,
        lowLightDurationMs: torchState.lowLightDurationMs,
        torchOnDurationMs: torchState.torchOnDurationMs,
      });
      setPowerState(govEval.powerState);
      setThermalLevel(govEval.thermalLevel);

      if (govEval.shouldAutoCutoffIdleTorch) {
        const cutoffAction = smartTorch.handleIdleThermalCutoff(
          debounced.timestamp
        );
        if (cutoffAction.action === 'TURN_OFF') {
          setIsTorchOn(false);
          cameraBridge.setTorch(false);
          audioController.playTorchEarcon(false);
          setAnnouncementText('Tự động tắt đèn pin để bảo vệ nhiệt độ và pin');
        }
      }

      if (debounced.stateChanged) {
        hadCandidateHintRef.current = false;
        setHasCandidateHintState(false);
        if (debounced.isEmptied || debounced.items.length === 0) {
          // Withdrawal / Empty Frame (M = ∅)
          previousStableItemsRef.current = [];
          smartTorch.setHasActiveDetection(false);
          setDetectionState({
            items: [],
            totalAmount: 0,
            totalNotesCount: 0,
            hasMoney: false,
            timestamp: debounced.timestamp,
          });
          setAnnouncementText('Không có tiền trong tầm quét');
          // Smart Preemption Rule 1: Immediate hard cut + empty earcon + haptic
          audioController.handleDetectionUpdate([], debounced.timestamp);
        } else {
          // Stable New Detection (Consensus >= 4/5 frames)
          smartTorch.setHasActiveDetection(true);
          setDetectionState({
            items: debounced.items,
            totalAmount: debounced.totalAmount,
            totalNotesCount: debounced.totalNotesCount,
            hasMoney: true,
            timestamp: debounced.timestamp,
          });

          // Accumulate newly presented notes into session wallet via Ticket 13 PresentationWalletAccumulator
          const {
            addedCount,
            walletItems,
            walletTotalAmount,
            walletTotalCount,
          } = walletUpdate;
          previousStableItemsRef.current = [...debounced.items];

          setWalletState(prev => {
            if (
              addedCount <= 0 &&
              prev.totalAmount === walletTotalAmount &&
              prev.totalNotesCount === walletTotalCount
            ) {
              return prev;
            }
            return {
              totalAmount: walletTotalAmount,
              totalNotesCount: walletTotalCount,
              history: walletItems,
              lastUpdated: Date.now(),
            };
          });

          const summary = formatDetectionSummary(debounced.items);
          setAnnouncementText(`Đã phát hiện: ${summary.spokenText}`);

          // Smart Preemption Rule 2: Wait for previous speech or announce new stable state
          audioController.handleDetectionUpdate(
            debounced.items,
            debounced.timestamp
          );
        }
      } else if (
        !debounced.hasMoney &&
        (hasCandidateHint || debounced.state === 'STABILIZING')
      ) {
        // Ticket 10 Pillar 3: Spatial Guidance "Giữ Yên Tay" (25ms tactile pulse + HUD cue)
        hadCandidateHintRef.current = true;
        setHasCandidateHintState(true);
        audioController.triggerCandidateGuidancePulse(debounced.timestamp);
        setAnnouncementText(CANDIDATE_GUIDANCE_ANNOUNCEMENT);
      } else if (!hasCandidateHint && debounced.state === 'EMPTY') {
        if (hadCandidateHintRef.current) {
          hadCandidateHintRef.current = false;
          setAnnouncementText('Không có tiền trong tầm quét');
        }
        setHasCandidateHintState(false);
      }

      return debounced;
    },
    [
      debounceFilter,
      audioController,
      smartTorch,
      powerGovernor,
      walletAccumulator,
    ]
  );

  // Connect NativeDetectorBridge listeners
  useEffect(() => {
    const unsubscribe = detectorBridge.addDetectionListener(detection => {
      handleMoneyDetected(detection);
    });
    return () => {
      unsubscribe();
    };
  }, [handleMoneyDetected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioController.destroy();
      debounceFilter.destroy();
    };
  }, [audioController, debounceFilter]);

  // 1. Single Tap: Re-read detection or status
  const handleSingleTap = useCallback(() => {
    powerGovernor.wakeUp('TOUCH_INTERACTION');
    setPowerState(powerGovernor.getState());
    setLastGesture('SINGLE_TAP');
    haptics.triggerSingleTap();

    if (detectionState.items.length === 0) {
      setAnnouncementText('Không có tiền trong tầm quét');
    } else {
      const summary = formatDetectionSummary(detectionState.items);
      setAnnouncementText(`Hiện tại: ${summary.spokenText}`);
    }

    // Trigger audio re-reading
    audioController.handleSingleTap(detectionState.items);
  }, [detectionState.items, audioController, powerGovernor]);

  // 2. Double Tap: Toggle Torch manually (sets manual override)
  const handleDoubleTap = useCallback(() => {
    const now = Date.now();
    powerGovernor.wakeUp('TOUCH_INTERACTION', now);
    setPowerState(powerGovernor.getState());
    setLastGesture('DOUBLE_TAP');
    haptics.triggerDoubleTap();

    const action = smartTorch.handleManualToggle(undefined, now);
    const next = action.isTorchOn;
    setIsTorchOn(next);
    cameraBridge.setTorch(next);
    setAnnouncementText(next ? 'Đèn pin đã bật' : 'Đèn pin đã tắt');
    audioController.handleDoubleTap(next);
  }, [smartTorch, audioController, powerGovernor]);

  // 3. Long Press (1s): Read Accumulated Session Wallet + 200ms haptic
  const handleLongPress = useCallback(() => {
    powerGovernor.wakeUp('TOUCH_INTERACTION');
    setPowerState(powerGovernor.getState());
    setLastGesture('LONG_PRESS');
    haptics.triggerLongPress();

    if (walletState.totalAmount === 0) {
      setAnnouncementText('Ví tích lũy hiện đang trống (0 đồng)');
    } else {
      setAnnouncementText(
        `Tổng tiền tích lũy trong phiên: ${formatSpokenVND(
          walletState.totalAmount
        )}, gồm ${walletState.totalNotesCount} tờ tiền.`
      );
    }

    audioController.handleLongPress(walletState);
  }, [walletState, audioController, powerGovernor]);

  // 4. Two-Finger Double Tap: Reset Session Wallet to 0 & Reset Debounce Filter (Dual-Layer)
  const handleTwoFingerDoubleTap = useCallback(() => {
    powerGovernor.wakeUp('TOUCH_INTERACTION');
    setPowerState(powerGovernor.getState());
    setLastGesture('TWO_FINGER_DOUBLE_TAP');
    haptics.triggerTwoFingerDoubleTap();
    debounceFilter.reset();
    walletAccumulator.reset();
    detectorBridge.resetDebounceFilter().catch(() => {});
    previousStableItemsRef.current = [];
    smartTorch.setHasActiveDetection(false);
    setHasCandidateHintState(false);

    setWalletState({
      totalAmount: 0,
      totalNotesCount: 0,
      history: [],
      lastUpdated: Date.now(),
    });
    setAnnouncementText('Đã đặt lại ví tích lũy về 0 đồng');

    audioController.handleTwoFingerDoubleTap();
  }, [debounceFilter, walletAccumulator, audioController, smartTorch, powerGovernor]);

  // Ambient Luminance & Smart Torch Update
  const handleLuminanceUpdate = useCallback(
    (
      luminance: number,
      timestamp?: number,
      context?: LuminanceSampleContext
    ) => {
      const roundedLuminance = Math.round(luminance);
      const now = timestamp || Date.now();
      const delta = Math.abs(roundedLuminance - lastCommittedLuminanceRef.current);
      if (
        delta >= 15 ||
        (delta >= 3 && now - lastLuminanceCommitTimeRef.current >= 1000)
      ) {
        lastLuminanceCommitTimeRef.current = now;
        lastCommittedLuminanceRef.current = roundedLuminance;
        setCurrentLuminance(roundedLuminance);
      }

      const enrichedContext: LuminanceSampleContext | undefined = context
        ? {
            ...context,
            frameDeltaY: context.frameDeltaY ?? context.motionDeltaY,
            imuLinearAccelDelta:
              context.imuLinearAccelDelta ?? context.accelMagnitudeDelta,
          }
        : undefined;

      const action = smartTorch.onLuminanceSample(
        luminance,
        timestamp,
        enrichedContext
      );

      if (action.action === 'TURN_ON') {
        setIsTorchOn(true);
        cameraBridge.setTorch(true);
        haptics.triggerAutoTorch();
        audioController.playTorchEarcon(true);
        setAnnouncementText('Tự động bật đèn pin do thiếu sáng');
      } else if (action.action === 'TURN_OFF') {
        setIsTorchOn(false);
        cameraBridge.setTorch(false);
        audioController.playTorchEarcon(false);
        setAnnouncementText('Tự động tắt đèn pin do đủ sáng');
      }

      if (
        context &&
        (context.motionDeltaY !== undefined ||
          context.accelMagnitudeDelta !== undefined ||
          context.isProximityNear !== undefined)
      ) {
        const torchState = smartTorch.getState();
        const isStableHolding =
          debounceFilter.getState() === 'STABLE' &&
          debounceFilter.getStableItems().length > 0;
        const effectiveConsecutiveEmpty =
          isStableHolding &&
          (context.motionDeltaY ?? 0) < STATIC_HOLDING_DELTA_Y_THRESHOLD
            ? 0
            : debounceFilter.getConsecutiveEmptyFrames();
        const govEval = powerGovernor.evaluate({
          timestamp,
          motionDeltaY: context.motionDeltaY ?? 0,
          luminance,
          ambientSensorLux: context.ambientSensorLux,
          accelMagnitudeDelta: context.accelMagnitudeDelta ?? 0,
          isProximityNear: Boolean(context.isProximityNear),
          hasMoney: isStableHolding,
          debounceState: debounceFilter.getState(),
          hasCandidateHint: Boolean(context.hasCandidateHint ?? hasCandidateHintState),
          consecutiveEmptyFrames: effectiveConsecutiveEmpty,
          isTorchOn: torchState.isTorchOn,
          isManualTorchOverride: torchState.isManualOverride,
          lowLightDurationMs: torchState.lowLightDurationMs,
          torchOnDurationMs: torchState.torchOnDurationMs,
        });
        setPowerState(govEval.powerState);
        setThermalLevel(govEval.thermalLevel);

        if (govEval.shouldAutoCutoffIdleTorch) {
          const cutoffAction = smartTorch.handleIdleThermalCutoff(timestamp);
          if (cutoffAction.action === 'TURN_OFF') {
            setIsTorchOn(false);
            cameraBridge.setTorch(false);
            audioController.playTorchEarcon(false);
            setAnnouncementText(
              'Tự động tắt đèn pin để bảo vệ nhiệt độ và pin'
            );
          }
        }
      }
    },
    [smartTorch, audioController, powerGovernor, debounceFilter, hasCandidateHintState]
  );

  // Synchronization with native torch state change
  const handleNativeTorchChanged = useCallback(
    (isOn: boolean) => {
      setIsTorchOn(isOn);
      smartTorch.syncTorchState(isOn);
    },
    [smartTorch]
  );

  const setTorchState = useCallback(
    (enabled: boolean) => {
      const action = smartTorch.handleManualToggle(enabled, Date.now());
      setIsTorchOn(action.isTorchOn);
      cameraBridge.setTorch(action.isTorchOn);
      audioController.playTorchEarcon(action.isTorchOn);
      setAnnouncementText(
        action.isTorchOn ? 'Đèn pin đã bật' : 'Đèn pin đã tắt'
      );
    },
    [smartTorch, audioController]
  );

  const setAutoTorchEnabled = useCallback(
    (enabled: boolean) => {
      setIsAutoTorchEnabled(enabled);
      smartTorch.setAutoTorchEnabled(enabled);
    },
    [smartTorch]
  );

  const resetManualOverride = useCallback(() => {
    smartTorch.resetManualOverride();
  }, [smartTorch]);

  const simulateLuminance = useCallback(
    (lux: number) => {
      const rounded = Math.round(lux);
      lastCommittedLuminanceRef.current = rounded;
      lastLuminanceCommitTimeRef.current = Date.now();
      setCurrentLuminance(rounded);
      handleLuminanceUpdate(lux);
    },
    [handleLuminanceUpdate]
  );

  // Simulation: Single bill detection (bypasses debounce latency for mock interaction)
  const simulateDetection = useCallback(
    (classId: MoneyClass, count: number = 1) => {
      const item: DetectedMoneyItem = {
        classId,
        count,
        label: DENOMINATION_NAMES[classId],
        totalAmount: classId * count,
      };

      powerGovernor.wakeUpToBurst('ACTIVE_DETECTION');
      setPowerState(powerGovernor.getPowerState());
      debounceFilter.forceStable([item]);
      smartTorch.setHasActiveDetection(true);
      setHasCandidateHintState(false);

      const { addedItems, addedAmount, addedCount } = calculateAddedItemsDelta(
        previousStableItemsRef.current,
        [item]
      );
      previousStableItemsRef.current = [item];

      setDetectionState({
        items: [item],
        totalAmount: item.totalAmount,
        totalNotesCount: count,
        hasMoney: true,
        timestamp: Date.now(),
      });

      if (addedCount > 0) {
        setWalletState(prev => ({
          totalAmount: prev.totalAmount + addedAmount,
          totalNotesCount: prev.totalNotesCount + addedCount,
          history: [...prev.history, ...addedItems],
          lastUpdated: Date.now(),
        }));
      }

      setAnnouncementText(`Đã phát hiện: ${count} tờ ${item.label.toLowerCase()}`);

      // Pass update to Smart Preemption Controller
      audioController.handleDetectionUpdate([item]);
    },
    [debounceFilter, audioController, smartTorch, powerGovernor]
  );

  // Simulation: Multi bill detection (e.g. 2x 100k + 1x 50k)
  const simulateMultiDetection = useCallback(
    (itemsInput: { classId: MoneyClass; count: number }[]) => {
      const items: DetectedMoneyItem[] = itemsInput.map(i => ({
        classId: i.classId,
        count: i.count,
        label: DENOMINATION_NAMES[i.classId],
        totalAmount: i.classId * i.count,
      }));

      powerGovernor.wakeUpToBurst('ACTIVE_DETECTION');
      setPowerState(powerGovernor.getPowerState());
      debounceFilter.forceStable(items);
      smartTorch.setHasActiveDetection(true);
      setHasCandidateHintState(false);

      const addedTotalAmount = items.reduce((sum, i) => sum + i.totalAmount, 0);
      const addedTotalNotesCount = items.reduce((sum, i) => sum + i.count, 0);

      const { addedItems, addedAmount, addedCount } = calculateAddedItemsDelta(
        previousStableItemsRef.current,
        items
      );
      previousStableItemsRef.current = [...items];

      setDetectionState({
        items,
        totalAmount: addedTotalAmount,
        totalNotesCount: addedTotalNotesCount,
        hasMoney: true,
        timestamp: Date.now(),
      });

      if (addedCount > 0) {
        setWalletState(prev => ({
          totalAmount: prev.totalAmount + addedAmount,
          totalNotesCount: prev.totalNotesCount + addedCount,
          history: [...prev.history, ...addedItems],
          lastUpdated: Date.now(),
        }));
      }

      const summary = formatDetectionSummary(items);
      setAnnouncementText(`Phát hiện nhiều tờ: ${summary.spokenText}`);

      // Pass update to Smart Preemption Controller
      audioController.handleDetectionUpdate(items);
    },
    [debounceFilter, audioController, smartTorch, powerGovernor]
  );

  // Simulation: Empty frame
  const simulateEmptyFrame = useCallback(() => {
    debounceFilter.forceStable([]);
    previousStableItemsRef.current = [];
    smartTorch.setHasActiveDetection(false);
    setHasCandidateHintState(false);

    setDetectionState({
      items: [],
      totalAmount: 0,
      totalNotesCount: 0,
      hasMoney: false,
      timestamp: Date.now(),
    });
    setAnnouncementText('Không có tiền trong tầm quét');

    // Trigger preemption for empty frame (hard cut + empty earcon + haptic)
    audioController.handleDetectionUpdate([]);
  }, [debounceFilter, audioController, smartTorch]);

  const toggleTorch = useCallback(() => {
    handleDoubleTap();
  }, [handleDoubleTap]);

  const resetWallet = useCallback(() => {
    handleTwoFingerDoubleTap();
  }, [handleTwoFingerDoubleTap]);

  const announceAuthorInfo = useCallback(() => {
    setAnnouncementText(AUTHOR_INFO.spokenAnnouncement);
    audioController
      .handleAuthorInfoAnnouncement(AUTHOR_INFO.spokenAnnouncement)
      .catch(() => {});
  }, [audioController]);

  const handleOpenAuthorModal = useCallback(() => {
    isAuthorModalVisibleRef.current = true;
    setIsAuthorModalVisible(true);
    announceAuthorInfo();
  }, [announceAuthorInfo]);

  const handleCloseAuthorModal = useCallback(() => {
    isAuthorModalVisibleRef.current = false;
    powerGovernor.wakeUp('TOUCH_INTERACTION');
    setPowerState(powerGovernor.getState());
    haptics.triggerSingleTap();
    setIsAuthorModalVisible(false);
  }, [powerGovernor]);

  return {
    detectionState,
    walletState,
    isTorchOn,
    currentLuminance,
    isAutoTorchEnabled,
    isManualOverride: smartTorch.getState().isManualOverride,
    powerState,
    thermalLevel,
    lastGesture,
    announcementText,
    hasMoney: detectionState.hasMoney,
    hasCandidateHint: hasCandidateHintState,
    isAuthorModalVisible,
    audioController,
    smartTorchController: smartTorch,
    debounceFilter,
    powerGovernor,
    walletAccumulator,
    handleSingleTap,
    handleDoubleTap,
    handleLongPress,
    handleTwoFingerDoubleTap,
    handleOpenAuthorModal,
    handleCloseAuthorModal,
    announceAuthorInfo,
    handleLuminanceUpdate,
    handleNativeTorchChanged,
    handleMoneyDetected,
    processRawFrame: handleMoneyDetected,
    setTorchState,
    setAutoTorchEnabled,
    resetManualOverride,
    simulateLuminance,
    simulateDetection,
    simulateMultiDetection,
    simulateEmptyFrame,
    toggleTorch,
    resetWallet,
  };
}
