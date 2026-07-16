import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create a 10-second WAV
const sr = 44100;
const sec = 10;
const ch = 1;
const bps = 16;
const samples = sr * sec;
const dataSize = samples * ch * (bps / 8);
const wav = Buffer.alloc(44 + dataSize);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + dataSize, 4); wav.write('WAVE', 8);
wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(ch, 22); wav.writeUInt32LE(sr, 24);
wav.writeUInt32LE(sr * ch * (bps / 8), 28); wav.writeUInt16LE(ch * (bps / 8), 32);
wav.writeUInt16LE(bps, 34); wav.write('data', 36); wav.writeUInt32LE(dataSize, 40);

const testFile = path.resolve(__dirname, 'test_dur.wav');
fs.writeFileSync(testFile, wav);
console.log('Created test file:', testFile);
console.log('Expected duration:', sec, 'seconds');

// Run the helper
const helper = path.resolve(__dirname, 'src/services/TTS/getAudioDuration.mjs');
console.log('Helper:', helper);

try {
  const result = execSync(`node "${helper}" "${testFile}"`, { encoding: 'utf8', timeout: 30000 });
  const dur = parseFloat(result.trim());
  console.log('Helper returned:', dur, 'seconds');
  console.log('Match:', dur === sec ? 'YES ✓' : 'NO ✗');
} catch(e) {
  console.error('Error:', e.message);
  console.error('stderr:', e.stderr?.toString());
}

fs.unlinkSync(testFile);
console.log('Cleaned up');