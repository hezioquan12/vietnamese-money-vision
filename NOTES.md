# Ghi chép yêu cầu dự án (NOTES.md)

## Tác giả & Bản quyền Sở hữu
- **Tác giả & Chủ sở hữu độc lập:** **Nguyễn Quang Toàn** (`Nguyễn Quang Toàn - Chủ sở hữu & Phát triển độc lập`)
- **Bản quyền:** `© 2026 Nguyễn Quang Toàn - Sở hữu & Phát triển độc lập`
- **Thông tin kỹ thuật:** Ứng dụng AI trợ năng nhận diện tiền Việt Nam Đồng 100% Offline (YOLO26 TFLite).

## Bối cảnh & Mục tiêu
- **Nền tảng:** React Native (Android 9.0+ / API 28+).
- **Đối tượng cốt lõi:** Người khiếm thị (Blind) và người có thị lực kém (Low Vision), người cao tuổi.
- **Mô hình AI:** YOLO TFLite Quantized (Input 640x640), nhận diện bộ tiền Việt Nam Đồng hiện hành từ 1k đến 500k.

## Các quyết định kiến trúc đã chốt (Round 1 Decisions)
1. **Triết lý Thiết kế UI/UX (Non-generic, Tactile/Audio-First):**
   - Không đi theo lối mòn AI đại trà (không dùng giao diện thẻ card bo góc vô dụng hay nút bấm nhỏ).
   - Thiết kế công thái học trợ năng theo chuẩn WCAG AAA: Phông chữ cực đại, tương phản tuyệt đối (OLED Black #000000 + Solar Yellow #FFE600).
   - Tương tác hoàn toàn bằng cử chỉ toàn màn hình (Gesture-driven): Chạm bất kỳ đâu để nghe lại, nhấp đúp bật/tắt flash, vuốt đổi chế độ, phản hồi rung haptic bimodal (thông báo tiền vào khung hình bằng nhịp rung).
2. **Kiến trúc Engine Camera & Inference:**
   - Dùng **Custom Native Android Module (CameraX + LiteRT / TFLite C++/Kotlin)** thay vì JavaScript Frame Processor để đảm bảo Android 9 (API 28) chạy ổn định, không bị nghẽn bridge, không giật lag/nóng máy.
   - Luồng Preview chạy độc lập ở 30 FPS; Luồng AI Inference chạy trên Background Thread/Coroutines tối ưu ở 8-12 FPS cho mô hình 640x640.
3. **Mô hình & Nhãn tiền tệ:**
   - Kiến trúc: Ultralytics YOLO26 Lượng tử hóa TFLite (INT8/FP16), Input: 640x640 RGB.
   - Trạng thái: Đang huấn luyện (App sẽ có cơ chế Mock/Simulation Detector để test UI/Audio/Haptics trước khi copy file `.tflite` thật vào).
   - Đường dẫn file quy ước: `android/app/src/main/assets/models/yolo26_money_quant.tflite`.
   - Thứ tự nhãn (Alphabetical Sorting):
     ```
     Index 0: "1000"   -> Một nghìn đồng
     Index 1: "10000"  -> Mười nghìn đồng
     Index 2: "100000" -> Một trăm nghìn đồng
     Index 3: "2000"   -> Hai nghìn đồng
     Index 4: "20000"  -> Hai mươi nghìn đồng
     Index 5: "200000" -> Hai trăm nghìn đồng
     Index 6: "5000"   -> Năm nghìn đồng
     Index 7: "50000"  -> Năm mươi nghìn đồng
     Index 8: "500000" -> Năm trăm nghìn đồng
     ```
4. **Bộ lọc ổn định trạng thái & Chống Spam âm thanh (Temporal Stability):**
   - Cơ chế Sliding Window (Temporal Majority Voting qua 5 frames liên tiếp) để xác thực trạng thái tiền trước khi kích hoạt âm thanh.
   - Format thông báo trực diện, cô đọng: 1 tờ đọc mệnh giá; nhiều tờ đọc `[Số lượng] + [Mệnh giá]`.
   - Ngắt thông minh (Smart Preemption): Rút tiền ra (trống frame) -> ngắt tức thời câu đọc, rung 1 nhịp và phát âm hiệu click/bụp; Thêm tờ tiền mới -> đọc xong câu cũ rồi nối tiếp.
5. **Cơ chế âm thanh (Audio Pipeline):**
   - Hệ thống Pre-recorded Audio Clips chất lượng cao (giọng tiếng Việt chuẩn, tự nhiên, offline 100%, 0ms latency) kết hợp âm hiệu (Earcons) và haptic feedback.
   - Hỗ trợ fallback sang Native Android TTS nếu có phát sinh tình huống ngoài kịch bản.
6. **Khởi tạo & Nền tảng:**
   - React Native CLI (TypeScript template).
   - Min SDK = 28 (Android 9.0 Pie), Target SDK = 34.
   - Custom Native Android Module (CameraX + TFLite LiteRT Kotlin/C++).
7. **Quy chuẩn Đóng gói APK & Miễn nhiễm Cảnh báo Mã độc (Release Packaging):**
   - **Zero-Network:** Xóa tuyệt đối thẻ `android.permission.INTERNET`, chỉ giữ lại `CAMERA`, `VIBRATE`, `FLASHLIGHT`. 100% bảo mật offline.
   - **Kiến trúc CPU Universal:** Đóng gói Universal APK chứa cả `armeabi-v7a` (32-bit Android 9 cũ) và `arm64-v8a` (64-bit mới), triệt tiêu lỗi `INSTALL_FAILED_NO_MATCHING_ABIS`.
   - **Application ID:** `com.nckh.moneyvision`.
   - **Chữ ký số (Release Keystore):** Sinh Keystore riêng RSA 4096-bit, áp dụng đồng thời chữ ký v1 + v2 + v3 schemes để tránh bị Google Play Protect / Samsung Knox chặn nhầm.
   - **R8 / ProGuard Rules:** Cấu hình rules giữ lại toàn bộ class native JNI của TensorFlow Lite và CameraX, ngăn chặn văng app khi chạy bản Release.

## Tiến độ hoàn thành các Ticket
- **Ticket 01:** Khởi tạo kiến trúc dự án, Zero-Network AndroidManifest, ProGuard, Release Keystore [COMPLETED]
- **Ticket 02:** Tactile High-Contrast Accessibility UI (WCAG AAA OLED Black #000000 + Solar Yellow #FFE600), Edge Pulse Glow (8dp), Fullscreen Gesture Canvas (PanResponder: Single Tap, Double Tap Torch, Long Press 1s Wallet, Two-Finger Double Tap Reset), Haptic Feedback Engine (`Vibration` API), Session Wallet State Machine, Mock/Simulation Interactive Controls [COMPLETED - 100% Tests Pass]
  - *Bug Fix 1 (Two-Finger Double Tap Start):* Sửa lỗi `handleTouchStart` trong `src/utils/gestureRecognizer.ts` khi chạm đồng thời 2 ngón (`touchCount >= 2`) bị return sớm trước khi gán `sessionStartTime` và `sessionStartPoint`. Khởi tạo đầy đủ session trước khi rẽ nhánh đa điểm.
  - *Bug Fix 2 (Two-Finger Drag/Swipe Bypass):* Sửa lỗi trong `handleTouchMove` khi `maxTouchesInSession >= 2` bị return sớm làm bỏ qua tính toán độ dịch chuyển `sessionMaxDisplacement`. Đã gỡ bỏ return sớm để cử chỉ vuốt/kéo 2 ngón vượt quá `maxMoveDistance` (40px) bị hủy chính xác và không nhận nhầm thành cử chỉ chạm đúp xóa ví.
  - *Bug Fix 3 (Interleaved Single-Tap Reset):* Sửa lỗi chạm đơn xen giữa hai lần chạm đôi: khi một cử chỉ 1 ngón kết thúc hoặc Long Press kích hoạt, chuỗi 2 ngón đang chờ (`lastTwoFingerReleaseTime`) được xóa triệt để để tránh kích hoạt nhầm Two-Finger Double Tap.
  - *Bug Fix 4 (Partial Release & PanResponder Contract):* Xử lý trường hợp nhấc ngón so le (`touchCount > 0` trong `handleTouchEnd`), không reset session trước khi tất cả ngón tay được nhấc khỏi màn hình. Tối ưu PanResponder trong `GestureCanvas.tsx` để `onPanResponderEnd` chỉ cập nhật số ngón còn lại và `onPanResponderRelease` kích hoạt kết thúc cử chỉ, loại bỏ gọi trùng lặp `handleTouchEnd`.
  - *Bộ đếm thời gian vệ sinh (Timer Hygiene):* Bổ sung `twoFingerTapTimer` dọn dẹp trạng thái `lastTwoFingerReleaseTime` sau khi hết cửa sổ `twoFingerTapWindowMs`, hủy timer sạch sẽ trong `destroy()`.
  - *Kiểm thử độc lập:* Mở rộng từ 24 lên 27 test cases trong `scripts/test-runner.mjs` bao gồm kiểm thử bổ sung cho: vuốt 2 ngón bị hủy, chạm đơn xen giữa xóa chuỗi 2 ngón, và nhấc 1 ngón trong khi ngón kia giữ quá thời gian chạm.
- **Ticket 03:** Offline Audio Pipeline, Voice Clips & Smart Preemption Engine [COMPLETED - 100% Tests Pass]
  - *Kho Audio Assets (24 files):* Tạo đầy đủ và đồng bộ binary audio files (WAV 16-bit PCM và MP3) vào 3 vị trí: `android/app/src/main/res/raw/`, `android/app/src/main/assets/audio/`, và `src/assets/audio/` gồm: 9 mệnh giá (1k - 500k), 10 lượng từ ("Một tờ" - "Mười tờ"), và 5 earcons (`tick.wav`, `empty.wav`, `torch_on.wav`, `torch_off.wav`, `wallet_reset.wav`).
  - *Bộ quản lý hàng đợi (AudioQueueManager):* Hỗ trợ phát chuỗi câu tuần tự độ trễ cực thấp (`playSequence`), khoảng nghỉ tự nhiên giữa các từ (`interClipGapMs`), ngắt tức thì (`stop()`), và bộ phát độc lập `SimulatedAudioDriver`.
  - *Bộ điều khiển ngắt thông minh (SmartPreemptionController):*
    + Khung hình trống ($M = \emptyset$): Dừng tức thì (`stop()`), phát `empty.wav` và rung 50ms.
    + Thêm/đổi tiền ($M_{mới} \neq M_{cũ}$): Đợi dứt câu hiện tại rồi phát tiếp câu mới nhất; gộp/loại bỏ các trạng thái trung gian lỗi thời.
    + Cú pháp câu tự nhiên: 1 tờ đọc mệnh giá; nhiều tờ đọc `[Số lượng] + [Mệnh giá]`.
    + Khoảng lặng an toàn (Cooldown 1.5s): Triệt tiêu hoàn toàn hiện tượng lặp tiếng vô nghĩa khi giữ nguyên góc máy.
  - *Cử chỉ cảm ứng:* Tích hợp Single Tap (nghe lại / bypass cooldown), Double Tap (`torch_on`/`torch_off`), Long Press (đọc ví tích lũy), Two-Finger Double Tap (`wallet_reset`).
  - *Native Android Module:* Xây dựng `MoneyAudioModule.kt` và `MoneyAudioPackage.kt` sử dụng `MediaPlayer` Android gốc cho quyền truy cập `res/raw`, đăng ký tại `MainApplication.kt`.
  - *Kiểm thử toàn diện:* Mở rộng từ 27 lên 61 test cases trong `scripts/test-runner.mjs`, bao gồm kiểm thử tài sản âm thanh, quy tắc câu nói, ngắt thông minh, bộ đếm cooldown, giải phóng tài nguyên và các ca biên (edge cases).
  - *Hardening & Bug Fixes sau Critical Review:*
    + **Fix 1 (Native Audio Integration & Production Output):** Bản trước tạo `createDefaultAudioDriver()` nhưng không dùng ở đâu, `SmartPreemptionController` và `AudioQueueManager` hardcode fallback sang `SimulatedAudioDriver`, dẫn đến trên Android thiết bị thật sẽ không có âm thanh ra loa. Đã đưa `createDefaultAudioDriver()` làm driver mặc định cho cả hai class.
    + **Fix 2 (Race Condition orphaning `pendingDetection` khi rút/bỏ tiền):** Bản trước dùng `isSpeaking() = isProcessingSequence || isPlaying()`. Khi frame trống, earcon `empty.wav` phát (80ms). Nếu tờ tiền mới xuất hiện ngay lúc đó, nó bị gán vào `pendingDetection` và coi là đang đọc câu. Do `empty.wav` là earcon chứ không qua `startAnnouncement`, `pendingDetection` bị bỏ rơi vĩnh viễn và không bao giờ được đọc. Đã tách biệt `isSpeaking()` chỉ đại diện cho chuỗi đọc phát âm ngữ nghĩa (`isProcessingSequence`), giúp frame tiền mới ngắt tức thì earcon `empty.wav` và phát ngay `tick` + mệnh giá mới.
    + **Fix 3 (Android MediaPlayer FD Lifecycle & Leaked Promises):** Trong `MoneyAudioModule.kt`, bản trước gọi `afd.close()` trước `player.prepare()`, gây lỗi `EBADF (Bad file descriptor)` trên Android MediaPlayer. Đã điều chỉnh đóng `afd` sau khi `prepare()` hoàn tất. Đồng thời bổ sung `activePromise` để khi `stopInternal()` được gọi thì giải phóng/resolve dứt điểm promise đang chạy, tránh treo vĩnh viễn các Promise JS.
    + **Fix 4 (Gộp cùng mệnh giá & Thứ tự tự nhiên):** Khi camera bắt nhiều bounding boxes cùng loại (ví dụ 2 tờ 100k), bản trước đọc lặp `Một tờ một trăm nghìn một tờ một trăm nghìn`. Đã nâng cấp `buildDetectionAudioSequence` và `computeSignature` tự động tổng hợp số lượng theo từng mệnh giá và sắp xếp giảm dần theo giá trị tiền (ví dụ: `Hai tờ một trăm nghìn`).
    + **Fix 5 (Tách file & Dọn dẹp re-export):** Tách `NativeAudioDriver.ts` thành file độc lập, loại bỏ khai báo trùng lặp `SimulatedAudioDriver` trong `AudioDriver.ts` gây xung đột export barrel.
- **Ticket 07:** Universal Release APK Packaging, Zero-Network Architecture & Keystore Security [COMPLETED - 154/154 Tests Pass]
  - *Cấu hình Universal APK:* `android/app/build.gradle` cấu hình `applicationId "com.nckh.moneyvision"`, `minSdkVersion 28` (Android 9.0 Pie), `targetSdkVersion 34` (Android 14), `ndk.abiFilters "armeabi-v7a", "arm64-v8a"`, và `splits.abi.enable false` đảm bảo xuất 1 file APK duy nhất tương thích 100% thiết bị Android 9+.
  - *Chữ ký số đa tầng (v1 + v2 + v3):* `signingConfigs.release` trỏ tới `release.keystore` (RSA 4096-bit, alias `moneyvision`), kích hoạt đồng thời `v1SigningEnabled true`, `v2SigningEnabled true`, `v3SigningEnabled true`.
  - *Kiến trúc Zero-Network:* `AndroidManifest.xml` loại bỏ triệt để mọi quyền mạng (`INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`), chỉ giữ lại 3 quyền phần cứng offline (`CAMERA`, `VIBRATE`, `FLASHLIGHT`), miễn nhiễm 100% cảnh báo giả từ Google Play Protect và Samsung Knox.
  - *ProGuard / R8 Rules:* Bảo vệ an toàn các lớp native JNI của `org.tensorflow.lite.**`, `androidx.camera.**`, `native <methods>`, và `com.nckh.moneyvision.**`.
  - *Scripts Đóng gói & Kiểm định:*
    + `scripts/build-release-apk.mjs`: Tự động kiểm tra 4 điều kiện tiên quyết (Keystore, 24 audio assets, models, SDK path), hỗ trợ chế độ Gradle assembleRelease và Offline Packaging Engine, tự động thiết lập `local.properties`, áp dụng chuẩn zipalign (4-byte assets, 4096-byte .so) và xuất file Universal Release APK `release/com.nckh.moneyvision-v1.0.0-universal-release.apk` kèm mã băm SHA-256.
    + `scripts/verify-apk-package.mjs`: Kiểm tra tự động 10/10 tiêu chí an ninh & tương thích (100% Pass), kiểm tra chặt chẽ alias `moneyvision` và từ chối mật khẩu keystore sai, bóc tách cấu trúc APK Sig Block v2/v3.
    + `scripts/package-release.ps1`: Script PowerShell hỗ trợ tự động thiết lập biến môi trường JDK/SDK, hỗ trợ tham số `-Mode` và `-VerifyOnly`, loại bỏ hoàn toàn lỗi parsing encoding trên Windows PowerShell 5.1.
  - *Bộ kiểm thử tự động:* Mở rộng `scripts/test-runner.mjs` với Suite 12 (26 test cases), nâng tổng số test cases toàn hệ thống lên 154/154 passed (100%).
- **Ticket 08:** Bổ sung Thông tin Tác giả & Bản quyền Sở hữu Độc lập (`Nguyễn Quang Toàn`) [COMPLETED]
  - *Hiển thị Giao diện chính & Hộp thoại Bản quyền (WCAG AAA):* Hiển thị cố định `"Tác giả & Sở hữu độc lập: Nguyễn Quang Toàn"` tại Header/Footer (tương phản `#FFE600` / `#FFFFFF` trên nền `#000000`) và nút mở hộp thoại **"Thông tin Bản quyền & Tác giả"** (`© 2026 Nguyễn Quang Toàn - Sở hữu & Phát triển độc lập`) đồng bộ trên cả tầng React Native TypeScript (`src/constants/author.ts`, `TactileDisplay.tsx`, `SimulationControls.tsx`, `App.tsx`) và tầng Native Android (`MainActivity.java` trong `scripts/android-sdk-builder.mjs`).
  - *Hành vi Âm thanh & Xúc giác:* Giữ nguyên câu chào ngắn gọn lúc khởi động ứng dụng; chỉ phát giọng đọc tiếng Việt *"Ứng dụng thuộc sở hữu và phát triển độc lập bởi Nguyễn Quang Toàn"* kèm phản hồi rung Haptic khi người dùng bấm vào nút/hộp thoại **"Thông tin Bản quyền & Tác giả"**.
  - *Metadata hệ thống & Ký số APK:* Bổ sung `"Nguyễn Quang Toàn - Chủ sở hữu & Phát triển độc lập"` vào `package.json`, `AndroidManifest.xml`, `strings.xml`, `NOTES.md`, `workflows/money_reader_workflow.md`; giữ nguyên tuyệt đối `release.keystore` để người dùng cài đè (update) trực tiếp lên Android 13 không bị lỗi `INSTALL_FAILED_UPDATE_INCOMPATIBLE`.
- **Ticket 08 (Upgrade Phase):** Anti-Strobe Smart Torch & Optical Reflection Guard [COMPLETED - Suite 15 Pass]
  - *4 Lớp Chống Chớp Tắt Đèn Flash:* Tích hợp cảm biến ánh sáng mặt trước `Sensor.TYPE_LIGHT` (`preTorchAmbientSensorLux`, ngưỡng hồi phục phòng `>= 85 lux`), đo mốc nền phản xạ sau khi bật đèn `postTorchBaselineLuma` (`+55 lux` delta, tối thiểu `175 lux`) kèm phân tích điểm chói cận cảnh (`glareRatio >= 0.08`, `centerToBorderRatio >= 1.30`), thời gian giữ đèn tối thiểu `MIN_TORCH_ON_HOLD_MS = 12000` + khóa đèn khi đang có tiền (`ACTIVE_DETECTION_LOCK`), bảo vệ tuyệt đối `isManualOverride` và cầu chì chống dao động `60s` (`Oscillation Latch`).
- **Ticket 09 (Upgrade Phase):** Adaptive Thermal & Battery Governor [COMPLETED - Suite 16 Pass]
  - *Bộ Điều tốc Năng lượng & Nhiệt độ 3 Tầng:* Chuyển đổi thông minh giữa `BURST (130ms)` $\rightarrow$ `ECO (650ms)` $\rightarrow$ `HIBERNATION (1500ms/3000ms, stopRepeating)` kết hợp cảm biến không cần quyền (`TYPE_LINEAR_ACCELERATION` với bộ lọc chống rung mặt bàn `0.35 -> 0.65 m/s²`, `TYPE_PROXIMITY`, `TYPE_LIGHT`), cổng chặn nhòe chuyển động `MOTION_BLUR_GATE` ($\Delta Y > 32.0$), xoay ảnh $16\times 16$ Cache-Tiled YUV-to-NCHW + `NORM_LUT[256]`, giải mã thưa Row-Major (`0` lượt đọc tọa độ khi khung hình trống), giới hạn 2 luồng XNNPACK + `THREAD_PRIORITY_BACKGROUND`, và cầu chì nhiệt tự tắt Auto-Torch sau `15s` tĩnh / `4s` bỏ túi.
- **Ticket 10 (Upgrade Phase):** Blind-First UI/UX & Spatial Guidance [COMPLETED - Suite 17 Pass]
  - *Giao diện & Trải nghiệm Ưu tiên Người khiếm thị:* Mặc định ẩn bảng nút giả lập vào ngăn kéo `🛠️ Kiểm thử` (`isSimulationDrawerOpen = false` / `View.GONE`), lọc điểm tì lòng bàn tay `16dp` theo từng ngón (`Per-Pointer Edge Palm-Rejection`), tương thích hai chế độ với Google TalkBack (`View.AccessibilityDelegate`, `View.OnHoverListener` giữ 1s đọc ví, `AccessibilityManager.interrupt()` + `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK` chống đọc đè), xung rung dẫn đường `"Giữ yên tay"` (`25ms`), bảng mã rung phân biệt 9 mệnh giá tiền Việt Nam (`1k`–`500k`), và giao diện Low-Vision HUD (`64sp` Hero, khung ngắm chữ L, huy hiệu màu Polymer/Cotton).
- **Ticket 11 (Upgrade Phase):** End-to-End Regression & Universal APK Release (Android 9.0+ / API 28–34) [COMPLETED - 201/201 Tests Pass across 18 Suites]
  - *Kiểm thử Hồi quy & Tài liệu Kỹ thuật Toàn diện:* Vượt qua 100% `201/201` bài kiểm thử tự động trong `scripts/test-runner.mjs` và `10/10` tiêu chí trong `scripts/verify-apk-package.mjs`. Xem tài liệu kiến trúc chi tiết tại [`README.md`](file:///c:/Users/ADMIN/NCKH/App_android/README.md), [`docs/BLIND_FIRST_UI_UX_SPECIFICATION.md`](file:///c:/Users/ADMIN/NCKH/App_android/docs/BLIND_FIRST_UI_UX_SPECIFICATION.md) và [`docs/SYSTEM_ARCHITECTURE_AND_DESIGN.md`](file:///c:/Users/ADMIN/NCKH/App_android/docs/SYSTEM_ARCHITECTURE_AND_DESIGN.md).
- **Ticket 12 (Upgrade Phase 2):** Smart Manual-OFF Torch Recovery & Dark-Scene Relocation Re-Arming [COMPLETED - Suite 19 Pass]
  - *Khôi phục Auto-Torch 2 Nhánh Sau Khi Tắt Đèn Thủ Công:* Tách biệt logic mở khóa `isManualOverride` khi đèn đang TẮT (`!isTorchOn`) khỏi điều kiện chống phản xạ `>= 85 lux` của trạng thái đèn BẬT. Hỗ trợ **Nhánh A** (Non-Dark Scene Re-Arming khi `luma >= 35 lux` và `!hasSpatialReflection` sau `250ms` thoát sáng phần cứng) và **Nhánh B** (Dark-Scene Relocation / Deeper Darkness Re-Arming thông qua chốt trạng thái **`hasMovedSinceManualOff`** ghi nhận chuyển động $\Delta Y \ge 4.5$ hoặc IMU $\Delta a \ge 0.35\text{ m/s}^2$ sau `400ms`, hoặc độ tối giảm sâu thêm $\ge 6\text{ lux}$, tự động tái kích hoạt Auto-Torch sau khoảng đệm `2500ms` để bật đèn lại sau `1000ms` ở vùng tối mới).
- **Ticket 13 (Upgrade Phase 2):** Multi-Note Presentation Wallet Accumulator, Audio Upgrade Preemption & Wallet Readout Protection [COMPLETED - Suite 19 Pass]
  - *Bộ Đối Soát Ví Theo Đỉnh Lượt Cầm (`PresentationWalletAccumulator`):* Thay thế cơ chế cộng dồn từng bước bằng mô hình đối soát đỉnh từng mệnh giá trong lượt cầm ($W_{\text{total}} = W_{\text{baseline}} \oplus M_{\text{presentation}}$), giải quyết triệt để lỗi cộng trùng lặp khi camera hội tụ tuần tự `1 -> 2` tờ, rung tay che khuất `2 -> 1 -> 2` tờ, nối tiếp phiên khi mất frame ngắn `< 1500ms` (`PRESENTATION_CONTINUITY_GRACE_MS`) lúc chỉnh thế cầm nhiều tờ, và hiệu chỉnh mệnh giá cùng tổng số tờ $\ge 2$ (`DENOMINATION_REFINEMENT_WINDOW_MS = 1500ms`).
  - *Ngắt Nâng Cấp Đa Tờ (`Multi-Note Upgrade Preemption`), Chặn Lặp Tụt Số Tờ & Khóa Bảo Vệ Đọc Ví (`isReadingWallet`):* Ngắt ngay câu đọc thiếu khi số tờ tăng (`newTotalNotes > currentlyAnnouncingNotesCount`) để đọc chuẩn xác tổng số tờ mới; giữ im lặng và bảo toàn chữ ký đỉnh khi số tờ tụt tạm thời (`2 -> 1 -> 2`); bật khóa `isReadingWallet = true` khi nhấn giữ đọc Ví tích lũy để việc hạ tay cầm tiền xuống (`EMPTY`) không bao giờ cắt ngang câu đọc Ví.
- **Ticket 14 (Upgrade Phase 2):** Suite 19 End-to-End Regression & Universal APK Repackaging (`211/211` Tests Pass) [COMPLETED]
  - *Kiểm thử Hồi quy 19 Suites & Đóng gói lại Universal Release APK:* Bổ sung Suite 19 (10 bài kiểm thử chuyên sâu cho Ticket 12 & 13), nâng tổng số bài kiểm thử tự động lên **`211/211` PASS (`19 Suites`, `0 failed`)**, `10/10` tiêu chí `verify-apk-package.mjs` PASS, và xuất bản lại `release/com.nckh.moneyvision-v1.0.0-universal-release.apk` tương thích Android 9.0+ (`API 28–34`).
- **Ticket 15 (UI/UX De-AI-Slop):** De-AI-Slop Typography & Accessible Top Header Action Bar [COMPLETED - Suite 20 Pass]
  - *Hệ thống Typography & Design Tokens Chuẩn:* Bổ sung `fontFamilySans: 'sans-serif'` cho tất cả nhãn, nút bấm, thông điệp dẫn đường và thông tin tác giả; bảo lưu `fontFamilyTabular: 'monospace'` nghiêm ngặt cho chữ số tiền tệ (`heroAmountText`, `walletAmountText`). Bổ sung token thẻ bo góc Material 3 (`cardBorderRadius: 12`, `pillBorderRadius: 9999`) và chuẩn tiếp xúc `accessibleTouchTarget48Dp: 48` (giữ nguyên `minTouchTargetDp: 44` bảo đảm tương thích bộ test).
  - *Dọn Dẹp Rác Emoji:* Thay thế triệt để các nút emoji lộn xộn: `ĐÈN PIN: BẬT / TẮT` (thay cho `🔦 ĐÈN: ...`), `KIỂM THỬ` (thay cho `🛠️ Kiểm thử`), `TÁC GIẢ & BẢN QUYỀN` (thay cho `ℹ️ Tác giả & Bản quyền`).
  - *Di Dời Dữ Liệu Đo Đạc (Telemetry):* Di chuyển dòng dữ liệu đo đạc nhà phát triển (`● YOLO26 TFLITE LIVE | ĐÈN: TẮT | 100 LUX`) từ giao diện HUD chính vào trong ngăn kéo kiểm thử (`KIỂM THỬ`), trả lại giao diện thiết bị trợ năng y tế chuẩn mực.
  - *Bảo Toàn Quyền Tác Giả:* Giữ nguyên 100% metadata và hiển thị tác quyền của **Nguyễn Quang Toàn** trên cả React Native lẫn Native Android.
- **Ticket 16 (UI/UX De-AI-Slop):** Assistive Viewfinder Reticle, 64sp Hero & Clean Polymer Badges [COMPLETED - Suite 20 Pass]
  - *Khung Ngắm Định Tâm Chữ L (Assistive Viewfinder Reticle):* Cải tiến khung ngắm 4 góc chữ L (`viewfinder-reticle`) với nét vẽ 3dp tinh xảo, bo góc viền nhẹ và chuyển màu tương phản cao theo trạng thái quét (Trung tính `#333333`, Vàng Solar `#FFE600` khi phát hiện bóng tiền, và màu Polymer đặc trưng khi nhận diện xong).
  - *Chữ Số Mệnh Giá Cực Đại 64sp:* Chữ số dạng bảng đơn cách, tự động co giãn (`adjustsFontSizeToFit`), cố định chiều cao loại bỏ hoàn toàn hiện tượng nhảy giật layout.
  - *Huy Hiệu Màu & Chất Liệu Tiền Tinh Tế:* Thay thế emoji `🎨` bằng chấm màu nhận diện thực tế `●` và kiểu chữ semibold sắc nét (ví dụ: `● XANH LỤC LAM • POLYMER`).
  - *Thông Điệp Dẫn Đường Tối Giản:* Thay thế dòng chữ có emoji `✋ Phát hiện bóng tờ tiền...` bằng thông điệp tương phản cao chuẩn y tế: `GIỮ YÊN TAY — ĐANG ĐỊNH TÂM` (bảo toàn hằng số native cho tương thích ngược).
- **Ticket 17 (UI/UX De-AI-Slop):** Ergonomic Bottom Action Dock & Gesture Footprint Reclamation [COMPLETED - Suite 20 Pass]
  - *Giải Phóng 100% Màn Hình Cho Cảm Ứng:* Loại bỏ vĩnh viễn bảng hướng dẫn 4 dòng đơn cách chiếm diện tích (`[1 CHẠM]... [2 CHẠM]... [GIỮ 1S]...`), giải phóng hơn 85% diện tích màn hình làm canvas cử chỉ xúc giác cho người khiếm thị.
  - *Thanh Tác Vụ Đáy Màn Hình Hợp Nhất (Action Dock):* Thiết kế lại thẻ Ví tích lũy (`wallet-card-btn`) và nút Xóa ví (`wallet-reset-btn`) thành thanh tác vụ đáy chuẩn Material 3: góc bo 12dp, vùng chạm >= 48dp, nhãn chữ rõ ràng không emoji: `VÍ TÍCH LŨY (PHIÊN)` và `XÓA VÍ`.
  - *Thông Tin Tác Giả Footer WCAG AAA:* Chân trang hiển thị trang trọng `© 2026 Nguyễn Quang Toàn - Sở hữu & Phát triển độc lập` với độ tương phản tuyệt đối.
- **Ticket 18 (UI/UX De-AI-Slop):** UI/UX E2E Regression, Universal APK Repackaging & Code Review [COMPLETED - 216/216 Tests Pass]
  - *Kiểm Thử Hồi Quy Toàn Diện 20 Suites:* Bổ sung Suite 20 vào `scripts/test-runner.mjs`. Toàn bộ 216 bài kiểm thử tự động trên 20 Suites đều **PASS 100% (0 failed)**.
  - *Kiểm Định An Ninh & Toàn Vẹn APK:* `scripts/verify-apk-package.mjs` đạt **10/10 tiêu chí** kèm xác thực metadata tác giả Nguyễn Quang Toàn.
  - *Đóng Gói & Ký Số Universal Release APK:* Biên dịch và ký số hoàn tất (v1, v2, v3 với RSA 4096-bit release keystore) tại `release/com.nckh.moneyvision-v1.0.0-universal-release.apk` (9.10 MB, Zero-Network, cài đè trực tiếp trên Android 13).


