import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { THEME } from '../constants/theme';
import { AUTHOR_INFO } from '../constants/author';
import type { MoneyClass } from '../types/money';
import { SUPPORTED_DENOMINATIONS } from '../types/money';
import { formatVND } from '../utils/formatters';

export interface SimulationControlsProps {
  isOpen?: boolean;
  onClose?: () => void;
  onSimulateDetection: (classId: MoneyClass) => void;
  onSimulateMultiDetection: (
    items: { classId: MoneyClass; count: number }[]
  ) => void;
  onSimulateEmptyFrame: () => void;
  onTriggerSingleTap: () => void;
  onTriggerDoubleTap: () => void;
  onTriggerLongPress: () => void;
  onTriggerTwoFingerDoubleTap: () => void;
  onSimulateLuminance?: (lux: number) => void;
  currentLuminance?: number;
  onOpenAuthorModal?: () => void;
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  isOpen = false,
  onClose,
  onSimulateDetection,
  onSimulateMultiDetection,
  onSimulateEmptyFrame,
  onTriggerSingleTap,
  onTriggerDoubleTap,
  onTriggerLongPress,
  onTriggerTwoFingerDoubleTap,
  onSimulateLuminance,
  currentLuminance,
  onOpenAuthorModal,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  if (!isOpen) {
    return null;
  }

  return (
    <View style={styles.container} testID="simulation-controls-drawer">
      {/* Fixed Footer Author & Copyright Attribution Bar */}
      <View style={styles.authorFooterRow}>
        <Text style={styles.authorFooterText} numberOfLines={1}>
          {AUTHOR_INFO.fixedBannerText}
        </Text>
        {onOpenAuthorModal && (
          <TouchableOpacity
            style={styles.authorModalBtn}
            activeOpacity={0.8}
            onPress={onOpenAuthorModal}
            accessibilityRole="button"
            accessibilityLabel={AUTHOR_INFO.modalTitle}
          >
            <Text style={styles.authorModalBtnText}>
              {AUTHOR_INFO.shortButtonLabel}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Toggle / Close Button */}
      <TouchableOpacity
        style={styles.toggleBar}
        activeOpacity={0.8}
        onPress={() => {
          if (onClose) {
            onClose();
          } else {
            setIsExpanded(prev => !prev);
          }
        }}
        accessibilityRole="button"
        accessibilityLabel="Đóng bảng giả lập kiểm thử"
        testID="close-simulation-drawer-btn"
      >
        <Text style={styles.toggleText}>
          {isExpanded
            ? 'ĐÓNG BẢNG GIẢ LẬP KIỂM THỬ (MOCK / TEST)'
            : 'MỞ BẢNG GIẢ LẬP KIỂM THỬ (MOCK / TEST)'}
        </Text>
      </TouchableOpacity>

      {/* Expanded Control Drawer */}
      {isExpanded && (
        <View style={styles.panel}>
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Section A: Simulate Banknotes */}
            <Text style={styles.sectionTitle}>1. GIẢ LẬP NHẬN DIỆN MỆNH GIÁ:</Text>
            <View style={styles.buttonGrid}>
              {SUPPORTED_DENOMINATIONS.map(denom => (
                <TouchableOpacity
                  key={denom}
                  style={styles.denomButton}
                  onPress={() => onSimulateDetection(denom)}
                >
                  <Text style={styles.denomButtonText}>
                    +{formatVND(denom)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Quick multi & clear */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.multiButton]}
                onPress={() =>
                  onSimulateMultiDetection([
                    { classId: 100000, count: 2 },
                    { classId: 50000, count: 1 },
                  ])
                }
              >
                <Text style={styles.actionButtonText}>
                  + Ghép: 2x100k + 1x50k
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.emptyButton]}
                onPress={onSimulateEmptyFrame}
              >
                <Text style={styles.emptyButtonText}>RÚT TIỀN (TRỐNG)</Text>
              </TouchableOpacity>
            </View>

            {/* Section B: Simulate Gestures */}
            <Text style={styles.sectionTitle}>
              2. GIẢ LẬP CỬ CHỈ CẢM ỨNG (GESTURES):
            </Text>
            <View style={styles.gestureGrid}>
              <TouchableOpacity
                style={styles.gestureButton}
                onPress={onTriggerSingleTap}
              >
                <Text style={styles.gestureButtonText}>1 CHẠM (ĐỌC LẠI)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.gestureButton}
                onPress={onTriggerDoubleTap}
              >
                <Text style={styles.gestureButtonText}>2 CHẠM (ĐÈN PIN)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.gestureButton}
                onPress={onTriggerLongPress}
              >
                <Text style={styles.gestureButtonText}>GIỮ 1S (TỔNG VÍ)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.gestureButton, styles.resetGestureButton]}
                onPress={onTriggerTwoFingerDoubleTap}
              >
                <Text style={styles.resetGestureButtonText}>
                  2 NGÓN X2 (RESET VÍ)
                </Text>
              </TouchableOpacity>
            </View>

            {/* Section 4: Smart Torch Luminance Simulation */}
            {onSimulateLuminance && (
              <>
                <Text style={styles.sectionTitle}>
                  4. GIẢ LẬP ÁNH SÁNG{' '}
                  {currentLuminance !== undefined
                    ? `(${Math.round(currentLuminance)} LUX)`
                    : ''}
                </Text>
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.emptyButton]}
                    onPress={() => onSimulateLuminance(15)}
                    accessibilityRole="button"
                    accessibilityLabel="Giả lập thiếu sáng 15 lux"
                  >
                    <Text style={styles.actionButtonText}>
                      THIẾU SÁNG (15 LUX)
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.multiButton]}
                    onPress={() => onSimulateLuminance(80)}
                    accessibilityRole="button"
                    accessibilityLabel="Giả lập đủ sáng 80 lux"
                  >
                    <Text style={styles.actionButtonText}>
                      ĐỦ SÁNG (80 LUX)
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#121212',
    borderTopWidth: 2,
    borderTopColor: THEME.colors.primaryYellow,
    zIndex: 1000,
  },
  authorFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: THEME.colors.background,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderMuted,
  },
  authorFooterText: {
    flex: 1,
    color: THEME.colors.secondaryWhite,
    fontFamily: THEME.typography.fontFamilySans,
    fontSize: 12,
    fontWeight: THEME.typography.fontWeightSemiBold,
    marginRight: 8,
  },
  authorModalBtn: {
    minHeight: THEME.layout.accessibleTouchTarget48Dp,
    justifyContent: 'center',
    backgroundColor: THEME.colors.primaryYellow,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  authorModalBtnText: {
    color: THEME.colors.background,
    fontFamily: THEME.typography.fontFamilySans,
    fontSize: 12,
    fontWeight: THEME.typography.fontWeightBold,
  },
  toggleBar: {
    minHeight: THEME.layout.accessibleTouchTarget48Dp,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: {
    color: THEME.colors.primaryYellow,
    fontFamily: THEME.typography.fontFamilySans,
    fontSize: 13,
    fontWeight: THEME.typography.fontWeightBold,
    letterSpacing: 0.5,
  },
  panel: {
    maxHeight: 300,
    backgroundColor: '#161616',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  scrollArea: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingBottom: 12,
  },
  sectionTitle: {
    color: THEME.colors.primaryYellow,
    fontFamily: THEME.typography.fontFamilySans,
    fontSize: 13,
    fontWeight: THEME.typography.fontWeightBold,
    marginTop: 6,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  buttonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  denomButton: {
    minHeight: THEME.layout.accessibleTouchTarget48Dp,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: THEME.colors.borderMuted,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  denomButtonText: {
    color: THEME.colors.primaryYellow,
    fontFamily: THEME.typography.fontFamilyTabular,
    fontSize: 13,
    fontWeight: THEME.typography.fontWeightBold,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  actionButton: {
    flex: 1,
    minHeight: THEME.layout.accessibleTouchTarget48Dp,
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  multiButton: {
    backgroundColor: '#122616',
    borderWidth: 1.5,
    borderColor: THEME.colors.accentGreen,
  },
  actionButtonText: {
    color: THEME.colors.accentGreen,
    fontFamily: THEME.typography.fontFamilySans,
    fontSize: 13,
    fontWeight: THEME.typography.fontWeightBold,
  },
  emptyButton: {
    backgroundColor: '#281414',
    borderWidth: 1.5,
    borderColor: THEME.colors.accentRed,
  },
  emptyButtonText: {
    color: THEME.colors.accentRed,
    fontFamily: THEME.typography.fontFamilySans,
    fontSize: 13,
    fontWeight: THEME.typography.fontWeightBold,
  },
  gestureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  gestureButton: {
    flexBasis: '48%',
    minHeight: THEME.layout.accessibleTouchTarget48Dp,
    justifyContent: 'center',
    backgroundColor: '#1A1A1A',
    borderWidth: 1.5,
    borderColor: THEME.colors.primaryYellow,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  gestureButtonText: {
    color: THEME.colors.primaryYellow,
    fontFamily: THEME.typography.fontFamilySans,
    fontSize: 12,
    fontWeight: THEME.typography.fontWeightBold,
  },
  resetGestureButton: {
    borderColor: THEME.colors.accentRed,
    backgroundColor: '#1F0B0B',
  },
  resetGestureButtonText: {
    color: THEME.colors.accentRed,
    fontFamily: THEME.typography.fontFamilySans,
    fontSize: 12,
    fontWeight: THEME.typography.fontWeightBold,
  },
});
