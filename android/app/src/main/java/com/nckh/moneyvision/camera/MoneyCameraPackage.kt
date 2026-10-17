package com.nckh.moneyvision.camera

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * MoneyCameraPackage
 * Registers MoneyCameraModule and MoneyCameraViewManager into React Native.
 */
class MoneyCameraPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(MoneyCameraModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return listOf(MoneyCameraViewManager())
    }
}
