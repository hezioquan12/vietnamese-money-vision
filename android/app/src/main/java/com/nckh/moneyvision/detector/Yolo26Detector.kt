package com.nckh.moneyvision.detector

import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import org.tensorflow.lite.DataType
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.gpu.GpuDelegate
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.channels.FileChannel

// 1. Data classes for Detection Results
data class DetectedBox(
    val x: Float,
    val y: Float,
    val width: Float,
    val height: Float,
    val cx: Float,
    val cy: Float,
    val score: Float,
    val classIndex: Int,
    val denomination: Long,
    val label: String
)

data class DetectedMoneyItem(
    val classId: Long,
    val count: Int,
    val label: String,
    val totalAmount: Long
)

data class DetectionResult(
    val items: List<DetectedMoneyItem>,
    val boxes: List<DetectedBox>,
    val totalAmount: Long,
    val totalNotesCount: Int,
    val hasMoney: Boolean,
    val timestamp: Long,
    val inferenceTimeMs: Long,
    val isMock: Boolean
)

data class DetectionSummary(
    val items: List<DetectedMoneyItem>,
    val boxes: List<DetectedBox>,
    val totalAmount: Long,
    val totalNotesCount: Int,
    val hasMoney: Boolean
)

// 2. Constants & Mappings
val YOLO_CLASS_ORDER = longArrayOf(
    1000L,
    10000L,
    100000L,
    2000L,
    20000L,
    200000L,
    5000L,
    50000L,
    500000L
)

val DENOMINATION_NAMES = mapOf(
    1000L to "Một nghìn",
    2000L to "Hai nghìn",
    5000L to "Năm nghìn",
    10000L to "Mười nghìn",
    20000L to "Hai mươi nghìn",
    50000L to "Năm mươi nghìn",
    100000L to "Một trăm nghìn",
    200000L to "Hai trăm nghìn",
    500000L to "Năm trăm nghìn"
)

/**
 * Yolo26Detector
 * Core inference engine for YOLO26 quantized INT8/Float32 LiteRT model.
 * Supports both NCHW [1, 3, 640, 640] and NHWC [1, 640, 640, 3] RGB inputs,
 * and both [1, 13, 8400] and [1, 8400, 13] outputs (normalized [0..1] or pixel [0..640] coords).
 */
class Yolo26Detector(private val context: Context) {

    companion object {
        private const val TAG = "Yolo26Detector"
        const val MODEL_PATH = "models/yolo26_money_quant.tflite"
        const val INPUT_WIDTH = 640
        const val INPUT_HEIGHT = 640
        const val NUM_CHANNELS = 3
        const val NUM_COORDINATES = 4
        const val NUM_CLASSES = 9
        const val TOTAL_CHANNELS = NUM_COORDINATES + NUM_CLASSES // 13
        const val NUM_ANCHORS = 8400
        const val SCORE_THRESHOLD = 0.50f
        const val CANDIDATE_HINT_THRESHOLD = 0.28f
        const val IOU_THRESHOLD = 0.45f
        const val TILE_SIZE = 16

        val SORTED_DENOMINATIONS = longArrayOf(
            500000L, 200000L, 100000L, 50000L, 20000L, 10000L, 5000L, 2000L, 1000L
        )

        // Pre-computed 256-entry normalization lookup table (eliminates 1,228,800 float divisions/frame)
        val NORM_LUT = FloatArray(256) { it * (1.0f / 255.0f) }

        @Volatile
        private var instance: Yolo26Detector? = null

        fun getInstance(context: Context): Yolo26Detector {
            return instance ?: synchronized(this) {
                instance ?: Yolo26Detector(context.applicationContext).also { instance = it }
            }
        }
    }

    private var interpreter: Interpreter? = null
    private var gpuDelegate: GpuDelegate? = null
    private val mockDetector = MockMoneyDetector()

    var isUsingMock: Boolean = true
        private set

    var inferenceFps: Int = 10
        private set

    @Volatile
    var hasLastCandidateHint: Boolean = false
        private set

    @Volatile
    var lastCoordinateReadsCount: Int = 0
        private set

    private var isInputChannelsFirst: Boolean = true // [1, 3, 640, 640] NCHW vs [1, 640, 640, 3] NHWC
    private var isChannelsLast: Boolean = false
    private var isInputQuantized: Boolean = false
    private var inputDataType: DataType = DataType.FLOAT32
    private var inputScale: Float = 1.0f / 255.0f
    private var inputZeroPoint: Int = 0

    // Reusable buffers to eliminate per-frame heap and native allocations
    private var reusableInputBuffer: ByteBuffer? = null
    private val reusablePixelBuffer = IntArray(INPUT_WIDTH * INPUT_HEIGHT)
    private val reusableFloatStaging = FloatArray(INPUT_WIDTH * INPUT_HEIGHT * NUM_CHANNELS)
    private var reusableChannelsFirstOutput: Array<Array<FloatArray>>? = null
    private var reusableChannelsLastOutput: Array<Array<FloatArray>>? = null

    // Pre-computed coordinate & stride LUTs for 90° CW YUV420 -> 640x640 NCHW
    private val sxLut = IntArray(INPUT_HEIGHT)
    private val uvColOffLut = IntArray(INPUT_HEIGHT)
    private val yRowOffLut = IntArray(INPUT_WIDTH)
    private val uvRowOffLut = IntArray(INPUT_WIDTH)
    private var cachedLutSrcW: Int = -1
    private var cachedLutSrcH: Int = -1
    private var cachedLutYStride: Int = -1
    private var cachedLutUvStride: Int = -1
    private var cachedLutUvPixelStride: Int = -1

    // Sparse hit tracking buffers for Row-Major decoder (zero per-frame array fill)
    private val reusableBestScores = FloatArray(NUM_ANCHORS) { -Float.MAX_VALUE }
    private val reusableBestClasses = IntArray(NUM_ANCHORS) { -1 }
    private val reusableHitAnchors = IntArray(NUM_ANCHORS)
    private val reusableIsHit = BooleanArray(NUM_ANCHORS)

    init {
        initModel()
    }

    private fun loadModelByteBuffer(): ByteBuffer {
        // 1. Try zero-copy mmap via openFd (works when uncompressed in APK)
        try {
            context.assets.openFd(MODEL_PATH).use { afd ->
                FileInputStream(afd.fileDescriptor).use { fis ->
                    return fis.channel.map(
                        FileChannel.MapMode.READ_ONLY,
                        afd.startOffset,
                        afd.declaredLength
                    )
                }
            }
        } catch (_: Exception) {
            // 2. Fallback: stream read into direct ByteBuffer (works even if compressed)
            context.assets.open(MODEL_PATH).use { inputStream ->
                val bytes = inputStream.readBytes()
                val directBuf = ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.nativeOrder())
                directBuf.put(bytes)
                directBuf.rewind()
                return directBuf
            }
        }
    }

    @Synchronized
    private fun initModel() {
        close()

        try {
            val modelByteBuffer = loadModelByteBuffer()
            val availableCores = Runtime.getRuntime().availableProcessors()
            // Ticket 09 Layer 2: Cap XNNPACK at 2 threads to keep inference on efficiency/mid cores
            // and avoid waking 4 big Cortex-X/A7xx cores on 8-core smartphones.
            val cpuThreads = availableCores.coerceIn(1, 2)

            // Step 1: Load with multi-threaded CPU + XNNPACK (optimal and deterministic for INT8 quantized YOLO26)
            var loaded = false
            try {
                val cpuOptions = Interpreter.Options().apply {
                    setNumThreads(cpuThreads)
                    setUseXNNPACK(true)
                }
                interpreter = Interpreter(modelByteBuffer, cpuOptions)
                loaded = true
                Log.i(TAG, "Loaded YOLO26 model on CPU+XNNPACK with $cpuThreads threads.")
            } catch (cpuError: Throwable) {
                Log.w(TAG, "CPU+XNNPACK init failed (${cpuError.message}), trying GPU Delegate fallback.")
            }

            // Step 2: Optional GPU Delegate fallback if standard init failed
            if (!loaded) {
                val gpuOptions = Interpreter.Options().apply {
                    setNumThreads(cpuThreads)
                    val delegate = GpuDelegate()
                    addDelegate(delegate)
                    gpuDelegate = delegate
                }
                interpreter = Interpreter(modelByteBuffer, gpuOptions)
            }

            // Inspect model input and output tensor characteristics
            val currentInterpreter = interpreter
            if (currentInterpreter != null) {
                val inputTensor = currentInterpreter.getInputTensor(0)
                val inShape = inputTensor.shape()
                // Detect NCHW [1, 3, 640, 640] vs NHWC [1, 640, 640, 3]
                isInputChannelsFirst = inShape != null && inShape.size == 4 && inShape[1] == NUM_CHANNELS
                inputDataType = inputTensor.dataType()
                isInputQuantized = inputDataType == DataType.INT8 || inputDataType == DataType.UINT8

                try {
                    val quantParams = inputTensor.quantizationParams()
                    if (quantParams.scale > 0f) {
                        inputScale = quantParams.scale
                        inputZeroPoint = quantParams.zeroPoint
                    }
                } catch (_: Throwable) {}

                val bytesPerPixelChannel = if (isInputQuantized) 1 else 4
                reusableInputBuffer = ByteBuffer.allocateDirect(
                    1 * INPUT_WIDTH * INPUT_HEIGHT * NUM_CHANNELS * bytesPerPixelChannel
                ).apply {
                    order(ByteOrder.nativeOrder())
                }

                val outputTensor = currentInterpreter.getOutputTensor(0)
                val outShape = outputTensor.shape()
                isChannelsLast = outShape != null && outShape.size == 3 && outShape[1] == NUM_ANCHORS && outShape[2] == TOTAL_CHANNELS

                if (isChannelsLast) {
                    reusableChannelsLastOutput = Array(1) { Array(NUM_ANCHORS) { FloatArray(TOTAL_CHANNELS) } }
                } else {
                    reusableChannelsFirstOutput = Array(1) { Array(TOTAL_CHANNELS) { FloatArray(NUM_ANCHORS) } }
                }

                isUsingMock = false
                Log.i(
                    TAG,
                    "YOLO26 LiteRT Engine initialized: inputNCHW=$isInputChannelsFirst, inputType=$inputDataType, outputChannelsLast=$isChannelsLast"
                )
            }
        } catch (e: Exception) {
            Log.w(TAG, "Model $MODEL_PATH not found or failed to load (${e.message}). Falling back to MockMoneyDetector.")
            isUsingMock = true
            interpreter = null
        }
    }

    fun isModelLoaded(): Boolean = !isUsingMock && interpreter != null

    fun reloadModel(): Boolean {
        initModel()
        return isModelLoaded()
    }

    fun setInferenceFps(fps: Int) {
        inferenceFps = fps.coerceIn(1, 15)
    }

    fun getMockDetector(): MockMoneyDetector = mockDetector

    /**
     * Numerically stable Sigmoid activation for raw logits
     */
    private fun sigmoid(x: Float): Float {
        if (x.isNaN()) return 0.0f
        if (x > 40f) return 1.0f
        if (x < -40f) return 0.0f
        return 1.0f / (1.0f + Math.exp(-x.toDouble()).toFloat())
    }

    /**
     * Inverse Sigmoid (logit) for pre-sigmoid threshold comparison
     */
    private fun inverseSigmoid(p: Float): Float {
        val clamped = p.coerceIn(1e-6f, 1.0f - 1e-6f)
        return Math.log((clamped / (1.0f - clamped)).toDouble()).toFloat()
    }

    /**
     * Zero-Bitmap Direct YUV_420_888 Inference Pipeline (Ticket 09 Layer 3).
     * Performs 16x16 cache-tiled 90-degree CW rotation + bilinear/nearest scaling + BT.601 YUV->RGB
     * directly into the NCHW/NHWC ByteBuffer without allocating any intermediate Bitmap or JPEG.
     */
    @Synchronized
    fun detectFromYuv(
        yBuffer: ByteBuffer,
        uBuffer: ByteBuffer,
        vBuffer: ByteBuffer,
        srcW: Int,
        srcH: Int,
        yRowStride: Int,
        uvRowStride: Int,
        uvPixelStride: Int
    ): DetectionResult {
        if (isUsingMock || interpreter == null) {
            return mockDetector.detect()
        }

        val startTime = System.currentTimeMillis()

        try {
            val inputBuffer = preprocessYuvToByteBuffer(
                yBuffer,
                uBuffer,
                vBuffer,
                srcW,
                srcH,
                yRowStride,
                uvRowStride,
                uvPixelStride
            )

            val candidateBoxes: List<DetectedBox>
            if (isChannelsLast) {
                val output = reusableChannelsLastOutput ?: Array(1) { Array(NUM_ANCHORS) { FloatArray(TOTAL_CHANNELS) } }
                interpreter?.run(inputBuffer, output)
                candidateBoxes = decodeChannelsLastOutput(output)
            } else {
                val output = reusableChannelsFirstOutput ?: Array(1) { Array(TOTAL_CHANNELS) { FloatArray(NUM_ANCHORS) } }
                interpreter?.run(inputBuffer, output)
                candidateBoxes = decodeChannelsFirstOutput(output)
            }

            val nmsBoxes = runNMS(candidateBoxes, IOU_THRESHOLD)
            val summary = aggregate(nmsBoxes)
            val inferenceTimeMs = (System.currentTimeMillis() - startTime).coerceAtLeast(1L)

            return DetectionResult(
                items = summary.items,
                boxes = nmsBoxes,
                totalAmount = summary.totalAmount,
                totalNotesCount = summary.totalNotesCount,
                hasMoney = summary.hasMoney,
                timestamp = System.currentTimeMillis(),
                inferenceTimeMs = inferenceTimeMs,
                isMock = false
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error during YUV inference, falling back to mock", e)
            return mockDetector.detect()
        }
    }

    /**
     * Zero-allocation YUV_420_888 inference overload accepting pre-copied ByteArray planes
     * so ImageProxy can be closed immediately on cameraExecutor without holding hardware buffers across threads.
     * Uses direct primitive array indexing to eliminate 1.23M virtual ByteBuffer.get() calls/frame.
     */
    @Synchronized
    fun detectFromYuv(
        yBytes: ByteArray,
        uBytes: ByteArray,
        vBytes: ByteArray,
        srcW: Int,
        srcH: Int,
        yRowStride: Int,
        uvRowStride: Int,
        uvPixelStride: Int
    ): DetectionResult {
        if (isUsingMock || interpreter == null) {
            return mockDetector.detect()
        }

        val startTime = System.currentTimeMillis()

        try {
            val inputBuffer = preprocessYuvBytesToByteBuffer(
                yBytes,
                uBytes,
                vBytes,
                srcW,
                srcH,
                yRowStride,
                uvRowStride,
                uvPixelStride
            )

            val candidateBoxes: List<DetectedBox>
            if (isChannelsLast) {
                val output = reusableChannelsLastOutput ?: Array(1) { Array(NUM_ANCHORS) { FloatArray(TOTAL_CHANNELS) } }
                interpreter?.run(inputBuffer, output)
                candidateBoxes = decodeChannelsLastOutput(output)
            } else {
                val output = reusableChannelsFirstOutput ?: Array(1) { Array(TOTAL_CHANNELS) { FloatArray(NUM_ANCHORS) } }
                interpreter?.run(inputBuffer, output)
                candidateBoxes = decodeChannelsFirstOutput(output)
            }

            val nmsBoxes = runNMS(candidateBoxes, IOU_THRESHOLD)
            val summary = aggregate(nmsBoxes)
            val inferenceTimeMs = (System.currentTimeMillis() - startTime).coerceAtLeast(1L)

            return DetectionResult(
                items = summary.items,
                boxes = nmsBoxes,
                totalAmount = summary.totalAmount,
                totalNotesCount = summary.totalNotesCount,
                hasMoney = summary.hasMoney,
                timestamp = System.currentTimeMillis(),
                inferenceTimeMs = inferenceTimeMs,
                isMock = false
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error during direct ByteArray YUV inference, falling back to mock", e)
            return mockDetector.detect()
        }
    }

    private fun ensureYuvLuts(
        srcW: Int,
        srcH: Int,
        yRowStride: Int,
        uvRowStride: Int,
        uvPixelStride: Int
    ) {
        if (srcW == cachedLutSrcW &&
            srcH == cachedLutSrcH &&
            yRowStride == cachedLutYStride &&
            uvRowStride == cachedLutUvStride &&
            uvPixelStride == cachedLutUvPixelStride
        ) {
            return
        }
        for (dy in 0 until INPUT_HEIGHT) {
            val sx = ((dy * srcW) / INPUT_HEIGHT).coerceIn(0, srcW - 1)
            sxLut[dy] = sx
            uvColOffLut[dy] = (sx shr 1) * uvPixelStride
        }
        for (dx in 0 until INPUT_WIDTH) {
            val sy = (srcH - 1 - (dx * srcH) / INPUT_WIDTH).coerceIn(0, srcH - 1)
            yRowOffLut[dx] = sy * yRowStride
            uvRowOffLut[dx] = (sy shr 1) * uvRowStride
        }
        cachedLutSrcW = srcW
        cachedLutSrcH = srcH
        cachedLutYStride = yRowStride
        cachedLutUvStride = uvRowStride
        cachedLutUvPixelStride = uvPixelStride
    }

    private fun preprocessYuvToByteBuffer(
        yBuffer: ByteBuffer,
        uBuffer: ByteBuffer,
        vBuffer: ByteBuffer,
        srcW: Int,
        srcH: Int,
        yRowStride: Int,
        uvRowStride: Int,
        uvPixelStride: Int
    ): ByteBuffer {
        ensureYuvLuts(srcW, srcH, yRowStride, uvRowStride, uvPixelStride)

        val byteBuffer = reusableInputBuffer ?: ByteBuffer.allocateDirect(
            1 * INPUT_WIDTH * INPUT_HEIGHT * NUM_CHANNELS * (if (isInputQuantized) 1 else 4)
        ).apply {
            order(ByteOrder.nativeOrder())
            reusableInputBuffer = this
        }
        byteBuffer.rewind()

        val yLim = yBuffer.limit()
        val uLim = uBuffer.limit()
        val vLim = vBuffer.limit()
        val planeSize = INPUT_WIDTH * INPUT_HEIGHT
        val gPlaneOffset = planeSize
        val bPlaneOffset = planeSize * 2

        if (isInputChannelsFirst && !isInputQuantized) {
            // 16x16 Cache-Tiled 90° CW YUV420 -> NCHW Float32 via reusableFloatStaging + FloatBuffer bulk copy
            var ty = 0
            while (ty < INPUT_HEIGHT) {
                val tyEnd = minOf(ty + TILE_SIZE, INPUT_HEIGHT)
                var tx = 0
                while (tx < INPUT_WIDTH) {
                    val txEnd = minOf(tx + TILE_SIZE, INPUT_WIDTH)
                    for (dy in ty until tyEnd) {
                        val sx = sxLut[dy]
                        val uvColOff = uvColOffLut[dy]
                        val dstRowBase = dy * INPUT_WIDTH
                        for (dx in tx until txEnd) {
                            val yIdx = yRowOffLut[dx] + sx
                            val uvIdx = uvRowOffLut[dx] + uvColOff

                            val yVal = if (yIdx in 0 until yLim) (yBuffer.get(yIdx).toInt() and 0xFF) else 0
                            val uVal = if (uvIdx in 0 until uLim) (uBuffer.get(uvIdx).toInt() and 0xFF) - 128 else 0
                            val vVal = if (uvIdx in 0 until vLim) (vBuffer.get(uvIdx).toInt() and 0xFF) - 128 else 0

                            val r = (yVal + ((1436 * vVal) shr 10)).coerceIn(0, 255)
                            val g = (yVal - ((352 * uVal + 731 * vVal) shr 10)).coerceIn(0, 255)
                            val b = (yVal + ((1815 * uVal) shr 10)).coerceIn(0, 255)

                            val outIdx = dstRowBase + dx
                            reusableFloatStaging[outIdx] = NORM_LUT[r]
                            reusableFloatStaging[gPlaneOffset + outIdx] = NORM_LUT[g]
                            reusableFloatStaging[bPlaneOffset + outIdx] = NORM_LUT[b]
                        }
                    }
                    tx += TILE_SIZE
                }
                ty += TILE_SIZE
            }
            byteBuffer.asFloatBuffer().put(reusableFloatStaging)
            byteBuffer.rewind()
            return byteBuffer
        }

        // Quantized or NHWC fallback using 16x16 cache tiling into reusablePixelBuffer
        var ty = 0
        while (ty < INPUT_HEIGHT) {
            val tyEnd = minOf(ty + TILE_SIZE, INPUT_HEIGHT)
            var tx = 0
            while (tx < INPUT_WIDTH) {
                val txEnd = minOf(tx + TILE_SIZE, INPUT_WIDTH)
                for (dy in ty until tyEnd) {
                    val sx = sxLut[dy]
                    val uvColOff = uvColOffLut[dy]
                    val dstRowBase = dy * INPUT_WIDTH
                    for (dx in tx until txEnd) {
                        val yIdx = yRowOffLut[dx] + sx
                        val uvIdx = uvRowOffLut[dx] + uvColOff

                        val yVal = if (yIdx in 0 until yLim) (yBuffer.get(yIdx).toInt() and 0xFF) else 0
                        val uVal = if (uvIdx in 0 until uLim) (uBuffer.get(uvIdx).toInt() and 0xFF) - 128 else 0
                        val vVal = if (uvIdx in 0 until vLim) (vBuffer.get(uvIdx).toInt() and 0xFF) - 128 else 0

                        val r = (yVal + ((1436 * vVal) shr 10)).coerceIn(0, 255)
                        val g = (yVal - ((352 * uVal + 731 * vVal) shr 10)).coerceIn(0, 255)
                        val b = (yVal + ((1815 * uVal) shr 10)).coerceIn(0, 255)

                        reusablePixelBuffer[dstRowBase + dx] = (r shl 16) or (g shl 8) or b
                    }
                }
                tx += TILE_SIZE
            }
            ty += TILE_SIZE
        }
        return fillByteBufferFromPixelBuffer(byteBuffer)
    }

    /**
     * Direct primitive ByteArray preprocessing (16x16 cache-tiled 90° CW YUV420 -> NCHW Float32)
     * Completely eliminates 1.23M virtual ByteBuffer.get() calls/frame and bounds checks.
     */
    private fun preprocessYuvBytesToByteBuffer(
        yBytes: ByteArray,
        uBytes: ByteArray,
        vBytes: ByteArray,
        srcW: Int,
        srcH: Int,
        yRowStride: Int,
        uvRowStride: Int,
        uvPixelStride: Int
    ): ByteBuffer {
        ensureYuvLuts(srcW, srcH, yRowStride, uvRowStride, uvPixelStride)

        val byteBuffer = reusableInputBuffer ?: ByteBuffer.allocateDirect(
            1 * INPUT_WIDTH * INPUT_HEIGHT * NUM_CHANNELS * (if (isInputQuantized) 1 else 4)
        ).apply {
            order(ByteOrder.nativeOrder())
            reusableInputBuffer = this
        }
        byteBuffer.rewind()

        val yLim = yBytes.size
        val uLim = uBytes.size
        val vLim = vBytes.size
        val planeSize = INPUT_WIDTH * INPUT_HEIGHT
        val gPlaneOffset = planeSize
        val bPlaneOffset = planeSize * 2

        if (isInputChannelsFirst && !isInputQuantized) {
            var ty = 0
            while (ty < INPUT_HEIGHT) {
                val tyEnd = minOf(ty + TILE_SIZE, INPUT_HEIGHT)
                var tx = 0
                while (tx < INPUT_WIDTH) {
                    val txEnd = minOf(tx + TILE_SIZE, INPUT_WIDTH)
                    for (dy in ty until tyEnd) {
                        val sx = sxLut[dy]
                        val uvColOff = uvColOffLut[dy]
                        val dstRowBase = dy * INPUT_WIDTH
                        for (dx in tx until txEnd) {
                            val yIdx = yRowOffLut[dx] + sx
                            val uvIdx = uvRowOffLut[dx] + uvColOff

                            val yVal = if (yIdx in 0 until yLim) (yBytes[yIdx].toInt() and 0xFF) else 0
                            val uVal = if (uvIdx in 0 until uLim) (uBytes[uvIdx].toInt() and 0xFF) - 128 else 0
                            val vVal = if (uvIdx in 0 until vLim) (vBytes[uvIdx].toInt() and 0xFF) - 128 else 0

                            val r = (yVal + ((1436 * vVal) shr 10)).coerceIn(0, 255)
                            val g = (yVal - ((352 * uVal + 731 * vVal) shr 10)).coerceIn(0, 255)
                            val b = (yVal + ((1815 * uVal) shr 10)).coerceIn(0, 255)

                            val outIdx = dstRowBase + dx
                            reusableFloatStaging[outIdx] = NORM_LUT[r]
                            reusableFloatStaging[gPlaneOffset + outIdx] = NORM_LUT[g]
                            reusableFloatStaging[bPlaneOffset + outIdx] = NORM_LUT[b]
                        }
                    }
                    tx += TILE_SIZE
                }
                ty += TILE_SIZE
            }
            byteBuffer.asFloatBuffer().put(reusableFloatStaging)
            byteBuffer.rewind()
            return byteBuffer
        }

        // Quantized or NHWC fallback directly indexing ByteArray
        var ty = 0
        while (ty < INPUT_HEIGHT) {
            val tyEnd = minOf(ty + TILE_SIZE, INPUT_HEIGHT)
            var tx = 0
            while (tx < INPUT_WIDTH) {
                val txEnd = minOf(tx + TILE_SIZE, INPUT_WIDTH)
                for (dy in ty until tyEnd) {
                    val sx = sxLut[dy]
                    val uvColOff = uvColOffLut[dy]
                    val dstRowBase = dy * INPUT_WIDTH
                    for (dx in tx until txEnd) {
                        val yIdx = yRowOffLut[dx] + sx
                        val uvIdx = uvRowOffLut[dx] + uvColOff

                        val yVal = if (yIdx in 0 until yLim) (yBytes[yIdx].toInt() and 0xFF) else 0
                        val uVal = if (uvIdx in 0 until uLim) (uBytes[uvIdx].toInt() and 0xFF) - 128 else 0
                        val vVal = if (uvIdx in 0 until vLim) (vBytes[uvIdx].toInt() and 0xFF) - 128 else 0

                        val r = (yVal + ((1436 * vVal) shr 10)).coerceIn(0, 255)
                        val g = (yVal - ((352 * uVal + 731 * vVal) shr 10)).coerceIn(0, 255)
                        val b = (yVal + ((1815 * uVal) shr 10)).coerceIn(0, 255)

                        reusablePixelBuffer[dstRowBase + dx] = (r shl 16) or (g shl 8) or b
                    }
                }
                tx += TILE_SIZE
            }
            ty += TILE_SIZE
        }
        return fillByteBufferFromPixelBuffer(byteBuffer)
    }

    /**
     * Run inference on a 640x640 Bitmap.
     * If model is not loaded, delegates to MockMoneyDetector.
     */
    @Synchronized
    fun detect(bitmap: Bitmap): DetectionResult {
        if (isUsingMock || interpreter == null) {
            return mockDetector.detect()
        }

        val startTime = System.currentTimeMillis()

        try {
            val inputBuffer = preprocessBitmap(bitmap)

            val candidateBoxes: List<DetectedBox>
            if (isChannelsLast) {
                val output = reusableChannelsLastOutput ?: Array(1) { Array(NUM_ANCHORS) { FloatArray(TOTAL_CHANNELS) } }
                interpreter?.run(inputBuffer, output)
                candidateBoxes = decodeChannelsLastOutput(output)
            } else {
                val output = reusableChannelsFirstOutput ?: Array(1) { Array(TOTAL_CHANNELS) { FloatArray(NUM_ANCHORS) } }
                interpreter?.run(inputBuffer, output)
                candidateBoxes = decodeChannelsFirstOutput(output)
            }

            val nmsBoxes = runNMS(candidateBoxes, IOU_THRESHOLD)
            val summary = aggregate(nmsBoxes)
            val inferenceTimeMs = (System.currentTimeMillis() - startTime).coerceAtLeast(1L)

            return DetectionResult(
                items = summary.items,
                boxes = nmsBoxes,
                totalAmount = summary.totalAmount,
                totalNotesCount = summary.totalNotesCount,
                hasMoney = summary.hasMoney,
                timestamp = System.currentTimeMillis(),
                inferenceTimeMs = inferenceTimeMs,
                isMock = false
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error during inference, falling back to mock", e)
            return mockDetector.detect()
        }
    }

    /**
     * Preprocesses a Bitmap into a direct ByteBuffer for model input:
     * - Supports NCHW [1, 3, 640, 640] (planar R, G, B) used by Ultralytics YOLO26 TFLite export
     * - Supports NHWC [1, 640, 640, 3] (interleaved RGB)
     * - Supports FLOAT32 [0.0..1.0], UINT8 [0..255], and INT8 [-128..127]
     * - Recycles temporary scaledBitmap if one was created (Ticket 09 memory leak fix)
     */
    private fun preprocessBitmap(bitmap: Bitmap): ByteBuffer {
        val scaledBitmap = if (bitmap.width != INPUT_WIDTH || bitmap.height != INPUT_HEIGHT) {
            Bitmap.createScaledBitmap(bitmap, INPUT_WIDTH, INPUT_HEIGHT, true)
        } else {
            bitmap
        }

        val byteBuffer = reusableInputBuffer ?: ByteBuffer.allocateDirect(
            1 * INPUT_WIDTH * INPUT_HEIGHT * NUM_CHANNELS * (if (isInputQuantized) 1 else 4)
        ).apply {
            order(ByteOrder.nativeOrder())
            reusableInputBuffer = this
        }

        byteBuffer.rewind()
        scaledBitmap.getPixels(
            reusablePixelBuffer,
            0,
            scaledBitmap.width,
            0,
            0,
            scaledBitmap.width,
            scaledBitmap.height
        )
        if (scaledBitmap !== bitmap) {
            scaledBitmap.recycle()
        }

        return fillByteBufferFromPixelBuffer(byteBuffer)
    }

    private fun fillByteBufferFromPixelBuffer(byteBuffer: ByteBuffer): ByteBuffer {
        val numPixels = INPUT_WIDTH * INPUT_HEIGHT

        if (isInputChannelsFirst) {
            // NCHW [1, 3, 640, 640]: Plane R, then Plane G, then Plane B
            if (isInputQuantized) {
                val isSignedInt8 = inputDataType == DataType.INT8
                for (i in 0 until numPixels) {
                    val r = (reusablePixelBuffer[i] shr 16) and 0xFF
                    byteBuffer.put((if (isSignedInt8) (r - 128) else r).toByte())
                }
                for (i in 0 until numPixels) {
                    val g = (reusablePixelBuffer[i] shr 8) and 0xFF
                    byteBuffer.put((if (isSignedInt8) (g - 128) else g).toByte())
                }
                for (i in 0 until numPixels) {
                    val b = reusablePixelBuffer[i] and 0xFF
                    byteBuffer.put((if (isSignedInt8) (b - 128) else b).toByte())
                }
            } else {
                // FLOAT32 NCHW [0.0f .. 1.0f] via NORM_LUT + FloatBuffer bulk copy
                val gOffset = numPixels
                val bOffset = numPixels * 2
                for (i in 0 until numPixels) {
                    val pixel = reusablePixelBuffer[i]
                    reusableFloatStaging[i] = NORM_LUT[(pixel shr 16) and 0xFF]
                    reusableFloatStaging[gOffset + i] = NORM_LUT[(pixel shr 8) and 0xFF]
                    reusableFloatStaging[bOffset + i] = NORM_LUT[pixel and 0xFF]
                }
                byteBuffer.asFloatBuffer().put(reusableFloatStaging)
            }
        } else {
            // NHWC [1, 640, 640, 3]: Interleaved R, G, B per pixel
            if (isInputQuantized) {
                val isSignedInt8 = inputDataType == DataType.INT8
                for (pixel in reusablePixelBuffer) {
                    val r = (pixel shr 16) and 0xFF
                    val g = (pixel shr 8) and 0xFF
                    val b = pixel and 0xFF
                    byteBuffer.put((if (isSignedInt8) (r - 128) else r).toByte())
                    byteBuffer.put((if (isSignedInt8) (g - 128) else g).toByte())
                    byteBuffer.put((if (isSignedInt8) (b - 128) else b).toByte())
                }
            } else {
                var outIdx = 0
                for (pixel in reusablePixelBuffer) {
                    reusableFloatStaging[outIdx++] = NORM_LUT[(pixel shr 16) and 0xFF]
                    reusableFloatStaging[outIdx++] = NORM_LUT[(pixel shr 8) and 0xFF]
                    reusableFloatStaging[outIdx++] = NORM_LUT[pixel and 0xFF]
                }
                byteBuffer.asFloatBuffer().put(reusableFloatStaging)
            }
        }

        byteBuffer.rewind()
        return byteBuffer
    }

    /**
     * Decodes YOLO26 channels-first output tensor [1, 13, 8400] into candidate boxes.
     * Ticket 09 Layer 2 optimizations:
     * 1. Row-Major class scan (c = 0..8 outer, i = 0..8399 inner) for contiguous L1 cache hits
     * 2. Pre-Sigmoid raw logit threshold comparison (zero Math.exp() on background anchors)
     * 3. Sparse hit tracking & reset (zero 8400-element Arrays.fill per frame)
     * 4. Zero-Coordinate-Read fast path on empty frames (0 reads of channels 0..3 when hitCount == 0)
     */
    fun decodeChannelsFirstOutput(output: Array<Array<FloatArray>>): List<DetectedBox> {
        val matrix = output[0] // 13 channels x 8400 anchors
        hasLastCandidateHint = false
        lastCoordinateReadsCount = 0

        // Step 1: Row-Major sample to detect if raw logits require Sigmoid activation
        var needSigmoid = false
        val sampleLimit = minOf(200, NUM_ANCHORS)
        for (c in 0 until NUM_CLASSES) {
            val classRow = matrix[NUM_COORDINATES + c]
            for (i in 0 until sampleLimit) {
                val v = classRow[i]
                if (v < -0.1f || v > 1.2f) {
                    needSigmoid = true
                    break
                }
            }
            if (needSigmoid) break
        }

        val rawScoreThreshold = if (needSigmoid) inverseSigmoid(SCORE_THRESHOLD) else SCORE_THRESHOLD
        val rawHintThreshold = if (needSigmoid) inverseSigmoid(CANDIDATE_HINT_THRESHOLD) else CANDIDATE_HINT_THRESHOLD

        var hitCount = 0
        var candidateHintFound = false

        // Step 2: Row-Major scan across the 9 class channels (sequential L1 cache traversal)
        for (c in 0 until NUM_CLASSES) {
            val classRow = matrix[NUM_COORDINATES + c]
            for (i in 0 until NUM_ANCHORS) {
                val rawVal = classRow[i]
                if (rawVal.isNaN()) continue

                if (!candidateHintFound && rawVal >= rawHintThreshold) {
                    candidateHintFound = true
                }

                if (rawVal >= rawScoreThreshold && rawVal > reusableBestScores[i]) {
                    if (!reusableIsHit[i]) {
                        reusableIsHit[i] = true
                        reusableHitAnchors[hitCount++] = i
                    }
                    reusableBestScores[i] = rawVal
                    reusableBestClasses[i] = c
                }
            }
        }

        // Step 3: Zero-Coordinate-Read Fast Path on Empty Frames (hitCount == 0)
        if (hitCount == 0) {
            hasLastCandidateHint = candidateHintFound
            return emptyList()
        }

        // Step 4: Inspect coordinate normalization [0..1] vs pixel [0..640] on hit anchors,
        // with fallback sample if all hit anchors have small (< 2.0) coordinate values
        val cxRow = matrix[0]
        val cyRow = matrix[1]
        val wRow = matrix[2]
        val hRow = matrix[3]

        var maxCoordVal = 0f
        for (h in 0 until hitCount) {
            val idx = reusableHitAnchors[h]
            val c0 = cxRow[idx]
            val c1 = cyRow[idx]
            val c2 = wRow[idx]
            val c3 = hRow[idx]
            if (!c0.isNaN() && c0 > maxCoordVal) maxCoordVal = c0
            if (!c1.isNaN() && c1 > maxCoordVal) maxCoordVal = c1
            if (!c2.isNaN() && c2 > maxCoordVal) maxCoordVal = c2
            if (!c3.isNaN() && c3 > maxCoordVal) maxCoordVal = c3
            if (maxCoordVal > 2.0f) break
        }
        if (maxCoordVal <= 2.0f) {
            for (c in 0 until NUM_COORDINATES) {
                val coordRow = matrix[c]
                for (i in 0 until sampleLimit) {
                    val v = coordRow[i]
                    if (!v.isNaN() && v > maxCoordVal) {
                        maxCoordVal = v
                        if (maxCoordVal > 2.0f) break
                    }
                }
                if (maxCoordVal > 2.0f) break
            }
        }
        val isNormalizedTensor = maxCoordVal > 0f && maxCoordVal <= 2.0f

        val candidates = ArrayList<DetectedBox>(hitCount)
        lastCoordinateReadsCount = hitCount * 4

        // Step 5: Extract boxes for hit anchors and sparsely reset reusable hit arrays in O(hitCount)
        for (h in 0 until hitCount) {
            val i = reusableHitAnchors[h]
            val rawBest = reusableBestScores[i]
            val bestClassIdx = reusableBestClasses[i]

            // Sparse cleanup for next frame
            reusableBestScores[i] = -Float.MAX_VALUE
            reusableBestClasses[i] = -1
            reusableIsHit[i] = false

            val maxScore = if (needSigmoid) sigmoid(rawBest) else rawBest.coerceIn(0f, 1f)
            if (bestClassIdx < 0 || maxScore < SCORE_THRESHOLD) continue

            val rawCx = cxRow[i]
            val rawCy = cyRow[i]
            val rawW = wRow[i]
            val rawH = hRow[i]

            if (rawCx.isNaN() || rawCy.isNaN() || rawW.isNaN() || rawH.isNaN() || rawW <= 0f || rawH <= 0f) {
                continue
            }

            // Scale normalized [0..1] coordinates from Ultralytics _NormalizeCoords to [0..640]
            val cx = if (isNormalizedTensor) rawCx * INPUT_WIDTH else rawCx
            val cy = if (isNormalizedTensor) rawCy * INPUT_HEIGHT else rawCy
            val w = if (isNormalizedTensor) rawW * INPUT_WIDTH else rawW
            val hBox = if (isNormalizedTensor) rawH * INPUT_HEIGHT else rawH

            val x1 = (cx - w / 2f).coerceIn(0f, INPUT_WIDTH.toFloat())
            val y1 = (cy - hBox / 2f).coerceIn(0f, INPUT_HEIGHT.toFloat())
            val x2 = (cx + w / 2f).coerceIn(0f, INPUT_WIDTH.toFloat())
            val y2 = (cy + hBox / 2f).coerceIn(0f, INPUT_HEIGHT.toFloat())

            val x = x1
            val y = y1
            val width = maxOf(0f, x2 - x1)
            val height = maxOf(0f, y2 - y1)

            if (width < 2f || height < 2f) continue

            val boxCx = x + width / 2f
            val boxCy = y + height / 2f

            val denomination = YOLO_CLASS_ORDER[bestClassIdx]
            val label = DENOMINATION_NAMES[denomination] ?: "$denomination VNĐ"

            candidates.add(
                DetectedBox(
                    x = x,
                    y = y,
                    width = width,
                    height = height,
                    cx = boxCx,
                    cy = boxCy,
                    score = maxScore,
                    classIndex = bestClassIdx,
                    denomination = denomination,
                    label = label
                )
            )
        }

        hasLastCandidateHint = candidateHintFound && candidates.isEmpty()
        return candidates
    }

    /**
     * Decodes YOLO26 channels-last output tensor [1, 8400, 13] into candidate boxes.
     */
    fun decodeChannelsLastOutput(output: Array<Array<FloatArray>>): List<DetectedBox> {
        val matrix = output[0] // 8400 anchors x 13 channels
        hasLastCandidateHint = false
        lastCoordinateReadsCount = 0

        var needSigmoid = false
        val sampleLimit = minOf(200, NUM_ANCHORS)
        for (i in 0 until sampleLimit) {
            val anchorRow = matrix[i]
            for (c in 0 until NUM_CLASSES) {
                val v = anchorRow[NUM_COORDINATES + c]
                if (v < -0.1f || v > 1.2f) {
                    needSigmoid = true
                    break
                }
            }
            if (needSigmoid) break
        }

        val rawScoreThreshold = if (needSigmoid) inverseSigmoid(SCORE_THRESHOLD) else SCORE_THRESHOLD
        val rawHintThreshold = if (needSigmoid) inverseSigmoid(CANDIDATE_HINT_THRESHOLD) else CANDIDATE_HINT_THRESHOLD

        var hitCount = 0
        var candidateHintFound = false

        for (i in 0 until NUM_ANCHORS) {
            val anchorRow = matrix[i]
            var bestRaw = -Float.MAX_VALUE
            var bestClassIdx = -1

            for (c in 0 until NUM_CLASSES) {
                val rawVal = anchorRow[NUM_COORDINATES + c]
                if (rawVal.isNaN()) continue
                if (!candidateHintFound && rawVal >= rawHintThreshold) {
                    candidateHintFound = true
                }
                if (rawVal >= rawScoreThreshold && rawVal > bestRaw) {
                    bestRaw = rawVal
                    bestClassIdx = c
                }
            }

            if (bestClassIdx >= 0) {
                reusableHitAnchors[hitCount] = i
                reusableBestScores[hitCount] = bestRaw
                reusableBestClasses[hitCount] = bestClassIdx
                hitCount++
            }
        }

        if (hitCount == 0) {
            hasLastCandidateHint = candidateHintFound
            return emptyList()
        }

        var maxCoordVal = 0f
        for (h in 0 until hitCount) {
            val anchorRow = matrix[reusableHitAnchors[h]]
            for (c in 0 until NUM_COORDINATES) {
                val v = anchorRow[c]
                if (!v.isNaN() && v > maxCoordVal) {
                    maxCoordVal = v
                }
            }
            if (maxCoordVal > 2.0f) break
        }
        if (maxCoordVal <= 2.0f) {
            for (i in 0 until sampleLimit) {
                val anchorRow = matrix[i]
                for (c in 0 until NUM_COORDINATES) {
                    val v = anchorRow[c]
                    if (!v.isNaN() && v > maxCoordVal) {
                        maxCoordVal = v
                        if (maxCoordVal > 2.0f) break
                    }
                }
                if (maxCoordVal > 2.0f) break
            }
        }
        val isNormalizedTensor = maxCoordVal > 0f && maxCoordVal <= 2.0f

        val candidates = ArrayList<DetectedBox>(hitCount)
        lastCoordinateReadsCount = hitCount * 4

        for (h in 0 until hitCount) {
            val i = reusableHitAnchors[h]
            val rawBest = reusableBestScores[h]
            val bestClassIdx = reusableBestClasses[h]
            reusableBestScores[h] = -Float.MAX_VALUE
            reusableBestClasses[h] = -1

            val maxScore = if (needSigmoid) sigmoid(rawBest) else rawBest.coerceIn(0f, 1f)
            if (maxScore < SCORE_THRESHOLD) continue

            val anchorRow = matrix[i]
            val rawCx = anchorRow[0]
            val rawCy = anchorRow[1]
            val rawW = anchorRow[2]
            val rawH = anchorRow[3]

            if (rawCx.isNaN() || rawCy.isNaN() || rawW.isNaN() || rawH.isNaN() || rawW <= 0f || rawH <= 0f) {
                continue
            }

            val cx = if (isNormalizedTensor) rawCx * INPUT_WIDTH else rawCx
            val cy = if (isNormalizedTensor) rawCy * INPUT_HEIGHT else rawCy
            val w = if (isNormalizedTensor) rawW * INPUT_WIDTH else rawW
            val hBox = if (isNormalizedTensor) rawH * INPUT_HEIGHT else rawH

            val x1 = (cx - w / 2f).coerceIn(0f, INPUT_WIDTH.toFloat())
            val y1 = (cy - hBox / 2f).coerceIn(0f, INPUT_HEIGHT.toFloat())
            val x2 = (cx + w / 2f).coerceIn(0f, INPUT_WIDTH.toFloat())
            val y2 = (cy + hBox / 2f).coerceIn(0f, INPUT_HEIGHT.toFloat())

            val x = x1
            val y = y1
            val width = maxOf(0f, x2 - x1)
            val height = maxOf(0f, y2 - y1)

            if (width < 2f || height < 2f) continue

            val boxCx = x + width / 2f
            val boxCy = y + height / 2f

            val denomination = YOLO_CLASS_ORDER[bestClassIdx]
            val label = DENOMINATION_NAMES[denomination] ?: "$denomination VNĐ"

            candidates.add(
                DetectedBox(
                    x = x,
                    y = y,
                    width = width,
                    height = height,
                    cx = boxCx,
                    cy = boxCy,
                    score = maxScore,
                    classIndex = bestClassIdx,
                    denomination = denomination,
                    label = label
                )
            )
        }

        hasLastCandidateHint = candidateHintFound && candidates.isEmpty()

        return candidates
    }

    /**
     * Fast greedy Non-Maximum Suppression (NMS). Runs under 5ms on CPU.
     */
    fun runNMS(
        boxes: List<DetectedBox>,
        iouThreshold: Float = IOU_THRESHOLD,
        maxDetections: Int = 100
    ): List<DetectedBox> {
        if (boxes.size <= 1) return boxes

        val sorted = boxes.sortedByDescending { it.score }
        val kept = mutableListOf<DetectedBox>()
        val suppressed = BooleanArray(sorted.size)
        val areas = FloatArray(sorted.size) { sorted[it].width * sorted[it].height }

        for (i in sorted.indices) {
            if (suppressed[i]) continue

            val current = sorted[i]
            val areaA = areas[i]
            kept.add(current)
            if (kept.size >= maxDetections) break

            for (j in (i + 1) until sorted.size) {
                if (suppressed[j]) continue

                val next = sorted[j]
                if (current.classIndex == next.classIndex) {
                    val iou = calculateIoUWithAreas(current, next, areaA, areas[j])
                    if (iou >= iouThreshold) {
                        suppressed[j] = true
                    }
                }
            }
        }

        return kept
    }

    fun calculateIoU(a: DetectedBox, b: DetectedBox): Float {
        return calculateIoUWithAreas(a, b, a.width * a.height, b.width * b.height)
    }

    private fun calculateIoUWithAreas(a: DetectedBox, b: DetectedBox, areaA: Float, areaB: Float): Float {
        if (areaA <= 0f || areaB <= 0f) return 0f
        if (a.x.isNaN() || a.y.isNaN() || b.x.isNaN() || b.y.isNaN()) return 0f

        val ax1 = a.x
        val ay1 = a.y
        val ax2 = a.x + a.width
        val ay2 = a.y + a.height

        val bx1 = b.x
        val by1 = b.y
        val bx2 = b.x + b.width
        val by2 = b.y + b.height

        val interX1 = maxOf(ax1, bx1)
        val interY1 = maxOf(ay1, by1)
        val interX2 = minOf(ax2, bx2)
        val interY2 = minOf(ay2, by2)

        val interW = maxOf(0f, interX2 - interX1)
        val interH = maxOf(0f, interY2 - interY1)
        val interArea = interW * interH

        if (interArea <= 0f) return 0f

        val unionArea = areaA + areaB - interArea
        return if (unionArea > 0f) interArea / unionArea else 0f
    }

    /**
     * Aggregates detected boxes into banknote count summaries sorted descending by value.
     */
    fun aggregate(boxes: List<DetectedBox>): DetectionSummary {
        val counts = IntArray(SORTED_DENOMINATIONS.size)
        for (box in boxes) {
            val idx = when (box.denomination) {
                500000L -> 0
                200000L -> 1
                100000L -> 2
                50000L -> 3
                20000L -> 4
                10000L -> 5
                5000L -> 6
                2000L -> 7
                1000L -> 8
                else -> -1
            }
            if (idx >= 0) {
                counts[idx]++
            }
        }

        val items = mutableListOf<DetectedMoneyItem>()
        var totalAmount = 0L
        var totalNotesCount = 0

        for (i in SORTED_DENOMINATIONS.indices) {
            val count = counts[i]
            if (count > 0) {
                val denom = SORTED_DENOMINATIONS[i]
                val denomTotal = denom * count
                totalAmount += denomTotal
                totalNotesCount += count
                items.add(
                    DetectedMoneyItem(
                        classId = denom,
                        count = count,
                        label = DENOMINATION_NAMES[denom] ?: "$denom VNĐ",
                        totalAmount = denomTotal
                    )
                )
            }
        }

        return DetectionSummary(
            items = items,
            boxes = boxes,
            totalAmount = totalAmount,
            totalNotesCount = totalNotesCount,
            hasMoney = totalNotesCount > 0
        )
    }

    @Synchronized
    fun close() {
        try {
            interpreter?.close()
            interpreter = null
            gpuDelegate?.close()
            gpuDelegate = null
            reusableInputBuffer = null
            reusableChannelsFirstOutput = null
            reusableChannelsLastOutput = null
        } catch (e: Exception) {
            Log.e(TAG, "Error closing interpreter", e)
        }
    }
}
