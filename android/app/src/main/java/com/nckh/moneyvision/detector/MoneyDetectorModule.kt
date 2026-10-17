package com.nckh.moneyvision.detector

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * MoneyDetectorModule
 * Native module exposing YOLO26 detector state, controls and temporal debounce filter to React Native.
 */
class MoneyDetectorModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        @Volatile
        private var instance: MoneyDetectorModule? = null

        fun getInstance(): MoneyDetectorModule? = instance

        fun updateLastResult(result: DetectionResult) {
            instance?.lastResult = result
        }

        fun convertResultToWritableMap(
            result: DetectionResult,
            debounced: DebouncedResult? = null
        ): WritableMap {
            val map = Arguments.createMap()
            val itemsArray = Arguments.createArray()
            for (item in result.items) {
                val itemMap = Arguments.createMap().apply {
                    putDouble("classId", item.classId.toDouble())
                    putInt("count", item.count)
                    putString("label", item.label)
                    putDouble("totalAmount", item.totalAmount.toDouble())
                }
                itemsArray.pushMap(itemMap)
            }

            val boxesArray = Arguments.createArray()
            for (box in result.boxes) {
                val boxMap = Arguments.createMap().apply {
                    putDouble("x", box.x.toDouble())
                    putDouble("y", box.y.toDouble())
                    putDouble("width", box.width.toDouble())
                    putDouble("height", box.height.toDouble())
                    putDouble("cx", box.cx.toDouble())
                    putDouble("cy", box.cy.toDouble())
                    putDouble("score", box.score.toDouble())
                    putInt("classIndex", box.classIndex)
                    putDouble("classId", box.denomination.toDouble())
                    putString("label", box.label)
                }
                boxesArray.pushMap(boxMap)
            }

            map.putArray("items", itemsArray)
            map.putArray("boxes", boxesArray)
            map.putDouble("totalAmount", result.totalAmount.toDouble())
            map.putInt("totalNotesCount", result.totalNotesCount)
            map.putBoolean("hasMoney", result.hasMoney)
            map.putDouble("timestamp", result.timestamp.toDouble())
            map.putDouble("inferenceTimeMs", result.inferenceTimeMs.toDouble())
            map.putBoolean("isMock", result.isMock)

            if (debounced != null) {
                map.putString("debounceState", debounced.state.name)
                map.putBoolean("stateChanged", debounced.stateChanged)
                map.putBoolean("isEmptied", debounced.isEmptied)
                map.putString("signature", debounced.signature)
                map.putInt("consensusCount", debounced.consensusCount)
                map.putString("candidateSignature", debounced.candidateSignature)
                map.putInt("candidateCount", debounced.candidateCount)
                map.putInt("consecutiveEmptyFrames", debounced.consecutiveEmptyFrames)
                map.putInt("windowSize", debounced.windowSize)
            }

            return map
        }
    }

    init {
        instance = this
    }

    override fun getName(): String = "MoneyDetectorModule"

    private val detector: Yolo26Detector by lazy {
        Yolo26Detector.getInstance(reactContext)
    }

    private val debounceFilter = TemporalDebounceFilter()
    private var lastResult: DetectionResult? = null

    @ReactMethod
    fun isModelLoaded(promise: Promise) {
        promise.resolve(detector.isModelLoaded())
    }

    @ReactMethod
    fun isUsingMock(promise: Promise) {
        promise.resolve(detector.isUsingMock)
    }

    @ReactMethod
    fun reloadModel(promise: Promise) {
        promise.resolve(detector.reloadModel())
    }

    @ReactMethod
    fun setInferenceFps(fps: Double, promise: Promise) {
        detector.setInferenceFps(fps.toInt())
        promise.resolve(true)
    }

    @ReactMethod
    fun getInferenceFps(promise: Promise) {
        promise.resolve(detector.inferenceFps)
    }

    @ReactMethod
    fun getLastDetection(promise: Promise) {
        val result = lastResult ?: detector.getMockDetector().detect()
        promise.resolve(convertResultToWritableMap(result))
    }

    @ReactMethod
    fun setMockScenario(scenario: String, promise: Promise) {
        detector.getMockDetector().setScenario(scenario)
        promise.resolve(true)
    }

    @ReactMethod
    fun detectSimulatedFrame(promise: Promise) {
        val raw = detector.getMockDetector().detect()
        val debounced = debounceFilter.process(raw)
        lastResult = debounced.result
        emitDetectionEvent(debounced.result, debounced)
        promise.resolve(convertResultToWritableMap(debounced.result, debounced))
    }

    @ReactMethod
    fun resetDebounceFilter(promise: Promise) {
        debounceFilter.reset()
        promise.resolve(true)
    }

    @ReactMethod
    fun getDebounceState(promise: Promise) {
        val map = Arguments.createMap().apply {
            putString("state", debounceFilter.getState().name)
            putString("signature", debounceFilter.getStableSignature())
            putInt("consecutiveEmptyFrames", debounceFilter.getConsecutiveEmptyFrames())
        }
        promise.resolve(map)
    }

    fun emitDetectionEvent(
        result: DetectionResult,
        debounced: DebouncedResult? = null
    ) {
        lastResult = result
        try {
            val map = convertResultToWritableMap(result, debounced)
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                ?.emit("onMoneyDetected", map)
        } catch (_: Exception) {}
    }
}
