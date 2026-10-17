/**
 * Downloads and verifies Google LiteRT (TensorFlow Lite) AARs into android/libs/
 * for offline Universal APK compilation (classes.jar + arm64-v8a & armeabi-v7a libtensorflowlite_jni.so).
 */
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const AARS = [
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

function downloadBuffer(url) {
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
          downloadBuffer(res.headers.location).then(resolve, reject);
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

function listZipEntries(zipBuf) {
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
  const entries = [];
  while (cur < cdOffset + cdSize) {
    if (zipBuf.readUInt32LE(cur) !== 0x02014b50) break;
    const uncompSize = zipBuf.readUInt32LE(cur + 24);
    const fnLen = zipBuf.readUInt16LE(cur + 28);
    const extraLen = zipBuf.readUInt16LE(cur + 30);
    const commentLen = zipBuf.readUInt16LE(cur + 32);
    const name = zipBuf.toString('utf8', cur + 46, cur + 46 + fnLen);
    entries.push({ name, uncompSize });
    cur += 46 + fnLen + extraLen + commentLen;
  }
  return entries;
}

export async function ensureLiteRtAars(rootDir = projectRoot) {
  const libsDir = path.join(rootDir, 'android', 'libs');
  if (!fs.existsSync(libsDir)) {
    fs.mkdirSync(libsDir, { recursive: true });
  }

  for (const item of AARS) {
    const targetPath = path.join(libsDir, item.name);
    if (!fs.existsSync(targetPath) || fs.statSync(targetPath).size < item.minBytes) {
      console.log(`Downloading ${item.name}...`);
      const buf = await downloadBuffer(item.url);
      fs.writeFileSync(targetPath, buf);
      console.log(`Saved ${item.name} (${buf.length} bytes)`);
    }
    const zipBuf = fs.readFileSync(targetPath);
    const entries = listZipEntries(zipBuf);
    console.log(`${item.name} entries:`, entries.map((e) => `${e.name} (${e.uncompSize}B)`).join(', '));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  ensureLiteRtAars()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
