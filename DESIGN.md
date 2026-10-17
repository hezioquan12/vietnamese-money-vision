---
version: alpha
name: money-vision
description: "Accessibility Ergonomic Design System for MoneyVision: 100% Offline Vietnamese Currency Reader for Blind and Low-Vision Users"
colors:
  background: "#000000"
  surface-dark: "#121212"
  surface-elevated: "#1A1A1A"
  surface-elevated-high: "#242424"
  primary-yellow: "#FFE600"
  secondary-white: "#FFFFFF"
  accent-green: "#00FF66"
  accent-red: "#FF7777"
  border-muted: "#333333"
  border-glow: "#FFE600"
  denom-500k: "#00E5FF"
  denom-200k: "#FF6D00"
  denom-100k: "#00E676"
  denom-50k: "#FF4081"
  denom-20k: "#40C4FF"
  denom-10k: "#FFD740"
  denom-5k: "#80D8FF"
  denom-2k: "#E0E0E0"
  denom-1k: "#FFF59D"
typography:
  sans:
    fontFamily: sans-serif
  mono:
    fontFamily: monospace
  hero:
    fontFamily: monospace
    fontSize: 64px
    lineHeight: 72px
    fontWeight: 700
  wallet:
    fontFamily: monospace
    fontSize: 52px
    lineHeight: 58px
    fontWeight: 700
  heading:
    fontFamily: sans-serif
    fontSize: 26px
    fontWeight: 700
  title:
    fontFamily: sans-serif
    fontSize: 20px
    fontWeight: 700
  body:
    fontFamily: sans-serif
    fontSize: 18px
    fontWeight: 400
  label:
    fontFamily: sans-serif
    fontSize: 15px
    fontWeight: 600
  caption:
    fontFamily: sans-serif
    fontSize: 12px
    fontWeight: 600
  micro:
    fontFamily: sans-serif
    fontSize: 11px
    fontWeight: 600
rounded:
  button: 8px
  card: 12px
  pill: 9999px
spacing:
  edge-palm-rejection: 16px
  edge-border-width: 8px
  touch-target-min: 44px
  touch-target-accessible: 48px
  screen-padding: 16px
---

# MoneyVision Design System

## Overview
MoneyVision is a 100% offline assistive Android application designed specifically for blind and low-vision users in Vietnam to recognize Vietnamese Đồng (1.000 đ – 500.000 đ) in real time. The visual and interaction design is governed by two complementary human factors:
1. **Blind-First Tactile & Auditory Accessibility**: Zero-Talk-Over TalkBack integration, full-screen multi-touch gesture mapping, 16dp edge palm-rejection, and distinct 9-denomination tactile haptic rhythms for non-visual operation.
2. **Low-Vision Ergonomics & WCAG AAA Contrast**: Peak retinal sensitivity at ~555nm (Solar Yellow `#FFE600` on OLED True Black `#000000`, ratio > 18:1), Full-Screen Chromatic Shift matching the 9 State Bank of Vietnam (SBV) banknote colors, 64sp Tabular Monospace Hero denomination numerals with thousand-separators, and 48dp Material Design 3 touch targets positioned within the ergonomic thumb zone.

All product surfaces maintain author attribution to **Nguyễn Quang Toàn** (`Nguyễn Quang Toàn - Chủ sở hữu & Phát triển độc lập`) and enforce zero-network security (`android.permission.INTERNET = 0`).

## Colors
- Apply True OLED Black `{colors.background}` across all root canvases and backgrounds to eliminate pixel light emission on OLED panels.
- Apply Solar Yellow `{colors.primary-yellow}` for primary branding, active highlights, viewfinder candidate cues, and copyright text (exceeds 18:1 contrast on black).
- Apply Pure White `{colors.secondary-white}` for high-contrast secondary headers, card counts, and border accents (21:1 contrast on black).
- Apply Accent Green `{colors.accent-green}` exclusively for active live scanning status badges (`🔍 ĐANG QUÉT`).
- Apply Accent Red `{colors.accent-red}` exclusively for destructive wallet reset affordances (`XÓA VÍ`).
- Apply Muted Dark Surface `{colors.surface-dark}` and Elevated Surface `{colors.surface-elevated}` for card backgrounds, header toolbars, and dialog containers.
- Apply Full-Screen Chromatic Shift across `{colors.denom-500k}` through `{colors.denom-1k}` on both the 8dp edge breathing border and the viewfinder reticle when a banknote is recognized.

## Typography
- Use system sans-serif (`fontFamily: 'sans-serif'`) for all interface copy, button labels, section headers, modal explanations, and status badges.
- Use tabular monospace (`fontFamily: 'monospace'`) exclusively for numerical currency and counter figures (`64sp` Hero amount, `52sp` Wallet total, and banknote simulation numbers).
- Format all currency numbers using standard Vietnamese thousand-separators (`500.000 đ`, `1.000.000 đ`) to enable low-vision users to count thousands/millions clusters without digit confusion.

## Layout
- Anchor interactive controls in the **Bottom Action Dock** in a single horizontal row (`[ ĐÈN PIN ] 90dp` + `[ VÍ TÍCH LŨY ] Flex 1` + `[ XÓA VÍ ] 84dp`) directly inside the thumb-zone arc of one-handed phone usage.
- Reserve the **Top Header Bar** for non-actionable status and secondary access across 2 structured rows: Row 1 hosts the application title, power badge, and developer drawer button; Row 2 hosts the fixed author attribution banner and copyright dialog trigger.
- Enforce a 16dp perimeter palm-rejection safe zone (`{spacing.edge-palm-rejection}`) on all pointer down/up touch events to eliminate accidental triggers from grip contact.
- Provide minimum 48dp touch targets (`{spacing.touch-target-accessible}`) on all interactive buttons per Material Design 3 and WCAG 2.5.5.

## Elevation & Depth
- Render backgrounds with True OLED Black `#000000` with 0 elevation.
- Separate cards and interactive docks using 1dp to 1.5dp high-contrast borders (`{colors.border-muted}`, `{colors.primary-yellow}`, `{colors.accent-red}`) rather than blur shadows or ambient drop-shadows.
- Render modal dialogs over a high-density scrim backdrop (`rgba(0, 0, 0, 0.92)`) with a 2dp Solar Yellow border.

## Shapes
- Apply 8px corner radius (`{rounded.button}`) to action buttons and author banner containers.
- Apply 12px corner radius (`{rounded.card}`) to the central Viewfinder Reticle box, session wallet card, and reset button.
- Apply 9999px fully rounded pill radius (`{rounded.pill}`) to power state badges and denomination color badges.

## Components
### Viewfinder Reticle
- Renders as a 12dp rounded rectangle box with a 3dp dynamic stroke around the 64sp Hero denomination and denomination color badge.
- Changes stroke color dynamically to match the recognized banknote (`#00E5FF` for 500k, `#FF6D00` for 200k, `#00E676` for 100k, etc.), Solar Yellow when a candidate silhouette is stabilizing, and muted dark gray (`#444444`) when empty.

### Edge Pulse Breathing Border
- Renders as an 8dp border overlay around the device screen perimeter.
- Pulses between 0.25 and 1.0 opacity in BURST mode, adopting the active banknote's color.
- Halts the 60 FPS animation loop in ECO mode, holding a static opacity of 0.85 to eliminate RenderThread power consumption.
- Completely shuts down (opacity 0.0) in HIBERNATION mode.

### Bottom Action Dock
- Contains direct accessible buttons with `accessibilityRole="button"` and descriptive Vietnamese accessibility labels:
  - `torch-toggle-btn`: 90dp min width, 48dp min height.
  - `wallet-card-btn`: Flex 1 dominant width, 48dp min height, tap to announce wallet summary.
  - `wallet-reset-btn`: 84dp min width, 48dp min height, reset wallet to 0.

### Author & Copyright Modal
- Displays author attribution to **Nguyễn Quang Toàn** (`Nguyễn Quang Toàn - Chủ sở hữu & Phát triển độc lập`) in bold high-contrast sans-serif.
- Contains two 48dp action buttons: "NGHE GIỚI THIỆU TÁC GIẢ" and "ĐÓNG HỘP THOẠI".

### Collapsible Simulation Drawer
- Hidden by default on launch (`isOpen = false` / `View.GONE`) to preserve 100% of the screen for tactile gestures.
- When expanded, renders as a bottom sheet with 0% emoji, sans-serif section labels, tabular monospace banknote chips, and 48dp touch targets.

## Do's and Don'ts
- **DO** use system Sans-serif for all button copy, dialog text, and headings.
- **DO** use Tabular Monospace exclusively for currency numbers and counters.
- **DO** enforce minimum 48dp touch targets on all clickable elements.
- **DO** keep `accessibilityLiveRegion="none"` on dynamic speech subtitles to prevent TalkBack talk-over during speech synthesis.
- **DO** maintain author attribution to **Nguyễn Quang Toàn** across all headers, footers, dialogs, and metadata.
- **DON'T** include emoji characters (`ℹ️`, `🔊`, `🔦`, `👛`, `🔄`, etc.) on buttons, labels, or dialogs.
- **DON'T** use monospace fonts for general prose, labels, or modal descriptions.
- **DON'T** use arbitrary gradient colors, drop shadows, or low-contrast gray text on black backgrounds.
- **DON'T** add `android.permission.INTERNET` or any network capabilities.
