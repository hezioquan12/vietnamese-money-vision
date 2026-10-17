# Workflow Spec: Offline Money Reader for the Visually Impaired (React Native Android 9+)

## 1. Tổng quan, Tác giả & Mục tiêu
- **Chủ sở hữu & Nhà phát triển độc lập:** **Nguyễn Quang Toàn** (`Nguyễn Quang Toàn - Chủ sở hữu & Phát triển độc lập`)
- **Bản quyền:** `© 2026 Nguyễn Quang Toàn - Sở hữu & Phát triển độc lập`
- **Hiển thị trên Giao diện chính & Hộp thoại Bản quyền (WCAG AAA):** Hiển thị cố định `"Tác giả & Sở hữu độc lập: Nguyễn Quang Toàn"` tại Header/Footer kèm nút mở hộp thoại **"Thông tin Bản quyền & Tác giả"** phát giọng đọc tiếng Việt *"Ứng dụng thuộc sở hữu và phát triển độc lập bởi Nguyễn Quang Toàn"* và phản hồi rung Haptic khi người dùng chạm vào.

Xây dựng ứng dụng di động React Native trên Android 9.0+ (API 28+) dành riêng cho người khiếm thị (Blind) và người có thị lực kém (Low Vision), sử dụng Camera thời gian thực quét và nhận diện các mệnh giá tiền Việt Nam Đồng (từ 1k đến 500k) thông qua mô hình YOLO26 TFLite lượng tử hóa. Ứng dụng hoạt động 100% offline, tối ưu hóa triệt để hiệu năng, phản hồi bằng âm thanh (Audio Clips) kết hợp rung haptic và triệt tiêu hoàn toàn hiện tượng lặp tiếng nhờ bộ lọc trạng thái ổn định (Temporal Debounce).

---

## 2. Kiến trúc Hệ thống (System Architecture)

```
[ CameraX Preview (30 FPS) ] ---------> Native Preview Surface (TextureView / SurfaceView)
            |
            v (YUV_420_888 @ 8-12 FPS)
[ Native Frame Analyzer (Coroutines/Thread Pool) ]
            |
            v (Resize & Normalize -> 640x640 RGB)
[ LiteRT / TFLite Interpreter (YOLO26 Quantized INT8) ]
            |
            v (Tensor [1, 13, 8400] -> Transpose & Decode BBoxes)
[ Native Non-Maximum Suppression (NMS) ]
            |
            v (Detected Detections: {class_id, score, bbox})
[ Temporal Debounce State Machine (5-Frame Sliding Window) ]
            |
            +-----> [ Smart Luminance Monitor ] ---> Tự động bật Torch nếu < 25 lux
            |
            v (Event: State Changed / Money Count Delta)
[ React Native JSI / Native Event Bridge ]
            |
            +-----> [ Audio Pipeline & Haptic Engine ]
            |         |-- Smart Interruption (Empty frame -> Cut speech + tick)
            |         |-- Sequential Voice Clips ("Hai tờ", "Năm mươi nghìn")
            |         `-- Multi-tier Haptic Feedback (VibrationEffect)
            |
            `-----> [ Tactile Accessibility UI (WCAG AAA) ]
                      |-- OLED Black (#000000) & Solar Yellow (#FFE600)
                      |-- Pulsing Detection Border (Edge Indicator)
                      `-- Fullscreen Gesture Canvas (Tap, Double Tap, Long Press)
```

---

## 3. Quy chuẩn Thuật toán & Xử lý Dữ liệu

### 3.1. Pipeline Nhận diện (YOLO26 LiteRT Engine)
- **Model format:** `.tflite` (Quantized INT8), Input Tensor `[1, 640, 640, 3]`.
- **Output Tensor:** `[1, 13, 8400]` (4 box coordinates + 9 class logits).
- **Vị trí file:** `android/app/src/main/assets/models/yolo26_money_quant.tflite`.
- **Trạng thái:** Mô hình đang trong quá trình huấn luyện -> Hệ thống tích hợp sẵn `MockMoneyDetector` để kiểm thử toàn diện luồng UI, Audio và Haptics trong môi trường phát triển.
- **Thứ tự nhãn chuẩn (Alphabetical Roboflow/YOLO):**
  - Index 0: `1000` (1.000 VNĐ - Một nghìn)
  - Index 1: `10000` (10.000 VNĐ - Mười nghìn)
  - Index 2: `100000` (100.000 VNĐ - Một trăm nghìn)
  - Index 3: `2000` (2.000 VNĐ - Hai nghìn)
  - Index 4: `20000` (20.000 VNĐ - Hai mươi nghìn)
  - Index 5: `200000` (200.000 VNĐ - Hai trăm nghìn)
  - Index 6: `5000` (5.000 VNĐ - Năm nghìn)
  - Index 7: `50000` (50.000 VNĐ - Năm mươi nghìn)
  - Index 8: `500000` (500.000 VNĐ - Năm trăm nghìn)
- **Tiền xử lý:** Chuyển đổi Color Space YUV sang RGB, scale aspect-ratio preserving về 640x640.
- **Hậu xử lý (Native C++/Kotlin):**
  - Score Threshold: $\ge 0.50$.
  - IoU Threshold (NMS): $0.45$.
  - Tần số suy luận: Cố định 8 - 12 FPS trên Background Executor để duy trì CPU mát và tiết kiệm pin cho Android 9.

### 3.2. Bộ lọc Trạng thái Ổn định (5-Frame Sliding Window Majority Vote)
- Duy trì bộ nhớ đệm $W = [F_{t-4}, F_{t-3}, F_{t-2}, F_{t-1}, F_t]$.
- Một tập hợp tờ tiền $M = \{(class_i, count_i)\}$ chỉ được xác nhận là "Trạng thái mới hợp lệ" khi xuất hiện đồng nhất trong $\ge 4/5$ frame gần nhất.
- Khi $M_{mới} \neq M_{cũ}$: Kích hoạt sự kiện cập nhật âm thanh.
- Nếu $M_{mới} = \emptyset$ (không có tiền): Chuyển ngay về trạng thái `IDLE`.

---

## 4. Cơ chế Âm thanh & Xúc giác (Audio & Haptic System)

### 4.1. Hệ thống File Âm thanh (Pre-recorded Voice Clips)
- Nạp sẵn các audio file chất lượng cao vào thư mục `android/app/src/main/res/raw/` hoặc assets:
  - **Mệnh giá:** `vnd_1k.mp3`, `vnd_2k.mp3`, `vnd_5k.mp3`, `vnd_10k.mp3`, `vnd_20k.mp3`, `vnd_50k.mp3`, `vnd_100k.mp3`, `vnd_200k.mp3`, `vnd_500k.mp3`.
  - **Số lượng:** `qty_1.mp3` ("Một tờ"), `qty_2.mp3` ("Hai tờ"), `qty_3.mp3` ("Ba tờ")...
  - **Earcons (Âm hiệu ngắn):** `tick.wav` (bắt được tiền), `empty.wav` (rút tiền ra), `torch_on.wav` (đã bật đèn), `torch_off.wav` (đã tắt đèn).

### 4.2. Logic Ngắt & Hàng đợi (Smart Hybrid Preemption)
1. **Rút tiền ra đột ngột ($M = \emptyset$):**
   - Lập tức hủy (`stop()`) mọi câu đọc đang dở.
   - Phát âm hiệu nhẹ `empty.wav` + rung ngắn 50ms.
2. **Có thêm tiền / Thay đổi số lượng ($M_{mới} \neq M_{cũ}$):**
   - Đợi câu đọc hiện tại kết thúc tự nhiên, sau đó phát câu cập nhật mới.
   - Cú pháp câu:
     - 1 tờ duy nhất: `[Mệnh giá]` (Ví dụ: *"Năm trăm nghìn"*).
     - Nhiều tờ: `[Số lượng] + [Mệnh giá]` (Ví dụ: *"Hai tờ một trăm nghìn, một tờ năm mươi nghìn"*).
3. **Cơ chế Cooldown:** Sau khi phát xong một trạng thái, giữ yên lặng tối thiểu 1.5 giây nếu khung hình không có bất kỳ biến động nào về số lượng hoặc mệnh giá.

---

## 5. Thiết kế Giao diện Công thái học (Tactile UI Map - Non-generic)

- **Màu sắc & Tương phản:** Chuẩn WCAG AAA
  - Nền chính: `#000000` (True OLED Black).
  - Màu nhấn & Văn bản chính: `#FFE600` (Safety Yellow - bước sóng dễ nhận diện nhất cho người thị lực kém).
  - Màu phụ: `#FFFFFF` (White).
- **Phản hồi Khung viền (Edge Pulse):** Khi có tiền trong khung hình, viền màn hình (độ dày 8dp) phát sáng nhịp thở (breathing glow) màu `#FFE600`.
- **Hiển thị Số liệu Cực đại:** Chữ số mệnh giá / tổng tiền hiển thị kích thước $\ge 48\text{sp}$ ở nửa dưới màn hình với font đơn khoảng (Monospace) rõ nét.
- **Bản đồ Cử chỉ Toàn màn hình (Gesture Canvas):**
  - **Single Tap (1 chạm):** Đọc lại trạng thái hiện tại hoặc thông báo *"Không có tiền trong tầm quét"*.
  - **Double Tap (2 chạm):** Bật / Tắt đèn pin (Flash).
  - **Long Press (Giữ 1 giây):** Đọc tổng số tiền tích lũy trong phiên (Accumulated Session Wallet) + Rung dài 200ms.
  - **Two-Finger Double Tap (2 ngón chạm đúp):** Xóa bộ đếm tiền tích lũy về 0.

---

## 6. Logic Ánh sáng Thông minh (Smart Ambient Torch)
- Bộ phân tích hình ảnh (ImageAnalysis) đo chỉ số Luminance trung bình của frame.
- Nếu Luminance $< 25\text{ lux}$ liên tục trong 1 giây:
  - Tự động kích hoạt Torch của Camera.
  - Phát âm hiệu `torch_on.wav` + rung nhẹ 100ms.
- Tự động tắt khi mức sáng tự nhiên đạt $\ge 60\text{ lux}$ hoặc người dùng Double Tap để can thiệp thủ công.

---

## 7. Quy trình Đóng gói & Phát hành APK Thuần Offline (Universal & Anti-Virus False Positive)

### 7.1. Cô lập Quyền hạn (Zero-Network Architecture)
Để triệt tiêu hoàn toàn khả năng bị Google Play Protect, Samsung Knox, hay trình diệt virus (Avast, Kaspersky, BKAV) gán nhãn phần mềm gián điệp:
- **Xóa tuyệt đối thẻ quyền Internet** trong `AndroidManifest.xml`:
  `<!-- KHÔNG CÓ android.permission.INTERNET -->`
- **Chỉ cấp 3 quyền phần cứng tối thiểu:**
  ```xml
  <uses-permission android:name="android.permission.CAMERA" />
  <uses-permission android:name="android.permission.VIBRATE" />
  <uses-permission android:name="android.permission.FLASHLIGHT" />
  <uses-feature android:name="android.hardware.camera" android:required="true" />
  <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />
  ```
- **Lợi ích:** Trình phân tích tĩnh (Static Analyzer) của hệ điều hành sẽ xác nhận app không có khả năng gửi dữ liệu camera ra ngoài Internet $\rightarrow$ Điểm uy tín bảo mật đạt 100%.

### 7.2. Cấu hình Universal APK chống lỗi `INSTALL_FAILED_NO_MATCHING_ABIS`
Thiết bị Android 9 thường dùng chip 32-bit (`armeabi-v7a`), trong khi máy mới dùng 64-bit (`arm64-v8a`). Để đảm bảo 1 file APK duy nhất cài được trên 100% dòng máy Android 9+:
- Cấu hình trong `android/app/build.gradle`:
  ```groovy
  defaultConfig {
      applicationId "com.nckh.moneyvision"
      minSdkVersion 28      // Android 9.0 (Pie)
      targetSdkVersion 34   // Android 14
      versionCode 1
      versionName "1.0.0"
      ndk {
          abiFilters "armeabi-v7a", "arm64-v8a"
      }
  }
  splits {
      abi {
          enable false // Xuất Universal APK duy nhất
      }
  }
  ```

### 7.3. Ký số Bản quyền (Release Keystore với Signature Schemes v1, v2, v3)
Tránh dùng `debug.keystore` vì các hệ điều hành sẽ hiện bảng cảnh báo đỏ *"Ứng dụng chưa được xác minh"*.
- **Tạo Keystore sản phẩm:**
  ```powershell
  keytool -genkeypair -v -storetype PKCS12 -keystore release.keystore -alias moneyvision -keyalg RSA -keysize 4096 -validity 9125 -dname "CN=NCKH MoneyVision, OU=Assistive Tech, O=NCKH, L=Hanoi, ST=Hanoi, C=VN"
  ```
- Cấu hình tự động ký trong Gradle:
  ```groovy
  signingConfigs {
      release {
          storeFile file('release.keystore')
          storePassword System.getenv("KEYSTORE_PASS") ?: "moneyvision2026"
          keyAlias "moneyvision"
          keyPassword System.getenv("KEY_PASS") ?: "moneyvision2026"
          v1SigningEnabled true
          v2SigningEnabled true
          v3SigningEnabled true
      }
  }
  ```

### 7.4. Bảo vệ R8 / ProGuard cho TensorFlow Lite & CameraX
Chống lỗi crash văng app do R8 xóa nhầm các hàm gọi C++ JNI khi tối ưu Release:
- Bổ sung vào `android/app/proguard-rules.pro`:
  ```proguard
  # TensorFlow Lite Runtime & GPU Delegates
  -keep class org.tensorflow.lite.** { *; }
  -dontwarn org.tensorflow.lite.**
  -keepclassmembers class * {
      native <methods>;
  }
  # CameraX
  -keep class androidx.camera.** { *; }
  -dontwarn androidx.camera.**
  ```

---

## 8. Tài Liệu Phân Tích Thiết Kế Chuyên Sâu (Tickets 08–18 Architecture Docs)

Toàn bộ các nâng cấp chuyên sâu về **Đèn Flash 4 lớp chống chớp tắt (Ticket 08)**, **Bộ điều tốc năng lượng & nhiệt độ 3 tầng `BURST`/`ECO`/`HIBERNATION` + Tối ưu L1 Cache $16\times 16$ (Ticket 09)**, **Giao diện Blind-First UI/UX, Lọc tì lòng bàn tay `16dp`, Tương thích Google TalkBack & Bảng mã rung 9 mệnh giá (Ticket 10)**, **Kiểm thử hồi quy Universal APK Android 9.0+ (Ticket 11)**, **Khôi phục Auto-Torch sau khi tắt đèn thủ công ở phòng mờ `>= 35 lux` & di chuyển vùng tối (Ticket 12)**, **Bộ đối soát Ví tích lũy đa tờ `PresentationWalletAccumulator`, Ngắt âm thanh nâng cấp `1 -> 2+` tờ & Khóa bảo vệ đọc Ví `isReadingWallet` (Ticket 13)**, **Bộ kiểm thử hồi quy Suite 19 & Đóng gói Universal APK (Ticket 14)**, cùng **Đợt Cải Tiến UI/UX Xóa Bỏ AI Slop — Typography Sans-serif, Khung Ngắm 64sp, Thanh Đáy Material 3 & Suite 20 (Tickets 15–18)** được trình bày chi tiết kèm sơ đồ luồng tại:
- [`README.md`](file:///c:/Users/ADMIN/NCKH/App_android/README.md) — Cổng tài liệu kỹ thuật tổng quan & Hướng dẫn CLI.
- [`docs/BLIND_FIRST_UI_UX_SPECIFICATION.md`](file:///c:/Users/ADMIN/NCKH/App_android/docs/BLIND_FIRST_UI_UX_SPECIFICATION.md) — Đặc tả thiết kế giao diện Low-Vision HUD, cử chỉ xúc giác, TalkBack & Mã rung 9 mệnh giá.
- [`docs/SYSTEM_ARCHITECTURE_AND_DESIGN.md`](file:///c:/Users/ADMIN/NCKH/App_android/docs/SYSTEM_ARCHITECTURE_AND_DESIGN.md) — Phân tích kiến trúc hệ thống Dual-Runtime, pipeline AI CV, điều tốc nhiệt/pin & đóng gói APK.
- [`.scratch/money-reader/research/12-13-smart-torch-and-multi-note-wallet-deep-research.md`](file:///c:/Users/ADMIN/NCKH/App_android/.scratch/money-reader/research/12-13-smart-torch-and-multi-note-wallet-deep-research.md) — Nghiên cứu gốc nguyên nhân & giải pháp thuật toán cho Ticket 12 & Ticket 13.
- [`.scratch/money-reader/issues/15-de-ai-slop-typography-and-top-header-action-bar.md`](file:///c:/Users/ADMIN/NCKH/App_android/.scratch/money-reader/issues/15-de-ai-slop-typography-and-top-header-action-bar.md) đến [`18-ui-ux-regression-and-universal-apk-repackaging.md`](file:///c:/Users/ADMIN/NCKH/App_android/.scratch/money-reader/issues/18-ui-ux-regression-and-universal-apk-repackaging.md) — Đặc tả kỹ thuật 4 Ticket xóa bỏ AI Slop và nâng cấp trải nghiệm công thái học.

