import React, { useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, View } from 'react-native';
import { THEME, getActiveBorderGlowColor } from './src/constants/theme';
import { useMoneyState } from './src/hooks/useMoneyState';
import { CameraViewport } from './src/components/CameraViewport';
import { EdgePulseBorder } from './src/components/EdgePulseBorder';
import { GestureCanvas } from './src/components/GestureCanvas';
import { TactileDisplay } from './src/components/TactileDisplay';
import { SimulationControls } from './src/components/SimulationControls';

const App = (): React.JSX.Element => {
  const [isSimulationDrawerOpen, setIsSimulationDrawerOpen] =
    useState<boolean>(false);

  const {
    detectionState,
    walletState,
    isTorchOn,
    currentLuminance,
    lastGesture,
    announcementText,
    hasMoney,
    hasCandidateHint,
    powerState,
    isAuthorModalVisible,
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
    simulateDetection,
    simulateMultiDetection,
    simulateEmptyFrame,
    simulateLuminance,
  } = useMoneyState();

  const activeItems = detectionState.items.filter(i => i && i.count > 0);
  const topDenomination =
    activeItems.length > 0
      ? Math.max(...activeItems.map(i => i.classId))
      : null;
  const activeBorderColor = getActiveBorderGlowColor(
    topDenomination,
    hasCandidateHint,
    hasMoney
  );

  const getGestureLabel = (): string | undefined => {
    switch (lastGesture) {
      case 'SINGLE_TAP':
        return '1 Chạm (Đọc lại)';
      case 'DOUBLE_TAP':
        return '2 Chạm (Đổi đèn pin)';
      case 'LONG_PRESS':
        return 'Giữ 1s (Đọc ví)';
      case 'TWO_FINGER_DOUBLE_TAP':
        return '2 Ngón x2 (Reset ví)';
      default:
        return undefined;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={THEME.colors.background}
      />

      {/* 1. CameraX Viewport in background layer (pointerEvents="none" so gestures pass through freely) */}
      <CameraViewport
        torchEnabled={isTorchOn}
        autoTorchEnabled={true}
        onLuminanceChanged={event => {
          const nativeEvt = (event as any)?.nativeEvent ?? (event as any) ?? {};
          const lum = nativeEvt.luminance ?? 0;
          const hasContext =
            nativeEvt.glareRatio !== undefined ||
            nativeEvt.centerLuma !== undefined ||
            nativeEvt.borderLuma !== undefined ||
            nativeEvt.centerToBorderRatio !== undefined ||
            nativeEvt.ambientSensorLux !== undefined ||
            nativeEvt.motionDeltaY !== undefined ||
            nativeEvt.accelMagnitudeDelta !== undefined ||
            nativeEvt.isProximityNear !== undefined ||
            nativeEvt.hasCandidateHint !== undefined;
          handleLuminanceUpdate(
            lum,
            nativeEvt.timestamp,
            hasContext
              ? {
                  glareRatio: nativeEvt.glareRatio,
                  centerLuma: nativeEvt.centerLuma,
                  borderLuma: nativeEvt.borderLuma,
                  centerToBorderRatio: nativeEvt.centerToBorderRatio,
                  ambientSensorLux:
                    typeof nativeEvt.ambientSensorLux === 'number' &&
                    nativeEvt.ambientSensorLux >= 0
                      ? nativeEvt.ambientSensorLux
                      : null,
                  motionDeltaY: nativeEvt.motionDeltaY,
                  accelMagnitudeDelta: nativeEvt.accelMagnitudeDelta,
                  isProximityNear: nativeEvt.isProximityNear,
                  hasCandidateHint: nativeEvt.hasCandidateHint,
                }
              : undefined
          );
        }}
        onTorchChanged={event => {
          const torch =
            (event as any)?.nativeEvent?.isTorchOn ??
            (event as any)?.isTorchOn ??
            false;
          handleNativeTorchChanged(torch);
        }}
        onMoneyDetected={event => {
          const detection =
            (event as any)?.nativeEvent ??
            (event as any) ??
            null;
          if (detection) {
            handleMoneyDetected(detection);
          }
        }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
        testID="camera-viewport"
      />

      {/* 2. 8dp Edge Pulse / Breathing Glow Border with Full-Screen Chromatic Shift */}
      <EdgePulseBorder
        active={hasMoney}
        activeColor={activeBorderColor}
        powerState={powerState}
        style={styles.pulseContainer}
      >
        {/* 3. Fullscreen Gesture Canvas for tactile navigation */}
        <GestureCanvas
          onSingleTap={handleSingleTap}
          onDoubleTap={handleDoubleTap}
          onLongPress={handleLongPress}
          onTwoFingerDoubleTap={handleTwoFingerDoubleTap}
          style={styles.canvasContainer}
        >
          {/* 4. WCAG AAA High-Contrast Tactile Display */}
          <View style={styles.displayWrapper} pointerEvents="box-none">
            <TactileDisplay
              detectionState={detectionState}
              walletState={walletState}
              isTorchOn={isTorchOn}
              powerState={powerState}
              hasCandidateHint={hasCandidateHint}
              isSimulationDrawerOpen={isSimulationDrawerOpen}
              announcementText={announcementText}
              lastGestureText={getGestureLabel()}
              isAuthorModalVisible={isAuthorModalVisible}
              onToggleTorch={handleDoubleTap}
              onReadWallet={handleLongPress}
              onResetWallet={handleTwoFingerDoubleTap}
              onToggleSimulationDrawer={() =>
                setIsSimulationDrawerOpen(prev => !prev)
              }
              onOpenAuthorModal={handleOpenAuthorModal}
              onCloseAuthorModal={handleCloseAuthorModal}
              onAnnounceAuthorInfo={announceAuthorInfo}
            />
          </View>
        </GestureCanvas>
      </EdgePulseBorder>

      {/* 5. Collapsible Mock / Simulation Controls (Hidden by default on launch for 100% blind-safe canvas) */}
      <SimulationControls
        isOpen={isSimulationDrawerOpen}
        onClose={() => setIsSimulationDrawerOpen(false)}
        onSimulateDetection={simulateDetection}
        onSimulateMultiDetection={simulateMultiDetection}
        onSimulateEmptyFrame={simulateEmptyFrame}
        onTriggerSingleTap={handleSingleTap}
        onTriggerDoubleTap={handleDoubleTap}
        onTriggerLongPress={handleLongPress}
        onTriggerTwoFingerDoubleTap={handleTwoFingerDoubleTap}
        onSimulateLuminance={simulateLuminance}
        currentLuminance={currentLuminance}
        onOpenAuthorModal={handleOpenAuthorModal}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  pulseContainer: {
    flex: 1,
  },
  canvasContainer: {
    flex: 1,
  },
  displayWrapper: {
    flex: 1,
  },
});

export default App;
