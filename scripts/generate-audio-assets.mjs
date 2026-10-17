/**
 * Audio Asset Generator for MoneyVision
 * Generates real Vietnamese voice audio assets (MP3) and crisp earcons (WAV) for:
 * 1. 9 Vietnamese Dong denominations (vnd_1k to vnd_500k)
 * 2. 10 Note quantity clips (qty_1 to qty_10)
 * 3. 5 Earcons (tick, empty, torch_on, torch_off, wallet_reset)
 *
 * Saves to:
 * - android/app/src/main/res/raw/
 * - android/app/src/main/assets/audio/
 * - src/assets/audio/
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

/**
 * Checks whether an MP3 buffer contains real non-zero compressed audio data
 * rather than zero-filled dummy frames.
 */
export function isRealMp3Audio(buf) {
  if (!buf || buf.length < 1024) return false;
  let nonZeroCount = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] !== 0x00 && buf[i] !== 0xff) {
      nonZeroCount++;
    }
  }
  return nonZeroCount > buf.length * 0.4;
}

/**
 * Creates a standard valid 16-bit PCM RIFF WAVE buffer (44.1 kHz mono)
 */
function createWavBuffer(sampleRate, durationSec, generatorFn) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataByteLength = numSamples * numChannels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataByteLength);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataByteLength, 4);
  buffer.write('WAVE', 8);

  // 'fmt ' chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // 'data' chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataByteLength, 40);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Apply smooth 5ms fade-in and fade-out envelope to prevent speaker clicks
    const fadeIn = Math.min(1, t / 0.005);
    const fadeOut = Math.min(1, (durationSec - t) / 0.01);
    const raw = generatorFn(t, durationSec) * fadeIn * fadeOut;
    const sample = Math.max(-1, Math.min(1, raw));
    const intSample = Math.floor(sample * 32767);
    buffer.writeInt16LE(intSample, offset);
    offset += 2;
  }

  return buffer;
}

/**
 * Fetches real Vietnamese speech MP3 from Google Translate TTS endpoint
 */
function fetchVietnameseTtsMp3(text) {
  const url =
    'https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=' +
    encodeURIComponent(text);

  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'audio/mpeg, */*',
        },
        timeout: 10000,
      },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for "${text}"`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          if (isRealMp3Audio(buf)) {
            resolve(buf);
          } else {
            reject(new Error(`Invalid or silent TTS payload for "${text}"`));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error(`Timeout fetching TTS for "${text}"`));
    });
  });
}

// 1. Earcon audio generators (44.1 kHz, rich audible earcons)
const EARCONS = {
  'tick.wav': {
    duration: 0.14,
    sampleRate: 44100,
    fn: (t) =>
      (0.65 * Math.sin(2 * Math.PI * 1046.5 * t) +
        0.35 * Math.sin(2 * Math.PI * 2093.0 * t)) *
      Math.exp(-t * 24), // Crisp C6+C7 confirmation chime
  },
  'empty.wav': {
    duration: 0.22,
    sampleRate: 44100,
    fn: (t) =>
      0.8 *
      Math.sin(2 * Math.PI * (420 - 160 * (t / 0.22)) * t) *
      Math.exp(-t * 12), // Distinct descending drop tone
  },
  'torch_on.wav': {
    duration: 0.24,
    sampleRate: 44100,
    fn: (t) => {
      const freq = t < 0.12 ? 587.33 : 880.0; // D5 -> A5 rising two-note chime
      const localT = t < 0.12 ? t : t - 0.12;
      return 0.8 * Math.sin(2 * Math.PI * freq * localT) * Math.exp(-localT * 10);
    },
  },
  'torch_off.wav': {
    duration: 0.24,
    sampleRate: 44100,
    fn: (t) => {
      const freq = t < 0.12 ? 880.0 : 587.33; // A5 -> D5 falling two-note chime
      const localT = t < 0.12 ? t : t - 0.12;
      return 0.8 * Math.sin(2 * Math.PI * freq * localT) * Math.exp(-localT * 10);
    },
  },
  'wallet_reset.wav': {
    duration: 0.30,
    sampleRate: 44100,
    fn: (t) => {
      const freq = t < 0.1 ? 659.25 : t < 0.2 ? 523.25 : 392.0; // E5 -> C5 -> G4 reset triad
      const localT = t % 0.1;
      return 0.85 * Math.sin(2 * Math.PI * freq * localT) * Math.exp(-localT * 12);
    },
  },
};

// 2. Denomination voice clips (.mp3) with Vietnamese spoken phrases
const DENOMINATIONS = {
  'vnd_1k.mp3': 'Một nghìn đồng',
  'vnd_2k.mp3': 'Hai nghìn đồng',
  'vnd_5k.mp3': 'Năm nghìn đồng',
  'vnd_10k.mp3': 'Mười nghìn đồng',
  'vnd_20k.mp3': 'Hai mươi nghìn đồng',
  'vnd_50k.mp3': 'Năm mươi nghìn đồng',
  'vnd_100k.mp3': 'Một trăm nghìn đồng',
  'vnd_200k.mp3': 'Hai trăm nghìn đồng',
  'vnd_500k.mp3': 'Năm trăm nghìn đồng',
};

// 3. Quantity voice clips (.mp3) with Vietnamese spoken phrases
const QUANTITIES = {
  'qty_1.mp3': 'Một tờ',
  'qty_2.mp3': 'Hai tờ',
  'qty_3.mp3': 'Ba tờ',
  'qty_4.mp3': 'Bốn tờ',
  'qty_5.mp3': 'Năm tờ',
  'qty_6.mp3': 'Sáu tờ',
  'qty_7.mp3': 'Bảy tờ',
  'qty_8.mp3': 'Tám tờ',
  'qty_9.mp3': 'Chín tờ',
  'qty_10.mp3': 'Mười tờ',
};

const targetDirs = [
  path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'raw'),
  path.join(rootDir, 'android', 'app', 'src', 'main', 'assets', 'audio'),
  path.join(rootDir, 'src', 'assets', 'audio'),
];

async function generateAllAudioAssets() {
  for (const dir of targetDirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // 1. Generate & write Earcons (.wav)
  for (const [filename, config] of Object.entries(EARCONS)) {
    const buf = createWavBuffer(config.sampleRate, config.duration, config.fn);
    for (const dir of targetDirs) {
      fs.writeFileSync(path.join(dir, filename), buf);
    }
    console.log(`   [WAV Earcon] ${filename} (${buf.length} bytes)`);
  }

  // 2. Generate & write Vietnamese Voice Clips (.mp3)
  const allVoiceClips = { ...DENOMINATIONS, ...QUANTITIES };
  for (const [filename, phrase] of Object.entries(allVoiceClips)) {
    // Check if we already have a real MP3 in any targetDir
    let existingRealBuf = null;
    for (const dir of targetDirs) {
      const candidate = path.join(dir, filename);
      if (fs.existsSync(candidate)) {
        const buf = fs.readFileSync(candidate);
        if (isRealMp3Audio(buf)) {
          existingRealBuf = buf;
          break;
        }
      }
    }

    let finalBuf = existingRealBuf;
    if (!finalBuf) {
      finalBuf = await fetchVietnameseTtsMp3(phrase);
    }

    for (const dir of targetDirs) {
      fs.writeFileSync(path.join(dir, filename), finalBuf);
    }
    console.log(`   [MP3 Voice]  ${filename} -> "${phrase}" (${finalBuf.length} bytes)`);
  }

  console.log('\n✅ Generated and verified 24 real audio assets across:');
  for (const dir of targetDirs) {
    console.log(`   - ${path.relative(rootDir, dir)}`);
  }
}

const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  generateAllAudioAssets().catch((err) => {
    console.error('❌ Failed to generate audio assets:', err.message);
    process.exit(1);
  });
}
