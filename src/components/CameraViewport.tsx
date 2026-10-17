import React from 'react';
import {
  Platform,
  requireNativeComponent,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeSyntheticEvent, StyleProp, ViewStyle } from 'react-native';
import { THEME } from '../constants/theme';

export interface LuminanceChangeEventData {
  luminance: number;
  glareRatio?: number;
  centerLuma?: number;
  borderLuma?: number;
  centerToBorderRatio?: number;
  ambientSensorLux?: number;
  motionDeltaY?: number;
  isMotionBlurred?: boolean;
  accelMagnitudeDelta?: number;
  isProximityNear?: boolean;
  hasCandidateHint?: boolean;
  powerState?: string;
  thermalLevel?: string;
  timestamp?: number;
}

export interface TorchChangeEventData {
  isTorchOn: boolean;
}

export interface MoneyDetectedEventData {
  items: Array<{
    classId: number;
    count: number;
    label: string;
    totalAmount: number;
  }>;
  boxes: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    score: number;
    classIndex: number;
    classId: number;
    label: string;
  }>;
  totalAmount: number;
  totalNotesCount: number;
  hasMoney: boolean;
  hasCandidateHint?: boolean;
  motionDeltaY?: number;
  isMotionBlurred?: boolean;
  powerState?: string;
  timestamp: number;
  inferenceTimeMs: number;
  isMock: boolean;
}

export interface CameraViewportProps {
  torchEnabled?: boolean;
  autoTorchEnabled?: boolean;
  onLuminanceChanged?: (
    event: NativeSyntheticEvent<LuminanceChangeEventData> | { luminance: number }
  ) => void;
  onTorchChanged?: (
    event: NativeSyntheticEvent<TorchChangeEventData> | { isTorchOn: boolean }
  ) => void;
  onMoneyDetected?: (
    event: NativeSyntheticEvent<MoneyDetectedEventData> | MoneyDetectedEventData
  ) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  pointerEvents?: 'box-none' | 'none' | 'box-only' | 'auto';
  isMockFallback?: boolean;
}

// Safely acquire native component on Android
let NativeMoneyCameraView: React.ComponentType<any> | null = null;
function getNativeCameraView(): React.ComponentType<any> | null {
  if (NativeMoneyCameraView) return NativeMoneyCameraView;
  if (Platform.OS === 'android') {
    try {
      NativeMoneyCameraView = requireNativeComponent('MoneyCameraView');
    } catch {
      NativeMoneyCameraView = null;
    }
  }
  return NativeMoneyCameraView;
}

/**
 * CameraViewport
 * Custom CameraX Viewport for MoneyVision.
 * Positioned in the background layer beneath GestureCanvas.
 * Transparent to touches (pointerEvents="none" by default)
 * so that gestures pass unobstructed to the GestureCanvas.
 */
export const CameraViewport: React.FC<CameraViewportProps> = ({
  torchEnabled = false,
  autoTorchEnabled = true,
  onLuminanceChanged,
  onTorchChanged,
  onMoneyDetected,
  style,
  testID = 'camera-viewport',
  pointerEvents = 'none',
  isMockFallback = false,
}) => {
  const NativeView = getNativeCameraView();

  // If native view is available and not forced fallback
  if (NativeView && !isMockFallback) {
    return (
      <View
        style={[styles.container, style]}
        pointerEvents={pointerEvents}
        testID={testID}
      >
        <NativeView
          style={StyleSheet.absoluteFillObject}
          torchEnabled={torchEnabled}
          autoTorchEnabled={autoTorchEnabled}
          onLuminanceChanged={onLuminanceChanged}
          onTorchChanged={onTorchChanged}
          onMoneyDetected={onMoneyDetected}
        />
      </View>
    );
  }

  // Fallback / Mock View for Simulator, Desktop, or Non-Camera hardware
  return (
    <View
      style={[styles.container, styles.fallbackContainer, style]}
      pointerEvents={pointerEvents}
      testID={testID}
      accessible={false}
    >
      <View style={styles.simulatedViewfinder}>
        <View style={styles.reticleCornerTopLeft} />
        <View style={styles.reticleCornerTopRight} />
        <View style={styles.reticleCornerBottomLeft} />
        <View style={styles.reticleCornerBottomRight} />
        <Text style={styles.fallbackLabel}>
          CAMERAX PREVIEW (30 FPS)
        </Text>
        {torchEnabled && (
          <Text style={styles.torchIndicator}>
            ⚡ ĐÈN PIN: ĐANG BẬT
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    zIndex: 0,
  },
  fallbackContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#050505',
  },
  simulatedViewfinder: {
    width: '85%',
    height: '75%',
    borderWidth: 1,
    borderColor: 'rgba(255, 230, 0, 0.25)',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  fallbackLabel: {
    fontFamily: THEME.typography.fontFamilyMono,
    fontSize: 14,
    color: 'rgba(255, 230, 0, 0.4)',
    letterSpacing: 2,
    fontWeight: '700',
  },
  torchIndicator: {
    marginTop: 8,
    fontFamily: THEME.typography.fontFamilyMono,
    fontSize: 12,
    color: THEME.colors.primaryYellow,
    fontWeight: '900',
    backgroundColor: 'rgba(255, 230, 0, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  reticleCornerTopLeft: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: 24,
    height: 24,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: THEME.colors.primaryYellow,
  },
  reticleCornerTopRight: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 24,
    height: 24,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: THEME.colors.primaryYellow,
  },
  reticleCornerBottomLeft: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    width: 24,
    height: 24,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: THEME.colors.primaryYellow,
  },
  reticleCornerBottomRight: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: THEME.colors.primaryYellow,
  },
});
