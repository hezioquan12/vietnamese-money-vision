import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  THEME,
  getDenominationVisualSpec,
  getPowerStateBadgeSpec,
} from '../constants/theme';
import { AUTHOR_INFO } from '../constants/author';
import type { DetectionState, SessionWalletState } from '../types/money';
import type { PowerState } from '../services/camera';
import { formatVND, formatDetectionSummary } from '../utils/formatters';

export interface TactileDisplayProps {
  detectionState: DetectionState;
  walletState: SessionWalletState;
  isTorchOn: boolean;
  powerState?: PowerState;
  hasCandidateHint?: boolean;
  isSimulationDrawerOpen?: boolean;
  announcementText?: string;
  lastGestureText?: string;
  isAuthorModalVisible?: boolean;
  onToggleTorch?: () => void;
  onReadWallet?: () => void;
  onResetWallet?: () => void;
  onToggleSimulationDrawer?: () => void;
  onOpenAuthorModal?: () => void;
  onCloseAuthorModal?: () => void;
  onAnnounceAuthorInfo?: () => void;
}

/**
 * TactileDisplay
 * Blind-First & Low-Vision HUD built specifically for visually impaired users.
 * Strictly adheres to WCAG AAA standards with OLED Black (#000000) and Solar Yellow (#FFE600).
 * Features:
 * - Zero Talk-Over (`accessibilityLiveRegion="none"` on dynamic regions)
 * - Direct >=48dp accessible buttons for TalkBack Explore-by-Touch (ĐÈN PIN, VÍ TÍCH LŨY, XÓA VÍ, KIỂM THỬ)
 * - 64sp Hero typography + Viewfinder Reticle + 9-Denomination Polymer/Cotton Color Badges + Power State Badge
 * - Fixed Author & Independent Ownership attribution and a WCAG AAA Copyright Modal.
 */
export const TactileDisplay: React.FC<TactileDisplayProps> = ({
  detectionState,
  walletState,
  isTorchOn,
  powerState = 'BURST',
  hasCandidateHint = false,
  isSimulationDrawerOpen = false,
  announcementText,
  lastGestureText,
  isAuthorModalVisible,
  onToggleTorch,
  onReadWallet,
  onResetWallet,
  onToggleSimulationDrawer,
  onOpenAuthorModal,
  onCloseAuthorModal,
  onAnnounceAuthorInfo,
}) => {
  const [internalModalOpen, setInternalModalOpen] = useState<boolean>(false);
  const modalVisible = isAuthorModalVisible ?? internalModalOpen;

  const handleOpenModal = () => {
    if (onOpenAuthorModal) {
      onOpenAuthorModal();
    } else {
      setInternalModalOpen(true);
      onAnnounceAuthorInfo?.();
    }
  };

  const handleCloseModal = () => {
    if (onCloseAuthorModal) {
      onCloseAuthorModal();
    } else {
      setInternalModalOpen(false);
    }
  };

  const summary = formatDetectionSummary(detectionState.items);
  const activeItems = detectionState.items.filter(i => i && i.count > 0);
  const topDenomination =
    activeItems.length > 0
      ? Math.max(...activeItems.map(i => i.classId))
      : null;
  const primaryVisualSpec = topDenomination
    ? getDenominationVisualSpec(topDenomination)
    : null;
  const powerBadge = getPowerStateBadgeSpec(powerState);

  const reticleColor = detectionState.hasMoney
    ? primaryVisualSpec?.colorHex ?? THEME.colors.accentGreen
    : hasCandidateHint
    ? THEME.colors.primaryYellow
    : THEME.colors.borderMuted;

  return (
    <View style={styles.container} pointerEvents="box-none" accessible={false}>
      {/* 1. Header Bar: Status, Power State Badge, Author Attribution & Simulation Drawer Button */}
      <View style={styles.headerBlock}>
        <View style={styles.header}>
          <View style={styles.titleColumn}>
            <Text
              style={styles.headerTitle}
              accessibilityRole="header"
              accessibilityLabel="Ứng dụng nhận diện tiền tệ Money Vision"
            >
              MONEY VISION
            </Text>
            <View
              style={[
                styles.powerBadge,
                { borderColor: powerBadge.color },
              ]}
              accessible={true}
              accessibilityRole="text"
              accessibilityLabel={`Trạng thái năng lượng camera: ${powerBadge.label}`}
              testID="power-state-badge"
            >
              <Text style={[styles.powerBadgeText, { color: powerBadge.color }]}>
                {powerBadge.label}
              </Text>
            </View>
          </View>

          <View style={styles.toolbarButtonsRow}>
            <TouchableOpacity
              style={[
                styles.simDrawerToggleBtn,
                isSimulationDrawerOpen && styles.simDrawerToggleBtnActive,
              ]}
              activeOpacity={0.8}
              onPress={onToggleSimulationDrawer}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel={
                isSimulationDrawerOpen
                  ? 'Đóng ngăn kéo kiểm thử giả lập'
                  : 'Mở ngăn kéo kiểm thử giả lập'
              }
              testID="toggle-simulation-drawer-btn"
            >
              <Text
                style={[
                  styles.simDrawerToggleText,
                  isSimulationDrawerOpen && styles.simDrawerToggleTextActive,
                ]}
              >
                KIỂM THỬ
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Fixed Header Author Attribution Bar + Button to open Copyright Modal */}
        <View style={styles.authorHeaderBar}>
          <Text
            style={styles.authorBannerText}
            accessible={true}
            accessibilityRole="text"
            accessibilityLabel={AUTHOR_INFO.fixedBannerText}
          >
            {AUTHOR_INFO.fixedBannerText}
          </Text>
          <TouchableOpacity
            style={styles.authorButton}
            activeOpacity={0.8}
            onPress={handleOpenModal}
            accessibilityRole="button"
            accessibilityLabel="Thông tin Bản quyền và Tác giả Nguyễn Quang Toàn"
            testID="open-author-modal-btn"
          >
            <Text style={styles.authorButtonText}>
              {AUTHOR_INFO.shortButtonLabel}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. Main Live Detection Area (64sp Hero + Viewfinder Reticle + Polymer Color Badge) */}
      <View
        style={[
          styles.heroSection,
          { borderColor: reticleColor },
        ]}
        accessible={true}
        accessibilityRole="summary"
        accessibilityLiveRegion="none"
        accessibilityLabel={`Hiện tại: ${summary.spokenText}`}
        testID="viewfinder-reticle"
      >
        {/* 4 L-Shaped High-Contrast Viewfinder Reticle Corners for Low-Vision Alignment */}
        <View
          style={[
            styles.reticleCorner,
            styles.reticleCornerTL,
            { borderColor: reticleColor },
          ]}
          pointerEvents="none"
        />
        <View
          style={[
            styles.reticleCorner,
            styles.reticleCornerTR,
            { borderColor: reticleColor },
          ]}
          pointerEvents="none"
        />
        <View
          style={[
            styles.reticleCorner,
            styles.reticleCornerBL,
            { borderColor: reticleColor },
          ]}
          pointerEvents="none"
        />
        <View
          style={[
            styles.reticleCorner,
            styles.reticleCornerBR,
            { borderColor: reticleColor },
          ]}
          pointerEvents="none"
        />

        <Text style={styles.countBadge}>{summary.headline}</Text>

        <Text
          style={styles.heroAmount}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {summary.detail}
        </Text>

        {/* Polymer / Cotton Denomination Color Badge for Low-Vision Users */}
        {primaryVisualSpec && (
          <View
            style={[
              styles.polymerBadge,
              {
                backgroundColor: primaryVisualSpec.badgeColor,
                borderColor: THEME.colors.secondaryWhite,
              },
            ]}
            testID="polymer-color-badge"
          >
            <Text
              style={[
                styles.polymerBadgeText,
                { color: primaryVisualSpec.textColor },
              ]}
            >
              ● {primaryVisualSpec.colorNameVi.toUpperCase()} • {primaryVisualSpec.materialVi}
            </Text>
          </View>
        )}

        {/* Spatial Guidance "Giữ Yên Tay" visual cue when candidate detected */}
        {!detectionState.hasMoney && hasCandidateHint && (
          <View
            style={styles.candidateGuidanceBadge}
            testID="spatial-guidance-badge"
          >
            <Text style={styles.candidateGuidanceText}>
              GIỮ YÊN TAY — ĐANG ĐỊNH TÂM
            </Text>
          </View>
        )}

        {/* Breakdown for multiple bills */}
        {detectionState.items.length > 1 && (
          <View style={styles.breakdownContainer}>
            {detectionState.items.map(item => (
              <Text key={item.classId} style={styles.breakdownText}>
                • {item.count}x {formatVND(item.classId)}
              </Text>
            ))}
          </View>
        )}
      </View>

      {/* 3. Bottom Action Dock: Torch + Session Wallet + Reset Button (Direct Accessible Buttons >= 48dp) */}
      <View style={styles.walletRowContainer}>
        {/* Left: Torch Toggle Button (Accessible Touch Target >= 48dp) */}
        <TouchableOpacity
          style={[
            styles.torchBadge,
            isTorchOn ? styles.torchBadgeOn : styles.torchBadgeOff,
          ]}
          activeOpacity={0.8}
          onPress={onToggleTorch}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={`Nút bật tắt đèn pin. Hiện đang ${
            isTorchOn ? 'Bật' : 'Tắt'
          }`}
          testID="torch-toggle-btn"
        >
          <Text
            style={[
              styles.torchText,
              isTorchOn ? styles.torchTextOn : styles.torchTextOff,
            ]}
          >
            {isTorchOn ? 'ĐÈN PIN: BẬT' : 'ĐÈN PIN: TẮT'}
          </Text>
        </TouchableOpacity>

        {/* Center: Session Wallet Card (Flex 1) */}
        <TouchableOpacity
          style={styles.walletSection}
          activeOpacity={0.85}
          onPress={onReadWallet}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={`VÍ TÍCH LŨY: ${formatVND(
            walletState.totalAmount
          )}, gồm ${walletState.totalNotesCount} tờ. Chạm để nghe đọc tổng ví.`}
          testID="wallet-card-btn"
        >
          <View style={styles.walletHeader}>
            <Text style={styles.walletLabel}>VÍ TÍCH LŨY (PHIÊN)</Text>
            <Text style={styles.walletCount}>
              {walletState.totalNotesCount} TỜ
            </Text>
          </View>
          <Text
            style={styles.walletAmount}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {formatVND(walletState.totalAmount)}
          </Text>
        </TouchableOpacity>

        {/* Right: Wallet Reset Button */}
        <TouchableOpacity
          style={styles.walletResetButton}
          activeOpacity={0.85}
          onPress={onResetWallet}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="XÓA VÍ: Đặt lại ví tích lũy về 0 đồng"
          testID="wallet-reset-btn"
        >
          <Text style={styles.walletResetText}>XÓA VÍ</Text>
        </TouchableOpacity>
      </View>

      {/* 4. Tactile Gesture Guidance, Live Feedback & Dignified WCAG AAA Footer Attribution */}
      <View style={styles.footerSection}>
        {lastGestureText ? (
          <View style={styles.gestureFeedbackBadge}>
            <Text style={styles.gestureFeedbackText}>
              CỬ CHỈ: {lastGestureText}
            </Text>
          </View>
        ) : null}

        {announcementText ? (
          <Text
            style={styles.announcementText}
            accessibilityLiveRegion="none"
          >
            {announcementText}
          </Text>
        ) : null}

        <View style={styles.authorFooterBar}>
          <Text style={styles.footerCopyrightText}>
            {AUTHOR_INFO.copyrightNotice}
          </Text>
        </View>
      </View>

      {/* 5. WCAG AAA High-Contrast Author & Copyright Modal / Dialog */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={styles.modalCard}
            accessible={true}
            accessibilityRole="alert"
            accessibilityLabel={`${AUTHOR_INFO.modalTitle}. ${AUTHOR_INFO.ownershipRole}: ${AUTHOR_INFO.authorName}. ${AUTHOR_INFO.copyrightNotice}. ${AUTHOR_INFO.technicalSummary}`}
            testID="author-copyright-modal"
          >
            <Text style={styles.modalHeaderTitle}>
              {AUTHOR_INFO.modalHeaderTitle}
            </Text>

            <View style={styles.modalSection}>
              <Text style={styles.modalLabel}>
                CHỦ SỞ HỮU & NHÀ PHÁT TRIỂN ĐỘC LẬP:
              </Text>
              <Text style={styles.modalAuthorName}>
                {AUTHOR_INFO.authorName}
              </Text>
            </View>

            <View style={styles.modalSection}>
              <Text style={styles.modalLabel}>BẢN QUYỀN SỞ HỮU:</Text>
              <Text style={styles.modalBodyText}>
                {AUTHOR_INFO.copyrightNotice}
              </Text>
            </View>

            <View style={styles.modalSection}>
              <Text style={styles.modalLabel}>THÔNG TIN KỸ THUẬT:</Text>
              <Text style={styles.modalBodyText}>
                {AUTHOR_INFO.technicalSummary}
              </Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalSpeakButton}
                activeOpacity={0.8}
                onPress={() => {
                  if (onAnnounceAuthorInfo) {
                    onAnnounceAuthorInfo();
                  } else {
                    onOpenAuthorModal?.();
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel="Nghe đọc giới thiệu tác giả Nguyễn Quang Toàn"
              >
                <Text style={styles.modalSpeakButtonText}>
                  NGHE GIỚI THIỆU TÁC GIẢ
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalCloseButton}
                activeOpacity={0.8}
                onPress={handleCloseModal}
                accessibilityRole="button"
                accessibilityLabel="Đóng hộp thoại Thông tin Bản quyền và Tác giả"
                testID="close-author-modal-btn"
              >
                <Text style={styles.modalCloseButtonText}>
                  ĐÓNG HỘP THOẠI
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingHorizontal: THEME.layout.screenPadding,
    paddingTop: 10,
    paddingBottom: 14,
    justifyContent: 'space-between',
  },
  headerBlock: {
    borderBottomWidth: 2,
    borderBottomColor: THEME.colors.borderMuted,
    paddingBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 6,
  },
  titleColumn: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
  },
  headerTitle: {
    color: THEME.colors.primaryYellow,
    fontSize: 20,
    fontWeight: THEME.typography.fontWeightBold,
    fontFamily: THEME.typography.fontFamilySans,
    letterSpacing: 1.2,
  },
  powerBadge: {
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 3,
    paddingHorizontal: 8,
    backgroundColor: '#121212',
  },
  powerBadgeText: {
    fontFamily: THEME.typography.fontFamilySans,
    fontSize: 12,
    fontWeight: THEME.typography.fontWeightSemiBold,
  },
  toolbarButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  authorHeaderBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: THEME.colors.borderMuted,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 4,
  },
  authorBannerText: {
    flex: 1,
    color: THEME.colors.primaryYellow,
    fontFamily: THEME.typography.fontFamilySans,
    fontSize: 12,
    fontWeight: THEME.typography.fontWeightSemiBold,
    marginRight: 8,
  },
  authorButton: {
    minHeight: THEME.layout.accessibleTouchTarget48Dp,
    justifyContent: 'center',
    backgroundColor: THEME.colors.primaryYellow,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  authorButtonText: {
    color: THEME.colors.background,
    fontFamily: THEME.typography.fontFamilySans,
    fontSize: 12,
    fontWeight: THEME.typography.fontWeightBold,
  },
  torchBadge: {
    width: 90,
    minHeight: THEME.layout.accessibleTouchTarget48Dp,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  torchBadgeOn: {
    backgroundColor: THEME.colors.primaryYellow,
    borderColor: THEME.colors.primaryYellow,
  },
  torchBadgeOff: {
    backgroundColor: '#121212',
    borderColor: THEME.colors.borderMuted,
  },
  torchText: {
    fontFamily: THEME.typography.fontFamilySans,
    fontSize: 12,
    fontWeight: THEME.typography.fontWeightBold,
    textAlign: 'center',
    lineHeight: 16,
  },
  torchTextOn: {
    color: THEME.colors.background,
  },
  torchTextOff: {
    color: THEME.colors.secondaryWhite,
  },
  simDrawerToggleBtn: {
    minHeight: THEME.layout.accessibleTouchTarget48Dp,
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: THEME.colors.borderMuted,
    backgroundColor: '#121212',
  },
  simDrawerToggleBtnActive: {
    backgroundColor: THEME.colors.primaryYellow,
    borderColor: THEME.colors.primaryYellow,
  },
  simDrawerToggleText: {
    color: THEME.colors.secondaryWhite,
    fontFamily: THEME.typography.fontFamilySans,
    fontSize: 12,
    fontWeight: THEME.typography.fontWeightBold,
  },
  simDrawerToggleTextActive: {
    color: THEME.colors.background,
  },
  heroSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginVertical: 6,
    position: 'relative',
    borderWidth: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  reticleCorner: {
    position: 'absolute',
    width: 28,
    height: 28,
  },
  reticleCornerTL: {
    top: 4,
    left: 4,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 4,
  },
  reticleCornerTR: {
    top: 4,
    right: 4,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 4,
  },
  reticleCornerBL: {
    bottom: 4,
    left: 4,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 4,
  },
  reticleCornerBR: {
    bottom: 4,
    right: 4,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 4,
  },
  countBadge: {
    color: THEME.colors.secondaryWhite,
    fontSize: THEME.typography.fontSizeSecondary,
    fontFamily: THEME.typography.fontFamilySans,
    fontWeight: THEME.typography.fontWeightBold,
    letterSpacing: 1.2,
    marginBottom: 8,
    textAlign: 'center',
  },
  heroAmount: {
    color: THEME.colors.primaryYellow,
    fontSize: THEME.typography.fontSizeHero, // 64sp High-Contrast Hero
    fontFamily: THEME.typography.fontFamilyTabular,
    fontWeight: THEME.typography.fontWeightBold,
    textAlign: 'center',
    letterSpacing: 0.5,
    lineHeight: 72,
  },
  polymerBadge: {
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  polymerBadgeText: {
    fontFamily: THEME.typography.fontFamilySans,
    fontSize: 13,
    fontWeight: THEME.typography.fontWeightBold,
    letterSpacing: 0.5,
  },
  candidateGuidanceBadge: {
    marginTop: 10,
    backgroundColor: '#1E1A00',
    borderWidth: 1.5,
    borderColor: THEME.colors.primaryYellow,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  candidateGuidanceText: {
    color: THEME.colors.primaryYellow,
    fontFamily: THEME.typography.fontFamilySans,
    fontSize: 13,
    fontWeight: THEME.typography.fontWeightBold,
    textAlign: 'center',
  },
  breakdownContainer: {
    marginTop: 10,
    alignItems: 'center',
  },
  breakdownText: {
    color: THEME.colors.secondaryWhite,
    fontFamily: THEME.typography.fontFamilyTabular,
    fontSize: THEME.typography.fontSizeStatus,
    fontWeight: THEME.typography.fontWeightBold,
  },
  walletRowContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginVertical: 6,
  },
  walletSection: {
    flex: 1,
    minHeight: THEME.layout.accessibleTouchTarget48Dp,
    backgroundColor: '#121212',
    borderWidth: 1.5,
    borderColor: THEME.colors.primaryYellow,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  walletHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  walletLabel: {
    color: THEME.colors.primaryYellow,
    fontFamily: THEME.typography.fontFamilySans,
    fontSize: 13,
    fontWeight: THEME.typography.fontWeightBold,
    letterSpacing: 0.5,
  },
  walletCount: {
    color: THEME.colors.secondaryWhite,
    fontFamily: THEME.typography.fontFamilySans,
    fontSize: 13,
    fontWeight: THEME.typography.fontWeightSemiBold,
  },
  walletAmount: {
    color: THEME.colors.secondaryWhite,
    fontFamily: THEME.typography.fontFamilyTabular,
    fontSize: THEME.typography.fontSizePrimary, // >= 48sp (52sp)
    fontWeight: THEME.typography.fontWeightBold,
    letterSpacing: 0.5,
    lineHeight: 56,
  },
  walletResetButton: {
    width: 80,
    minHeight: THEME.layout.accessibleTouchTarget48Dp,
    backgroundColor: '#1A0C0C',
    borderWidth: 1.5,
    borderColor: THEME.colors.accentRed,
    borderRadius: 12,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  walletResetText: {
    color: THEME.colors.accentRed,
    fontFamily: THEME.typography.fontFamilySans,
    fontSize: 13,
    fontWeight: THEME.typography.fontWeightBold,
    textAlign: 'center',
  },
  footerSection: {
    paddingTop: 6,
  },
  gestureFeedbackBadge: {
    backgroundColor: '#1A1800',
    borderWidth: 1,
    borderColor: THEME.colors.primaryYellow,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignSelf: 'center',
    marginBottom: 6,
  },
  gestureFeedbackText: {
    color: THEME.colors.primaryYellow,
    fontFamily: THEME.typography.fontFamilySans,
    fontSize: 13,
    fontWeight: THEME.typography.fontWeightSemiBold,
  },
  announcementText: {
    color: THEME.colors.secondaryWhite,
    fontFamily: THEME.typography.fontFamilySans,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 6,
  },
  authorFooterBar: {
    paddingTop: 8,
    alignItems: 'center',
  },
  footerCopyrightText: {
    color: THEME.colors.primaryYellow, // WCAG AAA compliant (> 16:1 on OLED Black)
    fontFamily: THEME.typography.fontFamilySans,
    fontSize: 11,
    fontWeight: THEME.typography.fontWeightSemiBold,
    textAlign: 'center',
    marginTop: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#0A0A0A',
    borderWidth: 2,
    borderColor: THEME.colors.primaryYellow,
    borderRadius: 16,
    padding: 20,
  },
  modalHeaderTitle: {
    color: THEME.colors.primaryYellow,
    fontFamily: THEME.typography.fontFamilySans,
    fontSize: 18,
    fontWeight: THEME.typography.fontWeightBold,
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 1,
  },
  modalSection: {
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: THEME.colors.borderMuted,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  modalLabel: {
    color: THEME.colors.primaryYellow,
    fontFamily: THEME.typography.fontFamilySans,
    fontSize: 12,
    fontWeight: THEME.typography.fontWeightSemiBold,
    marginBottom: 4,
  },
  modalAuthorName: {
    color: THEME.colors.secondaryWhite,
    fontFamily: THEME.typography.fontFamilySans,
    fontSize: 22,
    fontWeight: THEME.typography.fontWeightBold,
  },
  modalBodyText: {
    color: THEME.colors.secondaryWhite,
    fontFamily: THEME.typography.fontFamilySans,
    fontSize: 14,
    fontWeight: THEME.typography.fontWeightNormal,
    lineHeight: 22,
  },
  modalActions: {
    marginTop: 8,
    gap: 10,
  },
  modalSpeakButton: {
    minHeight: THEME.layout.accessibleTouchTarget48Dp,
    justifyContent: 'center',
    backgroundColor: THEME.colors.primaryYellow,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalSpeakButtonText: {
    color: THEME.colors.background,
    fontFamily: THEME.typography.fontFamilySans,
    fontSize: 14,
    fontWeight: THEME.typography.fontWeightBold,
  },
  modalCloseButton: {
    minHeight: THEME.layout.accessibleTouchTarget48Dp,
    justifyContent: 'center',
    backgroundColor: '#121212',
    borderWidth: 1.5,
    borderColor: THEME.colors.secondaryWhite,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    color: THEME.colors.secondaryWhite,
    fontFamily: THEME.typography.fontFamilySans,
    fontSize: 14,
    fontWeight: THEME.typography.fontWeightBold,
  },
});
