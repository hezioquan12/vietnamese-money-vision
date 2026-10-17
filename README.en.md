# MoneyVision — 100% Offline Assistive AI Application for Vietnamese Banknote Recognition for the Visually Impaired

**Language / Ngôn ngữ:** [Tiếng Việt (README.md)](README.md) | **English (Current)**

- **Author & Independent Owner:** Nguyễn Quang Toàn (`Nguyễn Quang Toàn - Chủ sở hữu & Phát triển độc lập` / Independent Owner & Developer)
- **Copyright:** `© 2026 Nguyễn Quang Toàn - Sở hữu & Phát triển độc lập` (All Rights Reserved)
- **Application ID:** `com.nckh.moneyvision` | **Version:** `1.0.0` (`versionCode = 1`)
- **OS Support:** Android 9.0 Pie (`minSdkVersion = 28`) through Android 14+ (`targetSdkVersion = 34`)
- **CPU Architecture:** Universal Dual-ABI (`armeabi-v7a` 32-bit and `arm64-v8a` 64-bit)
- **Security Policy:** 100% Offline (`Zero-Network`, zero `android.permission.INTERNET` declarations)

---

## 1. Executive Summary

**MoneyVision** is a real-time assistive mobile application engineered specifically for **totally blind users**, **low-vision individuals**, and **elderly citizens** in Vietnam. The application combines live rear-camera YUV frames with an INT8-quantized **YOLO26n object detection model (`yolo26_money_quant.tflite`, 2.75 MB)** running directly on **Google LiteRT / TensorFlow Lite JNI (XNNPACK)** to accurately recognize all **9 circulating Vietnamese Dong (VND) cotton and polymer banknote denominations**:

`1,000₫`, `2,000₫`, `5,000₫`, `10,000₫`, `20,000₫`, `50,000₫`, `100,000₫`, `200,000₫`, `500,000₫`.

Unlike commercial image-tagging tools, MoneyVision is architected from first principles around **Blind-First & Thermal-Safe Engineering**:

1. **100% Offline & Zero-Network Security Architecture**:
   - The application declares zero network permissions (`android.permission.INTERNET` is completely absent). All image preprocessing, neural network inference, and speech output happen entirely on-device with zero cloud latency and complete data privacy.

2. **WCAG AAA Low-Vision HUD & Dual-Mode Google TalkBack Compatibility**:
   - High-contrast canvas pairing **True OLED Black (`#000000`)** with **Solar Yellow (`#FFE600`, 16.74:1 contrast ratio)** in **64sp** hero typography, an L-shaped corner viewfinder reticle, and distinct high-contrast color badges for polymer and cotton banknotes.
   - Reclaims **100% of the screen area as an eyes-free tactile gesture canvas**, guarded by **Per-Pointer 16dp Edge Palm-Rejection**.
   - Functions concurrently across two distinct modes: when TalkBack is off (direct multi-touch gesture processing) and when TalkBack is enabled (`Explore-by-Touch`) via `View.AccessibilityDelegate`, `View.OnHoverListener`, `AccessibilityManager.interrupt()`, and temporary audio ducking via `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK` (Zero Talk-Over).

3. **Spatial Guidance Pulse & 9-Denomination Tactile Morse Code**:
   - Emits a gentle **25ms** haptic guidance pulse (*"Hold hand steady"*) immediately upon detecting a banknote edge or blurred silhouette entering the frame ($0.28 \le \text{score} < 0.50$).
   - Encodes all 9 denominations into distinct 3-tier vibration signatures (cotton banknotes = 35ms crisp pulses; tens-of-thousands polymer = 70ms pulses; hundreds-of-thousands polymer = 40ms lead-in combined with 120ms–140ms deep pulses), enabling recognition in loud environments.

4. **4-Layer Anti-Strobe Smart Torch & Two-Path Recovery System**:
   - Combines the front-facing hardware ambient light sensor (`Sensor.TYPE_LIGHT`), post-torch reflection baseline tracking (`postTorchBaselineLuma`), specular hotspot analysis (`glareRatio`), a 12-second minimum hold duration, active-detection locking (`ACTIVE_DETECTION_LOCK`), and a 60-second anti-oscillation circuit breaker (`Oscillation Latch`).
   - When the user manually turns off the torch via double-tap, the system automatically re-arms Auto-Torch through two paths: upon transitioning to lit indoor environments ($\ge 35\text{ lux}$ after a 250ms settle window), or after a 2.5-second buffer when walking into new dark areas (via the `hasMovedSinceManualOff` motion latch using $\Delta Y \ge 4.5$ and IMU acceleration $\Delta a \ge 0.35\text{ m/s}^2$).

5. **Presentation-Peak Wallet Accumulator & Multi-Note Audio Protection**:
   - Reconciles peak denomination sets within each presentation session ($W_{\text{total}} = W_{\text{baseline}} \oplus M_{\text{presentation}}$), bridging brief dropouts under 1.5 seconds during hand repositioning and adjusting denomination assignments for identical multi-note counts ($\ge 2$ notes).
   - Features **Multi-Note Upgrade Preemption** when detected count increases from 1 to 2 notes, maintains silence during downward flicker ($2 \rightarrow 1 \rightarrow 2$ notes), and enforces the **`isReadingWallet`** protection lock so camera empty frames do not cut off the wallet speech summary when the user lowers their hand.

6. **3-Tier Adaptive Thermal & Power Governor**:
   - Dynamically transitions inference duty cycles: **BURST (130ms)** $\rightarrow$ **ECO (650ms)** $\rightarrow$ **HIBERNATION (1500ms–3000ms)** while halting continuous Camera2 ISP frames (`captureSession.stopRepeating()`), filtering motion-blurred frames (`MOTION_BLUR_GATE`, $\Delta Y > 32.0$), executing $16\times 16$ Cache-Tiled YUV-to-NCHW conversion, and running a Row-Major Sparse Decoder (0 coordinate reads on empty frames).

---

## 2. Visual Architecture & Interface Diagrams

### 2.1. WCAG AAA Low-Vision HUD Blueprint

The diagram below illustrates the high-contrast interface designed for Android display devices:

![Low-Vision HUD Interface](docs/images/viewfinder_reticle_hud.svg)

```text
+-------------------------------------------------------------+
| [FLASH: AUTO]                [BURST (130ms)]   [BAT: 88% | 33°C] | <-- Hardware Status Bar
+-------------------------------------------------------------+
|                                                             |
|   |--                                                   --| |
|   |                                                       | | <-- L-Shaped Viewfinder Reticle
|                                                             |     Centers Banknote in View
|                                                             |
|                    500,000 VND                              | <-- Hero Typography (64sp, Solar Yellow #FFE600)
|                                                             |     16.74:1 Contrast on OLED Black #000000
|                                                             |
|                 [ POLYMER - CYAN BLUE ]                     | <-- Denomination Color Badge (Low-Vision Aid)
|                                                             |
|   |                                                       | |
|   |--                                                   --| |
|                                                             |
+-------------------------------------------------------------+
| <====== 16dp PER-POINTER EDGE PALM-REJECTION MARGINS ========> | <-- Palm Rejection Safe Zone
|                                                             |
|                 FULLSCREEN TACTILE GESTURE CANVAS:          |
|   - Single Tap: Replay Denomination & Haptic Feedback       |
|   - Double Tap: Toggle Flashlight Manually                  |
|   - 1-Second Hold: Announce Cumulative Wallet Total         |
|   - Two-Finger Double Tap: Reset Cumulative Session Wallet  |
|                                                             |
+-------------------------------------------------------------+
| [ WALLET: 700,000₫ ]                 [ AUTHOR: QUANG TOAN ] | <-- Bottom Action Dock (48dp Touch Targets)
+-------------------------------------------------------------+
```

### 2.2. End-to-End System Architecture

![MoneyVision System Architecture](docs/images/system_architecture.svg)

### 2.3. 3-Tier Adaptive Power & Thermal Governor (BURST / ECO / HIBERNATION)

![3-Tier Power Governor](docs/images/power_governor_state.svg)

---

## 3. Technical Documentation Index

Detailed engineering specifications are available in both English and Vietnamese:

| Document | Technical Focus | Primary Audience |
| :--- | :--- | :--- |
| [`docs/BLIND_FIRST_UI_UX_SPECIFICATION.en.md`](docs/BLIND_FIRST_UI_UX_SPECIFICATION.en.md)<br>[`docs/BLIND_FIRST_UI_UX_SPECIFICATION.md`](docs/BLIND_FIRST_UI_UX_SPECIFICATION.md) | In-depth specification for Low-Vision HUD, 16dp per-pointer edge palm-rejection ergonomics, multi-touch state machines, Google TalkBack integration, and 9-denomination tactile haptics. | UI/UX Engineers, Accessibility Specialists |
| [`docs/SYSTEM_ARCHITECTURE_AND_DESIGN.en.md`](docs/SYSTEM_ARCHITECTURE_AND_DESIGN.en.md)<br>[`docs/SYSTEM_ARCHITECTURE_AND_DESIGN.md`](docs/SYSTEM_ARCHITECTURE_AND_DESIGN.md) | Architectural analysis of Dual-Runtime synchronization (TypeScript & Native Android), $16\times 16$ Cache-Tiled YUV-to-NCHW conversion, Row-Major Sparse Decoder, 3-tier power governor, and universal release packaging. | Systems Engineers, Android Native Engineers, AI CV Engineers |
| [`README.en.md`](README.en.md)<br>[`README.md`](README.md) | Bilingual overview portal, setup guide, automated test suite execution, and release build commands. | All Contributors |

---

## 4. Repository Structure

```text
App_android/
├── App.tsx                                 # Root Component integrating CameraViewport, GestureCanvas, TactileDisplay
├── package.json                            # Project configuration & author metadata (Nguyễn Quang Toàn)
├── LICENSE                                 # MIT Open Source License
├── .gitignore                              # Production git ignore configuration
├── README.md                               # Primary documentation (Tiếng Việt)
├── README.en.md                            # Primary documentation (English)
├── docs/
│   ├── images/                             # Vector diagrams and visual assets for GitHub
│   │   ├── system_architecture.svg         # High-level system architecture flowchart
│   │   ├── viewfinder_reticle_hud.svg      # Low-Vision HUD interface layout
│   │   └── power_governor_state.svg        # 3-tier power governor state machine
│   ├── BLIND_FIRST_UI_UX_SPECIFICATION.md  # Accessibility UI/UX specification (Tiếng Việt)
│   ├── BLIND_FIRST_UI_UX_SPECIFICATION.en.md # Accessibility UI/UX specification (English)
│   ├── SYSTEM_ARCHITECTURE_AND_DESIGN.md   # Deep architecture engineering guide (Tiếng Việt)
│   └── SYSTEM_ARCHITECTURE_AND_DESIGN.en.md # Deep architecture engineering guide (English)
├── packages/
│   └── antigravity-skills-pack/            # Standalone package of 51 Antigravity skills (install.ps1 & install.sh)
├── src/                                    # TYPESCRIPT / REACT NATIVE LAYER
│   ├── constants/                          # Author metadata constants & WCAG AAA color palette
│   ├── types/                              # Core TypeScript interfaces & type definitions
│   ├── utils/                              # Gesture recognizer, 16dp palm rejection, currency formatting
│   ├── hooks/                              # useMoneyState: Camera, Debounce, Governor, Audio, Haptics
│   ├── components/                         # CameraViewport, EdgePulseBorder, GestureCanvas, TactileDisplay
│   └── services/                           # Single-pass Y analyzer, Smart torch, Power governor, YOLO decoder
├── android/                                # NATIVE ANDROID LAYER
│   ├── build.gradle                        # minSdkVersion = 28 (Android 9.0), targetSdkVersion = 34
│   ├── libs/litert-1.0.1.aar               # Local Google LiteRT C++ runtime library
│   └── app/
│       ├── build.gradle                    # Dual-ABI (armeabi-v7a, arm64-v8a) & v1+v2+v3 signature config
│       ├── release.keystore                # RSA 4096-bit keystore for reproducible offline builds
│       ├── proguard-rules.pro              # JNI preservation rules for LiteRT, CameraX, and Native Modules
│       └── src/main/
│           ├── AndroidManifest.xml         # Zero-Network Manifest (CAMERA, VIBRATE, FLASHLIGHT; 0 INTERNET)
│           ├── assets/models/              # yolo26_money_quant.tflite (2.75 MB INT8 model)
│           ├── res/raw/                    # 24 pre-recorded voice clips (.mp3) and earcons (.wav)
│           └── java/com/nckh/moneyvision/  # MainActivity, MoneyAudioModule, MoneyCameraView, Yolo26Detector
├── scripts/                                # ZERO-DEPENDENCY AUTOMATED TEST & BUILD ENGINE
│   ├── test-runner.mjs                     # Automated runner for 222 tests across 21 test suites
│   ├── verify-apk-package.mjs              # Security & package integrity verification (10/10 criteria)
│   ├── build-release-apk.mjs               # Universal Release APK build script (zipalign 4096B/4B + SHA-256)
│   └── android-sdk-builder.mjs             # Direct Android SDK compiler (javac, d8, aapt2, apksigner)
└── release/
    └── com.nckh.moneyvision-v1.0.0-universal-release.apk  # Official Universal Release APK (9.10 MB)
```

---

## 5. Testing & Build Instructions

The verification and packaging pipelines are built on the **Node.js Built-in Test Runner** without requiring third-party testing frameworks.

### 5.1. Running the Automated Test Suite (222/222 Tests)

Verifies currency formatters, WCAG AAA contrast ratios, multi-touch gesture state machines, 16dp edge palm rejection, audio preemption queues, 4-layer anti-strobe flashlight guards, 3-tier power governors, INT8 YOLO tensor decoding, 5-frame consensus debouncers, presentation-peak wallet accumulation, and `classes.dex` bytecode symbols:

```bash
node scripts/test-runner.mjs
```

Expected result: `222 tests, 0 failures (100% Pass)`.

### 5.2. Running Security, Compatibility & Author Attribution Verification

Validates the Zero-Network architecture (`INTERNET = 0`), RSA 4096-bit signing key, Dual-ABI binaries (`armeabi-v7a` + `arm64-v8a`), `minSdkVersion = 28` / `targetSdkVersion = 34`, `v1 + v2 + v3` digital signatures, 24 verified audio assets, `yolo26_money_quant.tflite` model integrity (`TFL3`), and Nguyễn Quang Toàn author metadata:

```bash
node scripts/verify-apk-package.mjs
```

### 5.3. Building the Universal Release APK

Compiles native code, packages audio assets, embeds the `.tflite` model, enforces `zipalign` boundaries (4096-byte alignment for native `.so` files and 4-byte alignment for resources), and signs the package using `android/app/release.keystore`:

```bash
node scripts/build-release-apk.mjs
```

Output APK location:
- `release/com.nckh.moneyvision-v1.0.0-universal-release.apk` (Size: 9.10 MB — installs cleanly on all Android devices from version 9.0 Pie through 14+).

---

## 6. License & Copyright

Distributed under the [MIT License](LICENSE).

- Copyright: `© 2026 Nguyễn Quang Toàn - Sở hữu & Phát triển độc lập` (All Rights Reserved)
- Author & Independent Owner: **Nguyễn Quang Toàn**
