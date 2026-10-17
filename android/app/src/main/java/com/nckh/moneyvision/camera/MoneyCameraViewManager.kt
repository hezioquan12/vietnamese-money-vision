package com.nckh.moneyvision.camera

import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

/**
 * MoneyCameraViewManager
 * React Native ViewManager for MoneyCameraView.
 * Exposes properties (torchEnabled, autoTorchEnabled)
 * and direct events (onLuminanceChanged, onTorchChanged).
 */
class MoneyCameraViewManager : SimpleViewManager<MoneyCameraView>() {

    override fun getName(): String = "MoneyCameraView"

    override fun createViewInstance(reactContext: ThemedReactContext): MoneyCameraView {
        return MoneyCameraView(reactContext)
    }

    @ReactProp(name = "torchEnabled")
    fun setTorchEnabled(view: MoneyCameraView, enabled: Boolean) {
        view.torchEnabled = enabled
    }

    @ReactProp(name = "autoTorchEnabled", defaultBoolean = true)
    fun setAutoTorchEnabled(view: MoneyCameraView, enabled: Boolean) {
        view.autoTorchEnabled = enabled
    }

    override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any>? {
        return MapBuilder.builder<String, Any>()
            .put(
                "onLuminanceChanged",
                MapBuilder.of("registrationName", "onLuminanceChanged")
            )
            .put(
                "onTorchChanged",
                MapBuilder.of("registrationName", "onTorchChanged")
            )
            .put(
                "onMoneyDetected",
                MapBuilder.of("registrationName", "onMoneyDetected")
            )
            .build()
    }
}
