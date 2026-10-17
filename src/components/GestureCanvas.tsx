import React, { useEffect, useMemo, useRef } from 'react';
import {
  PanResponder,
  StyleSheet,
  View,
} from 'react-native';
import type {
  GestureResponderEvent,
  LayoutChangeEvent,
  NativeSyntheticEvent,
  PanResponderGestureState,
  ViewStyle,
} from 'react-native';
import { EDGE_PALM_REJECTION_DP } from '../constants/theme';
import {
  GestureRecognizer,
  type TouchPoint,
} from '../utils/gestureRecognizer';

export interface GestureCanvasProps {
  onSingleTap?: () => void;
  onDoubleTap?: () => void;
  onLongPress?: () => void;
  onTwoFingerDoubleTap?: () => void;
  children?: React.ReactNode;
  style?: ViewStyle;
  testID?: string;
}

function extractTouchPointers(evt: GestureResponderEvent): TouchPoint[] {
  const nativeEvt = evt.nativeEvent;
  const rawTouches = nativeEvt.touches;
  if (!rawTouches || rawTouches.length === 0) {
    return [
      {
        x: nativeEvt.locationX ?? nativeEvt.pageX ?? 0,
        y: nativeEvt.locationY ?? nativeEvt.pageY ?? 0,
      },
    ];
  }
  const len = rawTouches.length;
  const result: TouchPoint[] = new Array(len);
  for (let i = 0; i < len; i++) {
    const t = rawTouches[i];
    result[i] = {
      x: t.locationX ?? t.pageX ?? 0,
      y: t.locationY ?? t.pageY ?? 0,
    };
  }
  return result;
}

/**
 * GestureCanvas
 * Fullscreen touch area transforming the entire device display into an accessible gesture map:
 * - Single Tap: Re-read detection / status
 * - Double Tap: Flashlight toggle
 * - Long Press (1s): Read accumulated session wallet + 200ms haptic
 * - Two-Finger Double Tap: Reset session wallet
 * - Per-Pointer 16dp Edge Palm-Rejection: Ignores palm/finger touches on the 16dp screen border
 * Coordinates with TalkBack accessibility actions while allowing child buttons to be focused via Explore-by-Touch.
 */
export const GestureCanvas: React.FC<GestureCanvasProps> = ({
  onSingleTap,
  onDoubleTap,
  onLongPress,
  onTwoFingerDoubleTap,
  children,
  style,
  testID = 'gesture-canvas',
}) => {
  const callbacksRef = useRef({
    onSingleTap,
    onDoubleTap,
    onLongPress,
    onTwoFingerDoubleTap,
  });
  const viewportRef = useRef<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  // Keep callbacks fresh
  useEffect(() => {
    callbacksRef.current = {
      onSingleTap,
      onDoubleTap,
      onLongPress,
      onTwoFingerDoubleTap,
    };
  }, [onSingleTap, onDoubleTap, onLongPress, onTwoFingerDoubleTap]);

  // Instantiate gesture recognizer with 16dp edge palm-rejection
  const recognizer = useMemo(() => {
    return new GestureRecognizer(
      {
        onSingleTap: () => callbacksRef.current.onSingleTap?.(),
        onDoubleTap: () => callbacksRef.current.onDoubleTap?.(),
        onLongPress: () => callbacksRef.current.onLongPress?.(),
        onTwoFingerDoubleTap: () =>
          callbacksRef.current.onTwoFingerDoubleTap?.(),
      },
      {
        doubleTapThresholdMs: 350,
        longPressThresholdMs: 1000,
        maxMoveDistance: 40,
        twoFingerTapWindowMs: 500,
        maxTapDurationMs: 500,
        edgeMarginPx: EDGE_PALM_REJECTION_DP,
      }
    );
  }, []);

  useEffect(() => {
    return () => {
      recognizer.destroy();
    };
  }, [recognizer]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    viewportRef.current = { width, height };
    recognizer.setViewportSize(width, height);
  };

  // PanResponder to intercept fullscreen multi-touch events
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // Allow interactive child buttons (Torch, Wallet, Author Modal, Test Drawer) to handle taps while canvas captures background touches
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponderCapture: () => false,

        onPanResponderGrant: (
          evt: GestureResponderEvent,
          gestureState: PanResponderGestureState
        ) => {
          const pointers = extractTouchPointers(evt);
          const touchCount = Math.max(
            pointers.length,
            gestureState.numberActiveTouches || 1
          );
          recognizer.handleTouchStart({
            touchCount,
            x: pointers[0]?.x ?? evt.nativeEvent.pageX,
            y: pointers[0]?.y ?? evt.nativeEvent.pageY,
            pointers,
            viewportWidth: viewportRef.current.width,
            viewportHeight: viewportRef.current.height,
            timestamp: Date.now(),
          });
        },

        onPanResponderStart: (
          evt: GestureResponderEvent,
          gestureState: PanResponderGestureState
        ) => {
          // Fires when secondary touches land
          const pointers = extractTouchPointers(evt);
          const touchCount = Math.max(
            pointers.length,
            gestureState.numberActiveTouches || 1
          );
          recognizer.handleTouchStart({
            touchCount,
            x: pointers[0]?.x ?? evt.nativeEvent.pageX,
            y: pointers[0]?.y ?? evt.nativeEvent.pageY,
            pointers,
            viewportWidth: viewportRef.current.width,
            viewportHeight: viewportRef.current.height,
            timestamp: Date.now(),
          });
        },

        onPanResponderMove: (
          evt: GestureResponderEvent,
          gestureState: PanResponderGestureState
        ) => {
          const pointers = extractTouchPointers(evt);
          const touchCount = Math.max(
            pointers.length,
            gestureState.numberActiveTouches || 1
          );
          recognizer.handleTouchMove({
            touchCount,
            dx: gestureState.dx,
            dy: gestureState.dy,
            pointers,
            viewportWidth: viewportRef.current.width,
            viewportHeight: viewportRef.current.height,
          });
        },

        onPanResponderEnd: (
          evt: GestureResponderEvent,
          _gestureState: PanResponderGestureState
        ) => {
          const touches = evt.nativeEvent.touches;
          // If some fingers lifted while others remain on screen
          if (touches && touches.length > 0) {
            const len = touches.length;
            const pointers: TouchPoint[] = new Array(len);
            for (let i = 0; i < len; i++) {
              const t = touches[i];
              pointers[i] = {
                x: t.locationX ?? t.pageX ?? 0,
                y: t.locationY ?? t.pageY ?? 0,
              };
            }
            recognizer.handleTouchEnd({
              touchCount: len,
              x: evt.nativeEvent.pageX,
              y: evt.nativeEvent.pageY,
              pointers,
              viewportWidth: viewportRef.current.width,
              viewportHeight: viewportRef.current.height,
              timestamp: Date.now(),
            });
          }
        },

        onPanResponderRelease: (
          evt: GestureResponderEvent,
          _gestureState: PanResponderGestureState
        ) => {
          // All fingers lifted, completing the touch gesture
          recognizer.handleTouchEnd({
            touchCount: 0,
            x: evt.nativeEvent.pageX,
            y: evt.nativeEvent.pageY,
            pointers: [],
            viewportWidth: viewportRef.current.width,
            viewportHeight: viewportRef.current.height,
            timestamp: Date.now(),
          });
        },

        onPanResponderTerminate: () => {
          recognizer.destroy();
        },
      }),
    [recognizer]
  );

  const handleAccessibilityAction = (
    event: NativeSyntheticEvent<{ actionName: string }>
  ) => {
    switch (event.nativeEvent.actionName) {
      case 'activate':
      case 'reread_money':
        callbacksRef.current.onSingleTap?.();
        break;
      case 'longpress':
      case 'readWallet':
      case 'read_wallet':
        callbacksRef.current.onLongPress?.();
        break;
      case 'toggleTorch':
      case 'toggle_torch':
        callbacksRef.current.onDoubleTap?.();
        break;
      case 'resetWallet':
      case 'reset_wallet':
        callbacksRef.current.onTwoFingerDoubleTap?.();
        break;
    }
  };

  return (
    <View
      {...panResponder.panHandlers}
      onLayout={handleLayout}
      testID={testID}
      style={[styles.container, style]}
      accessible={false}
    >
      {/* Dedicated TalkBack Gesture Surface in background so child buttons remain individually focusable in Explore-by-Touch */}
      <View
        style={StyleSheet.absoluteFillObject}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel="Vùng quét tiền cảm ứng toàn màn hình. Chạm đúp để đọc lại kết quả hiện tại, giữ để đọc ví, hoặc mở menu hành động trợ năng để bật đèn, đọc ví, xóa ví."
        accessibilityActions={[
          { name: 'activate', label: 'Đọc lại kết quả hiện tại' },
          { name: 'longpress', label: 'Đọc tổng ví tích lũy trong phiên' },
          { name: 'reread_money', label: 'Đọc lại mệnh giá (1 chạm)' },
          { name: 'toggleTorch', label: 'Bật hoặc tắt đèn pin' },
          { name: 'readWallet', label: 'Đọc tổng ví tích lũy trong phiên' },
          { name: 'resetWallet', label: 'Đặt lại ví tích lũy về 0' },
        ]}
        onAccessibilityAction={handleAccessibilityAction}
        testID="talkback-gesture-surface"
      />
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    width: '100%',
    height: '100%',
  },
});
