package com.nckh.moneyvision

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.nckh.moneyvision.camera.MoneyCameraView

class MainActivity : ReactActivity() {

  companion object {
    private const val CAMERA_PERMISSION_REQUEST_CODE = 1001
  }

  override fun getMainComponentName(): String = "MoneyVision"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    volumeControlStream = android.media.AudioManager.STREAM_MUSIC
    window?.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    ensureCameraPermission()
  }

  override fun dispatchTouchEvent(ev: android.view.MotionEvent?): Boolean {
    if (ev?.actionMasked == android.view.MotionEvent.ACTION_DOWN) {
      MoneyCameraView.getActiveView()?.onUserTouchInteraction()
    }
    return super.dispatchTouchEvent(ev)
  }

  private fun ensureCameraPermission() {
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
        != PackageManager.PERMISSION_GRANTED
    ) {
      ActivityCompat.requestPermissions(
        this,
        arrayOf(Manifest.permission.CAMERA),
        CAMERA_PERMISSION_REQUEST_CODE
      )
    }
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode == CAMERA_PERMISSION_REQUEST_CODE &&
        grantResults.isNotEmpty() &&
        grantResults[0] == PackageManager.PERMISSION_GRANTED
    ) {
      MoneyCameraView.getActiveView()?.onHostResume()
    }
  }
}
