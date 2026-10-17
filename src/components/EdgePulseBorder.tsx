import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { THEME } from '../constants/theme';

export interface EdgePulseBorderProps {
  active: boolean;
  /** Denomination-specific chromatic glow color for low-vision users */
  activeColor?: string;
  /** Ticket 09: Current power state. When 'ECO', pauses 60 FPS loop and holds static opacity 0.85 */
  powerState?: 'BURST' | 'ECO' | 'HIBERNATION';
  style?: ViewStyle;
  children?: React.ReactNode;
}

export const ECO_STATIC_BORDER_OPACITY = 0.85;

/**
 * EdgePulseBorder
 * Renders an 8dp breathing glow border around the screen when money is detected.
 * Complies with WCAG AAA tactile visual cues for low vision users.
 * Ticket 09: Pauses the 60 FPS RenderThread loop when in ECO mode (holding static opacity = 0.85)
 * or HIBERNATION mode (opacity = 0.0) to eliminate idle GPU/UI power drain.
 * Ticket 21: Full-Screen Chromatic Shift dynamically adopting banknote denomination colors.
 */
export const EdgePulseBorder: React.FC<EdgePulseBorderProps> = ({
  active,
  activeColor,
  powerState = 'BURST',
  style,
  children,
}) => {
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const wasActiveRef = useRef<boolean>(false);

  useEffect(() => {
    if (loopRef.current) {
      loopRef.current.stop();
      loopRef.current = null;
    }

    if (active) {
      wasActiveRef.current = true;
      if (powerState === 'HIBERNATION') {
        pulseAnim.setValue(0);
      } else if (powerState === 'ECO') {
        // Ticket 09: Stop 60 FPS animation loop in ECO and keep static high-contrast border
        pulseAnim.setValue(ECO_STATIC_BORDER_OPACITY);
      } else {
        // BURST mode: Start breathing loop between min opacity and max opacity
        pulseAnim.setValue(THEME.animation.pulseMinOpacity);
        loopRef.current = Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: THEME.animation.pulseMaxOpacity,
              duration: THEME.animation.pulseDurationMs,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: THEME.animation.pulseMinOpacity,
              duration: THEME.animation.pulseDurationMs,
              useNativeDriver: true,
            }),
          ])
        );
        loopRef.current.start();
      }
    } else if (wasActiveRef.current) {
      wasActiveRef.current = false;
      // Stop loop and fade border out cleanly only when transitioning from active -> inactive
      Animated.timing(pulseAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      pulseAnim.setValue(0);
    }

    return () => {
      if (loopRef.current) {
        loopRef.current.stop();
      }
    };
  }, [active, powerState, pulseAnim]);

  return (
    <View style={[styles.container, style]}>
      {children}
      {/* Absolute overlay border so it doesn't shift internal layout or block touches */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.borderOverlay,
          {
            opacity: pulseAnim,
            borderColor: activeColor ?? THEME.colors.borderGlow,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  borderOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: THEME.layout.edgeBorderWidth,
    borderColor: THEME.colors.borderGlow,
    // Rounded slightly for display corner ergonomics if desired
    borderRadius: 2,
    zIndex: 999,
  },
});
