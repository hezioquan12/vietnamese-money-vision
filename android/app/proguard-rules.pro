# React Native rules
-keep class com.facebook.react.** { *; }
-keep class com.facebook.jni.** { *; }
-dontwarn com.facebook.react.**

# TensorFlow Lite & LiteRT runtime + GPU delegate
-keep class org.tensorflow.lite.** { *; }
-dontwarn org.tensorflow.lite.**
-keepclassmembers class * {
    native <methods>;
}

# CameraX
-keep class androidx.camera.** { *; }
-dontwarn androidx.camera.**

# Custom Native Modules
-keep class com.nckh.moneyvision.** { *; }
