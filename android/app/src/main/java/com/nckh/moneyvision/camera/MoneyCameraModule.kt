package com.nckh.moneyvision.camera

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * MoneyCameraModule
 * Native Android Module for imperative camera and flashlight control.
 * Methods:
 * - setTorch(enabled: Boolean, promise: Promise)
 * - isTorchOn(promise: Promise)
 * - getLuminance(promise: Promise)
 * - checkCameraPermission(promise: Promise)
 */
class MoneyCameraModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "MoneyCameraModule"

    private var fallbackTorchState: Boolean = false

    @ReactMethod
    fun setTorch(enabled: Boolean, promise: Promise) {
        try {
            val view = MoneyCameraView.getActiveView()
            if (view != null) {
                view.applyTorchState(enabled)
                promise.resolve(true)
                return
            }

            // Fallback via CameraManager if view is not currently active
            val cameraManager = reactContext.getSystemService(Context.CAMERA_SERVICE) as? CameraManager
            val cameraId = cameraManager?.cameraIdList?.firstOrNull { id ->
                try {
                    val chars = cameraManager.getCameraCharacteristics(id)
                    chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
                } catch (_: Exception) {
                    false
                }
            }
            if (cameraManager != null && cameraId != null) {
                cameraManager.setTorchMode(cameraId, enabled)
                fallbackTorchState = enabled
                promise.resolve(true)
            } else {
                fallbackTorchState = enabled
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.reject("TORCH_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun isTorchOn(promise: Promise) {
        val view = MoneyCameraView.getActiveView()
        if (view != null) {
            promise.resolve(view.getIsTorchOn())
        } else {
            promise.resolve(fallbackTorchState)
        }
    }

    @ReactMethod
    fun getLuminance(promise: Promise) {
        val view = MoneyCameraView.getActiveView()
        if (view != null) {
            promise.resolve(view.getLuminance())
        } else {
            promise.resolve(0.0)
        }
    }

    @ReactMethod
    fun checkCameraPermission(promise: Promise) {
        val granted = ContextCompat.checkSelfPermission(
            reactContext,
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED
        promise.resolve(granted)
    }
}
