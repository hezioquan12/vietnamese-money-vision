/**
 * Real Android SDK Toolchain APK Compiler for MoneyVision
 * Uses installed Android SDK build-tools (aapt2, d8, zipalign, apksigner), JDK javac,
 * and Google LiteRT (TensorFlow Lite 1.0.1 AAR: classes.jar + arm64-v8a & armeabi-v7a libtensorflowlite_jni.so)
 * to compile a 100% genuine, installable, cryptographically signed Universal Release APK
 * with binary AndroidManifest.xml, resources.arsc, classes.dex, 24 real Vietnamese audio clips,
 * and live Camera2 YOLO26 inference on the 2.88 MB yolo26_money_quant.tflite model.
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

const LITERT_AARS = [
  {
    name: 'litert-api-1.0.1.aar',
    url: 'https://dl.google.com/dl/android/maven2/com/google/ai/edge/litert/litert-api/1.0.1/litert-api-1.0.1.aar',
    minBytes: 15000,
  },
  {
    name: 'litert-1.0.1.aar',
    url: 'https://dl.google.com/dl/android/maven2/com/google/ai/edge/litert/litert/1.0.1/litert-1.0.1.aar',
    minBytes: 5000000,
  },
];

function downloadHttpsBuffer(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Connection: 'close',
        },
        timeout: 30000,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          downloadHttpsBuffer(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`Timeout downloading ${url}`)));
  });
}

/**
 * Ensures Google LiteRT (TensorFlow Lite) AARs are cached in android/libs/
 */
export async function ensureLiteRtRuntimeAars(projectRoot) {
  const libsDir = path.join(projectRoot, 'android', 'libs');
  if (!fs.existsSync(libsDir)) {
    fs.mkdirSync(libsDir, { recursive: true });
  }
  for (const item of LITERT_AARS) {
    const targetPath = path.join(libsDir, item.name);
    if (!fs.existsSync(targetPath) || fs.statSync(targetPath).size < item.minBytes) {
      try {
        const buf = await downloadHttpsBuffer(item.url);
        if (buf && buf.length >= item.minBytes) {
          fs.writeFileSync(targetPath, buf);
        }
      } catch {
        // Offline fallback if network is unreachable
      }
    }
  }
}

/**
 * Generates a valid 48x48 RGBA PNG buffer (Solar Yellow #FFE600 badge on OLED Black #000000)
 */
export function createLauncherIconPng(isRound = false) {
  const width = 48;
  const height = 48;

  // Raw scanlines: each row starts with filter byte 0x00 followed by width * 4 RGBA bytes
  const rawData = Buffer.alloc(height * (1 + width * 4));
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;

  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    rawData[rowStart] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const pxOffset = rowStart + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (isRound && dist > 22.5) {
        // Transparent outside circle
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
        continue;
      }

      // Border ring in Solar Yellow (#FFE600)
      const isBorder = isRound
        ? dist >= 19.0 && dist <= 22.5
        : x < 4 || x >= width - 4 || y < 4 || y >= height - 4;

      // Center 'M' emblem in Solar Yellow (#FFE600)
      const inVertLeft = x >= 11 && x <= 15 && y >= 14 && y <= 34;
      const inVertRight = x >= 32 && x <= 36 && y >= 14 && y <= 34;
      const inDiagLeft =
        y >= 14 && y <= 26 && Math.abs(x - (13 + (y - 14) * 0.85)) <= 2.2;
      const inDiagRight =
        y >= 14 && y <= 26 && Math.abs(x - (34 - (y - 14) * 0.85)) <= 2.2;

      if (isBorder || inVertLeft || inVertRight || inDiagLeft || inDiagRight) {
        rawData[pxOffset] = 0xff; // R
        rawData[pxOffset + 1] = 0xe6; // G
        rawData[pxOffset + 2] = 0x00; // B
        rawData[pxOffset + 3] = 0xff; // A
      } else {
        // OLED Black (#000000)
        rawData[pxOffset] = 0x00;
        rawData[pxOffset + 1] = 0x00;
        rawData[pxOffset + 2] = 0x00;
        rawData[pxOffset + 3] = 0xff;
      }
    }
  }

  function makeChunk(type, data) {
    const chunk = Buffer.alloc(12 + data.length);
    chunk.writeUInt32BE(data.length, 0);
    chunk.write(type, 4, 4, 'ascii');
    data.copy(chunk, 8);
    const crcVal = zlib.crc32(chunk.subarray(4, 8 + data.length));
    chunk.writeUInt32BE(crcVal >>> 0, 8 + data.length);
    return chunk;
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth 8
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idatData = zlib.deflateSync(rawData);
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idatData),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Ensures mipmap launcher icons exist in android/app/src/main/res/mipmap-mdpi
 */
export function ensureLauncherIcons(projectRoot) {
  const mipmapDir = path.join(
    projectRoot,
    'android',
    'app',
    'src',
    'main',
    'res',
    'mipmap-mdpi'
  );
  if (!fs.existsSync(mipmapDir)) {
    fs.mkdirSync(mipmapDir, { recursive: true });
  }
  const iconPath = path.join(mipmapDir, 'ic_launcher.png');
  const roundIconPath = path.join(mipmapDir, 'ic_launcher_round.png');

  if (!fs.existsSync(iconPath)) {
    fs.writeFileSync(iconPath, createLauncherIconPng(false));
  }
  if (!fs.existsSync(roundIconPath)) {
    fs.writeFileSync(roundIconPath, createLauncherIconPng(true));
  }
}

/**
 * Locate Android SDK build-tools and platform android.jar + JDK javac
 */
export function locateAndroidSdkTools(sdkPath) {
  if (!sdkPath || !fs.existsSync(sdkPath)) return null;

  const buildToolsRoot = path.join(sdkPath, 'build-tools');
  const platformsRoot = path.join(sdkPath, 'platforms');
  if (!fs.existsSync(buildToolsRoot) || !fs.existsSync(platformsRoot)) {
    return null;
  }

  const btVersions = fs.readdirSync(buildToolsRoot).sort().reverse();
  const platVersions = fs.readdirSync(platformsRoot).sort().reverse();
  if (btVersions.length === 0 || platVersions.length === 0) return null;

  const btDir = path.join(buildToolsRoot, btVersions[0]);
  const platDir = path.join(platformsRoot, platVersions[0]);

  const isWin = process.platform === 'win32';
  const aapt2 = path.join(btDir, isWin ? 'aapt2.exe' : 'aapt2');
  const d8 = path.join(btDir, isWin ? 'd8.bat' : 'd8');
  const zipalign = path.join(btDir, isWin ? 'zipalign.exe' : 'zipalign');
  const apksigner = path.join(btDir, isWin ? 'apksigner.bat' : 'apksigner');
  const androidJar = path.join(platDir, 'android.jar');

  if (!fs.existsSync(aapt2) || !fs.existsSync(d8) || !fs.existsSync(androidJar)) {
    return null;
  }

  // Locate javac
  const javacCandidates = [
    'C:\\Program Files\\Android\\Android Studio\\jbr\\bin\\javac.exe',
    process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', isWin ? 'javac.exe' : 'javac') : null,
    'C:\\Program Files\\Java\\jdk-25\\bin\\javac.exe',
    'C:\\Program Files\\Java\\jdk-21\\bin\\javac.exe',
    'C:\\Program Files\\Java\\jdk-17\\bin\\javac.exe',
    'C:\\Program Files\\Java\\latest\\bin\\javac.exe',
    'javac',
  ].filter(Boolean);

  let javac = null;
  for (const c of javacCandidates) {
    try {
      execFileSync(c, ['-version'], { stdio: 'ignore' });
      javac = c;
      break;
    } catch {
      // try next
    }
  }

  if (!javac) return null;

  return {
    btDir,
    platDir,
    aapt2,
    d8,
    zipalign: fs.existsSync(zipalign) ? zipalign : null,
    apksigner: fs.existsSync(apksigner) ? apksigner : null,
    androidJar,
    javac,
  };
}

/**
 * Generates the complete Java source files for the standalone Android runtime
 */
function writeStandaloneJavaSources(srcDir) {
  const pkgDir = path.join(srcDir, 'com', 'nckh', 'moneyvision');
  const audioDir = path.join(pkgDir, 'audio');
  const cameraDir = path.join(pkgDir, 'camera');
  const detectorDir = path.join(pkgDir, 'detector');

  fs.mkdirSync(audioDir, { recursive: true });
  fs.mkdirSync(cameraDir, { recursive: true });
  fs.mkdirSync(detectorDir, { recursive: true });

  // 1. MainApplication.java
  fs.writeFileSync(
    path.join(pkgDir, 'MainApplication.java'),
    `package com.nckh.moneyvision;

import android.app.Application;

public class MainApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
    }
}
`,
    'utf8'
  );

  // 2. MoneyAudioModule.java (Plays real res/raw & assets/audio MP3/WAV clips on USAGE_MEDIA + Native Vietnamese TextToSpeech fallback + Ticket 10 Zero Talk-Over)
  fs.writeFileSync(
    path.join(audioDir, 'MoneyAudioModule.java'),
    `package com.nckh.moneyvision.audio;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.ToneGenerator;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.accessibility.AccessibilityManager;
import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class MoneyAudioModule implements TextToSpeech.OnInitListener {
    public static final long AUDIO_FOCUS_ABANDON_DELAY_MS = 400L;
    private final Context context;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private MediaPlayer activePlayer;
    private TextToSpeech tts;
    private volatile boolean ttsReady = false;
    private String pendingTtsText = null;
    private CompletionCallback pendingTtsCallback = null;
    private int sequenceToken = 0;
    private boolean isSpeakingSequence = false;
    private boolean isSpeakingTts = false;
    private AudioFocusRequest activeAudioFocusRequest = null;
    private final Runnable abandonFocusRunnable = new Runnable() {
        @Override
        public void run() {
            abandonAudioFocusNow();
        }
    };
    private final ConcurrentHashMap<String, Boolean> streamValidityCache = new ConcurrentHashMap<String, Boolean>();

    public static final Map<String, String> CLIP_LABELS = new HashMap<String, String>();
    static {
        CLIP_LABELS.put("vnd_1k", "Một nghìn đồng");
        CLIP_LABELS.put("vnd_2k", "Hai nghìn đồng");
        CLIP_LABELS.put("vnd_5k", "Năm nghìn đồng");
        CLIP_LABELS.put("vnd_10k", "Mười nghìn đồng");
        CLIP_LABELS.put("vnd_20k", "Hai mươi nghìn đồng");
        CLIP_LABELS.put("vnd_50k", "Năm mươi nghìn đồng");
        CLIP_LABELS.put("vnd_100k", "Một trăm nghìn đồng");
        CLIP_LABELS.put("vnd_200k", "Hai trăm nghìn đồng");
        CLIP_LABELS.put("vnd_500k", "Năm trăm nghìn đồng");
        CLIP_LABELS.put("qty_1", "Một tờ");
        CLIP_LABELS.put("qty_2", "Hai tờ");
        CLIP_LABELS.put("qty_3", "Ba tờ");
        CLIP_LABELS.put("qty_4", "Bốn tờ");
        CLIP_LABELS.put("qty_5", "Năm tờ");
        CLIP_LABELS.put("qty_6", "Sáu tờ");
        CLIP_LABELS.put("qty_7", "Bảy tờ");
        CLIP_LABELS.put("qty_8", "Tám tờ");
        CLIP_LABELS.put("qty_9", "Chín tờ");
        CLIP_LABELS.put("qty_10", "Mười tờ");
    }

    public interface CompletionCallback {
        void onComplete(boolean finished);
    }

    public MoneyAudioModule(Context context) {
        this.context = context.getApplicationContext();
        ensureAudibleVolume();
        try {
            this.tts = new TextToSpeech(this.context, this);
        } catch (Exception e) {
            this.ttsReady = false;
        }
    }

    /**
     * Ticket 10 Pillar 2: Zero Talk-Over with Google TalkBack.
     * Interrupts any ongoing AccessibilityManager speech and requests AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK.
     */
    private void interruptAccessibilityAndRequestAudioFocus() {
        mainHandler.removeCallbacks(abandonFocusRunnable);
        try {
            AccessibilityManager a11yManager = (AccessibilityManager) context.getSystemService(Context.ACCESSIBILITY_SERVICE);
            if (a11yManager != null && a11yManager.isEnabled()) {
                a11yManager.interrupt();
            }
        } catch (Exception ignored) {}

        try {
            AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (am == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (activeAudioFocusRequest == null) {
                    activeAudioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                        .setAudioAttributes(
                            new AudioAttributes.Builder()
                                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                                .setUsage(AudioAttributes.USAGE_MEDIA)
                                .build()
                        )
                        .setAcceptsDelayedFocusGain(false)
                        .setOnAudioFocusChangeListener(new AudioManager.OnAudioFocusChangeListener() {
                            @Override
                            public void onAudioFocusChange(int focusChange) {}
                        })
                        .build();
                }
                am.requestAudioFocus(activeAudioFocusRequest);
            } else {
                am.requestAudioFocus(
                    null,
                    AudioManager.STREAM_MUSIC,
                    AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
                );
            }
        } catch (Exception ignored) {}
    }

    private void scheduleAbandonAudioFocus() {
        mainHandler.removeCallbacks(abandonFocusRunnable);
        mainHandler.postDelayed(abandonFocusRunnable, AUDIO_FOCUS_ABANDON_DELAY_MS);
    }

    private void abandonAudioFocusNow() {
        mainHandler.removeCallbacks(abandonFocusRunnable);
        try {
            AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (am == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (activeAudioFocusRequest != null) {
                    am.abandonAudioFocusRequest(activeAudioFocusRequest);
                }
            } else {
                am.abandonAudioFocus(null);
            }
        } catch (Exception ignored) {}
    }

    public void ensureAudibleVolume() {
        try {
            AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                int maxVol = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                int curVol = am.getStreamVolume(AudioManager.STREAM_MUSIC);
                if (maxVol > 0 && curVol < Math.max(1, maxVol / 4)) {
                    am.setStreamVolume(AudioManager.STREAM_MUSIC, (maxVol * 7) / 10, 0);
                }
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onInit(int status) {
        if (status == TextToSpeech.SUCCESS && tts != null) {
            try {
                Locale vi = new Locale("vi", "VN");
                int res = tts.setLanguage(vi);
                if (res == TextToSpeech.LANG_MISSING_DATA || res == TextToSpeech.LANG_NOT_SUPPORTED) {
                    tts.setLanguage(new Locale("vi"));
                }
                tts.setSpeechRate(1.05f);
                tts.setPitch(1.0f);
                tts.setAudioAttributes(
                    new AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .build()
                );
                ttsReady = true;

                String textToSpeak = null;
                CompletionCallback cbToCall = null;
                synchronized (this) {
                    textToSpeak = pendingTtsText;
                    cbToCall = pendingTtsCallback;
                    pendingTtsText = null;
                    pendingTtsCallback = null;
                }
                if (textToSpeak != null) {
                    speakVietnamese(textToSpeak, cbToCall);
                }
            } catch (Exception ignored) {}
        }
    }

    public synchronized boolean isSpeaking() {
        return isSpeakingSequence || isSpeakingTts;
    }

    public synchronized void stop() {
        sequenceToken++;
        isSpeakingSequence = false;
        isSpeakingTts = false;
        pendingTtsText = null;
        pendingTtsCallback = null;
        abandonAudioFocusNow();
        try {
            if (tts != null) tts.stop();
        } catch (Exception ignored) {}
        try {
            if (activePlayer != null) {
                if (activePlayer.isPlaying()) {
                    activePlayer.stop();
                }
                activePlayer.reset();
                activePlayer.release();
            }
        } catch (Exception ignored) {
        } finally {
            activePlayer = null;
        }
    }

    private boolean isValidStreamPayload(InputStream is) {
        try {
            byte[] buf = new byte[2048];
            int total = 0;
            while (total < buf.length) {
                int n = is.read(buf, total, buf.length - total);
                if (n <= 0) break;
                total += n;
            }
            if (total < 64) return false;
            if (buf[0] == 'R' && buf[1] == 'I' && buf[2] == 'F' && buf[3] == 'F') {
                int nz = 0;
                for (int i = 44; i < total; i++) {
                    if (buf[i] != 0) nz++;
                }
                return nz > 16;
            }
            int nonZero = 0;
            for (int i = 0; i < total; i++) {
                int b = buf[i] & 0xFF;
                if (b != 0x00 && b != 0xFF) nonZero++;
            }
            return nonZero > total / 4;
        } catch (Exception e) {
            return true;
        } finally {
            try { is.close(); } catch (Exception ignored) {}
        }
    }

    private AssetFileDescriptor openClipDescriptor(String clipName) {
        String clean = clipName;
        int dot = clean.lastIndexOf('.');
        if (dot > 0) clean = clean.substring(0, dot);

        try {
            int resId = context.getResources().getIdentifier(clean, "raw", context.getPackageName());
            if (resId != 0) {
                String rawKey = "raw:" + clean;
                Boolean valid = streamValidityCache.get(rawKey);
                if (valid == null) {
                    InputStream checkStream = context.getResources().openRawResource(resId);
                    valid = isValidStreamPayload(checkStream);
                    streamValidityCache.put(rawKey, valid);
                }
                if (valid) {
                    AssetFileDescriptor afd = context.getResources().openRawResourceFd(resId);
                    if (afd != null && afd.getLength() > 256) return afd;
                    if (afd != null) afd.close();
                }
            }
        } catch (Exception ignored) {}

        String[] exts = new String[]{"", ".mp3", ".wav"};
        for (String ext : exts) {
            String path = "audio/" + clean + ext;
            try {
                String assetKey = "asset:" + path;
                Boolean valid = streamValidityCache.get(assetKey);
                if (valid != null && !valid) continue;
                if (valid == null) {
                    InputStream checkStream = context.getAssets().open(path);
                    valid = isValidStreamPayload(checkStream);
                    streamValidityCache.put(assetKey, valid);
                }
                if (valid) {
                    AssetFileDescriptor afd = context.getAssets().openFd(path);
                    if (afd != null && afd.getLength() > 256) return afd;
                    if (afd != null) afd.close();
                }
            } catch (Exception ignored) {
                streamValidityCache.put("asset:" + path, Boolean.FALSE);
            }
        }
        return null;
    }

    public synchronized void playClip(final String clipName, final CompletionCallback callback) {
        stop();
        interruptAccessibilityAndRequestAudioFocus();
        final int token = ++sequenceToken;
        playSingleInternal(clipName, token, new CompletionCallback() {
            @Override
            public void onComplete(boolean finished) {
                scheduleAbandonAudioFocus();
                if (callback != null) callback.onComplete(finished);
            }
        });
    }

    public synchronized void playSequence(final List<String> clips, final CompletionCallback callback) {
        stop();
        if (clips == null || clips.isEmpty()) {
            if (callback != null) callback.onComplete(true);
            return;
        }
        interruptAccessibilityAndRequestAudioFocus();
        final int token = ++sequenceToken;
        isSpeakingSequence = true;
        playNext(clips, 0, token, callback);
    }

    private void playNext(final List<String> clips, final int index, final int token, final CompletionCallback callback) {
        synchronized (this) {
            if (token != sequenceToken || !isSpeakingSequence) {
                if (callback != null) callback.onComplete(false);
                return;
            }
            if (index >= clips.size()) {
                isSpeakingSequence = false;
                scheduleAbandonAudioFocus();
                if (callback != null) callback.onComplete(true);
                return;
            }
        }

        String clip = clips.get(index);
        playSingleInternal(clip, token, new CompletionCallback() {
            @Override
            public void onComplete(boolean ok) {
                synchronized (MoneyAudioModule.this) {
                    if (token != sequenceToken || !isSpeakingSequence) {
                        if (callback != null) callback.onComplete(false);
                        return;
                    }
                }
                mainHandler.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        playNext(clips, index + 1, token, callback);
                    }
                }, 35L);
            }
        });
    }

    private void playSingleInternal(final String clipName, final int token, final CompletionCallback cb) {
        mainHandler.removeCallbacks(abandonFocusRunnable);
        ensureAudibleVolume();
        AssetFileDescriptor afd = openClipDescriptor(clipName);
        if (afd == null) {
            playFallbackTtsOrTone(clipName, cb);
            return;
        }

        try {
            MediaPlayer player = new MediaPlayer();
            player.setAudioAttributes(
                new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .build()
            );
            player.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
            player.setVolume(1.0f, 1.0f);
            player.prepare();
            try { afd.close(); } catch (Exception ignored) {}

            synchronized (this) {
                if (token != sequenceToken) {
                    player.release();
                    if (cb != null) cb.onComplete(false);
                    return;
                }
                activePlayer = player;
            }

            player.setOnCompletionListener(new MediaPlayer.OnCompletionListener() {
                @Override
                public void onCompletion(MediaPlayer mp) {
                    try {
                        mp.reset();
                        mp.release();
                    } catch (Exception ignored) {}
                    synchronized (MoneyAudioModule.this) {
                        if (activePlayer == mp) activePlayer = null;
                    }
                    if (cb != null) cb.onComplete(true);
                }
            });

            player.setOnErrorListener(new MediaPlayer.OnErrorListener() {
                @Override
                public boolean onError(MediaPlayer mp, int what, int extra) {
                    try {
                        mp.reset();
                        mp.release();
                    } catch (Exception ignored) {}
                    synchronized (MoneyAudioModule.this) {
                        if (activePlayer == mp) activePlayer = null;
                    }
                    playFallbackTtsOrTone(clipName, cb);
                    return true;
                }
            });

            player.start();
        } catch (Exception e) {
            try { afd.close(); } catch (Exception ignored) {}
            playFallbackTtsOrTone(clipName, cb);
        }
    }

    private void playFallbackTtsOrTone(String clipName, final CompletionCallback cb) {
        String clean = clipName;
        int dot = clean.lastIndexOf('.');
        if (dot > 0) clean = clean.substring(0, dot);

        String phrase = CLIP_LABELS.get(clean);
        if (phrase != null && tts != null) {
            speakVietnamese(phrase, cb);
            return;
        }

        try {
            final ToneGenerator tg = new ToneGenerator(AudioManager.STREAM_MUSIC, 95);
            int tone = ToneGenerator.TONE_PROP_BEEP;
            if ("empty".equals(clean)) tone = ToneGenerator.TONE_PROP_NACK;
            else if ("torch_on".equals(clean)) tone = ToneGenerator.TONE_PROP_ACK;
            else if ("torch_off".equals(clean)) tone = ToneGenerator.TONE_PROP_BEEP2;
            else if ("wallet_reset".equals(clean)) tone = ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD;
            tg.startTone(tone, 120);
            mainHandler.postDelayed(new Runnable() {
                @Override
                public void run() {
                    try { tg.release(); } catch (Exception ignored) {}
                    if (cb != null) cb.onComplete(true);
                }
            }, 130L);
        } catch (Exception e) {
            if (cb != null) cb.onComplete(false);
        }
    }

    public void speakVietnamese(String text, final CompletionCallback cb) {
        if (text == null || text.isEmpty() || tts == null) {
            if (cb != null) cb.onComplete(false);
            return;
        }
        interruptAccessibilityAndRequestAudioFocus();
        synchronized (this) {
            isSpeakingTts = true;
        }
        if (!ttsReady) {
            synchronized (this) {
                pendingTtsText = text;
                pendingTtsCallback = cb;
            }
            return;
        }
        try {
            ensureAudibleVolume();
            final String uid = "mv_" + UUID.randomUUID().toString();
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override
                public void onStart(String utteranceId) {}
                @Override
                public void onDone(String utteranceId) {
                    synchronized (MoneyAudioModule.this) {
                        isSpeakingTts = false;
                    }
                    scheduleAbandonAudioFocus();
                    if (cb != null) mainHandler.post(new Runnable() {
                        @Override public void run() { cb.onComplete(true); }
                    });
                }
                @Override
                public void onError(String utteranceId) {
                    synchronized (MoneyAudioModule.this) {
                        isSpeakingTts = false;
                    }
                    scheduleAbandonAudioFocus();
                    if (cb != null) mainHandler.post(new Runnable() {
                        @Override public void run() { cb.onComplete(false); }
                    });
                }
                @Override
                public void onError(String utteranceId, int errorCode) {
                    onError(utteranceId);
                }
            });
            Bundle params = new Bundle();
            params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f);
            int res = tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, uid);
            if (res != TextToSpeech.SUCCESS) {
                synchronized (this) {
                    isSpeakingTts = false;
                }
                scheduleAbandonAudioFocus();
                if (cb != null) cb.onComplete(false);
            }
        } catch (Exception e) {
            synchronized (this) {
                isSpeakingTts = false;
            }
            scheduleAbandonAudioFocus();
            if (cb != null) cb.onComplete(false);
        }
    }

    public void destroy() {
        stop();
        abandonAudioFocusNow();
        try {
            if (tts != null) {
                tts.shutdown();
                tts = null;
            }
        } catch (Exception ignored) {}
    }
}
`,
    'utf8'
  );

  // 3. MoneyCameraModule.java (Camera2 Live Preview + Y-Plane Luminance + Smart Torch)
  fs.writeFileSync(
    path.join(cameraDir, 'MoneyCameraModule.java'),
    `package com.nckh.moneyvision.camera;

import android.content.Context;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;

public class MoneyCameraModule {
    private final Context context;
    private boolean torchOn = false;

    public MoneyCameraModule(Context context) {
        this.context = context.getApplicationContext();
    }

    public boolean setTorch(boolean enabled) {
        try {
            CameraManager cm = (CameraManager) context.getSystemService(Context.CAMERA_SERVICE);
            if (cm != null) {
                for (String id : cm.getCameraIdList()) {
                    CameraCharacteristics chars = cm.getCameraCharacteristics(id);
                    Boolean hasFlash = chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                    if (hasFlash != null && hasFlash) {
                        cm.setTorchMode(id, enabled);
                        torchOn = enabled;
                        return true;
                    }
                }
            }
        } catch (Exception ignored) {}
        torchOn = enabled;
        return false;
    }

    public boolean isTorchOn() {
        return torchOn;
    }
}
`,
    'utf8'
  );

  // 4. MoneyDetectorModule.java (Loads & Executes yolo26_money_quant.tflite via LiteRT Interpreter + 16x16 Cache-Tiled YUV->NCHW + Row-Major Sparse Decoder + 5-Frame Debounce)
  fs.writeFileSync(
    path.join(detectorDir, 'MoneyDetectorModule.java'),
    `package com.nckh.moneyvision.detector;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.InputStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.channels.FileChannel;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class MoneyDetectorModule {
    public static final String MODEL_PATH = "models/yolo26_money_quant.tflite";
    public static final int INPUT_WIDTH = 640;
    public static final int INPUT_HEIGHT = 640;
    public static final int NUM_CHANNELS = 3;
    public static final int NUM_COORDS = 4;
    public static final int NUM_CLASSES = 9;
    public static final int TOTAL_CHANNELS = 13;
    public static final int NUM_ANCHORS = 8400;
    public static final float SCORE_THRESHOLD = 0.50f;
    public static final float CANDIDATE_HINT_THRESHOLD = 0.28f;
    public static final float IOU_THRESHOLD = 0.45f;
    public static final int TILE_SIZE = 16;

    // Pre-computed 256-entry normalization lookup table (Ticket 09 Layer 3)
    public static final float[] NORM_LUT = new float[256];
    static {
        for (int i = 0; i < 256; i++) {
            NORM_LUT[i] = i * (1.0f / 255.0f);
        }
    }

    public static final long[] YOLO_CLASS_ORDER = new long[]{
        1000L, 10000L, 100000L, 2000L, 20000L, 200000L, 5000L, 50000L, 500000L
    };

    public static final long[] SORTED_DENOMINATIONS = new long[]{
        500000L, 200000L, 100000L, 50000L, 20000L, 10000L, 5000L, 2000L, 1000L
    };

    public static class CandidateBox {
        public float x;
        public float y;
        public float width;
        public float height;
        public float score;
        public int classIndex;
        public long denomination;
    }

    private boolean modelVerified = false;
    private boolean interpreterReady = false;
    private long modelSizeBytes = 0L;
    private Object tfliteInterpreter = null;
    private Method runMethod = null;
    private Method closeMethod = null;
    private boolean isInputChannelsFirst = true; // [1, 3, 640, 640] NCHW default for Ultralytics YOLO26n
    private boolean isOutputChannelsLast = false; // [1, 13, 8400] channels-first default

    private ByteBuffer reusableInputBuffer = null;
    private final float[] reusableFloatStaging = new float[INPUT_WIDTH * INPUT_HEIGHT * NUM_CHANNELS];
    private float[][][] reusableOutputFirst = null;
    private float[][][] reusableOutputLast = null;

    // Pre-computed coordinate & stride LUTs for 16x16 Cache-Tiled 90° CW YUV420 -> NCHW
    private final int[] sxLut = new int[INPUT_HEIGHT];
    private final int[] uvColOffLut = new int[INPUT_HEIGHT];
    private final int[] yRowOffLut = new int[INPUT_WIDTH];
    private final int[] uvRowOffLut = new int[INPUT_WIDTH];
    private int cachedSrcW = -1;
    private int cachedSrcH = -1;
    private int cachedYStride = -1;
    private int cachedUvStride = -1;
    private int cachedUvPixStride = -1;

    // Sparse hit tracking buffers for Row-Major decoder (zero per-frame 8400-element Arrays.fill)
    private final float[] reusableBestScores = new float[NUM_ANCHORS];
    private final int[] reusableBestClasses = new int[NUM_ANCHORS];
    private final int[] reusableHitAnchors = new int[NUM_ANCHORS];
    private final boolean[] reusableIsHit = new boolean[NUM_ANCHORS];
    private volatile boolean lastCandidateHint = false;
    private volatile int lastCoordinateReadsCount = 0;

    private final List<String> slidingWindow = new ArrayList<String>();
    private String stableSignature = "EMPTY";
    private int consecutiveEmptyFrames = 0;

    public MoneyDetectorModule(Context context) {
        Arrays.fill(reusableBestScores, -Float.MAX_VALUE);
        Arrays.fill(reusableBestClasses, -1);
        initModelAndInterpreter(context);
    }

    private ByteBuffer loadModelBuffer(Context context) throws Exception {
        try {
            AssetFileDescriptor afd = context.getAssets().openFd(MODEL_PATH);
            modelSizeBytes = afd.getDeclaredLength();
            FileInputStream fis = new FileInputStream(afd.getFileDescriptor());
            FileChannel channel = fis.getChannel();
            ByteBuffer mapped = channel.map(
                FileChannel.MapMode.READ_ONLY,
                afd.getStartOffset(),
                afd.getDeclaredLength()
            );
            fis.close();
            afd.close();
            return mapped;
        } catch (Exception e) {
            InputStream is = context.getAssets().open(MODEL_PATH);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] chunk = new byte[16384];
            int n;
            while ((n = is.read(chunk)) != -1) {
                baos.write(chunk, 0, n);
            }
            is.close();
            byte[] bytes = baos.toByteArray();
            modelSizeBytes = bytes.length;
            ByteBuffer direct = ByteBuffer.allocateDirect(bytes.length).order(ByteOrder.nativeOrder());
            direct.put(bytes);
            direct.rewind();
            return direct;
        }
    }

    private void initModelAndInterpreter(Context context) {
        try {
            ByteBuffer modelBuf = loadModelBuffer(context);
            if (modelBuf != null && modelBuf.capacity() >= 8) {
                modelBuf.rewind();
                byte b4 = modelBuf.get(4);
                byte b5 = modelBuf.get(5);
                byte b6 = modelBuf.get(6);
                byte b7 = modelBuf.get(7);
                if (b4 == 'T' && b5 == 'F' && b6 == 'L' && b7 == '3') {
                    modelVerified = true;
                }
            }
            if (!modelVerified) return;

            // Initialize org.tensorflow.lite.Interpreter via LiteRT runtime
            Class<?> interpClass = Class.forName("org.tensorflow.lite.Interpreter");
            Class<?> optionsClass = Class.forName("org.tensorflow.lite.Interpreter$Options");
            Object options = optionsClass.getDeclaredConstructor().newInstance();
            // Ticket 09 Layer 2: Cap XNNPACK at 2 threads to keep inference on efficiency/mid cores
            int threads = Math.max(1, Math.min(2, Runtime.getRuntime().availableProcessors()));
            try {
                Method setThreads = optionsClass.getMethod("setNumThreads", int.class);
                setThreads.invoke(options, threads);
            } catch ( Throwable ignored ) {}
            try {
                Method setXnnpack = optionsClass.getMethod("setUseXNNPACK", boolean.class);
                setXnnpack.invoke(options, true);
            } catch ( Throwable ignored ) {}

            modelBuf.rewind();
            try {
                Constructor<?> ctor = interpClass.getConstructor(ByteBuffer.class, optionsClass);
                tfliteInterpreter = ctor.newInstance(modelBuf, options);
            } catch (Throwable fallbackErr) {
                modelBuf.rewind();
                Constructor<?> ctorSimple = interpClass.getConstructor(ByteBuffer.class);
                tfliteInterpreter = ctorSimple.newInstance(modelBuf);
            }

            runMethod = interpClass.getMethod("run", Object.class, Object.class);
            closeMethod = interpClass.getMethod("close");

            // Inspect input & output tensor shapes
            try {
                Method getInTensor = interpClass.getMethod("getInputTensor", int.class);
                Object inTensor = getInTensor.invoke(tfliteInterpreter, 0);
                Method shapeMethod = inTensor.getClass().getMethod("shape");
                int[] inShape = (int[]) shapeMethod.invoke(inTensor);
                if (inShape != null && inShape.length == 4) {
                    isInputChannelsFirst = (inShape[1] == NUM_CHANNELS);
                }

                Method getOutTensor = interpClass.getMethod("getOutputTensor", int.class);
                Object outTensor = getOutTensor.invoke(tfliteInterpreter, 0);
                int[] outShape = (int[]) shapeMethod.invoke(outTensor);
                if (outShape != null && outShape.length == 3) {
                    isOutputChannelsLast = (outShape[1] == NUM_ANCHORS && outShape[2] == TOTAL_CHANNELS);
                }
            } catch (Throwable ignored) {}

            reusableInputBuffer = ByteBuffer.allocateDirect(
                1 * INPUT_WIDTH * INPUT_HEIGHT * NUM_CHANNELS * 4
            ).order(ByteOrder.nativeOrder());

            if (isOutputChannelsLast) {
                reusableOutputLast = new float[1][NUM_ANCHORS][TOTAL_CHANNELS];
            } else {
                reusableOutputFirst = new float[1][TOTAL_CHANNELS][NUM_ANCHORS];
            }

            interpreterReady = true;
        } catch (Throwable t) {
            interpreterReady = false;
            tfliteInterpreter = null;
        }
    }

    public boolean isModelVerified() {
        return modelVerified;
    }

    public boolean isInterpreterReady() {
        return interpreterReady && tfliteInterpreter != null;
    }

    public long getModelSizeBytes() {
        return modelSizeBytes;
    }

    public boolean hasLastCandidateHint() {
        return lastCandidateHint;
    }

    public int getLastCoordinateReadsCount() {
        return lastCoordinateReadsCount;
    }

    private void ensureYuvLuts(
        int srcWidth,
        int srcHeight,
        int yRowStride,
        int uvRowStride,
        int uvPixelStride
    ) {
        if (srcWidth == cachedSrcW &&
            srcHeight == cachedSrcH &&
            yRowStride == cachedYStride &&
            uvRowStride == cachedUvStride &&
            uvPixelStride == cachedUvPixStride) {
            return;
        }
        for (int dy = 0; dy < INPUT_HEIGHT; dy++) {
            int sx = (dy * srcWidth) / INPUT_HEIGHT;
            if (sx < 0) sx = 0;
            else if (sx >= srcWidth) sx = srcWidth - 1;
            sxLut[dy] = sx;
            uvColOffLut[dy] = (sx >> 1) * uvPixelStride;
        }
        for (int dx = 0; dx < INPUT_WIDTH; dx++) {
            int sy = srcHeight - 1 - ((dx * srcHeight) / INPUT_WIDTH);
            if (sy < 0) sy = 0;
            else if (sy >= srcHeight) sy = srcHeight - 1;
            yRowOffLut[dx] = sy * yRowStride;
            uvRowOffLut[dx] = (sy >> 1) * uvRowStride;
        }
        cachedSrcW = srcWidth;
        cachedSrcH = srcHeight;
        cachedYStride = yRowStride;
        cachedUvStride = uvRowStride;
        cachedUvPixStride = uvPixelStride;
    }

    /**
     * Runs real YOLO26 TFLite inference on a YUV_420_888 camera frame
     * using 16x16 Cache-Tiled 90° CW YUV-to-NCHW conversion + NORM_LUT + FloatBuffer bulk copy.
     */
    public synchronized Map<Long, Integer> detectFromYuvFrame(
        byte[] yData,
        byte[] uData,
        byte[] vData,
        int srcWidth,
        int srcHeight,
        int yRowStride,
        int uvRowStride,
        int uvPixelStride
    ) {
        if (!isInterpreterReady() || reusableInputBuffer == null) {
            return null;
        }

        try {
            ensureYuvLuts(srcWidth, srcHeight, yRowStride, uvRowStride, uvPixelStride);
            reusableInputBuffer.rewind();

            final int yLen = yData.length;
            final int uLen = uData.length;
            final int vLen = vData.length;
            final int planeFloats = INPUT_WIDTH * INPUT_HEIGHT;
            final int gPlaneOffset = planeFloats;
            final int bPlaneOffset = planeFloats * 2;

            if (isInputChannelsFirst) {
                // 16x16 Cache-Tiled NCHW [1, 3, 640, 640]: Plane R, Plane G, Plane B
                for (int ty = 0; ty < INPUT_HEIGHT; ty += TILE_SIZE) {
                    int tyEnd = Math.min(ty + TILE_SIZE, INPUT_HEIGHT);
                    for (int tx = 0; tx < INPUT_WIDTH; tx += TILE_SIZE) {
                        int txEnd = Math.min(tx + TILE_SIZE, INPUT_WIDTH);
                        for (int dy = ty; dy < tyEnd; dy++) {
                            int sx = sxLut[dy];
                            int uvColOff = uvColOffLut[dy];
                            int pxBase = dy * INPUT_WIDTH;
                            for (int dx = tx; dx < txEnd; dx++) {
                                int yIdx = yRowOffLut[dx] + sx;
                                int uvIdx = uvRowOffLut[dx] + uvColOff;

                                int yVal = (yIdx >= 0 && yIdx < yLen) ? (yData[yIdx] & 0xFF) : 0;
                                int uVal = ((uvIdx >= 0 && uvIdx < uLen) ? (uData[uvIdx] & 0xFF) : 128) - 128;
                                int vVal = ((uvIdx >= 0 && uvIdx < vLen) ? (vData[uvIdx] & 0xFF) : 128) - 128;

                                int r = yVal + ((1436 * vVal) >> 10);
                                int g = yVal - ((352 * uVal + 731 * vVal) >> 10);
                                int b = yVal + ((1815 * uVal) >> 10);

                                if (r < 0) r = 0; else if (r > 255) r = 255;
                                if (g < 0) g = 0; else if (g > 255) g = 255;
                                if (b < 0) b = 0; else if (b > 255) b = 255;

                                int pIdx = pxBase + dx;
                                reusableFloatStaging[pIdx] = NORM_LUT[r];
                                reusableFloatStaging[gPlaneOffset + pIdx] = NORM_LUT[g];
                                reusableFloatStaging[bPlaneOffset + pIdx] = NORM_LUT[b];
                            }
                        }
                    }
                }
            } else {
                // NHWC [1, 640, 640, 3]: Interleaved R, G, B
                int outIdx = 0;
                for (int dy = 0; dy < INPUT_HEIGHT; dy++) {
                    int sx = sxLut[dy];
                    int uvColOff = uvColOffLut[dy];
                    for (int dx = 0; dx < INPUT_WIDTH; dx++) {
                        int yIdx = yRowOffLut[dx] + sx;
                        int uvIdx = uvRowOffLut[dx] + uvColOff;

                        int yVal = (yIdx >= 0 && yIdx < yLen) ? (yData[yIdx] & 0xFF) : 0;
                        int uVal = ((uvIdx >= 0 && uvIdx < uLen) ? (uData[uvIdx] & 0xFF) : 128) - 128;
                        int vVal = ((uvIdx >= 0 && uvIdx < vLen) ? (vData[uvIdx] & 0xFF) : 128) - 128;

                        int r = yVal + ((1436 * vVal) >> 10);
                        int g = yVal - ((352 * uVal + 731 * vVal) >> 10);
                        int b = yVal + ((1815 * uVal) >> 10);

                        if (r < 0) r = 0; else if (r > 255) r = 255;
                        if (g < 0) g = 0; else if (g > 255) g = 255;
                        if (b < 0) b = 0; else if (b > 255) b = 255;

                        reusableFloatStaging[outIdx++] = NORM_LUT[r];
                        reusableFloatStaging[outIdx++] = NORM_LUT[g];
                        reusableFloatStaging[outIdx++] = NORM_LUT[b];
                    }
                }
            }

            reusableInputBuffer.asFloatBuffer().put(reusableFloatStaging);
            reusableInputBuffer.rewind();

            List<CandidateBox> candidates;
            if (isOutputChannelsLast) {
                runMethod.invoke(tfliteInterpreter, reusableInputBuffer, reusableOutputLast);
                candidates = decodeChannelsLast(reusableOutputLast[0]);
            } else {
                runMethod.invoke(tfliteInterpreter, reusableInputBuffer, reusableOutputFirst);
                candidates = decodeChannelsFirst(reusableOutputFirst[0]);
            }

            List<CandidateBox> nmsBoxes = runNMS(candidates);
            return aggregateDetections(nmsBoxes);
        } catch (Throwable t) {
            return null;
        }
    }

    private float sigmoid(float x) {
        if (Float.isNaN(x)) return 0.0f;
        if (x > 40f) return 1.0f;
        if (x < -40f) return 0.0f;
        return (float) (1.0 / (1.0 + Math.exp(-x)));
    }

    private float inverseSigmoid(float p) {
        float clamped = Math.max(1e-6f, Math.min(1.0f - 1e-6f, p));
        return (float) Math.log(clamped / (1.0f - clamped));
    }

    /**
     * Ticket 09 Layer 2 Row-Major Sparse Decoder:
     * 1. Row-Major outer loop over 9 classes, inner loop over 8400 anchors (contiguous L1 cache hits)
     * 2. Pre-Sigmoid raw logit threshold comparison
     * 3. Sparse hit tracking & reset (zero 8400-element Arrays.fill per frame)
     * 4. Zero-Coordinate-Read fast path on empty frames (0 reads of channels 0..3 when hitCount == 0)
     */
    private List<CandidateBox> decodeChannelsFirst(float[][] matrix) {
        List<CandidateBox> list = new ArrayList<CandidateBox>();
        lastCandidateHint = false;
        lastCoordinateReadsCount = 0;

        boolean needSigmoid = false;
        int sampleLimit = Math.min(200, NUM_ANCHORS);
        for (int c = 0; c < NUM_CLASSES; c++) {
            float[] classRow = matrix[NUM_COORDS + c];
            for (int i = 0; i < sampleLimit; i++) {
                float v = classRow[i];
                if (v < -0.1f || v > 1.2f) {
                    needSigmoid = true;
                    break;
                }
            }
            if (needSigmoid) break;
        }

        float rawScoreThreshold = needSigmoid ? inverseSigmoid(SCORE_THRESHOLD) : SCORE_THRESHOLD;
        float rawHintThreshold = needSigmoid ? inverseSigmoid(CANDIDATE_HINT_THRESHOLD) : CANDIDATE_HINT_THRESHOLD;

        int hitCount = 0;
        boolean candidateHintFound = false;

        for (int c = 0; c < NUM_CLASSES; c++) {
            float[] classRow = matrix[NUM_COORDS + c];
            for (int i = 0; i < NUM_ANCHORS; i++) {
                float raw = classRow[i];
                if (Float.isNaN(raw)) continue;
                if (!candidateHintFound && raw >= rawHintThreshold) {
                    candidateHintFound = true;
                }
                if (raw >= rawScoreThreshold && raw > reusableBestScores[i]) {
                    if (!reusableIsHit[i]) {
                        reusableIsHit[i] = true;
                        reusableHitAnchors[hitCount++] = i;
                    }
                    reusableBestScores[i] = raw;
                    reusableBestClasses[i] = c;
                }
            }
        }

        if (hitCount == 0) {
            lastCandidateHint = candidateHintFound;
            return list;
        }

        float[] cxRow = matrix[0];
        float[] cyRow = matrix[1];
        float[] wRow = matrix[2];
        float[] hRow = matrix[3];

        float maxCoordVal = 0f;
        for (int h = 0; h < hitCount; h++) {
            int idx = reusableHitAnchors[h];
            float c0 = cxRow[idx];
            float c1 = cyRow[idx];
            float c2 = wRow[idx];
            float c3 = hRow[idx];
            if (!Float.isNaN(c0) && c0 > maxCoordVal) maxCoordVal = c0;
            if (!Float.isNaN(c1) && c1 > maxCoordVal) maxCoordVal = c1;
            if (!Float.isNaN(c2) && c2 > maxCoordVal) maxCoordVal = c2;
            if (!Float.isNaN(c3) && c3 > maxCoordVal) maxCoordVal = c3;
            if (maxCoordVal > 2.0f) break;
        }
        if (maxCoordVal <= 2.0f) {
            for (int c = 0; c < NUM_COORDS; c++) {
                float[] coordRow = matrix[c];
                for (int i = 0; i < sampleLimit; i++) {
                    float v = coordRow[i];
                    if (!Float.isNaN(v) && v > maxCoordVal) {
                        maxCoordVal = v;
                        if (maxCoordVal > 2.0f) break;
                    }
                }
                if (maxCoordVal > 2.0f) break;
            }
        }
        boolean isNormalizedTensor = maxCoordVal > 0f && maxCoordVal <= 2.0f;
        lastCoordinateReadsCount = hitCount * 4;

        for (int h = 0; h < hitCount; h++) {
            int i = reusableHitAnchors[h];
            float rawBest = reusableBestScores[i];
            int bestClass = reusableBestClasses[i];

            // Sparse O(hitCount) cleanup for next frame
            reusableBestScores[i] = -Float.MAX_VALUE;
            reusableBestClasses[i] = -1;
            reusableIsHit[i] = false;

            float maxScore = needSigmoid ? sigmoid(rawBest) : Math.max(0f, Math.min(1f, rawBest));
            if (bestClass < 0 || maxScore < SCORE_THRESHOLD) continue;

            float rawCx = cxRow[i];
            float rawCy = cyRow[i];
            float rawW = wRow[i];
            float rawH = hRow[i];
            if (Float.isNaN(rawCx) || Float.isNaN(rawCy) || Float.isNaN(rawW) || Float.isNaN(rawH) || rawW <= 0f || rawH <= 0f) {
                continue;
            }

            float cx = isNormalizedTensor ? rawCx * INPUT_WIDTH : rawCx;
            float cy = isNormalizedTensor ? rawCy * INPUT_HEIGHT : rawCy;
            float w = isNormalizedTensor ? rawW * INPUT_WIDTH : rawW;
            float hBox = isNormalizedTensor ? rawH * INPUT_HEIGHT : rawH;

            float x1 = Math.max(0f, Math.min(INPUT_WIDTH, cx - w / 2f));
            float y1 = Math.max(0f, Math.min(INPUT_HEIGHT, cy - hBox / 2f));
            float x2 = Math.max(0f, Math.min(INPUT_WIDTH, cx + w / 2f));
            float y2 = Math.max(0f, Math.min(INPUT_HEIGHT, cy + hBox / 2f));

            float bw = x2 - x1;
            float bh = y2 - y1;
            if (bw < 2f || bh < 2f) continue;

            CandidateBox box = new CandidateBox();
            box.x = x1;
            box.y = y1;
            box.width = bw;
            box.height = bh;
            box.score = maxScore;
            box.classIndex = bestClass;
            box.denomination = YOLO_CLASS_ORDER[bestClass];
            list.add(box);
        }
        lastCandidateHint = candidateHintFound && list.isEmpty();
        return list;
    }

    private List<CandidateBox> decodeChannelsLast(float[][] matrix) {
        List<CandidateBox> list = new ArrayList<CandidateBox>();
        lastCandidateHint = false;
        lastCoordinateReadsCount = 0;

        boolean needSigmoid = false;
        int sampleLimit = Math.min(200, NUM_ANCHORS);
        for (int i = 0; i < sampleLimit; i++) {
            for (int c = 0; c < NUM_CLASSES; c++) {
                float v = matrix[i][NUM_COORDS + c];
                if (v < -0.1f || v > 1.2f) {
                    needSigmoid = true;
                    break;
                }
            }
            if (needSigmoid) break;
        }

        float rawScoreThreshold = needSigmoid ? inverseSigmoid(SCORE_THRESHOLD) : SCORE_THRESHOLD;
        float rawHintThreshold = needSigmoid ? inverseSigmoid(CANDIDATE_HINT_THRESHOLD) : CANDIDATE_HINT_THRESHOLD;

        int hitCount = 0;
        boolean candidateHintFound = false;

        for (int i = 0; i < NUM_ANCHORS; i++) {
            float[] anchorRow = matrix[i];
            float bestRaw = -Float.MAX_VALUE;
            int bestClass = -1;

            for (int c = 0; c < NUM_CLASSES; c++) {
                float raw = anchorRow[NUM_COORDS + c];
                if (Float.isNaN(raw)) continue;
                if (!candidateHintFound && raw >= rawHintThreshold) {
                    candidateHintFound = true;
                }
                if (raw >= rawScoreThreshold && raw > bestRaw) {
                    bestRaw = raw;
                    bestClass = c;
                }
            }

            if (bestClass >= 0) {
                reusableHitAnchors[hitCount] = i;
                reusableBestScores[hitCount] = bestRaw;
                reusableBestClasses[hitCount] = bestClass;
                hitCount++;
            }
        }

        if (hitCount == 0) {
            lastCandidateHint = candidateHintFound;
            return list;
        }

        float maxCoordVal = 0f;
        for (int h = 0; h < hitCount; h++) {
            int idx = reusableHitAnchors[h];
            for (int c = 0; c < NUM_COORDS; c++) {
                float v = matrix[idx][c];
                if (!Float.isNaN(v) && v > maxCoordVal) {
                    maxCoordVal = v;
                }
            }
            if (maxCoordVal > 2.0f) break;
        }
        if (maxCoordVal <= 2.0f) {
            for (int i = 0; i < sampleLimit; i++) {
                for (int c = 0; c < NUM_COORDS; c++) {
                    float v = matrix[i][c];
                    if (!Float.isNaN(v) && v > maxCoordVal) {
                        maxCoordVal = v;
                        if (maxCoordVal > 2.0f) break;
                    }
                }
                if (maxCoordVal > 2.0f) break;
            }
        }
        boolean isNormalizedTensor = maxCoordVal > 0f && maxCoordVal <= 2.0f;
        lastCoordinateReadsCount = hitCount * 4;

        for (int h = 0; h < hitCount; h++) {
            int i = reusableHitAnchors[h];
            float rawBest = reusableBestScores[h];
            int bestClass = reusableBestClasses[h];
            reusableBestScores[h] = -Float.MAX_VALUE;
            reusableBestClasses[h] = -1;

            float maxScore = needSigmoid ? sigmoid(rawBest) : Math.max(0f, Math.min(1f, rawBest));
            if (maxScore < SCORE_THRESHOLD) continue;

            float rawCx = matrix[i][0];
            float rawCy = matrix[i][1];
            float rawW = matrix[i][2];
            float rawH = matrix[i][3];
            if (Float.isNaN(rawCx) || Float.isNaN(rawCy) || Float.isNaN(rawW) || Float.isNaN(rawH) || rawW <= 0f || rawH <= 0f) {
                continue;
            }

            float cx = isNormalizedTensor ? rawCx * INPUT_WIDTH : rawCx;
            float cy = isNormalizedTensor ? rawCy * INPUT_HEIGHT : rawCy;
            float w = isNormalizedTensor ? rawW * INPUT_WIDTH : rawW;
            float hBox = isNormalizedTensor ? rawH * INPUT_HEIGHT : rawH;

            float x1 = Math.max(0f, Math.min(INPUT_WIDTH, cx - w / 2f));
            float y1 = Math.max(0f, Math.min(INPUT_HEIGHT, cy - hBox / 2f));
            float x2 = Math.max(0f, Math.min(INPUT_WIDTH, cx + w / 2f));
            float y2 = Math.max(0f, Math.min(INPUT_HEIGHT, cy + hBox / 2f));

            float bw = x2 - x1;
            float bh = y2 - y1;
            if (bw < 2f || bh < 2f) continue;

            CandidateBox box = new CandidateBox();
            box.x = x1;
            box.y = y1;
            box.width = bw;
            box.height = bh;
            box.score = maxScore;
            box.classIndex = bestClass;
            box.denomination = YOLO_CLASS_ORDER[bestClass];
            list.add(box);
        }
        lastCandidateHint = candidateHintFound && list.isEmpty();
        return list;
    }

    private List<CandidateBox> runNMS(List<CandidateBox> boxes) {
        if (boxes == null || boxes.size() <= 1) return boxes;
        List<CandidateBox> sorted = new ArrayList<CandidateBox>(boxes);
        Collections.sort(sorted, new Comparator<CandidateBox>() {
            @Override
            public int compare(CandidateBox a, CandidateBox b) {
                return Float.compare(b.score, a.score);
            }
        });

        List<CandidateBox> kept = new ArrayList<CandidateBox>();
        boolean[] suppressed = new boolean[sorted.size()];

        for (int i = 0; i < sorted.size(); i++) {
            if (suppressed[i]) continue;
            CandidateBox cur = sorted.get(i);
            kept.add(cur);
            if (kept.size() >= 20) break;

            for (int j = i + 1; j < sorted.size(); j++) {
                if (suppressed[j]) continue;
                CandidateBox next = sorted.get(j);
                if (cur.classIndex == next.classIndex) {
                    if (computeIoU(cur, next) >= IOU_THRESHOLD) {
                        suppressed[j] = true;
                    }
                }
            }
        }
        return kept;
    }

    private float computeIoU(CandidateBox a, CandidateBox b) {
        float interX1 = Math.max(a.x, b.x);
        float interY1 = Math.max(a.y, b.y);
        float interX2 = Math.min(a.x + a.width, b.x + b.width);
        float interY2 = Math.min(a.y + a.height, b.y + b.height);
        float interW = Math.max(0f, interX2 - interX1);
        float interH = Math.max(0f, interY2 - interY1);
        float interArea = interW * interH;
        if (interArea <= 0f) return 0f;
        float union = a.width * a.height + b.width * b.height - interArea;
        return union > 0f ? interArea / union : 0f;
    }

    private Map<Long, Integer> aggregateDetections(List<CandidateBox> boxes) {
        Map<Long, Integer> rawCounts = new LinkedHashMap<Long, Integer>();
        if (boxes != null) {
            for (CandidateBox b : boxes) {
                int prev = rawCounts.containsKey(b.denomination) ? rawCounts.get(b.denomination) : 0;
                rawCounts.put(b.denomination, prev + 1);
            }
        }
        Map<Long, Integer> ordered = new LinkedHashMap<Long, Integer>();
        for (long denom : SORTED_DENOMINATIONS) {
            if (rawCounts.containsKey(denom)) {
                ordered.put(denom, rawCounts.get(denom));
            }
        }
        return ordered;
    }

    public synchronized boolean processFrameSignature(String sig) {
        if ("EMPTY".equals(sig)) {
            consecutiveEmptyFrames++;
        } else {
            consecutiveEmptyFrames = 0;
        }

        slidingWindow.add(sig);
        if (slidingWindow.size() > 5) {
            slidingWindow.remove(0);
        }

        if (consecutiveEmptyFrames >= 3 && !"EMPTY".equals(stableSignature)) {
            stableSignature = "EMPTY";
            return true;
        }

        int count = 0;
        for (String s : slidingWindow) {
            if (s.equals(sig)) count++;
        }
        if (count >= 4 && !sig.equals(stableSignature)) {
            stableSignature = sig;
            return true;
        }
        return false;
    }

    public synchronized void reset() {
        slidingWindow.clear();
        stableSignature = "EMPTY";
        consecutiveEmptyFrames = 0;
    }

    public synchronized void destroy() {
        try {
            if (tfliteInterpreter != null && closeMethod != null) {
                closeMethod.invoke(tfliteInterpreter);
            }
        } catch (Throwable ignored) {
        } finally {
            tfliteInterpreter = null;
            interpreterReady = false;
        }
    }
}
`,
    'utf8'
  );

  // 5. MainActivity.java (Full Tactile WCAG AAA UI + Live Camera2 YOLO26 TFLite Inference + Smart Torch + Gesture Canvas + Real Audio & TTS + Ticket 10 Blind-First UI/UX & Spatial Guidance)
  fs.writeFileSync(
    path.join(pkgDir, 'MainActivity.java'),
    `package com.nckh.moneyvision;

import android.Manifest;
import android.app.Activity;
import android.app.Dialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.ImageFormat;
import android.graphics.SurfaceTexture;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.media.AudioManager;
import android.media.Image;
import android.media.ImageReader;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.os.PowerManager;
import android.os.Process;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Range;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.Surface;
import android.view.TextureView;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.nckh.moneyvision.audio.MoneyAudioModule;
import com.nckh.moneyvision.camera.MoneyCameraModule;
import com.nckh.moneyvision.detector.MoneyDetectorModule;
import java.nio.ByteBuffer;
import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public class MainActivity extends Activity {
    private static final int REQ_CAMERA = 1001;
    private static final int COLOR_BLACK = Color.parseColor("#000000");
    private static final int COLOR_YELLOW = Color.parseColor("#FFE600");
    private static final int COLOR_WHITE = Color.parseColor("#FFFFFF");
    private static final int COLOR_GREEN = Color.parseColor("#00FF66");
    private static final int COLOR_RED = Color.parseColor("#FF3B30");
    private static final int COLOR_DARK_CARD = Color.parseColor("#111111");

    // Ticket 10: Blind-First UI/UX & Spatial Guidance Constants
    public static final int EDGE_PALM_REJECTION_DP = 16;
    public static final int MIN_TOUCH_TARGET_DP = 48;
    public static final int ACCESSIBLE_TOUCH_TARGET_DP = 48;
    public static final long CANDIDATE_GUIDANCE_PULSE_MS = 25L;
    public static final long CANDIDATE_GUIDANCE_COOLDOWN_MS = 1200L;
    public static final String CANDIDATE_GUIDANCE_TEXT = "✋ Phát hiện bóng tờ tiền — Giữ yên tay...";
    private static final int A11Y_ACTION_REREAD = 0x1001;
    private static final int A11Y_ACTION_TOGGLE_TORCH = 0x1002;
    private static final int A11Y_ACTION_READ_WALLET = 0x1003;
    private static final int A11Y_ACTION_RESET_WALLET = 0x1004;

    // Ticket 08: 4-Layer Anti-Strobe Smart Torch & Optical Reflection Guard Constants
    private static final long MIN_TORCH_ON_HOLD_MS = 12000L;
    private static final long POST_TORCH_BASELINE_WINDOW_MS = 450L;
    private static final long RESTORE_SUSTAIN_DURATION_MS = 3000L;
    private static final double HIGH_RESTORE_LUMA_THRESHOLD = 175.0;
    private static final double POST_TORCH_LUMA_DELTA = 55.0;
    private static final float AMBIENT_SENSOR_RESTORE_LUX = 85.0f;
    private static final double MAX_GLARE_RATIO_FOR_RESTORE = 0.08;
    private static final double MAX_CENTER_TO_BORDER_RATIO = 1.30;
    private static final long OSCILLATION_WINDOW_MS = 30000L;
    private static final int OSCILLATION_MAX_CYCLES = 2;
    private static final long OSCILLATION_LATCH_DURATION_MS = 60000L;

    // Ticket 12: Smart Manual-OFF Recovery & Dark-to-Dark Motion/Darkening Re-Arm Constants
    private static final long MANUAL_OFF_SETTLE_MS = 250L;
    private static final long MANUAL_OFF_MOTION_ARM_DELAY_MS = 400L;
    private static final double MANUAL_OFF_REARM_LUMA_LUX = 35.0;
    private static final long MANUAL_OFF_DARK_GRACE_MS = 2500L;
    private static final double MANUAL_OFF_DARKENING_DROP_LUX = 6.0;
    private static final double MANUAL_OFF_MOTION_DELTA_Y = 4.5;
    private static final float MANUAL_OFF_IMU_ACCEL_DELTA = 0.35f;

    // Ticket 13: Multi-Note Presentation Wallet & Audio Preemption Constants
    private static final long PRESENTATION_EMPTY_RESET_MS = 1200L;
    private static final long PRESENTATION_CONTINUITY_GRACE_MS = 1500L;
    private static final long DENOMINATION_REFINEMENT_WINDOW_MS = 1500L;

    // Ticket 09: 4-Layer Adaptive Thermal & Battery Governor Constants
    public static final String POWER_STATE_BURST = "BURST";
    public static final String POWER_STATE_ECO = "ECO";
    public static final String POWER_STATE_HIBERNATION = "HIBERNATION";
    public static final String THERMAL_NOMINAL = "NOMINAL";
    public static final String THERMAL_WARM = "WARM";
    public static final String THERMAL_HOT = "HOT";
    private static final int LUMA_GRID_DIM = 16;
    private static final int LUMA_GRID_CELLS = 256;
    private static final double MOTION_BLUR_DELTA_Y_THRESHOLD = 32.0;
    private static final double MOTION_WAKE_DELTA_Y_THRESHOLD = 4.5;
    private static final double STATIC_HOLDING_DELTA_Y_THRESHOLD = 2.5;
    private static final double STATIC_EMPTY_DELTA_Y_THRESHOLD = 2.0;
    private static final double STATIC_DEEP_IDLE_DELTA_Y_THRESHOLD = 1.5;
    private static final double DARK_OCCLUDED_LUX_THRESHOLD = 5.0;
    private static final long IDLE_TORCH_CUTOFF_MS = 15000L;
    private static final long PROXIMITY_TORCH_CUTOFF_MS = 4000L;
    private static final long DEEP_IDLE_SCREEN_OFF_TIMEOUT_MS = 180000L;
    private static final float IMU_WAKE_DEFAULT_THRESHOLD = 0.35f;
    private static final float IMU_WAKE_ELEVATED_THRESHOLD = 0.65f;
    private static final float LUX_WAKE_MIN_DELTA = 8.0f;
    private static final float LUX_WAKE_RELATIVE_RATIO = 0.25f;

    private static final long BURST_INTERVAL_NOMINAL_MS = 130L;
    private static final long BURST_INTERVAL_WARM_MS = 175L;
    private static final long BURST_INTERVAL_HOT_MS = 240L;
    private static final long ECO_INTERVAL_NOMINAL_MS = 650L;
    private static final long ECO_INTERVAL_WARM_MS = 850L;
    private static final long ECO_INTERVAL_HOT_MS = 1100L;
    private static final long ECO_ENTRY_STATIC_DURATION_NOMINAL_MS = 2500L;
    private static final long ECO_ENTRY_STATIC_DURATION_WARM_MS = 1800L;
    private static final long ECO_ENTRY_STATIC_DURATION_HOT_MS = 1200L;
    private static final long HIBERNATION_ENTRY_EMPTY_STATIC_NOMINAL_MS = 8000L;
    private static final long HIBERNATION_ENTRY_EMPTY_STATIC_HOT_MS = 5000L;
    private static final long HIBERNATION_ENTRY_DARK_STATIC_MS = 3000L;
    private static final float PREVIEW_ALPHA_BURST = 0.22f;
    private static final float PREVIEW_ALPHA_ECO = 0.08f;

    public static final String AUTHOR_NAME = "Nguyễn Quang Toàn";
    public static final String AUTHOR_OWNERSHIP_ROLE = "Chủ sở hữu & Nhà phát triển độc lập";
    public static final String AUTHOR_BANNER_TEXT = "Tác giả & Sở hữu độc lập: Nguyễn Quang Toàn";
    public static final String AUTHOR_COPYRIGHT_TEXT = "© 2026 Nguyễn Quang Toàn - Sở hữu & Phát triển độc lập";
    public static final String AUTHOR_TECH_INFO = "Ứng dụng AI trợ năng nhận diện tiền Việt Nam Đồng 100% Offline (YOLO26 TFLite).";
    public static final String AUTHOR_SPOKEN_TEXT = "Ứng dụng thuộc sở hữu và phát triển độc lập bởi Nguyễn Quang Toàn";

    private MoneyAudioModule audioModule;
    private MoneyCameraModule cameraModule;
    private MoneyDetectorModule detectorModule;
    private Vibrator vibrator;
    private SensorManager sensorManager;
    private Sensor lightSensor;
    private Sensor motionSensor;
    private Sensor proximitySensor;
    private volatile boolean hasHardwareLightSensor = false;
    private volatile float ambientSensorLux = -1.0f;
    private float lastWakeAmbientLux = -1.0f;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private Dialog activeAuthorDialog = null;

    // UI Elements
    private FrameLayout rootPulseContainer;
    private GradientDrawable pulseBorderDrawable;
    private GradientDrawable viewfinderReticleDrawable;
    private GradientDrawable polymerBadgeDrawable;
    private TextureView cameraTextureView;
    private TextView modelStatusText;
    private TextView powerStateBadgeText;
    private TextView torchStatusText;
    private TextView headlineCountText;
    private TextView heroAmountText;
    private TextView polymerColorBadgeText;
    private TextView spokenSubtitleText;
    private TextView walletSummaryText;
    private TextView gestureBadgeText;
    private Button directTorchBtn;
    private Button simDrawerToggleBtn;
    private Button directWalletResetBtn;
    private LinearLayout controlsPanel;

    // State
    private boolean isSimulationDrawerOpen = false;
    private final Map<Long, Integer> currentNotes = new LinkedHashMap<Long, Integer>();
    private final Map<Long, Integer> walletNotes = new LinkedHashMap<Long, Integer>();
    private final Map<Long, Integer> walletBaselineNotes = new LinkedHashMap<Long, Integer>();
    private final Map<Long, Integer> presentationCreditedNotes = new LinkedHashMap<Long, Integer>();
    private final Map<Long, Integer> presentationMaxCounts = new LinkedHashMap<Long, Integer>();
    private final Map<Long, Integer> presentationPeakAnnouncedCounts = new LinkedHashMap<Long, Integer>();
    private final Map<Long, Integer> lastActiveNotes = new LinkedHashMap<Long, Integer>();
    private final Map<Long, Integer> lastPresentationCreditedNotes = new LinkedHashMap<Long, Integer>();
    private int presentationPeakTotalNotes = 0;
    private int lastPresentationPeakTotalNotes = 0;
    private long lastActiveTimestampMs = 0L;
    private long lastEmptyTimestampMs = 0L;
    private boolean wasPresentationEmpty = true;
    private long emptySinceTimestampMs = 0L;
    private int currentlyAnnouncingNotesCount = 0;
    private volatile boolean isReadingWallet = false;
    private long currentTotalAmount = 0L;
    private int currentNotesCount = 0;
    private long walletTotalAmount = 0L;
    private int walletNotesCount = 0;
    private boolean isTorchOn = false;
    private boolean isManualTorchOverride = false;
    private long manualOffTimestampMs = 0L;
    private double manualOffBaselineLuma = -1.0;
    private boolean hasMovedSinceManualOff = false;
    private volatile float lastLinearAccelDelta = 0.0f;
    private double currentLuminance = 100.0;
    private long lowLightStartMs = 0L;
    private long restoreLightStartMs = 0L;
    private long torchAutoOnTimestampMs = 0L;
    private double postTorchBaselineLuma = -1.0;
    private float preTorchAmbientSensorLux = -1.0f;
    private volatile boolean hasCandidateInFrame = false;
    private volatile long lastCandidateGuidancePulseMs = 0L;
    private boolean isOscillationLatched = false;
    private long oscillationLatchUntilMs = 0L;
    private final List<Long> autoTorchCycleTimestamps = new ArrayList<Long>();
    private String lastAnnouncedSig = "EMPTY";
    private String pendingSig = null;
    private Map<Long, Integer> pendingNotes = null;
    private volatile long manualHoldUntilMs = 0L;

    // Ticket 09: Adaptive Power & Thermal Governor State
    private volatile String powerState = POWER_STATE_BURST;
    private volatile String thermalLevel = THERMAL_NOMINAL;
    private final long[] currentLumaGridSums = new long[LUMA_GRID_CELLS];
    private final int[] currentLumaGridCounts = new int[LUMA_GRID_CELLS];
    private final float[] previousLumaGrid = new float[LUMA_GRID_CELLS];
    private boolean hasPreviousLumaGrid = false;
    private volatile double currentMotionDeltaY = 0.0;
    private long staticHoldingStartMs = 0L;
    private long staticEmptyStartMs = 0L;
    private long deepIdleStartMs = 0L;
    private long darkOccludedStartMs = 0L;
    private long torchIdleStaticStartMs = 0L;
    private long proximityNearStartMs = 0L;
    private volatile boolean isProximityNear = false;
    private volatile float imuWakeThreshold = IMU_WAKE_DEFAULT_THRESHOLD;
    private int consecutiveFalseImuWakes = 0;
    private boolean pendingImuWakeVerify = false;
    private float gravityX = 0.0f;
    private float gravityY = 0.0f;
    private float gravityZ = 9.81f;
    private boolean isPreviewDetachedForHibernation = false;
    private boolean isKeepScreenOnReleased = false;
    private long lastThermalPollMs = 0L;
    private long lastTorchStatusUiUpdateMs = 0L;
    private long lastDisplayedLux = -100L;
    private boolean lastDisplayedTorchOn = false;

    private final SensorEventListener lightSensorListener = new SensorEventListener() {
        @Override
        public void onSensorChanged(SensorEvent event) {
            if (event != null && event.values != null && event.values.length > 0) {
                float lux = event.values[0];
                ambientSensorLux = lux;
                hasHardwareLightSensor = true;
                if (lastWakeAmbientLux < 0.0f) {
                    lastWakeAmbientLux = lux;
                } else {
                    float absShift = Math.abs(lux - lastWakeAmbientLux);
                    float relShift = absShift / Math.max(1.0f, lastWakeAmbientLux);
                    if (absShift >= LUX_WAKE_MIN_DELTA && relShift >= LUX_WAKE_RELATIVE_RATIO) {
                        lastWakeAmbientLux = lux;
                        if (!POWER_STATE_BURST.equals(powerState) && !isProximityNear) {
                            wakeUpToBurst("AMBIENT_LUX_SHIFT", System.currentTimeMillis());
                        }
                    }
                }
            }
        }
        @Override
        public void onAccuracyChanged(Sensor sensor, int accuracy) {}
    };

    private final SensorEventListener motionSensorListener = new SensorEventListener() {
        @Override
        public void onSensorChanged(SensorEvent event) {
            if (event == null || event.values == null || event.values.length < 3) return;
            float deltaMag;
            if (event.sensor.getType() == Sensor.TYPE_LINEAR_ACCELERATION) {
                float ax = event.values[0];
                float ay = event.values[1];
                float az = event.values[2];
                deltaMag = (float) Math.sqrt(ax * ax + ay * ay + az * az);
            } else {
                float alpha = 0.8f;
                gravityX = alpha * gravityX + (1.0f - alpha) * event.values[0];
                gravityY = alpha * gravityY + (1.0f - alpha) * event.values[1];
                gravityZ = alpha * gravityZ + (1.0f - alpha) * event.values[2];
                float lx = event.values[0] - gravityX;
                float ly = event.values[1] - gravityY;
                float lz = event.values[2] - gravityZ;
                deltaMag = (float) Math.sqrt(lx * lx + ly * ly + lz * lz);
            }
            lastLinearAccelDelta = deltaMag;
            if (isManualTorchOverride && !isTorchOn && manualOffTimestampMs > 0L &&
                (System.currentTimeMillis() - manualOffTimestampMs) > MANUAL_OFF_MOTION_ARM_DELAY_MS &&
                deltaMag >= MANUAL_OFF_IMU_ACCEL_DELTA) {
                hasMovedSinceManualOff = true;
            }
            float effectiveImuThreshold = (currentNotesCount > 0) ? IMU_WAKE_ELEVATED_THRESHOLD : imuWakeThreshold;
            if (deltaMag > effectiveImuThreshold && !POWER_STATE_BURST.equals(powerState) && !isProximityNear) {
                pendingImuWakeVerify = true;
                wakeUpToBurst("IMU_ACCELERATION", System.currentTimeMillis());
            }
        }
        @Override
        public void onAccuracyChanged(Sensor sensor, int accuracy) {}
    };

    private final SensorEventListener proximitySensorListener = new SensorEventListener() {
        @Override
        public void onSensorChanged(SensorEvent event) {
            if (event == null || event.values == null || event.values.length == 0) return;
            float maxRange = Math.min(5.0f, event.sensor.getMaximumRange());
            boolean nearNow = event.values[0] < maxRange;
            boolean wasNear = isProximityNear;
            isProximityNear = nearNow;
            long now = System.currentTimeMillis();
            if (nearNow && !wasNear) {
                proximityNearStartMs = now;
            } else if (!nearNow && wasNear) {
                proximityNearStartMs = 0L;
                wakeUpToBurst("PROXIMITY_UNCOVERED", now);
            }
        }
        @Override
        public void onAccuracyChanged(Sensor sensor, int accuracy) {}
    };

    // Camera2 & Background AI Inference Threads
    private HandlerThread cameraThread;
    private Handler cameraHandler;
    private HandlerThread inferenceThread;
    private Handler inferenceHandler;
    private CameraDevice cameraDevice;
    private CameraCaptureSession captureSession;
    private CaptureRequest.Builder previewRequestBuilder;
    private CaptureRequest.Builder heartbeatRequestBuilder;
    private Surface activePreviewSurface;
    private Surface activeReaderSurface;
    private ImageReader imageReader;
    private volatile boolean isInferring = false;
    private long lastInferenceMs = 0L;

    // Reusable YUV frame buffers to avoid GC churn
    private byte[] reusableY;
    private byte[] reusableU;
    private byte[] reusableV;

    // Gesture State
    private long touchStartMs = 0L;
    private float touchStartX = 0f;
    private float touchStartY = 0f;
    private int maxPointersInTouch = 0;
    private float maxMoveDistancePx = 0f;
    private boolean longPressFired = false;
    private long lastSingleTapMs = 0L;
    private long lastTwoFingerTapMs = 0L;
    private Runnable singleTapRunnable;
    private Runnable longPressRunnable;
    private Runnable hoverLongPressRunnable;
    private boolean hoverLongPressFired = false;
    private float hoverStartX = 0f;
    private float hoverStartY = 0f;
    private volatile boolean wasCandidateGuidanceActive = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);

        vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        sensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        if (sensorManager != null) {
            lightSensor = sensorManager.getDefaultSensor(Sensor.TYPE_LIGHT);
            motionSensor = sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION);
            if (motionSensor == null) {
                motionSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            }
            proximitySensor = sensorManager.getDefaultSensor(Sensor.TYPE_PROXIMITY);
        }
        audioModule = new MoneyAudioModule(this);
        cameraModule = new MoneyCameraModule(this);
        detectorModule = new MoneyDetectorModule(this);

        buildAccessibleInterface();
        checkAndRequestCameraPermission();

        // Startup audio feedback: play tick chime followed by short Vietnamese readiness announcement
        mainHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                audioModule.playClip("tick", new MoneyAudioModule.CompletionCallback() {
                    @Override
                    public void onComplete(boolean finished) {
                        audioModule.speakVietnamese("Hệ thống nhận diện tiền Việt Nam sẵn sàng", null);
                    }
                });
            }
        }, 350L);
    }

    private int dp(int v) {
        return Math.round(TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()
        ));
    }

    private String formatPowerStateBadge(String state) {
        if (POWER_STATE_ECO.equals(state)) return "🌿 ECO";
        if (POWER_STATE_HIBERNATION.equals(state)) return "💤 CHỜ";
        return "🔍 ĐANG QUÉT";
    }

    private void toggleSimulationDrawer() {
        isSimulationDrawerOpen = !isSimulationDrawerOpen;
        if (controlsPanel != null) {
            controlsPanel.setVisibility(isSimulationDrawerOpen ? View.VISIBLE : View.GONE);
        }
        if (simDrawerToggleBtn != null) {
            simDrawerToggleBtn.setText(isSimulationDrawerOpen ? "ĐÓNG" : "KIỂM THỬ");
        }
    }

    private void buildAccessibleInterface() {
        FrameLayout masterRoot = new FrameLayout(this);
        masterRoot.setBackgroundColor(COLOR_BLACK);

        // 1. Live Camera2 TextureView in Background Layer (Dimmed to PREVIEW_ALPHA_BURST = 0.22f)
        cameraTextureView = new TextureView(this);
        cameraTextureView.setAlpha(PREVIEW_ALPHA_BURST);
        cameraTextureView.setSurfaceTextureListener(surfaceTextureListener);
        cameraTextureView.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        masterRoot.addView(cameraTextureView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        // 2. Foreground Layout with 8dp Edge Pulse Border
        LinearLayout mainColumn = new LinearLayout(this);
        mainColumn.setOrientation(LinearLayout.VERTICAL);

        rootPulseContainer = new FrameLayout(this);
        pulseBorderDrawable = new GradientDrawable();
        pulseBorderDrawable.setColor(Color.TRANSPARENT);
        pulseBorderDrawable.setStroke(dp(8), Color.parseColor("#26FFE600"));
        rootPulseContainer.setBackground(pulseBorderDrawable);
        rootPulseContainer.setPadding(dp(14), dp(10), dp(14), dp(10));

        // 3. Tactile Display Content inside Gesture Canvas
        LinearLayout canvasContent = new LinearLayout(this);
        canvasContent.setOrientation(LinearLayout.VERTICAL);
        canvasContent.setGravity(Gravity.CENTER_HORIZONTAL);

        // Status Header Row: App Title + Power State Badge ("🔍 ĐANG QUÉT" / "🌿 ECO" / "💤 CHỜ") + Torch Status
        LinearLayout headerRow = new LinearLayout(this);
        headerRow.setOrientation(LinearLayout.HORIZONTAL);
        headerRow.setGravity(Gravity.CENTER_VERTICAL);

        TextView appTitleTv = new TextView(this);
        appTitleTv.setTypeface(Typeface.SANS_SERIF, Typeface.BOLD);
        appTitleTv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        appTitleTv.setTextColor(COLOR_YELLOW);
        appTitleTv.setText("MONEY VISION");

        modelStatusText = new TextView(this);
        modelStatusText.setTypeface(Typeface.SANS_SERIF, Typeface.NORMAL);
        modelStatusText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        modelStatusText.setTextColor(COLOR_YELLOW);
        String modelMb = String.format(Locale.US, "%.2f MB", detectorModule.getModelSizeBytes() / (1024.0 * 1024.0));
        if (detectorModule.isInterpreterReady()) {
            modelStatusText.setText("● YOLO26 TFLITE LIVE (" + modelMb + ")");
        } else if (detectorModule.isModelVerified()) {
            modelStatusText.setText("● YOLO26 TFLITE (" + modelMb + ")");
        } else {
            modelStatusText.setText("● AI SIMULATION MODE");
        }

        powerStateBadgeText = new TextView(this);
        powerStateBadgeText.setTypeface(Typeface.SANS_SERIF, Typeface.BOLD);
        powerStateBadgeText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        powerStateBadgeText.setTextColor(COLOR_GREEN);
        powerStateBadgeText.setPadding(dp(8), dp(3), dp(8), dp(3));
        GradientDrawable powerBadgeBg = new GradientDrawable();
        powerBadgeBg.setColor(Color.parseColor("#121212"));
        powerBadgeBg.setCornerRadius(dp(12));
        powerBadgeBg.setStroke(dp(1), COLOR_GREEN);
        powerStateBadgeText.setBackground(powerBadgeBg);
        powerStateBadgeText.setText(formatPowerStateBadge(powerState));

        torchStatusText = new TextView(this);
        torchStatusText.setTypeface(Typeface.SANS_SERIF, Typeface.BOLD);
        torchStatusText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        torchStatusText.setTextColor(COLOR_WHITE);
        torchStatusText.setVisibility(View.GONE);

        LinearLayout titleCol = new LinearLayout(this);
        titleCol.setOrientation(LinearLayout.HORIZONTAL);
        titleCol.setGravity(Gravity.CENTER_VERTICAL);
        titleCol.addView(appTitleTv, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        LinearLayout.LayoutParams pbLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        pbLp.setMargins(dp(8), 0, 0, 0);
        titleCol.addView(powerStateBadgeText, pbLp);

        simDrawerToggleBtn = new Button(this);
        simDrawerToggleBtn.setText("KIỂM THỬ");
        simDrawerToggleBtn.setAllCaps(false);
        simDrawerToggleBtn.setTypeface(Typeface.SANS_SERIF, Typeface.BOLD);
        simDrawerToggleBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        simDrawerToggleBtn.setTextColor(COLOR_YELLOW);
        GradientDrawable simBtnBg = new GradientDrawable();
        simBtnBg.setColor(COLOR_DARK_CARD);
        simBtnBg.setCornerRadius(dp(8));
        simBtnBg.setStroke(dp(1), COLOR_YELLOW);
        simDrawerToggleBtn.setBackground(simBtnBg);
        simDrawerToggleBtn.setMinimumHeight(dp(MIN_TOUCH_TARGET_DP));
        simDrawerToggleBtn.setMinHeight(dp(MIN_TOUCH_TARGET_DP));
        simDrawerToggleBtn.setContentDescription("Mở hoặc đóng ngăn kéo kiểm thử giả lập");
        simDrawerToggleBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                toggleSimulationDrawer();
            }
        });
        LinearLayout.LayoutParams simBtnLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            dp(MIN_TOUCH_TARGET_DP)
        );
        simDrawerToggleBtn.setPadding(dp(12), 0, dp(12), 0);

        headerRow.addView(titleCol, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        headerRow.addView(simDrawerToggleBtn, simBtnLp);
        canvasContent.addView(headerRow, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        // Fixed Header Author Attribution Bar + Button to open Copyright Dialog (WCAG AAA, >= 48dp button)
        LinearLayout authorHeaderBar = new LinearLayout(this);
        authorHeaderBar.setOrientation(LinearLayout.HORIZONTAL);
        authorHeaderBar.setGravity(Gravity.CENTER_VERTICAL);
        GradientDrawable authorBarBg = new GradientDrawable();
        authorBarBg.setColor(COLOR_DARK_CARD);
        authorBarBg.setCornerRadius(dp(8));
        authorBarBg.setStroke(dp(1), Color.parseColor("#333333"));
        authorHeaderBar.setBackground(authorBarBg);
        authorHeaderBar.setPadding(dp(10), dp(6), dp(10), dp(6));

        TextView authorBannerTv = new TextView(this);
        authorBannerTv.setTypeface(Typeface.SANS_SERIF, Typeface.BOLD);
        authorBannerTv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        authorBannerTv.setTextColor(COLOR_YELLOW);
        authorBannerTv.setText(AUTHOR_BANNER_TEXT);

        Button authorInfoBtn = new Button(this);
        authorInfoBtn.setText("BẢN QUYỀN");
        authorInfoBtn.setAllCaps(false);
        authorInfoBtn.setTypeface(Typeface.SANS_SERIF, Typeface.BOLD);
        authorInfoBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
        authorInfoBtn.setTextColor(COLOR_BLACK);
        GradientDrawable authorBtnBg = new GradientDrawable();
        authorBtnBg.setColor(COLOR_YELLOW);
        authorBtnBg.setCornerRadius(dp(8));
        authorInfoBtn.setBackground(authorBtnBg);
        authorInfoBtn.setPadding(dp(8), dp(2), dp(8), dp(2));
        authorInfoBtn.setMinimumHeight(dp(MIN_TOUCH_TARGET_DP));
        authorInfoBtn.setMinHeight(dp(MIN_TOUCH_TARGET_DP));
        authorInfoBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showAuthorCopyrightDialog();
            }
        });

        authorHeaderBar.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showAuthorCopyrightDialog();
            }
        });

        authorHeaderBar.addView(authorBannerTv, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        LinearLayout.LayoutParams authorBtnLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(MIN_TOUCH_TARGET_DP));
        authorBtnLp.setMargins(dp(6), 0, 0, 0);
        authorHeaderBar.addView(authorInfoBtn, authorBtnLp);

        LinearLayout.LayoutParams authorBarLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        authorBarLp.setMargins(0, dp(6), 0, 0);
        canvasContent.addView(authorHeaderBar, authorBarLp);

        // Spacer
        View topSpacer = new View(this);
        canvasContent.addView(topSpacer, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        // Ticket 10 Pillar 4: Low-Vision Viewfinder Reticle Container around 64sp Hero + Polymer Color Badge
        LinearLayout viewfinderReticleBox = new LinearLayout(this);
        viewfinderReticleBox.setOrientation(LinearLayout.VERTICAL);
        viewfinderReticleBox.setGravity(Gravity.CENTER);
        viewfinderReticleDrawable = new GradientDrawable();
        viewfinderReticleDrawable.setColor(Color.parseColor("#88000000"));
        viewfinderReticleDrawable.setCornerRadius(dp(12));
        viewfinderReticleDrawable.setStroke(dp(3), Color.parseColor("#444444"));
        viewfinderReticleBox.setBackground(viewfinderReticleDrawable);
        viewfinderReticleBox.setPadding(dp(14), dp(14), dp(14), dp(14));

        // Headline Note Count ("CHƯA CÓ TIỀN" / "1 TỜ" / "3 TỜ")
        headlineCountText = new TextView(this);
        headlineCountText.setTypeface(Typeface.SANS_SERIF, Typeface.BOLD);
        headlineCountText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 26);
        headlineCountText.setTextColor(COLOR_WHITE);
        headlineCountText.setGravity(Gravity.CENTER);
        headlineCountText.setText("CHƯA CÓ TIỀN");
        viewfinderReticleBox.addView(headlineCountText);

        // Hero Denomination Display (64sp WCAG AAA Solar Yellow for Low-Vision Users)
        heroAmountText = new TextView(this);
        heroAmountText.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        heroAmountText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 64);
        heroAmountText.setTextColor(COLOR_YELLOW);
        heroAmountText.setGravity(Gravity.CENTER);
        heroAmountText.setPadding(0, dp(4), 0, dp(4));
        heroAmountText.setText("0 đ");
        viewfinderReticleBox.addView(heroAmountText);

        // Polymer / Cotton Denomination Color Badge (9 Vietnamese Banknote Colors)
        polymerColorBadgeText = new TextView(this);
        polymerColorBadgeText.setTypeface(Typeface.SANS_SERIF, Typeface.BOLD);
        polymerColorBadgeText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        polymerColorBadgeText.setGravity(Gravity.CENTER);
        polymerColorBadgeText.setPadding(dp(12), dp(4), dp(12), dp(4));
        polymerBadgeDrawable = new GradientDrawable();
        polymerBadgeDrawable.setCornerRadius(dp(99));
        polymerBadgeDrawable.setColor(Color.parseColor("#00E5FF"));
        polymerBadgeDrawable.setStroke(dp(2), COLOR_WHITE);
        polymerColorBadgeText.setBackground(polymerBadgeDrawable);
        polymerColorBadgeText.setVisibility(View.GONE);
        viewfinderReticleBox.addView(polymerColorBadgeText);

        // Spoken Vietnamese Announcement Banner
        spokenSubtitleText = new TextView(this);
        spokenSubtitleText.setTypeface(Typeface.SANS_SERIF, Typeface.NORMAL);
        spokenSubtitleText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        spokenSubtitleText.setTextColor(COLOR_WHITE);
        spokenSubtitleText.setGravity(Gravity.CENTER);
        spokenSubtitleText.setPadding(dp(8), dp(6), dp(8), dp(4));
        spokenSubtitleText.setText("Đưa tờ tiền vào trước camera hoặc chạm màn hình để nghe giọng đọc.");
        viewfinderReticleBox.addView(spokenSubtitleText);

        canvasContent.addView(viewfinderReticleBox, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        // Spacer
        View bottomSpacer = new View(this);
        canvasContent.addView(bottomSpacer, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        // Session Wallet Row (Bottom Action Dock): [ ĐÈN PIN ] (90dp) + [ VÍ TÍCH LŨY ] (Flex 1) + [ XÓA VÍ ] (80dp) >= 48dp
        LinearLayout walletRow = new LinearLayout(this);
        walletRow.setOrientation(LinearLayout.HORIZONTAL);
        walletRow.setGravity(Gravity.CENTER_VERTICAL);

        directTorchBtn = new Button(this);
        directTorchBtn.setText("ĐÈN PIN: TẮT");
        directTorchBtn.setAllCaps(false);
        directTorchBtn.setTypeface(Typeface.SANS_SERIF, Typeface.BOLD);
        directTorchBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        directTorchBtn.setTextColor(COLOR_YELLOW);
        GradientDrawable torchBtnBg = new GradientDrawable();
        torchBtnBg.setColor(COLOR_DARK_CARD);
        torchBtnBg.setCornerRadius(dp(12));
        torchBtnBg.setStroke(dp(1), Color.parseColor("#444444"));
        directTorchBtn.setBackground(torchBtnBg);
        directTorchBtn.setMinimumHeight(dp(MIN_TOUCH_TARGET_DP));
        directTorchBtn.setMinHeight(dp(MIN_TOUCH_TARGET_DP));
        directTorchBtn.setContentDescription("Nút bật tắt đèn pin");
        directTorchBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                onDoubleTapGesture();
            }
        });
        LinearLayout.LayoutParams torchBtnLp = new LinearLayout.LayoutParams(
            dp(90),
            dp(MIN_TOUCH_TARGET_DP)
        );
        torchBtnLp.setMargins(0, 0, dp(8), 0);
        walletRow.addView(directTorchBtn, torchBtnLp);

        LinearLayout walletCard = new LinearLayout(this);
        walletCard.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable walletBg = new GradientDrawable();
        walletBg.setColor(COLOR_DARK_CARD);
        walletBg.setCornerRadius(dp(12));
        walletBg.setStroke(dp(1), COLOR_YELLOW);
        walletCard.setBackground(walletBg);
        walletCard.setPadding(dp(12), dp(10), dp(12), dp(10));
        walletCard.setMinimumHeight(dp(MIN_TOUCH_TARGET_DP));
        walletCard.setClickable(true);
        walletCard.setFocusable(true);
        walletCard.setContentDescription("VÍ TÍCH LŨY. Chạm để nghe đọc tổng ví tích lũy trong phiên.");
        walletCard.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                onLongPressGesture();
            }
        });

        walletSummaryText = new TextView(this);
        walletSummaryText.setTypeface(Typeface.SANS_SERIF, Typeface.BOLD);
        walletSummaryText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        walletSummaryText.setTextColor(COLOR_YELLOW);
        walletSummaryText.setGravity(Gravity.CENTER);
        walletSummaryText.setText("VÍ TÍCH LŨY: 0 đ (0 tờ)");
        walletCard.addView(walletSummaryText);

        gestureBadgeText = new TextView(this);
        gestureBadgeText.setTypeface(Typeface.SANS_SERIF, Typeface.NORMAL);
        gestureBadgeText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        gestureBadgeText.setTextColor(COLOR_WHITE);
        gestureBadgeText.setGravity(Gravity.CENTER);
        gestureBadgeText.setPadding(0, dp(4), 0, 0);
        gestureBadgeText.setText("");
        gestureBadgeText.setVisibility(View.GONE);
        walletCard.addView(gestureBadgeText);

        LinearLayout.LayoutParams walletCardLp = new LinearLayout.LayoutParams(
            0,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            1f
        );
        walletCardLp.setMargins(0, 0, dp(8), 0);
        walletRow.addView(walletCard, walletCardLp);

        directWalletResetBtn = new Button(this);
        directWalletResetBtn.setText("XÓA VÍ");
        directWalletResetBtn.setAllCaps(false);
        directWalletResetBtn.setTypeface(Typeface.SANS_SERIF, Typeface.BOLD);
        directWalletResetBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        directWalletResetBtn.setTextColor(COLOR_RED);
        GradientDrawable resetWalletBg = new GradientDrawable();
        resetWalletBg.setColor(Color.parseColor("#1F0B0B"));
        resetWalletBg.setCornerRadius(dp(12));
        resetWalletBg.setStroke(dp(1), COLOR_RED);
        directWalletResetBtn.setBackground(resetWalletBg);
        directWalletResetBtn.setMinimumHeight(dp(MIN_TOUCH_TARGET_DP));
        directWalletResetBtn.setMinHeight(dp(MIN_TOUCH_TARGET_DP));
        directWalletResetBtn.setMinimumWidth(dp(76));
        directWalletResetBtn.setContentDescription("XÓA VÍ: Đặt lại ví tích lũy về 0 đồng");
        directWalletResetBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                onTwoFingerDoubleTapGesture();
            }
        });
        LinearLayout.LayoutParams resetBtnLp = new LinearLayout.LayoutParams(
            dp(80),
            dp(MIN_TOUCH_TARGET_DP)
        );
        walletRow.addView(directWalletResetBtn, resetBtnLp);

        canvasContent.addView(walletRow, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        rootPulseContainer.addView(canvasContent, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // Attach Fullscreen Multi-Touch Gesture Recognizer + TalkBack AccessibilityDelegate to rootPulseContainer
        setupGestureCanvas(rootPulseContainer);

        mainColumn.addView(rootPulseContainer, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f
        ));

        // 4. Collapsible Bottom Interactive Banknote & Gesture Control Drawer (Hidden by default on launch: View.GONE)
        controlsPanel = buildControlsPanel();
        controlsPanel.setVisibility(View.GONE);
        mainColumn.addView(controlsPanel, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        masterRoot.addView(mainColumn, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
        ));

        setContentView(masterRoot);
    }

    private LinearLayout buildControlsPanel() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setBackgroundColor(Color.parseColor("#0A0A0A"));
        panel.setPadding(dp(8), dp(6), dp(8), dp(8));

        TextView title = new TextView(this);
        title.setTypeface(Typeface.SANS_SERIF, Typeface.BOLD);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        title.setTextColor(COLOR_YELLOW);
        title.setText("BẢNG ĐIỀU KHIỂN & KIỂM THỬ ÂM THANH TIẾNG VIỆT (100% OFFLINE):");
        title.setPadding(dp(4), 0, dp(4), dp(4));
        panel.addView(title);

        // Row 1: All 9 Denominations + Multi + Empty
        HorizontalScrollView scroll1 = new HorizontalScrollView(this);
        scroll1.setHorizontalScrollBarEnabled(false);
        LinearLayout row1 = new LinearLayout(this);
        row1.setOrientation(LinearLayout.HORIZONTAL);

        final long[] denoms = new long[]{1000L, 2000L, 5000L, 10000L, 20000L, 50000L, 100000L, 200000L, 500000L};
        final String[] labels = new String[]{"1K", "2K", "5K", "10K", "20K", "50K", "100K", "200K", "500K"};

        for (int i = 0; i < denoms.length; i++) {
            final long d = denoms[i];
            Button btn = createTactileButton(labels[i], true);
            btn.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    manualHoldUntilMs = System.currentTimeMillis() + 8000L;
                    detectorModule.reset();
                    Map<Long, Integer> map = new LinkedHashMap<Long, Integer>();
                    map.put(d, 1);
                    applyDetectionUpdate(map);
                }
            });
            row1.addView(btn);
        }

        Button multiBtn = createTactileButton("2x100K + 1x50K", true);
        multiBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                manualHoldUntilMs = System.currentTimeMillis() + 8000L;
                detectorModule.reset();
                Map<Long, Integer> map = new LinkedHashMap<Long, Integer>();
                map.put(100000L, 2);
                map.put(50000L, 1);
                applyDetectionUpdate(map);
            }
        });
        row1.addView(multiBtn);

        Button emptyBtn = createTactileButton("RÚT TIỀN (TRỐNG)", false);
        emptyBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                manualHoldUntilMs = 0L;
                detectorModule.reset();
                applyDetectionUpdate(new LinkedHashMap<Long, Integer>());
            }
        });
        row1.addView(emptyBtn);

        scroll1.addView(row1);
        panel.addView(scroll1);

        // Row 2: Quick Action Gesture Buttons + Author & Copyright Modal Button
        HorizontalScrollView scroll2 = new HorizontalScrollView(this);
        scroll2.setHorizontalScrollBarEnabled(false);
        LinearLayout row2 = new LinearLayout(this);
        row2.setOrientation(LinearLayout.HORIZONTAL);
        row2.setPadding(0, dp(4), 0, 0);

        Button authorModalBtn = createTactileButton("Thông tin Bản quyền & Tác giả", true);
        authorModalBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { showAuthorCopyrightDialog(); }
        });
        row2.addView(authorModalBtn);

        Button tapBtn = createTactileButton("1 Chạm (Đọc lại)", false);
        tapBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { onSingleTapGesture(); }
        });
        row2.addView(tapBtn);

        Button torchBtn = createTactileButton("2 Chạm (Đèn pin)", false);
        torchBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { onDoubleTapGesture(); }
        });
        row2.addView(torchBtn);

        Button walletBtn = createTactileButton("Giữ 1s (Đọc ví)", false);
        walletBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { onLongPressGesture(); }
        });
        row2.addView(walletBtn);

        Button resetBtn = createTactileButton("2 Ngón x2 (Xóa ví)", false);
        resetBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { onTwoFingerDoubleTapGesture(); }
        });
        row2.addView(resetBtn);

        scroll2.addView(row2);
        panel.addView(scroll2);

        return panel;
    }

    private Button createTactileButton(String text, boolean primary) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setTypeface(Typeface.SANS_SERIF, Typeface.BOLD);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        b.setTextColor(primary ? COLOR_BLACK : COLOR_YELLOW);

        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(8));
        bg.setColor(primary ? COLOR_YELLOW : Color.parseColor("#1A1A1A"));
        bg.setStroke(dp(1), COLOR_YELLOW);
        b.setBackground(bg);

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, dp(MIN_TOUCH_TARGET_DP)
        );
        lp.setMargins(dp(3), dp(2), dp(3), dp(2));
        b.setLayoutParams(lp);
        b.setMinimumHeight(dp(MIN_TOUCH_TARGET_DP));
        b.setMinHeight(dp(MIN_TOUCH_TARGET_DP));
        b.setPadding(dp(12), 0, dp(12), 0);
        return b;
    }

    private boolean isPointerInsideSafeZone(float x, float y, int width, int height) {
        int marginPx = dp(EDGE_PALM_REJECTION_DP);
        if (width <= marginPx * 2 || height <= marginPx * 2) return true;
        return x >= marginPx && x <= (width - marginPx) && y >= marginPx && y <= (height - marginPx);
    }

    private int countInteriorPointers(MotionEvent event, View v) {
        int count = 0;
        int total = event.getPointerCount();
        int w = v.getWidth();
        int h = v.getHeight();
        for (int i = 0; i < total; i++) {
            if (isPointerInsideSafeZone(event.getX(i), event.getY(i), w, h)) {
                count++;
            }
        }
        return count;
    }

    private int getFirstInteriorPointerIndex(MotionEvent event, View v) {
        int total = event.getPointerCount();
        int w = v.getWidth();
        int h = v.getHeight();
        for (int i = 0; i < total; i++) {
            if (isPointerInsideSafeZone(event.getX(i), event.getY(i), w, h)) {
                return i;
            }
        }
        return -1;
    }

    private void setupGestureCanvas(View canvas) {
        // Ticket 10 Pillar 2: Google TalkBack AccessibilityDelegate + Custom AccessibilityActions
        canvas.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);
        canvas.setContentDescription(
            "Mặt cảm ứng MoneyVision. Chạm đúp để nghe đọc lại mệnh giá. Giữ hoặc dùng trình đơn Hành động TalkBack để bật đèn, đọc ví hoặc xóa ví."
        );
        canvas.setAccessibilityDelegate(new View.AccessibilityDelegate() {
            @Override
            public void onInitializeAccessibilityNodeInfo(View host, AccessibilityNodeInfo info) {
                super.onInitializeAccessibilityNodeInfo(host, info);
                info.setClickable(true);
                info.setLongClickable(true);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    info.addAction(new AccessibilityNodeInfo.AccessibilityAction(
                        AccessibilityNodeInfo.ACTION_CLICK,
                        "Đọc lại mệnh giá"
                    ));
                    info.addAction(new AccessibilityNodeInfo.AccessibilityAction(
                        AccessibilityNodeInfo.ACTION_LONG_CLICK,
                        "Đọc tổng ví tích lũy"
                    ));
                    info.addAction(new AccessibilityNodeInfo.AccessibilityAction(
                        A11Y_ACTION_REREAD,
                        "Đọc lại mệnh giá (1 chạm)"
                    ));
                    info.addAction(new AccessibilityNodeInfo.AccessibilityAction(
                        A11Y_ACTION_TOGGLE_TORCH,
                        "Bật hoặc tắt đèn pin (2 chạm)"
                    ));
                    info.addAction(new AccessibilityNodeInfo.AccessibilityAction(
                        A11Y_ACTION_READ_WALLET,
                        "Đọc tổng ví tích lũy (Giữ 1 giây)"
                    ));
                    info.addAction(new AccessibilityNodeInfo.AccessibilityAction(
                        A11Y_ACTION_RESET_WALLET,
                        "Xóa ví tích lũy về 0 đồng (2 ngón chạm đúp)"
                    ));
                }
            }

            @Override
            public boolean performAccessibilityAction(View host, int action, Bundle args) {
                if (action == AccessibilityNodeInfo.ACTION_CLICK || action == A11Y_ACTION_REREAD) {
                    onSingleTapGesture();
                    return true;
                }
                if (action == AccessibilityNodeInfo.ACTION_LONG_CLICK || action == A11Y_ACTION_READ_WALLET) {
                    onLongPressGesture();
                    return true;
                }
                if (action == A11Y_ACTION_TOGGLE_TORCH) {
                    onDoubleTapGesture();
                    return true;
                }
                if (action == A11Y_ACTION_RESET_WALLET) {
                    onTwoFingerDoubleTapGesture();
                    return true;
                }
                return super.performAccessibilityAction(host, action, args);
            }
        });

        // Ticket 10 Pillar 2: TalkBack Explore-by-Touch Hover Listener (1s hover hold -> read wallet)
        canvas.setOnHoverListener(new View.OnHoverListener() {
            @Override
            public boolean onHover(View v, MotionEvent event) {
                int action = event.getActionMasked();
                long now = System.currentTimeMillis();
                float hx = event.getX();
                float hy = event.getY();
                boolean inSafeZone = isPointerInsideSafeZone(hx, hy, v.getWidth(), v.getHeight());
                if (action == MotionEvent.ACTION_HOVER_ENTER) {
                    wakeUpToBurst("TOUCH_INTERACTION", now);
                    hoverLongPressFired = false;
                    if (hoverLongPressRunnable != null) {
                        mainHandler.removeCallbacks(hoverLongPressRunnable);
                    }
                    if (!inSafeZone) {
                        return false;
                    }
                    hoverStartX = hx;
                    hoverStartY = hy;
                    hoverLongPressRunnable = new Runnable() {
                        @Override
                        public void run() {
                            hoverLongPressFired = true;
                            onLongPressGesture();
                        }
                    };
                    mainHandler.postDelayed(hoverLongPressRunnable, 1000L);
                    return false;
                } else if (action == MotionEvent.ACTION_HOVER_MOVE) {
                    if (!inSafeZone) {
                        if (hoverLongPressRunnable != null) {
                            mainHandler.removeCallbacks(hoverLongPressRunnable);
                        }
                        return false;
                    }
                    float dx = hx - hoverStartX;
                    float dy = hy - hoverStartY;
                    float dist = (float) Math.sqrt(dx * dx + dy * dy);
                    if (dist > dp(35) && !hoverLongPressFired) {
                        hoverStartX = hx;
                        hoverStartY = hy;
                        if (hoverLongPressRunnable != null) {
                            mainHandler.removeCallbacks(hoverLongPressRunnable);
                            mainHandler.postDelayed(hoverLongPressRunnable, 1000L);
                        }
                    }
                    return false;
                } else if (action == MotionEvent.ACTION_HOVER_EXIT) {
                    if (hoverLongPressRunnable != null) {
                        mainHandler.removeCallbacks(hoverLongPressRunnable);
                    }
                    return false;
                }
                return false;
            }
        });

        // Ticket 10 Pillar 1: Per-Pointer 16dp Edge Palm-Rejection Multi-Touch Recognizer
        canvas.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View v, MotionEvent event) {
                int action = event.getActionMasked();
                int interiorCount = countInteriorPointers(event, v);
                int firstInteriorIdx = getFirstInteriorPointerIndex(event, v);
                long now = System.currentTimeMillis();

                if (action == MotionEvent.ACTION_DOWN) {
                    wakeUpToBurst("TOUCH_INTERACTION", now);
                    if (interiorCount == 0) {
                        // Thumb resting on 16dp bezel: wait for an interior finger on ACTION_POINTER_DOWN
                        maxPointersInTouch = 0;
                        longPressFired = false;
                        return true;
                    }
                    touchStartMs = now;
                    touchStartX = event.getX(firstInteriorIdx);
                    touchStartY = event.getY(firstInteriorIdx);
                    maxPointersInTouch = interiorCount;
                    maxMoveDistancePx = 0f;
                    longPressFired = false;

                    if (singleTapRunnable != null) {
                        mainHandler.removeCallbacks(singleTapRunnable);
                    }
                    longPressRunnable = new Runnable() {
                        @Override
                        public void run() {
                            if (maxPointersInTouch == 1 && maxMoveDistancePx < dp(30)) {
                                longPressFired = true;
                                lastTwoFingerTapMs = 0L;
                                onLongPressGesture();
                            }
                        }
                    };
                    mainHandler.postDelayed(longPressRunnable, 1000L);
                    return true;
                } else if (action == MotionEvent.ACTION_POINTER_DOWN) {
                    if (interiorCount == 0) {
                        return true;
                    }
                    if (maxPointersInTouch == 0 && firstInteriorIdx >= 0) {
                        // First interior pointer arrived while another finger/palm rested on the 16dp edge
                        touchStartMs = now;
                        touchStartX = event.getX(firstInteriorIdx);
                        touchStartY = event.getY(firstInteriorIdx);
                        maxPointersInTouch = interiorCount;
                        maxMoveDistancePx = 0f;
                        longPressFired = false;
                        if (singleTapRunnable != null) {
                            mainHandler.removeCallbacks(singleTapRunnable);
                        }
                        if (interiorCount == 1) {
                            longPressRunnable = new Runnable() {
                                @Override
                                public void run() {
                                    if (maxPointersInTouch == 1 && maxMoveDistancePx < dp(30)) {
                                        longPressFired = true;
                                        lastTwoFingerTapMs = 0L;
                                        onLongPressGesture();
                                    }
                                }
                            };
                            mainHandler.postDelayed(longPressRunnable, 1000L);
                        }
                        return true;
                    }
                    if (interiorCount > maxPointersInTouch) {
                        maxPointersInTouch = interiorCount;
                    }
                    if (maxPointersInTouch >= 2 && longPressRunnable != null) {
                        mainHandler.removeCallbacks(longPressRunnable);
                    }
                    return true;
                } else if (action == MotionEvent.ACTION_MOVE) {
                    if (maxPointersInTouch == 0) {
                        return true;
                    }
                    if (firstInteriorIdx < 0) {
                        // Active interior touch slid into the 16dp edge zone: invalidate tap/long-press
                        maxMoveDistancePx = dp(100);
                        if (longPressRunnable != null) {
                            mainHandler.removeCallbacks(longPressRunnable);
                        }
                        return true;
                    }
                    float dx = event.getX(firstInteriorIdx) - touchStartX;
                    float dy = event.getY(firstInteriorIdx) - touchStartY;
                    float dist = (float) Math.sqrt(dx * dx + dy * dy);
                    if (dist > maxMoveDistancePx) {
                        maxMoveDistancePx = dist;
                    }
                    if (maxMoveDistancePx > dp(35) && longPressRunnable != null) {
                        mainHandler.removeCallbacks(longPressRunnable);
                    }
                    return true;
                } else if (action == MotionEvent.ACTION_POINTER_UP || action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) {
                    if (action == MotionEvent.ACTION_POINTER_UP) {
                        // Check if all interior pointers have now been lifted while a bezel thumb remains down
                        int actionIdx = event.getActionIndex();
                        int remainingInterior = 0;
                        int total = event.getPointerCount();
                        int w = v.getWidth();
                        int h = v.getHeight();
                        for (int i = 0; i < total; i++) {
                            if (i == actionIdx) continue;
                            if (isPointerInsideSafeZone(event.getX(i), event.getY(i), w, h)) {
                                remainingInterior++;
                            }
                        }
                        if (remainingInterior > 0 || maxPointersInTouch == 0) {
                            return true;
                        }
                    }

                    if (longPressRunnable != null) {
                        mainHandler.removeCallbacks(longPressRunnable);
                    }
                    if (action == MotionEvent.ACTION_CANCEL || longPressFired || maxMoveDistancePx > dp(35) || maxPointersInTouch == 0) {
                        maxPointersInTouch = 0;
                        return true;
                    }
                    long duration = now - touchStartMs;
                    int gesturePointers = maxPointersInTouch;
                    maxPointersInTouch = 0;
                    if (duration > 500L) {
                        return true;
                    }

                    if (gesturePointers >= 2) {
                        if (now - lastTwoFingerTapMs <= 450L) {
                            lastTwoFingerTapMs = 0L;
                            onTwoFingerDoubleTapGesture();
                        } else {
                            lastTwoFingerTapMs = now;
                        }
                    } else if (gesturePointers == 1) {
                        lastTwoFingerTapMs = 0L;
                        if (now - lastSingleTapMs <= 300L) {
                            lastSingleTapMs = 0L;
                            if (singleTapRunnable != null) {
                                mainHandler.removeCallbacks(singleTapRunnable);
                            }
                            onDoubleTapGesture();
                        } else {
                            lastSingleTapMs = now;
                            singleTapRunnable = new Runnable() {
                                @Override
                                public void run() {
                                    lastSingleTapMs = 0L;
                                    onSingleTapGesture();
                                }
                            };
                            mainHandler.postDelayed(singleTapRunnable, 300L);
                        }
                    }
                    return true;
                }
                return true;
            }
        });
    }

    private void vibratePattern(long[] pattern) {
        if (vibrator == null || !vibrator.hasVibrator()) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1));
            } else {
                vibrator.vibrate(pattern, -1);
            }
        } catch (Exception ignored) {}
    }

    /**
     * Ticket 10 Pillar 3: Spatial Guidance "Giữ Yên Tay" 25ms light tactile pulse (rate-limited to 1200ms).
     */
    private void triggerCandidateGuidancePulse(long now) {
        if (now - lastCandidateGuidancePulseMs < CANDIDATE_GUIDANCE_COOLDOWN_MS) {
            return;
        }
        lastCandidateGuidancePulseMs = now;
        vibratePattern(new long[]{0, CANDIDATE_GUIDANCE_PULSE_MS});
    }

    /**
     * Ticket 10 Pillar 3: 9-Denomination Tactile Vibration Coding
     * - Cotton small notes (1k, 2k, 5k): 1, 2, 3 short pulses (35ms)
     * - Polymer medium notes (10k, 20k, 50k): 1, 2, 3 medium pulses (70ms)
     * - Polymer high notes (100k, 200k, 500k): 1 short lead + 1, 2, 3 long heavy pulses (120ms-140ms)
     */
    public static long[] getDenominationVibrationPattern(long denom) {
        if (denom == 1000L) return new long[]{0, 35};
        if (denom == 2000L) return new long[]{0, 35, 45, 35};
        if (denom == 5000L) return new long[]{0, 35, 45, 35, 45, 35};
        if (denom == 10000L) return new long[]{0, 70};
        if (denom == 20000L) return new long[]{0, 70, 55, 70};
        if (denom == 50000L) return new long[]{0, 70, 55, 70, 55, 70};
        if (denom == 100000L) return new long[]{0, 40, 45, 120};
        if (denom == 200000L) return new long[]{0, 40, 45, 120, 60, 120};
        if (denom == 500000L) return new long[]{0, 40, 45, 120, 60, 120, 60, 140};
        return new long[]{0, 60, 50, 90};
    }

    private String getDenominationColorHex(long denom) {
        if (denom == 500000L) return "#00E5FF";
        if (denom == 200000L) return "#FF6D00";
        if (denom == 100000L) return "#00E676";
        if (denom == 50000L) return "#FF4081";
        if (denom == 20000L) return "#40C4FF";
        if (denom == 10000L) return "#FFD740";
        if (denom == 5000L) return "#80D8FF";
        if (denom == 2000L) return "#E0E0E0";
        if (denom == 1000L) return "#FFF59D";
        return "#FFE600";
    }

    private String getDenominationBadgeLabel(long denom) {
        if (denom == 500000L) return "● XANH LƠ TÍM (CYAN) • POLYMER";
        if (denom == 200000L) return "● ĐỎ CAM (ORANGE-RED) • POLYMER";
        if (denom == 100000L) return "● XANH LÁ CÂY (GREEN) • POLYMER";
        if (denom == 50000L) return "● HỒNG ĐỎ TÍM (MAGENTA) • POLYMER";
        if (denom == 20000L) return "● XANH DƯƠNG ĐẬM (BLUE) • POLYMER";
        if (denom == 10000L) return "● VÀNG NÂU (GOLD) • POLYMER";
        if (denom == 5000L) return "● XANH LƠ NHẠT • COTTON";
        if (denom == 2000L) return "● XÁM TRẮNG • COTTON";
        if (denom == 1000L) return "● VÀNG NHẠT • COTTON";
        return "";
    }

    private String computeSignature(Map<Long, Integer> notes) {
        if (notes == null || notes.isEmpty()) return "EMPTY";
        List<Long> keys = new ArrayList<Long>(notes.keySet());
        Collections.sort(keys);
        StringBuilder sb = new StringBuilder();
        for (Long k : keys) {
            int c = notes.get(k);
            if (c > 0) {
                if (sb.length() > 0) sb.append("|");
                sb.append(k).append(":").append(c);
            }
        }
        return sb.length() == 0 ? "EMPTY" : sb.toString();
    }

    private String denomToClip(long denom) {
        if (denom == 1000L) return "vnd_1k";
        if (denom == 2000L) return "vnd_2k";
        if (denom == 5000L) return "vnd_5k";
        if (denom == 10000L) return "vnd_10k";
        if (denom == 20000L) return "vnd_20k";
        if (denom == 50000L) return "vnd_50k";
        if (denom == 100000L) return "vnd_100k";
        if (denom == 200000L) return "vnd_200k";
        if (denom == 500000L) return "vnd_500k";
        return "vnd_1k";
    }

    private List<String> buildSpeechClips(Map<Long, Integer> notes) {
        List<String> clips = new ArrayList<String>();
        if (notes == null || notes.isEmpty()) return clips;

        List<Long> sorted = new ArrayList<Long>(notes.keySet());
        Collections.sort(sorted, Collections.reverseOrder());

        int totalNotes = 0;
        for (Long d : sorted) {
            totalNotes += notes.get(d);
        }
        if (totalNotes <= 0) return clips;

        if (sorted.size() == 1 && totalNotes == 1) {
            clips.add(denomToClip(sorted.get(0)));
            return clips;
        }

        for (Long d : sorted) {
            int count = notes.get(d);
            if (count <= 0) continue;
            int clamped = Math.min(10, count);
            clips.add("qty_" + clamped);
            clips.add(denomToClip(d));
        }
        return clips;
    }

    private String buildSpokenSummary(Map<Long, Integer> notes) {
        List<String> clips = buildSpeechClips(notes);
        if (clips.isEmpty()) return "Không có tiền trong tầm quét";
        StringBuilder sb = new StringBuilder();
        for (String c : clips) {
            String w = MoneyAudioModule.CLIP_LABELS.get(c);
            if (w != null) {
                if (sb.length() > 0) sb.append(" ");
                sb.append(w);
            }
        }
        return sb.toString();
    }

    private String formatCurrency(long amount) {
        NumberFormat nf = NumberFormat.getInstance(new Locale("vi", "VN"));
        return nf.format(amount) + " đ";
    }

    private void rebuildWalletFromBaselineAndCredited() {
        walletNotes.clear();
        walletTotalAmount = 0L;
        walletNotesCount = 0;
        for (long denom : MoneyDetectorModule.SORTED_DENOMINATIONS) {
            int bCount = walletBaselineNotes.containsKey(denom) ? walletBaselineNotes.get(denom) : 0;
            int cCount = presentationCreditedNotes.containsKey(denom) ? presentationCreditedNotes.get(denom) : 0;
            int total = bCount + cCount;
            if (total > 0) {
                walletNotes.put(denom, total);
                walletTotalAmount += denom * total;
                walletNotesCount += total;
            }
        }
        presentationMaxCounts.clear();
        presentationMaxCounts.putAll(presentationCreditedNotes);
    }

    private void applyDetectionUpdate(Map<Long, Integer> newNotes) {
        long now = System.currentTimeMillis();
        String newSig = computeSignature(newNotes);
        boolean hasMoney = !"EMPTY".equals(newSig);

        if (!hasMoney) {
            if (!wasPresentationEmpty) {
                lastPresentationCreditedNotes.clear();
                lastPresentationCreditedNotes.putAll(presentationCreditedNotes);
                lastPresentationPeakTotalNotes = presentationPeakTotalNotes;
                lastEmptyTimestampMs = now;

                for (Map.Entry<Long, Integer> e : presentationCreditedNotes.entrySet()) {
                    long denom = e.getKey();
                    int count = e.getValue();
                    if (count > 0) {
                        int bPrev = walletBaselineNotes.containsKey(denom) ? walletBaselineNotes.get(denom) : 0;
                        walletBaselineNotes.put(denom, bPrev + count);
                    }
                }
                presentationCreditedNotes.clear();
                presentationPeakTotalNotes = 0;
                lastActiveNotes.clear();
                wasPresentationEmpty = true;
                rebuildWalletFromBaselineAndCredited();
            }

            if (emptySinceTimestampMs == 0L) {
                emptySinceTimestampMs = now;
            } else if (now - emptySinceTimestampMs >= PRESENTATION_EMPTY_RESET_MS) {
                presentationMaxCounts.clear();
                presentationPeakAnnouncedCounts.clear();
                if (now - lastEmptyTimestampMs >= PRESENTATION_CONTINUITY_GRACE_MS) {
                    lastPresentationCreditedNotes.clear();
                    lastPresentationPeakTotalNotes = 0;
                }
            }
            pendingSig = null;
            pendingNotes = null;
            currentNotes.clear();
            currentTotalAmount = 0L;
            currentNotesCount = 0;
            currentlyAnnouncingNotesCount = 0;
            lastAnnouncedSig = "EMPTY";

            updateDisplayUI("Không có tiền trong tầm quét", null);
            if (!isReadingWallet) {
                audioModule.stop();
                vibratePattern(new long[]{0, 50});
                audioModule.playClip("empty", null);
            }
            return;
        }

        int newTotalNotes = 0;
        for (Map.Entry<Long, Integer> entry : newNotes.entrySet()) {
            newTotalNotes += entry.getValue();
        }

        // Ticket 13: Multi-Note Presentation Wallet Accumulator Reconciliation
        if (wasPresentationEmpty) {
            long emptyGapMs = Math.max(0L, now - lastEmptyTimestampMs);
            boolean sharesDenomination = false;
            boolean isSubsetOfLastCredited = true;

            for (Map.Entry<Long, Integer> entry : newNotes.entrySet()) {
                long denom = entry.getKey();
                int count = entry.getValue();
                int lastCredited = lastPresentationCreditedNotes.containsKey(denom)
                    ? lastPresentationCreditedNotes.get(denom)
                    : 0;
                if (lastCredited > 0) {
                    sharesDenomination = true;
                }
                if (count > lastCredited) {
                    isSubsetOfLastCredited = false;
                }
            }

            boolean isMultiNoteDropoutExpansion =
                lastPresentationPeakTotalNotes > 0 &&
                emptyGapMs < PRESENTATION_CONTINUITY_GRACE_MS &&
                newTotalNotes > lastPresentationPeakTotalNotes &&
                sharesDenomination;

            boolean isBriefSameNoteFlicker =
                lastPresentationPeakTotalNotes > 0 &&
                emptyGapMs < PRESENTATION_EMPTY_RESET_MS &&
                sharesDenomination &&
                isSubsetOfLastCredited;

            if (isMultiNoteDropoutExpansion || isBriefSameNoteFlicker) {
                for (Map.Entry<Long, Integer> e : lastPresentationCreditedNotes.entrySet()) {
                    long denom = e.getKey();
                    int count = e.getValue();
                    int base = walletBaselineNotes.containsKey(denom) ? walletBaselineNotes.get(denom) : 0;
                    int remaining = Math.max(0, base - count);
                    if (remaining > 0) {
                        walletBaselineNotes.put(denom, remaining);
                    } else {
                        walletBaselineNotes.remove(denom);
                    }
                }
                presentationCreditedNotes.clear();
                presentationCreditedNotes.putAll(lastPresentationCreditedNotes);
                presentationPeakTotalNotes = lastPresentationPeakTotalNotes;
                wasPresentationEmpty = false;
            } else {
                wasPresentationEmpty = false;
                presentationCreditedNotes.clear();
                presentationCreditedNotes.putAll(newNotes);
                presentationPeakTotalNotes = newTotalNotes;
                presentationPeakAnnouncedCounts.clear();
                lastActiveNotes.clear();
                lastActiveNotes.putAll(newNotes);
                lastActiveTimestampMs = now;
                emptySinceTimestampMs = 0L;
                rebuildWalletFromBaselineAndCredited();
            }
        }

        if (!wasPresentationEmpty && lastActiveTimestampMs != now) {
            int creditedTotalNotes = 0;
            for (Integer c : presentationCreditedNotes.values()) {
                creditedTotalNotes += c;
            }
            int lastActiveTotalNotes = 0;
            for (Integer c : lastActiveNotes.values()) {
                lastActiveTotalNotes += c;
            }

            boolean isSubsetOrEqual = true;
            for (Map.Entry<Long, Integer> entry : newNotes.entrySet()) {
                int prevCredited = presentationCreditedNotes.containsKey(entry.getKey())
                    ? presentationCreditedNotes.get(entry.getKey())
                    : 0;
                if (entry.getValue() > prevCredited) {
                    isSubsetOrEqual = false;
                    break;
                }
            }

            if (isSubsetOrEqual) {
                // Case 2A: Subset / equal occlusion flicker -> no change to presentationCreditedNotes
            } else if (
                newTotalNotes == creditedTotalNotes &&
                newTotalNotes >= 2 &&
                lastActiveTotalNotes == newTotalNotes &&
                Math.max(0L, now - lastActiveTimestampMs) <= DENOMINATION_REFINEMENT_WINDOW_MS
            ) {
                // Case 2B: Simultaneous same-count multi-note denomination refinement in place
                presentationCreditedNotes.clear();
                presentationCreditedNotes.putAll(newNotes);
            } else {
                // Case 2C: General expansion / addition (per-denomination high-water mark)
                for (Map.Entry<Long, Integer> entry : newNotes.entrySet()) {
                    long denom = entry.getKey();
                    int nextCount = entry.getValue();
                    int prevCredited = presentationCreditedNotes.containsKey(denom)
                        ? presentationCreditedNotes.get(denom)
                        : 0;
                    if (nextCount > prevCredited) {
                        presentationCreditedNotes.put(denom, nextCount);
                    }
                }
                int updatedCreditedTotal = 0;
                for (Integer c : presentationCreditedNotes.values()) {
                    updatedCreditedTotal += c;
                }
                presentationPeakTotalNotes = Math.max(presentationPeakTotalNotes, updatedCreditedTotal);
            }

            lastActiveNotes.clear();
            lastActiveNotes.putAll(newNotes);
            lastActiveTimestampMs = now;
            emptySinceTimestampMs = 0L;
            rebuildWalletFromBaselineAndCredited();
        }

        currentNotes.clear();
        currentNotes.putAll(newNotes);
        currentTotalAmount = 0L;
        currentNotesCount = 0;
        for (Map.Entry<Long, Integer> e : currentNotes.entrySet()) {
            currentTotalAmount += e.getKey() * e.getValue();
            currentNotesCount += e.getValue();
        }

        String spoken = buildSpokenSummary(currentNotes);
        updateDisplayUI("Đã phát hiện: " + spoken, null);

        if (isReadingWallet) {
            return;
        }

        if (newSig.equals(lastAnnouncedSig)) {
            return;
        }

        // Ticket 13: Downward-Flicker Audio Suppression (2 -> 1 -> 2 notes)
        int peakTotalNotes = 0;
        for (Integer c : presentationPeakAnnouncedCounts.values()) {
            peakTotalNotes += c;
        }
        if (peakTotalNotes >= 2 && currentNotesCount <= peakTotalNotes) {
            boolean isSubsetOrEqualToPeak = true;
            for (Map.Entry<Long, Integer> e : currentNotes.entrySet()) {
                int peakCount = presentationPeakAnnouncedCounts.containsKey(e.getKey())
                    ? presentationPeakAnnouncedCounts.get(e.getKey())
                    : 0;
                if (e.getValue() > peakCount) {
                    isSubsetOrEqualToPeak = false;
                    break;
                }
            }
            if (isSubsetOrEqualToPeak) {
                return;
            }
        }

        // Ticket 13: Multi-Note Upgrade Audio Preemption (1 note -> 2+ notes)
        if (audioModule.isSpeaking()) {
            if (currentlyAnnouncingNotesCount > 0 && currentNotesCount > currentlyAnnouncingNotesCount) {
                pendingSig = null;
                pendingNotes = null;
                audioModule.stop();
                startNoteAnnouncement(new LinkedHashMap<Long, Integer>(currentNotes), newSig, false);
                return;
            }
            pendingSig = newSig;
            pendingNotes = new LinkedHashMap<Long, Integer>(currentNotes);
            return;
        }

        boolean fromEmpty = "EMPTY".equals(lastAnnouncedSig);
        startNoteAnnouncement(new LinkedHashMap<Long, Integer>(currentNotes), newSig, fromEmpty);
    }

    private void startNoteAnnouncement(final Map<Long, Integer> notes, final String sig, boolean fromEmpty) {
        long highestDenom = 0L;
        int announcingCount = 0;
        if (notes != null) {
            for (Map.Entry<Long, Integer> e : notes.entrySet()) {
                int count = e.getValue();
                if (count > 0) {
                    announcingCount += count;
                    if (e.getKey() > highestDenom) {
                        highestDenom = e.getKey();
                    }
                    int prevPeak = presentationPeakAnnouncedCounts.containsKey(e.getKey())
                        ? presentationPeakAnnouncedCounts.get(e.getKey())
                        : 0;
                    if (count > prevPeak) {
                        presentationPeakAnnouncedCounts.put(e.getKey(), count);
                    }
                }
            }
        }
        currentlyAnnouncingNotesCount = announcingCount;
        if (highestDenom > 0L) {
            vibratePattern(getDenominationVibrationPattern(highestDenom));
        } else if (fromEmpty) {
            vibratePattern(new long[]{0, 60, 50, 90});
        }
        List<String> speechClips = buildSpeechClips(notes);
        if (speechClips.isEmpty()) {
            currentlyAnnouncingNotesCount = 0;
            return;
        }

        List<String> sequence = new ArrayList<String>();
        if (fromEmpty) sequence.add("tick");
        sequence.addAll(speechClips);

        audioModule.playSequence(sequence, new MoneyAudioModule.CompletionCallback() {
            @Override
            public void onComplete(boolean finished) {
                if (finished) {
                    currentlyAnnouncingNotesCount = 0;
                    lastAnnouncedSig = sig;
                    if (pendingNotes != null && pendingSig != null && !pendingSig.equals(lastAnnouncedSig)) {
                        Map<Long, Integer> nextN = pendingNotes;
                        String nextS = pendingSig;
                        pendingNotes = null;
                        pendingSig = null;
                        startNoteAnnouncement(nextN, nextS, false);
                    }
                }
            }
        });
    }

    private void onSingleTapGesture() {
        isReadingWallet = false;
        wakeUpToBurst("TOUCH_INTERACTION", System.currentTimeMillis());
        vibratePattern(new long[]{0, 40});
        if (currentNotes.isEmpty()) {
            updateDisplayUI("Không có tiền trong tầm quét", "1 Chạm (Đọc lại)");
            audioModule.playClip("empty", null);
        } else {
            String spoken = buildSpokenSummary(currentNotes);
            updateDisplayUI("Hiện tại: " + spoken, "1 Chạm (Đọc lại)");
            startNoteAnnouncement(new LinkedHashMap<Long, Integer>(currentNotes), computeSignature(currentNotes), false);
        }
    }

    private void onDoubleTapGesture() {
        long now = System.currentTimeMillis();
        wakeUpToBurst("TOUCH_INTERACTION", now);
        vibratePattern(new long[]{0, 45, 50, 45});
        isManualTorchOverride = true;
        lowLightStartMs = 0L;
        restoreLightStartMs = 0L;
        torchIdleStaticStartMs = 0L;
        isTorchOn = !isTorchOn;
        if (!isTorchOn) {
            torchAutoOnTimestampMs = 0L;
            postTorchBaselineLuma = -1.0;
            preTorchAmbientSensorLux = -1.0f;
            manualOffTimestampMs = now;
            manualOffBaselineLuma = -1.0;
            hasMovedSinceManualOff = false;
        } else {
            manualOffTimestampMs = 0L;
            manualOffBaselineLuma = -1.0;
            hasMovedSinceManualOff = false;
        }
        setHardwareTorch(isTorchOn);
        updateDisplayUI(isTorchOn ? "Đèn pin đã bật" : "Đèn pin đã tắt", "2 Chạm (Đổi đèn pin)");
        audioModule.playClip(isTorchOn ? "torch_on" : "torch_off", null);
    }

    private void onLongPressGesture() {
        wakeUpToBurst("TOUCH_INTERACTION", System.currentTimeMillis());
        vibratePattern(new long[]{0, 200});
        isReadingWallet = true;
        currentlyAnnouncingNotesCount = 0;
        pendingSig = null;
        pendingNotes = null;
        if (walletTotalAmount <= 0 || walletNotes.isEmpty()) {
            updateDisplayUI("Ví tích lũy hiện đang trống (0 đồng)", "Giữ 1s (Đọc ví)");
            audioModule.playClip("empty", new MoneyAudioModule.CompletionCallback() {
                @Override
                public void onComplete(boolean finished) {
                    isReadingWallet = false;
                }
            });
        } else {
            String spoken = buildSpokenSummary(walletNotes);
            updateDisplayUI(
                "Tổng ví: " + formatCurrency(walletTotalAmount) + " (" + walletNotesCount + " tờ) - " + spoken,
                "Giữ 1s (Đọc ví)"
            );
            List<String> clips = new ArrayList<String>();
            clips.add("tick");
            clips.addAll(buildSpeechClips(walletNotes));
            audioModule.playSequence(clips, new MoneyAudioModule.CompletionCallback() {
                @Override
                public void onComplete(boolean finished) {
                    isReadingWallet = false;
                }
            });
        }
    }

    private void onTwoFingerDoubleTapGesture() {
        isReadingWallet = false;
        wakeUpToBurst("TOUCH_INTERACTION", System.currentTimeMillis());
        vibratePattern(new long[]{0, 50, 50, 50, 50, 80});
        walletNotes.clear();
        walletBaselineNotes.clear();
        presentationCreditedNotes.clear();
        presentationMaxCounts.clear();
        presentationPeakAnnouncedCounts.clear();
        lastActiveNotes.clear();
        lastPresentationCreditedNotes.clear();
        presentationPeakTotalNotes = 0;
        lastPresentationPeakTotalNotes = 0;
        lastActiveTimestampMs = 0L;
        lastEmptyTimestampMs = 0L;
        wasPresentationEmpty = true;
        emptySinceTimestampMs = 0L;
        currentlyAnnouncingNotesCount = 0;
        walletTotalAmount = 0L;
        walletNotesCount = 0;
        manualHoldUntilMs = 0L;
        hasCandidateInFrame = false;
        detectorModule.reset();
        updateDisplayUI("Đã đặt lại ví tích lũy về 0 đồng", "2 Ngón x2 (Reset ví)");
        audioModule.playClip("wallet_reset", null);
    }

    private void announceAuthorVoice() {
        vibratePattern(new long[]{0, 60, 40, 80});
        updateDisplayUI(AUTHOR_SPOKEN_TEXT, "Thông tin Bản quyền & Tác giả");
        audioModule.stop();
        audioModule.playClip("tick", new MoneyAudioModule.CompletionCallback() {
            @Override
            public void onComplete(boolean finished) {
                if (!finished) return;
                audioModule.speakVietnamese(AUTHOR_SPOKEN_TEXT, null);
            }
        });
    }

    private LinearLayout createDialogInfoCard(String label, String value, int valueSizeSp) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(COLOR_DARK_CARD);
        bg.setCornerRadius(dp(8));
        bg.setStroke(dp(1), COLOR_YELLOW);
        box.setBackground(bg);
        box.setPadding(dp(12), dp(10), dp(12), dp(10));

        TextView labelTv = new TextView(this);
        labelTv.setTypeface(Typeface.SANS_SERIF, Typeface.BOLD);
        labelTv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        labelTv.setTextColor(COLOR_YELLOW);
        labelTv.setText(label);
        box.addView(labelTv);

        TextView valueTv = new TextView(this);
        valueTv.setTypeface(Typeface.SANS_SERIF, Typeface.BOLD);
        valueTv.setTextSize(TypedValue.COMPLEX_UNIT_SP, valueSizeSp);
        valueTv.setTextColor(COLOR_WHITE);
        valueTv.setPadding(0, dp(4), 0, 0);
        valueTv.setText(value);
        box.addView(valueTv);

        return box;
    }

    private void showAuthorCopyrightDialog() {
        announceAuthorVoice();

        try {
            if (activeAuthorDialog != null && activeAuthorDialog.isShowing()) {
                return;
            }
        } catch (Exception ignored) {}

        final Dialog dialog = new Dialog(this);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        if (dialog.getWindow() != null) {
            dialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        }

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(COLOR_BLACK);
        cardBg.setCornerRadius(dp(12));
        cardBg.setStroke(dp(3), COLOR_YELLOW);
        card.setBackground(cardBg);
        card.setPadding(dp(18), dp(18), dp(18), dp(18));

        TextView headerTitle = new TextView(this);
        headerTitle.setTypeface(Typeface.SANS_SERIF, Typeface.BOLD);
        headerTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        headerTitle.setTextColor(COLOR_YELLOW);
        headerTitle.setGravity(Gravity.CENTER);
        headerTitle.setPadding(0, 0, 0, dp(14));
        headerTitle.setText("THÔNG TIN BẢN QUYỀN & TÁC GIẢ");
        card.addView(headerTitle);

        LinearLayout.LayoutParams sectionLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        sectionLp.setMargins(0, 0, 0, dp(10));

        card.addView(
            createDialogInfoCard(
                "CHỦ SỞ HỮU & NHÀ PHÁT TRIỂN ĐỘC LẬP:",
                AUTHOR_NAME,
                22
            ),
            sectionLp
        );

        card.addView(
            createDialogInfoCard(
                "BẢN QUYỀN SỞ HỮU:",
                AUTHOR_COPYRIGHT_TEXT,
                14
            ),
            sectionLp
        );

        card.addView(
            createDialogInfoCard(
                "THÔNG TIN KỸ THUẬT:",
                AUTHOR_TECH_INFO,
                14
            ),
            sectionLp
        );

        Button speakBtn = new Button(this);
        speakBtn.setText("NGHE GIỚI THIỆU TÁC GIẢ");
        speakBtn.setAllCaps(false);
        speakBtn.setTypeface(Typeface.SANS_SERIF, Typeface.BOLD);
        speakBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        speakBtn.setTextColor(COLOR_BLACK);
        GradientDrawable speakBg = new GradientDrawable();
        speakBg.setColor(COLOR_YELLOW);
        speakBg.setCornerRadius(dp(8));
        speakBtn.setBackground(speakBg);
        speakBtn.setMinimumHeight(dp(MIN_TOUCH_TARGET_DP));
        speakBtn.setMinHeight(dp(MIN_TOUCH_TARGET_DP));
        speakBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                announceAuthorVoice();
            }
        });
        LinearLayout.LayoutParams speakLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(MIN_TOUCH_TARGET_DP)
        );
        speakLp.setMargins(0, dp(4), 0, dp(8));
        card.addView(speakBtn, speakLp);

        Button closeBtn = new Button(this);
        closeBtn.setText("ĐÓNG HỘP THOẠI");
        closeBtn.setAllCaps(false);
        closeBtn.setTypeface(Typeface.SANS_SERIF, Typeface.BOLD);
        closeBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        closeBtn.setTextColor(COLOR_WHITE);
        GradientDrawable closeBg = new GradientDrawable();
        closeBg.setColor(COLOR_BLACK);
        closeBg.setCornerRadius(dp(8));
        closeBg.setStroke(dp(2), COLOR_WHITE);
        closeBtn.setBackground(closeBg);
        closeBtn.setMinimumHeight(dp(MIN_TOUCH_TARGET_DP));
        closeBtn.setMinHeight(dp(MIN_TOUCH_TARGET_DP));
        closeBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                vibratePattern(new long[]{0, 40});
                dialog.dismiss();
            }
        });
        LinearLayout.LayoutParams closeLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(MIN_TOUCH_TARGET_DP)
        );
        card.addView(closeBtn, closeLp);

        dialog.setOnDismissListener(new DialogInterface.OnDismissListener() {
            @Override
            public void onDismiss(DialogInterface d) {
                if (activeAuthorDialog == dialog) {
                    activeAuthorDialog = null;
                }
                detectorModule.reset();
                wakeUpToBurst("TOUCH_INTERACTION", System.currentTimeMillis());
            }
        });

        dialog.setContentView(card);
        activeAuthorDialog = dialog;
        dialog.show();
        if (dialog.getWindow() != null) {
            dialog.getWindow().setLayout(
                (int) (getResources().getDisplayMetrics().widthPixels * 0.92f),
                ViewGroup.LayoutParams.WRAP_CONTENT
            );
        }
    }

    private void updateDisplayUI(final String announcement, final String gestureLabel) {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                boolean hasMoney = currentNotesCount > 0;
                long topDenom = 0L;
                for (Map.Entry<Long, Integer> e : currentNotes.entrySet()) {
                    if (e.getValue() > 0 && e.getKey() > topDenom) {
                        topDenom = e.getKey();
                    }
                }
                int pulseBorderColor = (hasMoney && topDenom > 0L)
                    ? Color.parseColor(getDenominationColorHex(topDenom))
                    : (hasMoney ? COLOR_YELLOW : (hasCandidateInFrame ? COLOR_YELLOW : Color.parseColor("#26FFE600")));
                pulseBorderDrawable.setStroke(dp(8), pulseBorderColor);
                if (viewfinderReticleDrawable != null) {
                    int reticleStrokeColor = (hasMoney && topDenom > 0L)
                        ? Color.parseColor(getDenominationColorHex(topDenom))
                        : (hasMoney ? COLOR_GREEN : (hasCandidateInFrame ? COLOR_YELLOW : Color.parseColor("#444444")));
                    viewfinderReticleDrawable.setStroke(dp(3), reticleStrokeColor);
                }
                if (powerStateBadgeText != null) {
                    powerStateBadgeText.setText(formatPowerStateBadge(powerState));
                    powerStateBadgeText.setTextColor(
                        POWER_STATE_HIBERNATION.equals(powerState)
                            ? Color.parseColor("#9E9E9E")
                            : (POWER_STATE_ECO.equals(powerState) ? COLOR_YELLOW : COLOR_GREEN)
                    );
                }
                headlineCountText.setText(hasMoney ? (currentNotesCount + " TỜ") : "CHƯA CÓ TIỀN");
                heroAmountText.setText(formatCurrency(currentTotalAmount));
                if (polymerColorBadgeText != null) {
                    if (hasMoney && topDenom > 0L) {
                        polymerBadgeDrawable.setColor(Color.parseColor(getDenominationColorHex(topDenom)));
                        polymerColorBadgeText.setTextColor(COLOR_BLACK);
                        polymerColorBadgeText.setText(getDenominationBadgeLabel(topDenom));
                        polymerColorBadgeText.setVisibility(View.VISIBLE);
                    } else {
                        polymerColorBadgeText.setVisibility(View.GONE);
                    }
                }
                if (announcement != null) {
                    spokenSubtitleText.setText(announcement);
                }
                walletSummaryText.setText(
                    "VÍ TÍCH LŨY: " + formatCurrency(walletTotalAmount) + " (" + walletNotesCount + " tờ)"
                );
                if (gestureLabel != null) {
                    gestureBadgeText.setVisibility(View.VISIBLE);
                    gestureBadgeText.setText("CỬ CHỈ VỪA THỰC HIỆN: " + gestureLabel);
                }
                if (directTorchBtn != null) {
                    directTorchBtn.setText(isTorchOn ? "ĐÈN PIN: BẬT" : "ĐÈN PIN: TẮT");
                    GradientDrawable torchBg = new GradientDrawable();
                    torchBg.setColor(isTorchOn ? Color.parseColor("#332B00") : COLOR_DARK_CARD);
                    torchBg.setCornerRadius(dp(12));
                    torchBg.setStroke(dp(1), isTorchOn ? COLOR_YELLOW : Color.parseColor("#444444"));
                    directTorchBtn.setBackground(torchBg);
                    directTorchBtn.setTextColor(isTorchOn ? COLOR_YELLOW : Color.parseColor("#AAAAAA"));
                }
                long roundedLux = Math.round(currentLuminance);
                lastDisplayedLux = roundedLux;
                lastDisplayedTorchOn = isTorchOn;
                torchStatusText.setText(
                    (isTorchOn ? "ĐÈN: BẬT" : "ĐÈN: TẮT") +
                    " | " + roundedLux + " LUX"
                );
            }
        });
    }

    // =========================================================================
    // Camera2 Live Preview + Ambient Luminance + Smart Torch + YOLO26 Inference
    // + Ticket 09 4-Layer Adaptive Thermal & Battery Governor
    // =========================================================================

    private void checkAndRequestCameraPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
                return;
            }
        }
        startCameraIfReady();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_CAMERA && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            startCameraIfReady();
        }
    }

    private final TextureView.SurfaceTextureListener surfaceTextureListener = new TextureView.SurfaceTextureListener() {
        @Override
        public void onSurfaceTextureAvailable(SurfaceTexture surface, int width, int height) {
            startCameraIfReady();
        }
        @Override public void onSurfaceTextureSizeChanged(SurfaceTexture surface, int width, int height) {}
        @Override public boolean onSurfaceTextureDestroyed(SurfaceTexture surface) { return true; }
        @Override public void onSurfaceTextureUpdated(SurfaceTexture surface) {}
    };

    private void startCameraThread() {
        if (cameraThread == null) {
            cameraThread = new HandlerThread("MoneyVisionCameraThread");
            cameraThread.start();
            cameraHandler = new Handler(cameraThread.getLooper());
        }
        if (inferenceThread == null) {
            // Ticket 09 Layer 2: Pin inference worker to Process.THREAD_PRIORITY_BACKGROUND
            // so Linux EAS schedules TFLite XNNPACK onto high-efficiency Cortex-A55/A510 cores.
            inferenceThread = new HandlerThread(
                "MoneyVisionInferenceThread",
                Process.THREAD_PRIORITY_BACKGROUND
            );
            inferenceThread.start();
            inferenceHandler = new Handler(inferenceThread.getLooper());
        }
    }

    private void stopCameraThread() {
        if (cameraThread != null) {
            cameraThread.quitSafely();
            try {
                cameraThread.join();
            } catch (InterruptedException ignored) {}
            cameraThread = null;
            cameraHandler = null;
        }
        if (inferenceThread != null) {
            inferenceThread.quitSafely();
            try {
                inferenceThread.join();
            } catch (InterruptedException ignored) {}
            inferenceThread = null;
            inferenceHandler = null;
        }
    }

    private void startCameraIfReady() {
        if (cameraTextureView == null || !cameraTextureView.isAvailable()) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
            checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        startCameraThread();
        openBackCamera();
    }

    private void openBackCamera() {
        if (cameraDevice != null) return;
        try {
            CameraManager manager = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
            if (manager == null) return;
            String backCameraId = null;
            for (String id : manager.getCameraIdList()) {
                CameraCharacteristics chars = manager.getCameraCharacteristics(id);
                Integer facing = chars.get(CameraCharacteristics.LENS_FACING);
                if (facing != null && facing == CameraCharacteristics.LENS_FACING_BACK) {
                    backCameraId = id;
                    break;
                }
            }
            if (backCameraId == null && manager.getCameraIdList().length > 0) {
                backCameraId = manager.getCameraIdList()[0];
            }
            if (backCameraId == null) return;

            imageReader = ImageReader.newInstance(640, 480, ImageFormat.YUV_420_888, 2);
            imageReader.setOnImageAvailableListener(new ImageReader.OnImageAvailableListener() {
                @Override
                public void onImageAvailable(ImageReader reader) {
                    Image image = null;
                    try {
                        image = reader.acquireLatestImage();
                        if (image != null) {
                            processCameraFrame(image);
                        }
                    } catch (Exception ignored) {
                    } finally {
                        if (image != null) image.close();
                    }
                }
            }, cameraHandler);

            manager.openCamera(backCameraId, new CameraDevice.StateCallback() {
                @Override
                public void onOpened(CameraDevice camera) {
                    cameraDevice = camera;
                    createCameraPreviewSession();
                }
                @Override
                public void onDisconnected(CameraDevice camera) {
                    camera.close();
                    cameraDevice = null;
                }
                @Override
                public void onError(CameraDevice camera, int error) {
                    camera.close();
                    cameraDevice = null;
                }
            }, cameraHandler);
        } catch (Exception ignored) {}
    }

    private void createCameraPreviewSession() {
        try {
            if (cameraDevice == null || !cameraTextureView.isAvailable()) return;
            SurfaceTexture texture = cameraTextureView.getSurfaceTexture();
            if (texture == null) return;
            texture.setDefaultBufferSize(640, 480);
            Surface previewSurface = new Surface(texture);
            Surface readerSurface = imageReader.getSurface();
            activePreviewSurface = previewSurface;
            activeReaderSurface = readerSurface;

            previewRequestBuilder = cameraDevice.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
            previewRequestBuilder.addTarget(previewSurface);
            previewRequestBuilder.addTarget(readerSurface);
            previewRequestBuilder.set(
                CaptureRequest.CONTROL_AF_MODE,
                CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE
            );
            previewRequestBuilder.set(
                CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE,
                new Range<Integer>(15, 24)
            );
            if (isTorchOn) {
                previewRequestBuilder.set(CaptureRequest.FLASH_MODE, CaptureRequest.FLASH_MODE_TORCH);
            }

            // Ticket 09 Layer 4: Low-power heartbeat request targeting ONLY readerSurface (detaches TextureView GPU composition in HIBERNATION)
            heartbeatRequestBuilder = cameraDevice.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
            heartbeatRequestBuilder.addTarget(readerSurface);
            heartbeatRequestBuilder.set(
                CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE,
                new Range<Integer>(5, 15)
            );

            cameraDevice.createCaptureSession(
                Arrays.asList(previewSurface, readerSurface),
                new CameraCaptureSession.StateCallback() {
                    @Override
                    public void onConfigured(CameraCaptureSession session) {
                        if (cameraDevice == null) return;
                        captureSession = session;
                        isPreviewDetachedForHibernation = false;
                        try {
                            captureSession.setRepeatingRequest(
                                previewRequestBuilder.build(), null, cameraHandler
                            );
                        } catch (Exception ignored) {}
                    }
                    @Override
                    public void onConfigureFailed(CameraCaptureSession session) {}
                },
                cameraHandler
            );
        } catch (Exception ignored) {}
    }

    private void setHardwareTorch(boolean enabled) {
        try {
            if (captureSession != null && previewRequestBuilder != null) {
                previewRequestBuilder.set(
                    CaptureRequest.FLASH_MODE,
                    enabled ? CaptureRequest.FLASH_MODE_TORCH : CaptureRequest.FLASH_MODE_OFF
                );
                if (heartbeatRequestBuilder != null) {
                    heartbeatRequestBuilder.set(
                        CaptureRequest.FLASH_MODE,
                        enabled ? CaptureRequest.FLASH_MODE_TORCH : CaptureRequest.FLASH_MODE_OFF
                    );
                }
                if (isPreviewDetachedForHibernation && heartbeatRequestBuilder != null) {
                    if (enabled) {
                        captureSession.setRepeatingRequest(heartbeatRequestBuilder.build(), null, cameraHandler);
                    } else {
                        // Torch turned OFF during HIBERNATION (e.g., 15s idle cutoff): stop repeating and switch to single-frame heartbeat
                        captureSession.setRepeatingRequest(heartbeatRequestBuilder.build(), null, cameraHandler);
                        captureSession.stopRepeating();
                        if (cameraHandler != null) {
                            cameraHandler.removeCallbacks(heartbeatCaptureRunnable);
                            long delayMs = (currentLuminance < DARK_OCCLUDED_LUX_THRESHOLD || isProximityNear) ? 3000L : 1500L;
                            cameraHandler.postDelayed(heartbeatCaptureRunnable, delayMs);
                        }
                    }
                } else {
                    captureSession.setRepeatingRequest(previewRequestBuilder.build(), null, cameraHandler);
                }
                return;
            }
        } catch (Exception ignored) {}
        cameraModule.setTorch(enabled);
    }

    private synchronized void wakeUpToBurst(String reason, long now) {
        staticHoldingStartMs = 0L;
        staticEmptyStartMs = 0L;
        deepIdleStartMs = 0L;
        darkOccludedStartMs = 0L;
        torchIdleStaticStartMs = 0L;
        if (!POWER_STATE_BURST.equals(powerState) || isPreviewDetachedForHibernation || isKeepScreenOnReleased) {
            powerState = POWER_STATE_BURST;
            applyHibernationDisplayAndSessionState(false, false);
        }
    }

    private final Runnable heartbeatCaptureRunnable = new Runnable() {
        @Override
        public void run() {
            if (!POWER_STATE_HIBERNATION.equals(powerState) || !isPreviewDetachedForHibernation) {
                return;
            }
            try {
                if (captureSession != null && heartbeatRequestBuilder != null && !isTorchOn) {
                    captureSession.capture(heartbeatRequestBuilder.build(), null, cameraHandler);
                }
            } catch (Exception ignored) {}
            if (cameraHandler != null && POWER_STATE_HIBERNATION.equals(powerState)) {
                long delayMs = (currentLuminance < DARK_OCCLUDED_LUX_THRESHOLD || isProximityNear) ? 3000L : 1500L;
                cameraHandler.postDelayed(this, delayMs);
            }
        }
    };

    private void applyHibernationDisplayAndSessionState(final boolean enterHibernation, final boolean releaseKeepScreenOn) {
        final String targetPowerState = powerState;
        if (cameraHandler != null) {
            cameraHandler.post(new Runnable() {
                @Override
                public void run() {
                    try {
                        if (captureSession == null) return;
                        if (enterHibernation && !isPreviewDetachedForHibernation && heartbeatRequestBuilder != null) {
                            isPreviewDetachedForHibernation = true;
                            cameraHandler.removeCallbacks(heartbeatCaptureRunnable);
                            if (isTorchOn) {
                                // Never call stopRepeating() while FLASH_MODE_TORCH is active so hardware torch stays lit
                                captureSession.setRepeatingRequest(heartbeatRequestBuilder.build(), null, cameraHandler);
                            } else {
                                captureSession.stopRepeating();
                                long delayMs = (currentLuminance < DARK_OCCLUDED_LUX_THRESHOLD || isProximityNear) ? 3000L : 1500L;
                                cameraHandler.postDelayed(heartbeatCaptureRunnable, delayMs);
                            }
                        } else if (!enterHibernation && previewRequestBuilder != null) {
                            cameraHandler.removeCallbacks(heartbeatCaptureRunnable);
                            Range<Integer> targetAeFps = POWER_STATE_ECO.equals(targetPowerState)
                                ? new Range<Integer>(10, 15)
                                : new Range<Integer>(15, 24);
                            previewRequestBuilder.set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, targetAeFps);
                            if (isPreviewDetachedForHibernation && !isTorchOn) {
                                captureSession.stopRepeating();
                            }
                            captureSession.setRepeatingRequest(previewRequestBuilder.build(), null, cameraHandler);
                            isPreviewDetachedForHibernation = false;
                        }
                    } catch (Exception ignored) {}
                }
            });
        }

        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                try {
                    if (powerStateBadgeText != null) {
                        powerStateBadgeText.setText(formatPowerStateBadge(targetPowerState));
                        powerStateBadgeText.setTextColor(
                            POWER_STATE_HIBERNATION.equals(targetPowerState)
                                ? Color.parseColor("#9E9E9E")
                                : (POWER_STATE_ECO.equals(targetPowerState) ? COLOR_YELLOW : COLOR_GREEN)
                        );
                    }
                    Window window = getWindow();
                    if (enterHibernation) {
                        if (cameraTextureView != null && cameraTextureView.getAlpha() != 0.0f) {
                            cameraTextureView.setAlpha(0.0f);
                        }
                        if (window != null) {
                            WindowManager.LayoutParams lp = window.getAttributes();
                            if (lp.screenBrightness != 0.01f) {
                                lp.screenBrightness = 0.01f;
                                window.setAttributes(lp);
                            }
                            if (releaseKeepScreenOn && !isKeepScreenOnReleased) {
                                window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                                isKeepScreenOnReleased = true;
                            }
                        }
                    } else {
                        float targetAlpha = THERMAL_HOT.equals(thermalLevel)
                            ? 0.0f
                            : (POWER_STATE_ECO.equals(targetPowerState) ? PREVIEW_ALPHA_ECO : PREVIEW_ALPHA_BURST);
                        if (cameraTextureView != null && cameraTextureView.getAlpha() != targetAlpha) {
                            cameraTextureView.setAlpha(targetAlpha);
                        }
                        if (window != null) {
                            WindowManager.LayoutParams lp = window.getAttributes();
                            if (lp.screenBrightness != WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE) {
                                lp.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
                                window.setAttributes(lp);
                            }
                            if (isKeepScreenOnReleased) {
                                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                                isKeepScreenOnReleased = false;
                            }
                        }
                    }
                } catch (Exception ignored) {}
            }
        });
    }

    private void updateThermalAndBatteryLevel(long now) {
        if (now - lastThermalPollMs < 5000L) return;
        lastThermalPollMs = now;
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            String resolved = THERMAL_NOMINAL;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && pm != null) {
                int status = pm.getCurrentThermalStatus();
                if (status >= PowerManager.THERMAL_STATUS_SEVERE) {
                    resolved = THERMAL_HOT;
                } else if (status >= PowerManager.THERMAL_STATUS_MODERATE) {
                    resolved = THERMAL_WARM;
                }
            }
            if (pm != null && pm.isPowerSaveMode() && THERMAL_NOMINAL.equals(resolved)) {
                resolved = THERMAL_WARM;
            }
            Intent batteryIntent = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (batteryIntent != null) {
                int tempTenths = batteryIntent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 250);
                int level = batteryIntent.getIntExtra(BatteryManager.EXTRA_LEVEL, 100);
                int scale = Math.max(1, batteryIntent.getIntExtra(BatteryManager.EXTRA_SCALE, 100));
                int pct = (level * 100) / scale;
                if (tempTenths >= 410) {
                    resolved = THERMAL_HOT;
                } else if ((tempTenths >= 380 || pct < 15) && THERMAL_NOMINAL.equals(resolved)) {
                    resolved = THERMAL_WARM;
                }
            }
            String prevThermal = thermalLevel;
            thermalLevel = resolved;
            if (!prevThermal.equals(resolved) && !POWER_STATE_HIBERNATION.equals(powerState)) {
                applyHibernationDisplayAndSessionState(false, false);
            }
        } catch (Exception ignored) {}
    }

    private long getTargetInferenceIntervalMs() {
        if (POWER_STATE_HIBERNATION.equals(powerState)) {
            return -1L;
        }
        if (POWER_STATE_ECO.equals(powerState)) {
            if (THERMAL_HOT.equals(thermalLevel)) return ECO_INTERVAL_HOT_MS; // 1100ms
            if (THERMAL_WARM.equals(thermalLevel)) return ECO_INTERVAL_WARM_MS; // 850ms
            return ECO_INTERVAL_NOMINAL_MS; // 650ms
        }
        // BURST state
        if (THERMAL_HOT.equals(thermalLevel)) return BURST_INTERVAL_HOT_MS; // 240ms
        if (THERMAL_WARM.equals(thermalLevel)) return BURST_INTERVAL_WARM_MS; // 175ms
        return BURST_INTERVAL_NOMINAL_MS; // 130ms
    }

    private void evaluatePowerGovernor(long now, double motionDeltaY) {
        boolean hasConfirmedMoney = (currentNotesCount > 0);
        boolean hasUnsettledCandidate = hasCandidateInFrame || detectorModule.hasLastCandidateHint();
        boolean hasActiveOrCandidate = hasConfirmedMoney || hasUnsettledCandidate;

        // Auto-Torch Idle Thermal Cutoff (15s static empty or 4s proximity near)
        if (isTorchOn && !isManualTorchOverride) {
            if (!hasActiveOrCandidate && motionDeltaY < STATIC_EMPTY_DELTA_Y_THRESHOLD) {
                if (torchIdleStaticStartMs == 0L) {
                    torchIdleStaticStartMs = now;
                } else if (now - torchIdleStaticStartMs >= IDLE_TORCH_CUTOFF_MS) {
                    torchIdleStaticStartMs = 0L;
                    isTorchOn = false;
                    torchAutoOnTimestampMs = 0L;
                    postTorchBaselineLuma = -1.0;
                    preTorchAmbientSensorLux = -1.0f;
                    setHardwareTorch(false);
                    audioModule.playClip("torch_off", null);
                    updateDisplayUI("Tự động tắt đèn pin để bảo vệ nhiệt độ và pin", null);
                }
            } else {
                torchIdleStaticStartMs = 0L;
            }

            if (isProximityNear && proximityNearStartMs > 0L &&
                now - proximityNearStartMs >= PROXIMITY_TORCH_CUTOFF_MS) {
                isTorchOn = false;
                torchAutoOnTimestampMs = 0L;
                postTorchBaselineLuma = -1.0;
                preTorchAmbientSensorLux = -1.0f;
                setHardwareTorch(false);
                audioModule.playClip("torch_off", null);
                updateDisplayUI("Tự động tắt đèn pin do che cảm biến tiệm cận", null);
            }
        } else {
            torchIdleStaticStartMs = 0L;
        }

        if ((motionDeltaY >= MOTION_WAKE_DELTA_Y_THRESHOLD || hasUnsettledCandidate) && !isProximityNear) {
            wakeUpToBurst(hasUnsettledCandidate ? "CANDIDATE_DETECTION" : "LUMA_MOTION", now);
            return;
        }

        long ecoHoldMs = THERMAL_HOT.equals(thermalLevel)
            ? ECO_ENTRY_STATIC_DURATION_HOT_MS
            : (THERMAL_WARM.equals(thermalLevel) ? ECO_ENTRY_STATIC_DURATION_WARM_MS : ECO_ENTRY_STATIC_DURATION_NOMINAL_MS);
        long hibernationHoldMs = THERMAL_HOT.equals(thermalLevel)
            ? HIBERNATION_ENTRY_EMPTY_STATIC_HOT_MS
            : HIBERNATION_ENTRY_EMPTY_STATIC_NOMINAL_MS;

        // Dark / Occluded / Pocket check (< 5 lux or proximity near, outside Ticket 08's 1s auto-torch trigger window)
        long lowLightElapsed = lowLightStartMs > 0L ? (now - lowLightStartMs) : 0L;
        boolean isOutsideAutoTorchWindow = isTorchOn || isManualTorchOverride || isOscillationLatched || lowLightElapsed == 0L || lowLightElapsed > 1200L;
        boolean isDarkOrOccluded = !hasActiveOrCandidate &&
            motionDeltaY < STATIC_DEEP_IDLE_DELTA_Y_THRESHOLD &&
            (isProximityNear || currentLuminance < DARK_OCCLUDED_LUX_THRESHOLD) &&
            isOutsideAutoTorchWindow;

        if (isDarkOrOccluded) {
            if (darkOccludedStartMs == 0L) {
                darkOccludedStartMs = now;
            } else if (now - darkOccludedStartMs >= HIBERNATION_ENTRY_DARK_STATIC_MS && !POWER_STATE_HIBERNATION.equals(powerState)) {
                powerState = POWER_STATE_HIBERNATION;
                deepIdleStartMs = now;
                applyHibernationDisplayAndSessionState(true, false);
                return;
            }
        } else {
            darkOccludedStartMs = 0L;
        }

        if (POWER_STATE_BURST.equals(powerState)) {
            if (hasConfirmedMoney && !hasUnsettledCandidate && motionDeltaY < STATIC_HOLDING_DELTA_Y_THRESHOLD) {
                if (staticHoldingStartMs == 0L) {
                    staticHoldingStartMs = now;
                } else if (now - staticHoldingStartMs >= ecoHoldMs) {
                    powerState = POWER_STATE_ECO;
                    staticHoldingStartMs = 0L;
                    applyHibernationDisplayAndSessionState(false, false);
                }
            } else {
                staticHoldingStartMs = 0L;
            }

            if (!hasActiveOrCandidate && motionDeltaY < STATIC_EMPTY_DELTA_Y_THRESHOLD) {
                if (staticEmptyStartMs == 0L) {
                    staticEmptyStartMs = now;
                }
                if (deepIdleStartMs == 0L && motionDeltaY < STATIC_DEEP_IDLE_DELTA_Y_THRESHOLD) {
                    deepIdleStartMs = now;
                } else if (motionDeltaY >= STATIC_DEEP_IDLE_DELTA_Y_THRESHOLD) {
                    deepIdleStartMs = 0L;
                }
                if (now - staticEmptyStartMs >= ecoHoldMs) {
                    powerState = POWER_STATE_ECO;
                    applyHibernationDisplayAndSessionState(false, false);
                }
            } else {
                staticEmptyStartMs = 0L;
                deepIdleStartMs = 0L;
            }
        } else if (POWER_STATE_ECO.equals(powerState)) {
            if (!hasActiveOrCandidate && motionDeltaY < STATIC_DEEP_IDLE_DELTA_Y_THRESHOLD) {
                if (deepIdleStartMs == 0L) {
                    deepIdleStartMs = now;
                } else if (now - deepIdleStartMs >= hibernationHoldMs) {
                    powerState = POWER_STATE_HIBERNATION;
                    applyHibernationDisplayAndSessionState(true, false);
                }
            } else if (hasActiveOrCandidate) {
                deepIdleStartMs = 0L;
            }
        } else if (POWER_STATE_HIBERNATION.equals(powerState)) {
            if (deepIdleStartMs > 0L &&
                now - deepIdleStartMs >= DEEP_IDLE_SCREEN_OFF_TIMEOUT_MS &&
                !isKeepScreenOnReleased) {
                applyHibernationDisplayAndSessionState(true, true);
            }
        }
    }

    private void processCameraFrame(Image image) {
        Image.Plane[] planes = image.getPlanes();
        if (planes == null || planes.length < 3) return;

        Image.Plane yPlane = planes[0];
        ByteBuffer yBuf = yPlane.getBuffer();
        int rowStride = yPlane.getRowStride();
        int pixelStride = yPlane.getPixelStride();
        final int w = image.getWidth();
        final int h = image.getHeight();
        int limit = yBuf.limit();

        Arrays.fill(currentLumaGridSums, 0L);
        Arrays.fill(currentLumaGridCounts, 0);

        long sum = 0L;
        long count = 0L;
        long centerSum = 0L;
        long centerCount = 0L;
        long borderSum = 0L;
        long borderCount = 0L;
        long glareCount = 0L;
        final int rMin = h / 4;
        final int rMax = (h * 3) / 4;
        final int cMin = w / 4;
        final int cMax = (w * 3) / 4;

        // Single-pass Y-plane luminance + Ticket 08 spatial reflection + Ticket 09 16x16 Luma Grid
        for (int r = 0; r < h; r += 8) {
            int rowStart = r * rowStride;
            boolean inCenterRow = (r >= rMin && r < rMax);
            int gridRow = (r * LUMA_GRID_DIM) / h;
            if (gridRow >= LUMA_GRID_DIM) gridRow = LUMA_GRID_DIM - 1;
            int gridRowBase = gridRow * LUMA_GRID_DIM;
            for (int c = 0; c < w; c += 8) {
                int idx = rowStart + c * pixelStride;
                if (idx < limit) {
                    int val = (yBuf.get(idx) & 0xFF);
                    sum += val;
                    count++;
                    if (val > 230) {
                        glareCount++;
                    }
                    if (inCenterRow && c >= cMin && c < cMax) {
                        centerSum += val;
                        centerCount++;
                    } else {
                        borderSum += val;
                        borderCount++;
                    }
                    int gridCol = (c * LUMA_GRID_DIM) / w;
                    if (gridCol >= LUMA_GRID_DIM) gridCol = LUMA_GRID_DIM - 1;
                    int cellIdx = gridRowBase + gridCol;
                    currentLumaGridSums[cellIdx] += val;
                    currentLumaGridCounts[cellIdx]++;
                }
            }
        }
        final double avgLux = count > 0 ? (double) sum / count : 100.0;
        double motionDeltaSum = 0.0;
        for (int cell = 0; cell < LUMA_GRID_CELLS; cell++) {
            int cnt = currentLumaGridCounts[cell];
            float cellAvg = cnt > 0 ? ((float) currentLumaGridSums[cell] / cnt) : (float) avgLux;
            if (hasPreviousLumaGrid) {
                motionDeltaSum += Math.abs(cellAvg - previousLumaGrid[cell]);
            }
            previousLumaGrid[cell] = cellAvg;
        }
        final double motionDeltaY = hasPreviousLumaGrid ? (motionDeltaSum / LUMA_GRID_CELLS) : 0.0;
        hasPreviousLumaGrid = true;
        currentMotionDeltaY = motionDeltaY;
        final boolean isMotionBlurred = motionDeltaY > MOTION_BLUR_DELTA_Y_THRESHOLD;

        final double centerLuma = centerCount > 0 ? (double) centerSum / centerCount : avgLux;
        final double borderLuma = borderCount > 0 ? (double) borderSum / borderCount : avgLux;
        final double glareRatio = count > 0 ? (double) glareCount / count : 0.0;
        final double centerToBorderRatio = borderLuma > 1.0
            ? (centerLuma / borderLuma)
            : (centerLuma > 1.0 ? centerLuma : 1.0);
        final boolean hasOpticalReflection =
            (glareRatio >= MAX_GLARE_RATIO_FOR_RESTORE) ||
            ((avgLux >= 60.0 || centerLuma >= 60.0) &&
             (centerToBorderRatio >= MAX_CENTER_TO_BORDER_RATIO));
        final double effectiveSampleLux = hasOpticalReflection
            ? Math.max(avgLux, centerLuma)
            : avgLux;
        currentLuminance = avgLux;
        long now = System.currentTimeMillis();

        updateThermalAndBatteryLevel(now);

        // Adaptive IMU Table-Vibration Guard verification
        if (pendingImuWakeVerify) {
            pendingImuWakeVerify = false;
            if (motionDeltaY < 1.2) {
                consecutiveFalseImuWakes++;
                if (consecutiveFalseImuWakes >= 3) {
                    imuWakeThreshold = IMU_WAKE_ELEVATED_THRESHOLD;
                }
            } else {
                consecutiveFalseImuWakes = 0;
                imuWakeThreshold = IMU_WAKE_DEFAULT_THRESHOLD;
            }
        } else if (motionDeltaY >= MOTION_WAKE_DELTA_Y_THRESHOLD) {
            consecutiveFalseImuWakes = 0;
            imuWakeThreshold = IMU_WAKE_DEFAULT_THRESHOLD;
        }

        evaluatePowerGovernor(now, motionDeltaY);

        // Layer 4: Clear oscillation latch if 60s cooldown has elapsed
        if (isOscillationLatched && now >= oscillationLatchUntilMs) {
            isOscillationLatched = false;
            oscillationLatchUntilMs = 0L;
            autoTorchCycleTimestamps.clear();
        }

        // Layer 2: Record postTorchBaselineLuma (~450ms after auto-torch turns ON, ignoring dark pre-flash frames)
        if (isTorchOn && !isManualTorchOverride && torchAutoOnTimestampMs > 0L) {
            long elapsedSinceTorchOn = now - torchAutoOnTimestampMs;
            if (elapsedSinceTorchOn >= 0L && effectiveSampleLux >= 25.0 &&
                (elapsedSinceTorchOn <= POST_TORCH_BASELINE_WINDOW_MS ||
                 (elapsedSinceTorchOn <= 1000L && postTorchBaselineLuma < 80.0 && effectiveSampleLux >= 80.0))) {
                if (effectiveSampleLux > postTorchBaselineLuma) {
                    postTorchBaselineLuma = effectiveSampleLux;
                }
            }
        }

        // Ticket 12: Smart Manual-OFF Recovery & Dark-to-Dark Motion/Darkening Re-Arm
        if (isManualTorchOverride && !isTorchOn) {
            long elapsedSinceManualOff = manualOffTimestampMs > 0L ? (now - manualOffTimestampMs) : Long.MAX_VALUE;

            if (elapsedSinceManualOff >= MANUAL_OFF_SETTLE_MS && manualOffBaselineLuma < 0.0 && avgLux < MANUAL_OFF_REARM_LUMA_LUX) {
                manualOffBaselineLuma = avgLux;
            }

            boolean hasFrameMotion = (motionDeltaY >= MANUAL_OFF_MOTION_DELTA_Y) || (lastLinearAccelDelta >= MANUAL_OFF_IMU_ACCEL_DELTA);
            boolean hasDarkenedFurther = manualOffBaselineLuma >= 0.0 &&
                (manualOffBaselineLuma - avgLux) >= MANUAL_OFF_DARKENING_DROP_LUX;

            if (elapsedSinceManualOff >= MANUAL_OFF_MOTION_ARM_DELAY_MS && (hasFrameMotion || hasDarkenedFurther)) {
                hasMovedSinceManualOff = true;
            }

            if (elapsedSinceManualOff >= MANUAL_OFF_SETTLE_MS &&
                avgLux >= MANUAL_OFF_REARM_LUMA_LUX &&
                !hasOpticalReflection) {
                isManualTorchOverride = false;
                manualOffTimestampMs = 0L;
                hasMovedSinceManualOff = false;
                manualOffBaselineLuma = -1.0;
                lowLightStartMs = 0L;
            } else if (elapsedSinceManualOff >= MANUAL_OFF_DARK_GRACE_MS && avgLux < MANUAL_OFF_REARM_LUMA_LUX) {
                if (hasMovedSinceManualOff || hasFrameMotion || hasDarkenedFurther) {
                    isManualTorchOverride = false;
                    manualOffTimestampMs = 0L;
                    hasMovedSinceManualOff = false;
                    manualOffBaselineLuma = -1.0;
                    if (avgLux < 25.0) {
                        lowLightStartMs = now;
                    }
                }
            }
        }

        // 4-Layer Anti-Strobe Smart Torch State Machine
        if (avgLux < 25.0) {
            restoreLightStartMs = 0L;
            if (lowLightStartMs == 0L) {
                lowLightStartMs = now;
            } else if (now - lowLightStartMs >= 1000L && !isTorchOn && !isManualTorchOverride && !isOscillationLatched) {
                isTorchOn = true;
                torchAutoOnTimestampMs = now;
                postTorchBaselineLuma = -1.0;
                preTorchAmbientSensorLux = hasHardwareLightSensor ? ambientSensorLux : -1.0f;
                restoreLightStartMs = 0L;
                setHardwareTorch(true);
                vibratePattern(new long[]{0, 100});
                audioModule.playClip("torch_on", null);
                updateDisplayUI("Tự động bật đèn pin do thiếu sáng", null);
            }
        } else {
            lowLightStartMs = 0L;
            if (avgLux >= 60.0) {
                boolean isGenuineBrightRoom =
                    (!hasHardwareLightSensor || ambientSensorLux >= AMBIENT_SENSOR_RESTORE_LUX) &&
                    !hasOpticalReflection;

                // Protect isManualTorchOverride: NEVER clear manual override while torch is ON!
                // Only re-arm auto mode if user manually turned torch OFF in dark and entered a genuinely bright room.
                if (isManualTorchOverride && !isTorchOn && isGenuineBrightRoom) {
                    long elapsedSinceManualOff = manualOffTimestampMs > 0L ? (now - manualOffTimestampMs) : Long.MAX_VALUE;
                    if (elapsedSinceManualOff > MANUAL_OFF_SETTLE_MS) {
                        isManualTorchOverride = false;
                        hasMovedSinceManualOff = false;
                        manualOffBaselineLuma = -1.0;
                    }
                }

                if (isTorchOn && !isManualTorchOverride && !isOscillationLatched) {
                    long holdElapsed = torchAutoOnTimestampMs > 0L
                        ? (now - torchAutoOnTimestampMs)
                        : MIN_TORCH_ON_HOLD_MS;
                    boolean hasActiveDetection = (currentNotesCount > 0) || hasCandidateInFrame;
                    double baseline = postTorchBaselineLuma > 0.0 ? postTorchBaselineLuma : 60.0;
                    double requiredYThreshold = Math.max(
                        HIGH_RESTORE_LUMA_THRESHOLD,
                        baseline + POST_TORCH_LUMA_DELTA
                    );

                    boolean isTrueAmbientRecovery;
                    if (hasHardwareLightSensor && ambientSensorLux >= 0.0f) {
                        boolean wasShadowedInLitRoom = (preTorchAmbientSensorLux >= AMBIENT_SENSOR_RESTORE_LUX);
                        boolean sensorRestored = wasShadowedInLitRoom
                            ? (ambientSensorLux >= preTorchAmbientSensorLux + 40.0f || avgLux >= requiredYThreshold)
                            : (ambientSensorLux >= AMBIENT_SENSOR_RESTORE_LUX);
                        isTrueAmbientRecovery = sensorRestored && !hasOpticalReflection;
                    } else {
                        isTrueAmbientRecovery =
                            (avgLux >= requiredYThreshold) && !hasOpticalReflection;
                    }

                    if (isTrueAmbientRecovery && !hasActiveDetection) {
                        if (restoreLightStartMs == 0L) {
                            restoreLightStartMs = now;
                        }
                    } else {
                        restoreLightStartMs = 0L;
                    }

                    if (holdElapsed >= MIN_TORCH_ON_HOLD_MS &&
                        !hasActiveDetection &&
                        isTrueAmbientRecovery &&
                        restoreLightStartMs > 0L &&
                        (now - restoreLightStartMs >= RESTORE_SUSTAIN_DURATION_MS)) {
                        isTorchOn = false;
                        torchAutoOnTimestampMs = 0L;
                        postTorchBaselineLuma = -1.0;
                        preTorchAmbientSensorLux = -1.0f;
                        restoreLightStartMs = 0L;

                        // Track auto ON-OFF cycle for Oscillation Latch (60s lock if >= 2 cycles in 30s)
                        autoTorchCycleTimestamps.add(now);
                        while (!autoTorchCycleTimestamps.isEmpty() &&
                               (now - autoTorchCycleTimestamps.get(0) > OSCILLATION_WINDOW_MS)) {
                            autoTorchCycleTimestamps.remove(0);
                        }
                        if (autoTorchCycleTimestamps.size() >= OSCILLATION_MAX_CYCLES) {
                            isOscillationLatched = true;
                            oscillationLatchUntilMs = now + OSCILLATION_LATCH_DURATION_MS;
                        }

                        setHardwareTorch(false);
                        audioModule.playClip("torch_off", null);
                        updateDisplayUI("Tự động tắt đèn pin do đủ sáng", null);
                    }
                }
            } else {
                restoreLightStartMs = 0L;
            }
        }

        // Ticket 09 Layer 4: Throttle torchStatusText UI updates (>= 400ms & >= 2 lux delta)
        long roundedLux = Math.round(currentLuminance);
        if (now - lastTorchStatusUiUpdateMs >= 400L &&
            (Math.abs(roundedLux - lastDisplayedLux) >= 2L || isTorchOn != lastDisplayedTorchOn)) {
            lastTorchStatusUiUpdateMs = now;
            lastDisplayedLux = roundedLux;
            lastDisplayedTorchOn = isTorchOn;
            mainHandler.post(new Runnable() {
                @Override
                public void run() {
                    torchStatusText.setText(
                        (isTorchOn ? "⚡ ĐÈN: BẬT" : "ĐÈN: TẮT") +
                        " | " + Math.round(currentLuminance) + " LUX"
                    );
                }
            });
        }

        // Ticket 09 Layer 1: Motion-Blur Gate (skip TFLite inference during fast hand swipe ΔY > 32.0)
        if (isMotionBlurred) {
            return;
        }

        long targetIntervalMs = getTargetInferenceIntervalMs();
        if (targetIntervalMs <= 0L) {
            return;
        }

        // Live YOLO26 TFLite Inference at governed FPS on background inferenceHandler
        if (!isInferring &&
            now - lastInferenceMs >= targetIntervalMs &&
            detectorModule.isInterpreterReady() &&
            inferenceHandler != null) {

            isInferring = true;
            lastInferenceMs = now;

            try {
                Image.Plane uPlane = planes[1];
                Image.Plane vPlane = planes[2];
                ByteBuffer uBuf = uPlane.getBuffer();
                ByteBuffer vBuf = vPlane.getBuffer();

                final int yLen = yBuf.remaining();
                final int uLen = uBuf.remaining();
                final int vLen = vBuf.remaining();

                if (reusableY == null || reusableY.length < yLen) reusableY = new byte[yLen];
                if (reusableU == null || reusableU.length < uLen) reusableU = new byte[uLen];
                if (reusableV == null || reusableV.length < vLen) reusableV = new byte[vLen];

                yBuf.get(reusableY, 0, yLen);
                uBuf.get(reusableU, 0, uLen);
                vBuf.get(reusableV, 0, vLen);

                final int yStride = rowStride;
                final int uvStride = uPlane.getRowStride();
                final int uvPixStride = uPlane.getPixelStride();

                inferenceHandler.post(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            final Map<Long, Integer> detected = detectorModule.detectFromYuvFrame(
                                reusableY,
                                reusableU,
                                reusableV,
                                w,
                                h,
                                yStride,
                                uvStride,
                                uvPixStride
                            );
                            if (detected != null) {
                                // Do not let background camera frames interrupt the Author & Copyright dialog while open
                                if (activeAuthorDialog != null && activeAuthorDialog.isShowing()) {
                                    return;
                                }
                                String sig = computeSignature(detected);
                                boolean candidateHint = detectorModule.hasLastCandidateHint();
                                boolean isUnsettledSig = !"EMPTY".equals(sig) && (currentNotesCount == 0 || !sig.equals(lastAnnouncedSig));
                                hasCandidateInFrame = isUnsettledSig || candidateHint;
                                if (hasCandidateInFrame && !POWER_STATE_BURST.equals(powerState)) {
                                    wakeUpToBurst("CANDIDATE_DETECTION", System.currentTimeMillis());
                                }
                                // If user recently tapped a manual test button, do not let empty camera frames cancel it
                                if ("EMPTY".equals(sig) && System.currentTimeMillis() < manualHoldUntilMs) {
                                    return;
                                }
                                if (!"EMPTY".equals(sig)) {
                                    manualHoldUntilMs = 0L;
                                }
                                final long frameEvalNow = System.currentTimeMillis();
                                if ("EMPTY".equals(sig)) {
                                    mainHandler.post(new Runnable() {
                                        @Override
                                        public void run() {
                                            if (emptySinceTimestampMs == 0L) {
                                                emptySinceTimestampMs = frameEvalNow;
                                            } else if (frameEvalNow - emptySinceTimestampMs >= PRESENTATION_EMPTY_RESET_MS) {
                                                presentationMaxCounts.clear();
                                                presentationPeakAnnouncedCounts.clear();
                                            }
                                        }
                                    });
                                }
                                boolean stateChanged = detectorModule.processFrameSignature(sig);
                                if (stateChanged) {
                                    wasCandidateGuidanceActive = false;
                                    mainHandler.post(new Runnable() {
                                        @Override
                                        public void run() {
                                            if (activeAuthorDialog != null && activeAuthorDialog.isShowing()) {
                                                return;
                                            }
                                            applyDetectionUpdate(detected);
                                        }
                                    });
                                } else if (hasCandidateInFrame && currentNotesCount == 0) {
                                    // Ticket 10 Pillar 3: Spatial Guidance "Giữ Yên Tay" (25ms pulse + HUD cue)
                                    wasCandidateGuidanceActive = true;
                                    triggerCandidateGuidancePulse(System.currentTimeMillis());
                                    updateDisplayUI(CANDIDATE_GUIDANCE_TEXT, null);
                                } else if (!hasCandidateInFrame && wasCandidateGuidanceActive && currentNotesCount == 0) {
                                    // Candidate silhouette left the frame before reaching 4/5 consensus: clear guidance HUD
                                    wasCandidateGuidanceActive = false;
                                    updateDisplayUI("Không có tiền trong tầm quét", null);
                                }
                            }
                        } catch (Throwable ignored) {
                        } finally {
                            isInferring = false;
                        }
                    }
                });
            } catch (Throwable t) {
                isInferring = false;
            }
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (sensorManager != null && lightSensor != null) {
            try {
                sensorManager.registerListener(
                    lightSensorListener,
                    lightSensor,
                    SensorManager.SENSOR_DELAY_NORMAL
                );
            } catch (Exception ignored) {}
        }
        if (sensorManager != null && motionSensor != null) {
            try {
                sensorManager.registerListener(
                    motionSensorListener,
                    motionSensor,
                    SensorManager.SENSOR_DELAY_NORMAL
                );
            } catch (Exception ignored) {}
        }
        if (sensorManager != null && proximitySensor != null) {
            try {
                sensorManager.registerListener(
                    proximitySensorListener,
                    proximitySensor,
                    SensorManager.SENSOR_DELAY_NORMAL
                );
            } catch (Exception ignored) {}
        }
        wakeUpToBurst("TOUCH_INTERACTION", System.currentTimeMillis());
        startCameraIfReady();
    }

    @Override
    protected void onPause() {
        if (sensorManager != null) {
            try {
                sensorManager.unregisterListener(lightSensorListener);
                sensorManager.unregisterListener(motionSensorListener);
                sensorManager.unregisterListener(proximitySensorListener);
            } catch (Exception ignored) {}
        }
        try {
            if (captureSession != null) {
                captureSession.close();
                captureSession = null;
            }
            if (cameraDevice != null) {
                cameraDevice.close();
                cameraDevice = null;
            }
            if (imageReader != null) {
                imageReader.close();
                imageReader = null;
            }
        } catch (Exception ignored) {}
        stopCameraThread();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        try {
            if (activeAuthorDialog != null && activeAuthorDialog.isShowing()) {
                activeAuthorDialog.dismiss();
            }
            activeAuthorDialog = null;
        } catch (Exception ignored) {}
        audioModule.destroy();
        detectorModule.destroy();
        super.onDestroy();
    }
}
`,
    'utf8'
  );
}

/**
 * Extract entries from a standard ZIP/APK/AAR buffer
 */
function extractZipEntries(zipBuf) {
  let eocd = -1;
  for (let i = zipBuf.length - 22; i >= 0; i--) {
    if (zipBuf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error('Invalid ZIP buffer');

  const cdOffset = zipBuf.readUInt32LE(eocd + 16);
  const cdSize = zipBuf.readUInt32LE(eocd + 12);
  let cur = cdOffset;
  const map = new Map();

  while (cur < cdOffset + cdSize) {
    if (zipBuf.readUInt32LE(cur) !== 0x02014b50) break;
    const method = zipBuf.readUInt16LE(cur + 10);
    const compSize = zipBuf.readUInt32LE(cur + 20);
    const fnLen = zipBuf.readUInt16LE(cur + 28);
    const extraLen = zipBuf.readUInt16LE(cur + 30);
    const commentLen = zipBuf.readUInt16LE(cur + 32);
    const localOffset = zipBuf.readUInt32LE(cur + 42);
    const name = zipBuf.toString('utf8', cur + 46, cur + 46 + fnLen);

    const localFnLen = zipBuf.readUInt16LE(localOffset + 26);
    const localExtraLen = zipBuf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localFnLen + localExtraLen;
    const rawSlice = zipBuf.subarray(dataStart, dataStart + compSize);

    const data = method === 8 ? zlib.inflateRawSync(rawSlice) : Buffer.from(rawSlice);
    map.set(name, data);

    cur += 46 + fnLen + extraLen + commentLen;
  }

  return map;
}

/**
 * Compiles binary AndroidManifest.xml, resources.arsc, executable classes.dex (including org.tensorflow.lite.*),
 * and extracts native libtensorflowlite_jni.so binaries using real Android SDK tools.
 */
export function compileRealAndroidArtifacts(projectRoot, sdkPath) {
  ensureLauncherIcons(projectRoot);
  const tools = locateAndroidSdkTools(sdkPath);
  if (!tools) return null;

  const workDir = path.join(projectRoot, 'release', '.sdk_build_tmp');
  if (fs.existsSync(workDir)) {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
  const compiledResDir = path.join(workDir, 'compiled_res');
  const genRDir = path.join(workDir, 'gen_r');
  const javaSrcDir = path.join(workDir, 'java_src');
  const classesDir = path.join(workDir, 'classes');
  const dexDir = path.join(workDir, 'dex');
  const linkedResApk = path.join(workDir, 'linked_res.apk');

  fs.mkdirSync(compiledResDir, { recursive: true });
  fs.mkdirSync(genRDir, { recursive: true });
  fs.mkdirSync(javaSrcDir, { recursive: true });
  fs.mkdirSync(classesDir, { recursive: true });
  fs.mkdirSync(dexDir, { recursive: true });

  try {
    const resDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res');
    const manifestPath = path.join(
      projectRoot,
      'android',
      'app',
      'src',
      'main',
      'AndroidManifest.xml'
    );

    // Extract LiteRT (TensorFlow Lite) classes.jar & JNI .so libraries if cached in android/libs/
    const libsDir = path.join(projectRoot, 'android', 'libs');
    const litertApiAar = path.join(libsDir, 'litert-api-1.0.1.aar');
    const litertRuntimeAar = path.join(libsDir, 'litert-1.0.1.aar');
    const extraJars = [];
    let arm64TfliteSo = null;
    let armeabiTfliteSo = null;

    if (fs.existsSync(litertApiAar)) {
      try {
        const apiEntries = extractZipEntries(fs.readFileSync(litertApiAar));
        const apiJar = apiEntries.get('classes.jar');
        if (apiJar) {
          const apiJarPath = path.join(workDir, 'litert-api-classes.jar');
          fs.writeFileSync(apiJarPath, apiJar);
          extraJars.push(apiJarPath);
        }
      } catch {
        // ignore
      }
    }

    if (fs.existsSync(litertRuntimeAar)) {
      try {
        const rtEntries = extractZipEntries(fs.readFileSync(litertRuntimeAar));
        const rtJar = rtEntries.get('classes.jar');
        if (rtJar) {
          const rtJarPath = path.join(workDir, 'litert-classes.jar');
          fs.writeFileSync(rtJarPath, rtJar);
          extraJars.push(rtJarPath);
        }
        arm64TfliteSo = rtEntries.get('jni/arm64-v8a/libtensorflowlite_jni.so') || null;
        armeabiTfliteSo = rtEntries.get('jni/armeabi-v7a/libtensorflowlite_jni.so') || null;
      } catch {
        // ignore
      }
    }

    // 1. Compile resources with aapt2 compile --dir
    const resZip = path.join(workDir, 'res_compiled.flata');
    execFileSync(tools.aapt2, ['compile', '--dir', resDir, '-o', resZip], {
      stdio: 'pipe',
    });

    // 2. Link resources and binary AndroidManifest.xml with aapt2 link
    execFileSync(
      tools.aapt2,
      [
        'link',
        '-I',
        tools.androidJar,
        '--manifest',
        manifestPath,
        '--min-sdk-version',
        '28',
        '--target-sdk-version',
        '34',
        '--version-code',
        '1',
        '--version-name',
        '1.0.0',
        '-0',
        'mp3',
        '-0',
        'wav',
        '-0',
        'tflite',
        '--java',
        genRDir,
        '-o',
        linkedResApk,
        resZip,
      ],
      { stdio: 'pipe' }
    );

    // 3. Write standalone Java sources and compile with javac
    writeStandaloneJavaSources(javaSrcDir);

    const findJavaFiles = (dir) => {
      let list = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) list.push(...findJavaFiles(full));
        else if (entry.name.endsWith('.java')) list.push(full);
      }
      return list;
    };

    const javaFiles = [...findJavaFiles(genRDir), ...findJavaFiles(javaSrcDir)];
    const javacCp = [tools.androidJar, ...extraJars].join(path.delimiter);
    execFileSync(
      tools.javac,
      [
        '--release',
        '11',
        '-encoding',
        'UTF-8',
        '-cp',
        javacCp,
        '-d',
        classesDir,
        ...javaFiles,
      ],
      { stdio: 'pipe' }
    );

    // 4. Convert compiled .class files + LiteRT jars to real Dalvik bytecode (classes.dex) using d8
    const findClassFiles = (dir) => {
      let list = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) list.push(...findClassFiles(full));
        else if (entry.name.endsWith('.class')) list.push(full);
      }
      return list;
    };

    const classFiles = findClassFiles(classesDir);
    const d8Inputs = [...classFiles, ...extraJars];
    if (process.platform === 'win32') {
      execFileSync(
        'cmd.exe',
        [
          '/c',
          tools.d8,
          '--min-api',
          '28',
          '--lib',
          tools.androidJar,
          '--output',
          dexDir,
          ...d8Inputs,
        ],
        { stdio: 'pipe' }
      );
    } else {
      execFileSync(
        tools.d8,
        ['--min-api', '28', '--lib', tools.androidJar, '--output', dexDir, ...d8Inputs],
        { stdio: 'pipe' }
      );
    }

    const linkedEntries = extractZipEntries(fs.readFileSync(linkedResApk));
    const binaryManifest = linkedEntries.get('AndroidManifest.xml');
    const resourcesArsc = linkedEntries.get('resources.arsc');
    const classesDexPath = path.join(dexDir, 'classes.dex');
    const classesDex = fs.existsSync(classesDexPath)
      ? fs.readFileSync(classesDexPath)
      : null;

    if (!binaryManifest || !resourcesArsc || !classesDex) {
      return null;
    }

    return {
      binaryManifest,
      resourcesArsc,
      classesDex,
      arm64TfliteSo,
      armeabiTfliteSo,
      linkedEntries,
      tools,
    };
  } catch (err) {
    console.warn(`    ⚠ SDK artifact compilation warning: ${err.message}`);
    return null;
  } finally {
    try {
      if (fs.existsSync(workDir)) {
        fs.rmSync(workDir, { recursive: true, force: true });
      }
    } catch {
      // ignore cleanup errors
    }
  }
}

/**
 * Cryptographically sign an aligned APK using Android SDK apksigner (v1 + v2 + v3 schemes)
 */
export function signApkWithSdkApksigner(apkPath, keystorePath, storePass, tools) {
  if (!tools || !tools.apksigner || !fs.existsSync(keystorePath)) {
    return false;
  }
  try {
    const args = [
      'sign',
      '--min-sdk-version',
      '18',
      '--ks',
      keystorePath,
      '--ks-pass',
      `pass:${storePass}`,
      '--ks-key-alias',
      'moneyvision',
      '--key-pass',
      `pass:${storePass}`,
      '--v1-signing-enabled',
      'true',
      '--v2-signing-enabled',
      'true',
      '--v3-signing-enabled',
      'true',
      '--v1-signer-name',
      'CERT',
      apkPath,
    ];

    if (process.platform === 'win32') {
      execFileSync('cmd.exe', ['/c', tools.apksigner, ...args], { stdio: 'pipe' });
    } else {
      execFileSync(tools.apksigner, args, { stdio: 'pipe' });
    }
    return true;
  } catch {
    return false;
  }
}
