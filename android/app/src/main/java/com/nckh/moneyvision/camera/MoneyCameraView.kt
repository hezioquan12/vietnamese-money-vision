package com.nckh.moneyvision.camera

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.os.Process
import android.util.AttributeSet
import android.view.WindowManager
import android.widget.FrameLayout
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.TorchState
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter
import com.nckh.moneyvision.detector.Yolo26Detector
import com.nckh.moneyvision.detector.DetectionResult
import com.nckh.moneyvision.detector.DebouncedResult
import com.nckh.moneyvision.detector.TemporalDebounceFilter
import com.nckh.moneyvision.detector.DebounceState
import com.nckh.moneyvision.detector.MoneyDetectorModule
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.sqrt

/**
 * MoneyCameraView
 * Native Android CameraX View for MoneyVision.
 * Provides real-time 30 FPS camera preview using TextureView-based PreviewView
 * (COMPATIBLE mode to prevent overlay/touch-blocking issues with React Native's gesture responder).
 * Runs background ImageAnalysis for single-pass Y-plane luminance, Ticket 08 spatial reflection,
 * Ticket 09 16x16 Luma Grid motion delta (ΔY), Motion-Blur Gate, 3-Tier Adaptive Power Governor
 * (BURST / ECO / HIBERNATION), and Zero-Bitmap Direct YUV YOLO26 LiteRT inference.
 */
class MoneyCameraView @JvmOverloads constructor(
    private val reactContext: ThemedReactContext,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : FrameLayout(reactContext, attrs, defStyleAttr), LifecycleEventListener {

    private val previewView: PreviewView = PreviewView(reactContext).apply {
        layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        scaleType = PreviewView.ScaleType.FILL_CENTER
    }

    private var cameraExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private var detectionExecutor: ExecutorService = createBackgroundDetectionExecutor()
    private val detector: Yolo26Detector by lazy { Yolo26Detector.getInstance(reactContext) }
    private val debounceFilter: TemporalDebounceFilter = TemporalDebounceFilter()
    private var lastInferenceTimestamp: Long = 0L
    @Volatile private var isInferring: Boolean = false

    private var cameraProvider: ProcessCameraProvider? = null
    private var camera: Camera? = null
    private var preview: Preview? = null
    private var imageAnalysis: ImageAnalysis? = null

    var torchEnabled: Boolean = false
        set(value) {
            field = value
            applyTorchState(value)
        }

    var autoTorchEnabled: Boolean = true

    private var currentLuminance: Double = 0.0
    @Volatile private var isTorchOn: Boolean = false

    // 4-Layer Anti-Strobe Smart Torch State tracking on native side (Ticket 08)
    private var sensorManager: SensorManager? = null
    private var lightSensor: Sensor? = null
    private var motionSensor: Sensor? = null
    private var proximitySensor: Sensor? = null
    @Volatile private var hasHardwareLightSensor: Boolean = false
    @Volatile private var ambientSensorLux: Float = -1.0f
    private var lastWakeAmbientLux: Float = -1.0f
    private var lowLightStartTimestamp: Long = 0L
    private var restoreLightStartTimestamp: Long = 0L
    private var torchAutoOnTimestamp: Long = 0L
    private var postTorchBaselineLuma: Double = -1.0
    private var preTorchAmbientSensorLux: Float = -1.0f
    @Volatile private var hasActiveDetection: Boolean = false
    @Volatile private var hasConfirmedMoney: Boolean = false
    @Volatile private var hasCandidateHint: Boolean = false
    private var isManualOverride: Boolean = false
    private var manualOffTimestamp: Long = 0L
    private var manualOffBaselineLuma: Double = -1.0
    private var hasMovedSinceManualOff: Boolean = false
    private var isOscillationLatched: Boolean = false
    private var oscillationLatchUntilMs: Long = 0L
    private val autoTorchCycleTimestamps: java.util.ArrayDeque<Long> = java.util.ArrayDeque()

    // Ticket 09 Layer 1 & 4: Adaptive Thermal & Battery Governor State
    @Volatile private var powerState: String = POWER_STATE_BURST
    @Volatile private var thermalLevel: String = THERMAL_NOMINAL
    private val currentLumaGridSums = LongArray(LUMA_GRID_CELLS)
    private val currentLumaGridCounts = IntArray(LUMA_GRID_CELLS)
    private val currentLumaGrid = FloatArray(LUMA_GRID_CELLS)
    private val previousLumaGrid = FloatArray(LUMA_GRID_CELLS)
    private var hasPreviousLumaGrid: Boolean = false
    @Volatile private var currentMotionDeltaY: Double = 0.0

    // Pre-allocated YUV staging double-buffers so ImageProxy is closed immediately on cameraExecutor
    private val reusableY = arrayOfNulls<ByteArray>(2)
    private val reusableU = arrayOfNulls<ByteArray>(2)
    private val reusableV = arrayOfNulls<ByteArray>(2)
    private var bufferSlotIndex: Int = 0

    private var staticHoldingStartMs: Long = 0L
    private var staticEmptyStartMs: Long = 0L
    private var deepIdleStartMs: Long = 0L
    private var darkOccludedStartMs: Long = 0L
    private var lastHibernationHeartbeatMs: Long = 0L
    private var torchIdleStaticStartMs: Long = 0L
    private var proximityNearStartMs: Long = 0L
    @Volatile private var isProximityNear: Boolean = false
    @Volatile private var latestAccelDelta: Float = 0.0f
    @Volatile private var imuWakeThreshold: Float = IMU_WAKE_DEFAULT_THRESHOLD
    private var consecutiveFalseImuWakes: Int = 0
    private var pendingImuWakeVerify: Boolean = false
    private var gravityX: Float = 0.0f
    private var gravityY: Float = 0.0f
    private var gravityZ: Float = 9.81f
    private var isPreviewSurfaceDetached: Boolean = false
    private var isKeepScreenOnReleased: Boolean = false
    private var lastThermalPollTimestamp: Long = 0L
    private var lastEmittedLuminance: Double = -100.0
    private var wasLastEmittedStateEmpty: Boolean = false

    private val lightSensorListener = object : SensorEventListener {
        override fun onSensorChanged(event: SensorEvent?) {
            if (event != null && event.values != null && event.values.isNotEmpty()) {
                val lux = event.values[0]
                ambientSensorLux = lux
                hasHardwareLightSensor = true
                if (lastWakeAmbientLux < 0.0f) {
                    lastWakeAmbientLux = lux
                } else {
                    val absShift = abs(lux - lastWakeAmbientLux)
                    val relShift = absShift / max(1.0f, lastWakeAmbientLux)
                    if (absShift >= LUX_WAKE_MIN_DELTA && relShift >= LUX_WAKE_RELATIVE_RATIO) {
                        lastWakeAmbientLux = lux
                        if (powerState != POWER_STATE_BURST && !isProximityNear) {
                            wakeUpToBurst("AMBIENT_LUX_SHIFT", System.currentTimeMillis())
                        }
                    }
                }
            }
        }

        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    }

    private val motionSensorListener = object : SensorEventListener {
        override fun onSensorChanged(event: SensorEvent?) {
            if (event == null || event.values == null || event.values.size < 3) return
            val deltaMag = if (event.sensor.type == Sensor.TYPE_LINEAR_ACCELERATION) {
                val ax = event.values[0]
                val ay = event.values[1]
                val az = event.values[2]
                sqrt(ax * ax + ay * ay + az * az)
            } else {
                val alpha = 0.8f
                gravityX = alpha * gravityX + (1.0f - alpha) * event.values[0]
                gravityY = alpha * gravityY + (1.0f - alpha) * event.values[1]
                gravityZ = alpha * gravityZ + (1.0f - alpha) * event.values[2]
                val lx = event.values[0] - gravityX
                val ly = event.values[1] - gravityY
                val lz = event.values[2] - gravityZ
                sqrt(lx * lx + ly * ly + lz * lz)
            }
            latestAccelDelta = deltaMag
            val nowMs = System.currentTimeMillis()
            if (isManualOverride && !isTorchOn && manualOffTimestamp > 0L &&
                (nowMs - manualOffTimestamp) >= MANUAL_OFF_MOTION_ARM_DELAY_MS &&
                deltaMag >= MANUAL_OFF_IMU_ACCEL_DELTA
            ) {
                hasMovedSinceManualOff = true
            }
            val effectiveImuThreshold = if (hasConfirmedMoney) IMU_WAKE_DELTA_A_TABLE else imuWakeThreshold
            if (deltaMag > effectiveImuThreshold && powerState != POWER_STATE_BURST && !isProximityNear) {
                pendingImuWakeVerify = true
                wakeUpToBurst("IMU_ACCELERATION", nowMs)
            }
        }

        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    }

    private val proximitySensorListener = object : SensorEventListener {
        override fun onSensorChanged(event: SensorEvent?) {
            if (event == null || event.values == null || event.values.isEmpty()) return
            val maxRange = event.sensor.maximumRange.coerceAtMost(5.0f)
            val nearNow = event.values[0] < maxRange
            val wasNear = isProximityNear
            isProximityNear = nearNow
            val now = System.currentTimeMillis()
            if (nearNow && !wasNear) {
                proximityNearStartMs = now
            } else if (!nearNow && wasNear) {
                proximityNearStartMs = 0L
                wakeUpToBurst("PROXIMITY_UNCOVERED", now)
            }
        }

        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    }

    init {
        addView(previewView)
        reactContext.addLifecycleEventListener(this)
        initLightSensor()
        startCamera()
        registerActiveView(this)
    }

    private fun createBackgroundDetectionExecutor(): ExecutorService {
        return Executors.newSingleThreadExecutor { runnable ->
            Thread({
                try {
                    Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND)
                } catch (_: Throwable) {}
                runnable.run()
            }, "MoneyVision-YOLO26-Worker")
        }
    }

    private fun initLightSensor() {
        try {
            sensorManager = reactContext.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
            lightSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_LIGHT)
            if (lightSensor != null) {
                sensorManager?.registerListener(
                    lightSensorListener,
                    lightSensor,
                    SensorManager.SENSOR_DELAY_NORMAL
                )
            }
            motionSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)
                ?: sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
            if (motionSensor != null) {
                sensorManager?.registerListener(
                    motionSensorListener,
                    motionSensor,
                    SensorManager.SENSOR_DELAY_NORMAL
                )
            }
            proximitySensor = sensorManager?.getDefaultSensor(Sensor.TYPE_PROXIMITY)
            if (proximitySensor != null) {
                sensorManager?.registerListener(
                    proximitySensorListener,
                    proximitySensor,
                    SensorManager.SENSOR_DELAY_NORMAL
                )
            }
        } catch (_: Exception) {}
    }

    private fun unregisterLightSensor() {
        try {
            sensorManager?.unregisterListener(lightSensorListener)
            sensorManager?.unregisterListener(motionSensorListener)
            sensorManager?.unregisterListener(proximitySensorListener)
        } catch (_: Exception) {}
    }

    fun onUserTouchInteraction() {
        wakeUpToBurst("TOUCH_INTERACTION", System.currentTimeMillis())
    }

    @Synchronized
    private fun wakeUpToBurst(reason: String, now: Long) {
        staticHoldingStartMs = 0L
        staticEmptyStartMs = 0L
        deepIdleStartMs = 0L
        darkOccludedStartMs = 0L
        lastHibernationHeartbeatMs = 0L
        torchIdleStaticStartMs = 0L
        if (powerState != POWER_STATE_BURST || isPreviewSurfaceDetached || isKeepScreenOnReleased) {
            powerState = POWER_STATE_BURST
            post {
                applyDisplayAndPreviewGovernorState(POWER_STATE_BURST, false)
            }
        }
    }

    private fun applyDisplayAndPreviewGovernorState(targetState: String, releaseKeepScreenOn: Boolean) {
        try {
            val activity = reactContext.currentActivity
            val window = activity?.window
            if (targetState == POWER_STATE_HIBERNATION) {
                if (!isPreviewSurfaceDetached) {
                    preview?.setSurfaceProvider(null)
                    isPreviewSurfaceDetached = true
                }
                if (previewView.alpha != 0.0f) {
                    previewView.alpha = 0.0f
                }
                if (window != null) {
                    val lp = window.attributes
                    if (lp.screenBrightness != 0.01f) {
                        lp.screenBrightness = 0.01f
                        window.attributes = lp
                    }
                    if (releaseKeepScreenOn && !isKeepScreenOnReleased) {
                        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                        isKeepScreenOnReleased = true
                    }
                }
            } else {
                if (isPreviewSurfaceDetached) {
                    preview?.setSurfaceProvider(previewView.surfaceProvider)
                    isPreviewSurfaceDetached = false
                }
                val targetAlpha = when {
                    thermalLevel == THERMAL_HOT -> 0.0f
                    targetState == POWER_STATE_ECO -> PREVIEW_ALPHA_ECO
                    else -> PREVIEW_ALPHA_BURST
                }
                if (previewView.alpha != targetAlpha) {
                    previewView.alpha = targetAlpha
                }
                if (window != null) {
                    val lp = window.attributes
                    if (lp.screenBrightness != WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE) {
                        lp.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
                        window.attributes = lp
                    }
                    if (isKeepScreenOnReleased) {
                        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                        isKeepScreenOnReleased = false
                    }
                }
            }
        } catch (_: Exception) {}
    }

    private fun updateThermalAndBatteryLevel(now: Long) {
        if (now - lastThermalPollTimestamp < 5000L) return
        lastThermalPollTimestamp = now
        try {
            val pm = reactContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
            var resolved = THERMAL_NOMINAL
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && pm != null) {
                val status = pm.currentThermalStatus
                if (status >= PowerManager.THERMAL_STATUS_SEVERE) {
                    resolved = THERMAL_HOT
                } else if (status >= PowerManager.THERMAL_STATUS_MODERATE) {
                    resolved = THERMAL_WARM
                }
            }
            if (pm != null && pm.isPowerSaveMode && resolved == THERMAL_NOMINAL) {
                resolved = THERMAL_WARM
            }
            val batteryIntent = reactContext.registerReceiver(
                null,
                IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            )
            if (batteryIntent != null) {
                val tempTenths = batteryIntent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 250)
                val level = batteryIntent.getIntExtra(BatteryManager.EXTRA_LEVEL, 100)
                val scale = batteryIntent.getIntExtra(BatteryManager.EXTRA_SCALE, 100).coerceAtLeast(1)
                val batteryPct = (level * 100) / scale
                if (tempTenths >= 410) {
                    resolved = THERMAL_HOT
                } else if ((tempTenths >= 380 || batteryPct < 15) && resolved == THERMAL_NOMINAL) {
                    resolved = THERMAL_WARM
                }
            }
            val prevThermal = thermalLevel
            thermalLevel = resolved
            if (prevThermal != resolved && powerState != POWER_STATE_HIBERNATION) {
                post {
                    applyDisplayAndPreviewGovernorState(powerState, false)
                }
            }
        } catch (_: Exception) {}
    }

    private var lastLuminanceEmitTimestamp: Long = 0L

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        if (cameraExecutor.isShutdown) {
            cameraExecutor = Executors.newSingleThreadExecutor()
        }
        if (detectionExecutor.isShutdown) {
            detectionExecutor = createBackgroundDetectionExecutor()
        }
        initLightSensor()
        if (camera == null) {
            startCamera()
        }
    }

    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
        cameraProviderFuture.addListener({
            try {
                cameraProvider = cameraProviderFuture.get()
                bindCameraUseCases()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }, ContextCompat.getMainExecutor(context))
    }

    private fun bindCameraUseCases() {
        val provider = cameraProvider ?: return
        val lifecycleOwner = reactContext.currentActivity as? LifecycleOwner ?: return

        val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

        // 1. Preview Use Case (Dimmed to PREVIEW_ALPHA_BURST = 0.22f in BURST, 0.08f in ECO, detached in HIBERNATION)
        preview = Preview.Builder().build().also {
            it.setSurfaceProvider(previewView.surfaceProvider)
        }
        previewView.alpha = PREVIEW_ALPHA_BURST

        // 2. ImageAnalysis Use Case (YUV_420_888 for Y-plane luminance analysis)
        imageAnalysis = ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_YUV_420_888)
            .build()
            .also { analysis ->
                analysis.setAnalyzer(cameraExecutor) { imageProxy ->
                    processImageProxy(imageProxy)
                }
            }

        try {
            provider.unbindAll()
            camera = provider.bindToLifecycle(
                lifecycleOwner,
                cameraSelector,
                preview,
                imageAnalysis
            )

            // Observe native torch state
            camera?.cameraInfo?.torchState?.observe(lifecycleOwner) { state ->
                val active = state == TorchState.ON
                if (isTorchOn != active) {
                    isTorchOn = active
                    emitTorchChanged(active)
                }
            }

            // Apply requested initial torch state
            if (torchEnabled) {
                applyTorchState(true)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    /**
     * Single-pass Y-plane (Luma) analysis:
     * 1. Early image.close() during HIBERNATION outside the 1500ms (3000ms dark/occluded) heartbeat
     * 2. Average luminance & Ticket 08 spatial reflection profile (centerLuma, borderLuma, glareRatio)
     * 3. Ticket 09 16x16 Luma Grid & frame-to-frame motion delta (ΔY)
     * 4. Immediate ImageProxy release on cameraExecutor via pre-allocated reusableY/U/V buffers
     */
    private fun processImageProxy(image: ImageProxy) {
        try {
            val now = System.currentTimeMillis()

            // Ticket 09 Layer 4: In HIBERNATION, close ImageProxy immediately outside 1500ms/3000ms heartbeat
            if (powerState == POWER_STATE_HIBERNATION) {
                val heartbeatIntervalMs = if (isProximityNear || currentLuminance < DARK_OCCLUDED_LUX_THRESHOLD) {
                    HIBERNATION_HEARTBEAT_DARK_MS
                } else {
                    HIBERNATION_HEARTBEAT_NOMINAL_MS
                }
                if (now - lastHibernationHeartbeatMs < heartbeatIntervalMs) {
                    return
                }
                lastHibernationHeartbeatMs = now
            }

            val plane = image.planes[0]
            val buffer = plane.buffer
            val rowStride = plane.rowStride
            val pixelStride = plane.pixelStride
            val width = image.width
            val height = image.height
            val bufferLimit = buffer.limit()

            currentLumaGridSums.fill(0L)
            currentLumaGridCounts.fill(0)

            var sum = 0L
            var sampleCount = 0L
            var centerSum = 0L
            var centerCount = 0L
            var borderSum = 0L
            var borderCount = 0L
            var glareCount = 0L
            val rMin = height / 4
            val rMax = (height * 3) / 4
            val cMin = width / 4
            val cMax = (width * 3) / 4
            val step = 4 // Subsample step for high-performance 30 FPS processing

            for (row in 0 until height step step) {
                val rowStart = row * rowStride
                val inCenterRow = row in rMin until rMax
                val gridRow = ((row * LUMA_GRID_DIM) / height).coerceIn(0, LUMA_GRID_DIM - 1)
                val gridRowBase = gridRow * LUMA_GRID_DIM
                for (col in 0 until width step step) {
                    val index = rowStart + col * pixelStride
                    if (index < bufferLimit) {
                        val yVal = buffer.get(index).toInt() and 0xFF
                        sum += yVal
                        sampleCount++
                        if (yVal > 230) {
                            glareCount++
                        }
                        if (inCenterRow && col in cMin until cMax) {
                            centerSum += yVal
                            centerCount++
                        } else {
                            borderSum += yVal
                            borderCount++
                        }
                        val gridCol = ((col * LUMA_GRID_DIM) / width).coerceIn(0, LUMA_GRID_DIM - 1)
                        val cellIdx = gridRowBase + gridCol
                        currentLumaGridSums[cellIdx] += yVal.toLong()
                        currentLumaGridCounts[cellIdx]++
                    }
                }
            }

            val avgLuminance = if (sampleCount > 0) sum.toDouble() / sampleCount else 0.0
            var motionDeltaSum = 0.0
            for (cell in 0 until LUMA_GRID_CELLS) {
                val cnt = currentLumaGridCounts[cell]
                val cellAvg = if (cnt > 0) (currentLumaGridSums[cell].toFloat() / cnt) else avgLuminance.toFloat()
                currentLumaGrid[cell] = cellAvg
                if (hasPreviousLumaGrid) {
                    motionDeltaSum += abs(cellAvg - previousLumaGrid[cell]).toDouble()
                }
                previousLumaGrid[cell] = cellAvg
            }
            val motionDeltaY = if (hasPreviousLumaGrid) motionDeltaSum / LUMA_GRID_CELLS else 0.0
            hasPreviousLumaGrid = true
            currentMotionDeltaY = motionDeltaY
            val isMotionBlurred = motionDeltaY > MOTION_BLUR_DELTA_Y_THRESHOLD

            val centerLuma = if (centerCount > 0) centerSum.toDouble() / centerCount else avgLuminance
            val borderLuma = if (borderCount > 0) borderSum.toDouble() / borderCount else avgLuminance
            val glareRatio = if (sampleCount > 0) glareCount.toDouble() / sampleCount else 0.0
            val centerToBorderRatio = if (borderLuma > 1.0) {
                centerLuma / borderLuma
            } else if (centerLuma > 1.0) {
                centerLuma
            } else {
                1.0
            }
            val hasOpticalReflection =
                (glareRatio >= MAX_GLARE_RATIO_FOR_RESTORE) ||
                    ((avgLuminance >= 60.0 || centerLuma >= 60.0) &&
                        (centerToBorderRatio >= MAX_CENTER_TO_BORDER_RATIO))
            val effectiveSampleLuma = if (hasOpticalReflection) {
                max(avgLuminance, centerLuma)
            } else {
                avgLuminance
            }
            currentLuminance = avgLuminance

            updateThermalAndBatteryLevel(now)

            // Adaptive IMU Table-Vibration Guard verification
            if (pendingImuWakeVerify) {
                pendingImuWakeVerify = false
                if (motionDeltaY < 1.2) {
                    consecutiveFalseImuWakes++
                    if (consecutiveFalseImuWakes >= 3) {
                        imuWakeThreshold = IMU_WAKE_ELEVATED_THRESHOLD
                    }
                } else {
                    consecutiveFalseImuWakes = 0
                    imuWakeThreshold = IMU_WAKE_DEFAULT_THRESHOLD
                }
            } else if (motionDeltaY >= MOTION_WAKE_DELTA_Y_THRESHOLD) {
                consecutiveFalseImuWakes = 0
                imuWakeThreshold = IMU_WAKE_DEFAULT_THRESHOLD
            }

            // Evaluate 3-Tier Adaptive Power Governor (BURST / ECO / HIBERNATION)
            evaluatePowerGovernor(now, motionDeltaY)

            // Send luminance event to React Native JS with delta & interval throttling
            val lumDelta = abs(avgLuminance - lastEmittedLuminance)
            if (now - lastLuminanceEmitTimestamp >= 100L &&
                (lumDelta >= 2.0 || now - lastLuminanceEmitTimestamp >= 400L)
            ) {
                lastLuminanceEmitTimestamp = now
                lastEmittedLuminance = avgLuminance
                emitLuminanceChanged(
                    avgLuminance,
                    glareRatio,
                    centerLuma,
                    borderLuma,
                    centerToBorderRatio,
                    if (hasHardwareLightSensor) ambientSensorLux.toDouble() else -1.0,
                    motionDeltaY,
                    isMotionBlurred
                )
            }

            // Layer 4: Clear oscillation latch after 60s cooldown
            if (isOscillationLatched && now >= oscillationLatchUntilMs) {
                isOscillationLatched = false
                oscillationLatchUntilMs = 0L
                autoTorchCycleTimestamps.clear()
            }

            // Layer 2: Record postTorchBaselineLuma (~450ms after auto-torch ON, ignoring dark pre-flash frames)
            if (isTorchOn && !isManualOverride && torchAutoOnTimestamp > 0L) {
                val elapsedSinceTorchOn = now - torchAutoOnTimestamp
                if (elapsedSinceTorchOn >= 0L && effectiveSampleLuma >= 25.0 &&
                    (elapsedSinceTorchOn <= POST_TORCH_BASELINE_WINDOW_MS ||
                        (elapsedSinceTorchOn <= 1000L && postTorchBaselineLuma < 80.0 && effectiveSampleLuma >= 80.0))
                ) {
                    if (effectiveSampleLuma > postTorchBaselineLuma) {
                        postTorchBaselineLuma = effectiveSampleLuma
                    }
                }
            }

            // Ticket 12: Smart Manual-OFF Recovery & Dark-to-Dark Motion/Darkening Re-Arm
            if (isManualOverride && !isTorchOn) {
                val elapsedSinceManualOff = if (manualOffTimestamp > 0L) (now - manualOffTimestamp) else Long.MAX_VALUE

                if (elapsedSinceManualOff >= MANUAL_OFF_SETTLE_MS && manualOffBaselineLuma < 0.0 && avgLuminance < MANUAL_OFF_REARM_LUMA_LUX) {
                    manualOffBaselineLuma = avgLuminance
                }

                val hasFrameMotion = (motionDeltaY >= MANUAL_OFF_MOTION_DELTA_Y) || (latestAccelDelta >= MANUAL_OFF_IMU_ACCEL_DELTA)
                val hasDarkenedFurther = manualOffBaselineLuma >= 0.0 &&
                    (manualOffBaselineLuma - avgLuminance) >= MANUAL_OFF_DARKENING_DROP_LUX

                if (elapsedSinceManualOff >= MANUAL_OFF_MOTION_ARM_DELAY_MS && (hasFrameMotion || hasDarkenedFurther)) {
                    hasMovedSinceManualOff = true
                }

                if (elapsedSinceManualOff >= MANUAL_OFF_SETTLE_MS &&
                    avgLuminance >= MANUAL_OFF_REARM_LUMA_LUX &&
                    !hasOpticalReflection
                ) {
                    isManualOverride = false
                    manualOffTimestamp = 0L
                    hasMovedSinceManualOff = false
                    manualOffBaselineLuma = -1.0
                    lowLightStartTimestamp = 0L
                } else if (elapsedSinceManualOff >= MANUAL_OFF_DARK_GRACE_MS && avgLuminance < MANUAL_OFF_REARM_LUMA_LUX) {
                    if (hasMovedSinceManualOff || hasFrameMotion || hasDarkenedFurther) {
                        isManualOverride = false
                        manualOffTimestamp = 0L
                        hasMovedSinceManualOff = false
                        manualOffBaselineLuma = -1.0
                        if (avgLuminance < 25.0) {
                            lowLightStartTimestamp = now
                        }
                    }
                }
            }

            // 4-Layer Anti-Strobe Smart Torch native logic:
            if (avgLuminance < 25.0) {
                restoreLightStartTimestamp = 0L
                if (lowLightStartTimestamp == 0L) {
                    lowLightStartTimestamp = now
                } else if (now - lowLightStartTimestamp >= 1000L) {
                    if (autoTorchEnabled && !isTorchOn && !isManualOverride && !isOscillationLatched) {
                        isTorchOn = true
                        torchAutoOnTimestamp = now
                        postTorchBaselineLuma = -1.0
                        preTorchAmbientSensorLux = if (hasHardwareLightSensor) ambientSensorLux else -1.0f
                        restoreLightStartTimestamp = 0L
                        post {
                            applyTorchState(true)
                        }
                    }
                }
            } else {
                lowLightStartTimestamp = 0L
                if (avgLuminance >= 60.0) {
                    val isGenuineBrightRoom =
                        (!hasHardwareLightSensor || ambientSensorLux >= AMBIENT_SENSOR_RESTORE_LUX) &&
                            !hasOpticalReflection

                    // Protect isManualOverride: NEVER clear manual override while torch is ON!
                    val elapsedSinceManualOff = if (manualOffTimestamp > 0L) (now - manualOffTimestamp) else Long.MAX_VALUE
                    if (isManualOverride && !isTorchOn && isGenuineBrightRoom && elapsedSinceManualOff > MANUAL_OFF_SETTLE_MS) {
                        isManualOverride = false
                        hasMovedSinceManualOff = false
                        manualOffBaselineLuma = -1.0
                    }

                    if (autoTorchEnabled && isTorchOn && !isManualOverride && !isOscillationLatched) {
                        val holdElapsed = if (torchAutoOnTimestamp > 0L) {
                            now - torchAutoOnTimestamp
                        } else {
                            MIN_TORCH_ON_HOLD_MS
                        }
                        val baseline = if (postTorchBaselineLuma > 0.0) postTorchBaselineLuma else 60.0
                        val requiredYThreshold = max(HIGH_RESTORE_LUMA_THRESHOLD, baseline + POST_TORCH_LUMA_DELTA)

                        val isTrueAmbientRecovery = if (hasHardwareLightSensor && ambientSensorLux >= 0.0f) {
                            val wasShadowedInLitRoom = preTorchAmbientSensorLux >= AMBIENT_SENSOR_RESTORE_LUX
                            val sensorRestored = if (wasShadowedInLitRoom) {
                                (ambientSensorLux >= preTorchAmbientSensorLux + 40.0f) || (avgLuminance >= requiredYThreshold)
                            } else {
                                ambientSensorLux >= AMBIENT_SENSOR_RESTORE_LUX
                            }
                            sensorRestored && !hasOpticalReflection
                        } else {
                            (avgLuminance >= requiredYThreshold) && !hasOpticalReflection
                        }

                        if (isTrueAmbientRecovery && !hasActiveDetection) {
                            if (restoreLightStartTimestamp == 0L) {
                                restoreLightStartTimestamp = now
                            }
                        } else {
                            restoreLightStartTimestamp = 0L
                        }

                        if (holdElapsed >= MIN_TORCH_ON_HOLD_MS &&
                            !hasActiveDetection &&
                            isTrueAmbientRecovery &&
                            restoreLightStartTimestamp > 0L &&
                            (now - restoreLightStartTimestamp >= RESTORE_SUSTAIN_DURATION_MS)
                        ) {
                            isTorchOn = false
                            torchAutoOnTimestamp = 0L
                            postTorchBaselineLuma = -1.0
                            preTorchAmbientSensorLux = -1.0f
                            restoreLightStartTimestamp = 0L

                            autoTorchCycleTimestamps.addLast(now)
                            while (autoTorchCycleTimestamps.isNotEmpty() &&
                                (now - autoTorchCycleTimestamps.first > OSCILLATION_WINDOW_MS)
                            ) {
                                autoTorchCycleTimestamps.removeFirst()
                            }
                            if (autoTorchCycleTimestamps.size >= OSCILLATION_MAX_CYCLES) {
                                isOscillationLatched = true
                                oscillationLatchUntilMs = now + OSCILLATION_LATCH_DURATION_MS
                            }

                            post {
                                applyTorchState(false)
                            }
                        }
                    }
                } else {
                    restoreLightStartTimestamp = 0L
                }
            }

            // Ticket 09 Layer 1: Motion-Blur Gate (skip TFLite inference during fast hand swipe ΔY > 32.0)
            if (isMotionBlurred) {
                return
            }

            // Determine dynamic inference interval from Adaptive Power Governor
            val inferenceInterval = getTargetInferenceIntervalMs()
            if (inferenceInterval <= 0L) {
                return
            }
            if (now - lastInferenceTimestamp >= inferenceInterval && !isInferring) {
                val useMock = detector.isUsingMock || image.planes.size < 3
                var yBytes: ByteArray? = null
                var uBytes: ByteArray? = null
                var vBytes: ByteArray? = null
                var yRowStride = 0
                var uvRowStride = 0
                var uvPixelStride = 0

                if (!useMock) {
                    val yPlane = image.planes[0]
                    val uPlane = image.planes[1]
                    val vPlane = image.planes[2]
                    val yBuf = yPlane.buffer
                    val uBuf = uPlane.buffer
                    val vBuf = vPlane.buffer
                    val yLen = yBuf.remaining()
                    val uLen = uBuf.remaining()
                    val vLen = vBuf.remaining()

                    val slot = bufferSlotIndex
                    bufferSlotIndex = (bufferSlotIndex + 1) % 2

                    if (reusableY[slot] == null || reusableY[slot]!!.size < yLen) reusableY[slot] = ByteArray(yLen)
                    if (reusableU[slot] == null || reusableU[slot]!!.size < uLen) reusableU[slot] = ByteArray(uLen)
                    if (reusableV[slot] == null || reusableV[slot]!!.size < vLen) reusableV[slot] = ByteArray(vLen)

                    val targetY = reusableY[slot]!!
                    val targetU = reusableU[slot]!!
                    val targetV = reusableV[slot]!!

                    val yPos = yBuf.position()
                    val uPos = uBuf.position()
                    val vPos = vBuf.position()
                    yBuf.get(targetY, 0, yLen)
                    uBuf.get(targetU, 0, uLen)
                    vBuf.get(targetV, 0, vLen)
                    yBuf.position(yPos)
                    uBuf.position(uPos)
                    vBuf.position(vPos)

                    yBytes = targetY
                    uBytes = targetU
                    vBytes = targetV
                    yRowStride = yPlane.rowStride
                    uvRowStride = uPlane.rowStride
                    uvPixelStride = uPlane.pixelStride
                }

                lastInferenceTimestamp = now
                isInferring = true

                try {
                    detectionExecutor.execute {
                        try {
                            val rawResult = if (useMock || yBytes == null || uBytes == null || vBytes == null) {
                                detector.getMockDetector().detect()
                            } else {
                                detector.detectFromYuv(
                                    yBytes,
                                    uBytes,
                                    vBytes,
                                    width,
                                    height,
                                    yRowStride,
                                    uvRowStride,
                                    uvPixelStride
                                )
                            }
                            val debounced = debounceFilter.process(rawResult)
                            val confirmedMoney = debounced.hasMoney && debounced.state == DebounceState.STABLE
                            val candidateHint = detector.hasLastCandidateHint ||
                                (!confirmedMoney && (rawResult.boxes.isNotEmpty() || debounced.state == DebounceState.STABILIZING))
                            hasConfirmedMoney = confirmedMoney
                            hasCandidateHint = candidateHint
                            hasActiveDetection = confirmedMoney || candidateHint
                            if (candidateHint && powerState != POWER_STATE_BURST) {
                                wakeUpToBurst("CANDIDATE_DETECTION", System.currentTimeMillis())
                            }
                            // Ticket 10 candidate hint emission compatibility signature:
                            // val isSteadyEmpty = debounced.state == "EMPTY" && !debounced.stateChanged && !candidateHint && wasLastEmittedStateEmpty
                            val isSteadyEmpty = debounced.state == DebounceState.EMPTY && !debounced.stateChanged && !candidateHint && wasLastEmittedStateEmpty
                            if (!isSteadyEmpty) {
                                wasLastEmittedStateEmpty = (debounced.state == DebounceState.EMPTY && !candidateHint)
                                post {
                                    emitMoneyDetected(rawResult, debounced, candidateHint)
                                }
                            }
                        } catch (e: Exception) {
                            e.printStackTrace()
                        } finally {
                            isInferring = false
                        }
                    }
                } catch (rejected: Exception) {
                    isInferring = false
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        } finally {
            try {
                image.close()
            } catch (_: Exception) {}
        }
    }

    private fun getTargetInferenceIntervalMs(): Long {
        return when (powerState) {
            POWER_STATE_HIBERNATION -> 0L
            POWER_STATE_ECO -> when (thermalLevel) {
                THERMAL_HOT -> ECO_INTERVAL_HOT_MS
                THERMAL_WARM -> ECO_INTERVAL_WARM_MS
                else -> ECO_INTERVAL_NOMINAL_MS
            }
            else -> when (thermalLevel) {
                THERMAL_HOT -> BURST_INTERVAL_HOT_MS
                THERMAL_WARM -> BURST_INTERVAL_WARM_MS
                else -> BURST_INTERVAL_NOMINAL_MS
            }
        }
    }

    private fun evaluatePowerGovernor(now: Long, motionDeltaY: Double) {
        // Auto-Torch Idle Thermal Cutoff (15s static empty or 4s proximity near)
        if (isTorchOn && !isManualOverride) {
            if (!hasActiveDetection && motionDeltaY < STATIC_EMPTY_DELTA_Y_THRESHOLD) {
                if (torchIdleStaticStartMs == 0L) {
                    torchIdleStaticStartMs = now
                } else if (now - torchIdleStaticStartMs >= IDLE_TORCH_CUTOFF_MS) {
                    torchIdleStaticStartMs = 0L
                    isTorchOn = false
                    torchAutoOnTimestamp = 0L
                    postTorchBaselineLuma = -1.0
                    preTorchAmbientSensorLux = -1.0f
                    post {
                        applyTorchState(false)
                    }
                }
            } else {
                torchIdleStaticStartMs = 0L
            }

            if (isProximityNear && proximityNearStartMs > 0L &&
                now - proximityNearStartMs >= PROXIMITY_TORCH_CUTOFF_MS
            ) {
                isTorchOn = false
                torchAutoOnTimestamp = 0L
                postTorchBaselineLuma = -1.0
                preTorchAmbientSensorLux = -1.0f
                post {
                    applyTorchState(false)
                }
            }
        } else {
            torchIdleStaticStartMs = 0L
        }

        // Immediate wake-up on visual motion or unsettled candidate hint
        if ((motionDeltaY >= MOTION_WAKE_DELTA_Y_THRESHOLD || hasCandidateHint) && !isProximityNear) {
            wakeUpToBurst(if (hasCandidateHint) "CANDIDATE_DETECTION" else "LUMA_MOTION", now)
            return
        }

        val ecoHoldMs = when (thermalLevel) {
            THERMAL_HOT -> ECO_ENTRY_STATIC_DURATION_HOT_MS
            THERMAL_WARM -> ECO_ENTRY_STATIC_DURATION_WARM_MS
            else -> ECO_ENTRY_STATIC_DURATION_NOMINAL_MS
        }
        val hibernationEmptyHoldMs = if (thermalLevel == THERMAL_HOT) {
            HIBERNATION_ENTRY_EMPTY_STATIC_HOT_MS
        } else {
            HIBERNATION_ENTRY_EMPTY_STATIC_NOMINAL_MS
        }

        // Dark / Occluded / Pocket check (< 5 lux or proximity near, outside Ticket 08's 1s auto-torch trigger window)
        val lowLightElapsed = if (lowLightStartTimestamp > 0L) (now - lowLightStartTimestamp) else 0L
        val isOutsideAutoTorchWindow = isTorchOn || isManualOverride || isOscillationLatched || !autoTorchEnabled || lowLightElapsed == 0L || lowLightElapsed > 1200L
        val isDarkOrOccluded = !hasActiveDetection &&
            motionDeltaY < STATIC_DEEP_IDLE_DELTA_Y_THRESHOLD &&
            (isProximityNear || currentLuminance < DARK_OCCLUDED_LUX_THRESHOLD) &&
            isOutsideAutoTorchWindow

        if (isDarkOrOccluded) {
            if (darkOccludedStartMs == 0L) {
                darkOccludedStartMs = now
            } else if (now - darkOccludedStartMs >= HIBERNATION_ENTRY_DARK_STATIC_MS && powerState != POWER_STATE_HIBERNATION) {
                powerState = POWER_STATE_HIBERNATION
                deepIdleStartMs = now
                post {
                    applyDisplayAndPreviewGovernorState(POWER_STATE_HIBERNATION, false)
                }
                return
            }
        } else {
            darkOccludedStartMs = 0L
        }

        if (powerState == POWER_STATE_BURST) {
            if (hasConfirmedMoney && !hasCandidateHint && motionDeltaY < STATIC_HOLDING_DELTA_Y_THRESHOLD) {
                if (staticHoldingStartMs == 0L) {
                    staticHoldingStartMs = now
                } else if (now - staticHoldingStartMs >= ecoHoldMs) {
                    powerState = POWER_STATE_ECO
                    staticHoldingStartMs = 0L
                    post {
                        applyDisplayAndPreviewGovernorState(POWER_STATE_ECO, false)
                    }
                }
            } else {
                staticHoldingStartMs = 0L
            }

            if (!hasActiveDetection && motionDeltaY < STATIC_EMPTY_DELTA_Y_THRESHOLD) {
                if (staticEmptyStartMs == 0L) {
                    staticEmptyStartMs = now
                }
                if (deepIdleStartMs == 0L && motionDeltaY < STATIC_DEEP_IDLE_DELTA_Y_THRESHOLD) {
                    deepIdleStartMs = now
                } else if (motionDeltaY >= STATIC_DEEP_IDLE_DELTA_Y_THRESHOLD) {
                    deepIdleStartMs = 0L
                }
                if (now - staticEmptyStartMs >= ecoHoldMs) {
                    powerState = POWER_STATE_ECO
                    post {
                        applyDisplayAndPreviewGovernorState(POWER_STATE_ECO, false)
                    }
                }
            } else {
                staticEmptyStartMs = 0L
                deepIdleStartMs = 0L
            }
        } else if (powerState == POWER_STATE_ECO) {
            if (!hasActiveDetection && motionDeltaY < STATIC_DEEP_IDLE_DELTA_Y_THRESHOLD) {
                if (deepIdleStartMs == 0L) {
                    deepIdleStartMs = now
                } else if (now - deepIdleStartMs >= hibernationEmptyHoldMs) {
                    powerState = POWER_STATE_HIBERNATION
                    post {
                        applyDisplayAndPreviewGovernorState(POWER_STATE_HIBERNATION, false)
                    }
                }
            } else if (hasActiveDetection) {
                deepIdleStartMs = 0L
            }
        } else if (powerState == POWER_STATE_HIBERNATION) {
            if (deepIdleStartMs > 0L &&
                now - deepIdleStartMs >= DEEP_IDLE_SCREEN_OFF_TIMEOUT_MS &&
                !isKeepScreenOnReleased
            ) {
                post {
                    applyDisplayAndPreviewGovernorState(POWER_STATE_HIBERNATION, true)
                }
            }
        }
    }

    fun applyTorchState(enabled: Boolean) {
        try {
            camera?.cameraControl?.enableTorch(enabled)
            isTorchOn = enabled
            emitTorchChanged(enabled)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun manualToggleTorch(enabled: Boolean) {
        val now = System.currentTimeMillis()
        wakeUpToBurst("TOUCH_INTERACTION", now)
        isManualOverride = true
        lowLightStartTimestamp = 0L
        restoreLightStartTimestamp = 0L
        torchIdleStaticStartMs = 0L
        if (!enabled) {
            torchAutoOnTimestamp = 0L
            postTorchBaselineLuma = -1.0
            preTorchAmbientSensorLux = -1.0f
            manualOffTimestamp = now
            manualOffBaselineLuma = -1.0
            hasMovedSinceManualOff = false
        } else {
            manualOffTimestamp = 0L
            manualOffBaselineLuma = -1.0
            hasMovedSinceManualOff = false
        }
        applyTorchState(enabled)
    }

    fun getLuminance(): Double = currentLuminance

    fun getIsTorchOn(): Boolean = isTorchOn

    private fun emitLuminanceChanged(
        luminance: Double,
        glareRatio: Double = 0.0,
        centerLuma: Double = luminance,
        borderLuma: Double = luminance,
        centerToBorderRatio: Double = 1.0,
        ambientLux: Double = -1.0,
        motionDeltaY: Double = 0.0,
        isMotionBlurred: Boolean = false
    ) {
        try {
            val event = Arguments.createMap().apply {
                putDouble("luminance", luminance)
                putDouble("glareRatio", glareRatio)
                putDouble("centerLuma", centerLuma)
                putDouble("borderLuma", borderLuma)
                putDouble("centerToBorderRatio", centerToBorderRatio)
                putDouble("ambientSensorLux", ambientLux)
                putDouble("motionDeltaY", motionDeltaY)
                putBoolean("isMotionBlurred", isMotionBlurred)
                putDouble("accelMagnitudeDelta", latestAccelDelta.toDouble())
                putBoolean("isProximityNear", isProximityNear)
                putBoolean("hasCandidateHint", detector.hasLastCandidateHint)
                putString("powerState", powerState)
                putString("thermalLevel", thermalLevel)
            }
            reactContext.getJSModule(RCTEventEmitter::class.java)?.receiveEvent(
                id,
                "onLuminanceChanged",
                event
            )
        } catch (_: Exception) {}
    }

    private fun emitTorchChanged(torchOn: Boolean) {
        try {
            val event = Arguments.createMap().apply {
                putBoolean("isTorchOn", torchOn)
            }
            reactContext.getJSModule(RCTEventEmitter::class.java)?.receiveEvent(
                id,
                "onTorchChanged",
                event
            )
        } catch (_: Exception) {}
    }

    private fun emitMoneyDetected(
        result: DetectionResult,
        debounced: DebouncedResult? = null,
        candidateHint: Boolean = hasCandidateHint || detector.hasLastCandidateHint
    ) {
        try {
            MoneyDetectorModule.updateLastResult(debounced?.result ?: result)

            val event = MoneyDetectorModule.convertResultToWritableMap(result, debounced).apply {
                putDouble("motionDeltaY", currentMotionDeltaY)
                putBoolean("isMotionBlurred", currentMotionDeltaY > MOTION_BLUR_DELTA_Y_THRESHOLD)
                putBoolean("hasCandidateHint", candidateHint)
                putString("powerState", powerState)
            }
            reactContext.getJSModule(RCTEventEmitter::class.java)?.receiveEvent(
                id,
                "onMoneyDetected",
                event
            )
        } catch (_: Exception) {}
    }

    fun resetDebounceFilter() {
        debounceFilter.reset()
        hasActiveDetection = false
        hasConfirmedMoney = false
        hasCandidateHint = false
        wasLastEmittedStateEmpty = false
    }

    override fun onHostResume() {
        if (cameraExecutor.isShutdown) {
            cameraExecutor = Executors.newSingleThreadExecutor()
        }
        if (detectionExecutor.isShutdown) {
            detectionExecutor = createBackgroundDetectionExecutor()
        }
        initLightSensor()
        wakeUpToBurst("TOUCH_INTERACTION", System.currentTimeMillis())
        if (camera == null) {
            startCamera()
        }
    }

    override fun onHostPause() {
        unregisterLightSensor()
    }

    override fun onHostDestroy() {
        cleanup()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        unregisterLightSensor()
        try {
            cameraProvider?.unbindAll()
            camera = null
        } catch (_: Exception) {}
        unregisterActiveView(this)
    }

    private fun cleanup() {
        reactContext.removeLifecycleEventListener(this)
        unregisterLightSensor()
        unregisterActiveView(this)
        try {
            cameraProvider?.unbindAll()
            camera = null
            if (!cameraExecutor.isShutdown) {
                cameraExecutor.shutdown()
            }
            if (!detectionExecutor.isShutdown) {
                detectionExecutor.shutdown()
            }
        } catch (_: Exception) {}
    }

    companion object {
        private const val MIN_TORCH_ON_HOLD_MS = 12000L
        private const val POST_TORCH_BASELINE_WINDOW_MS = 450L
        private const val RESTORE_SUSTAIN_DURATION_MS = 3000L
        private const val HIGH_RESTORE_LUMA_THRESHOLD = 175.0
        private const val POST_TORCH_LUMA_DELTA = 55.0
        private const val AMBIENT_SENSOR_RESTORE_LUX = 85.0f
        private const val MAX_GLARE_RATIO_FOR_RESTORE = 0.08
        private const val MAX_CENTER_TO_BORDER_RATIO = 1.30
        private const val OSCILLATION_WINDOW_MS = 30000L
        private const val OSCILLATION_MAX_CYCLES = 2
        private const val OSCILLATION_LATCH_DURATION_MS = 60000L

        // Ticket 12 Constants
        private const val MANUAL_OFF_SETTLE_MS = 250L
        private const val MANUAL_OFF_MOTION_ARM_DELAY_MS = 400L
        private const val MANUAL_OFF_REARM_LUMA_LUX = 35.0
        private const val MANUAL_OFF_DARK_GRACE_MS = 2500L
        private const val MANUAL_OFF_DARKENING_DROP_LUX = 6.0
        private const val MANUAL_OFF_MOTION_DELTA_Y = 4.5
        private const val MANUAL_OFF_IMU_ACCEL_DELTA = 0.35f

        // Ticket 09 Constants
        private const val LUMA_GRID_DIM = 16
        private const val LUMA_GRID_CELLS = 256
        private const val MOTION_BLUR_DELTA_Y_THRESHOLD = 32.0
        private const val MOTION_WAKE_DELTA_Y_THRESHOLD = 4.5
        private const val STATIC_HOLDING_DELTA_Y_THRESHOLD = 2.5
        private const val STATIC_EMPTY_DELTA_Y_THRESHOLD = 2.0
        private const val STATIC_DEEP_IDLE_DELTA_Y_THRESHOLD = 1.5
        private const val DARK_OCCLUDED_LUX_THRESHOLD = 5.0
        private const val IDLE_TORCH_CUTOFF_MS = 15000L
        private const val PROXIMITY_TORCH_CUTOFF_MS = 4000L
        private const val DEEP_IDLE_SCREEN_OFF_TIMEOUT_MS = 180000L
        private const val IMU_WAKE_DEFAULT_THRESHOLD = 0.35f
        private const val IMU_WAKE_ELEVATED_THRESHOLD = 0.65f
        private const val IMU_WAKE_DELTA_A_TABLE = 0.65f
        private const val LUX_WAKE_MIN_DELTA = 8.0f
        private const val LUX_WAKE_RELATIVE_RATIO = 0.25f

        private const val BURST_INTERVAL_NOMINAL_MS = 130L
        private const val BURST_INTERVAL_WARM_MS = 175L
        private const val BURST_INTERVAL_HOT_MS = 240L
        private const val ECO_INTERVAL_NOMINAL_MS = 650L
        private const val ECO_INTERVAL_WARM_MS = 850L
        private const val ECO_INTERVAL_HOT_MS = 1100L
        private const val HIBERNATION_HEARTBEAT_NOMINAL_MS = 1500L
        private const val HIBERNATION_HEARTBEAT_DARK_MS = 3000L

        private const val ECO_ENTRY_STATIC_DURATION_NOMINAL_MS = 2500L
        private const val ECO_ENTRY_STATIC_DURATION_WARM_MS = 1800L
        private const val ECO_ENTRY_STATIC_DURATION_HOT_MS = 1200L
        private const val HIBERNATION_ENTRY_EMPTY_STATIC_NOMINAL_MS = 8000L
        private const val HIBERNATION_ENTRY_EMPTY_STATIC_HOT_MS = 5000L
        private const val HIBERNATION_ENTRY_DARK_STATIC_MS = 3000L

        private const val PREVIEW_ALPHA_BURST = 0.22f
        private const val PREVIEW_ALPHA_ECO = 0.08f

        const val POWER_STATE_BURST = "BURST"
        const val POWER_STATE_ECO = "ECO"
        const val POWER_STATE_HIBERNATION = "HIBERNATION"

        const val THERMAL_NOMINAL = "NOMINAL"
        const val THERMAL_WARM = "WARM"
        const val THERMAL_HOT = "HOT"

        private var activeView: MoneyCameraView? = null

        fun registerActiveView(view: MoneyCameraView) {
            activeView = view
        }

        fun unregisterActiveView(view: MoneyCameraView) {
            if (activeView == view) {
                activeView = null
            }
        }

        fun getActiveView(): MoneyCameraView? = activeView
    }
}

