import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import decode from 'audio-decode';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create a 10-second WAV
const sr = 44100;
const sec = 10;
const ch = 1;
const bps = 16;
const samples = sr * sec;
const dataSize = samples * ch * (bps / 8);

const wav = Buffer.alloc(44 + dataSize);
wav.write('RIFF', 0);
wav.writeUInt32LE(36 + dataSize, 4);
wav.write('WAVE', 8);
wav.write('fmt ', 12);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(ch, 22);
wav.writeUInt32LE(sr, 24);
wav.writeUInt32LE(sr * ch * (bps / 8), 28);
wav.writeUInt16LE(ch * (bps / 8), 32);
wav.writeUInt16LE(bps, 34);
wav.write('data', 36);
wav.writeUInt32LE(dataSize, 40);

const testFile = path.resolve(__dirname, 'test_10s.wav');
fs.writeFileSync(testFile, wav);

const buf = fs.readFileSync(testFile);
const ad = await decode(buf);
console.log('Full object:', ad);
console.log('Keys:', Object.keys(ad));
console.log('  constructor name:', ad.constructor?.name);
console.log('  length:', ad.length);
console.log('  duration:', ad.duration);
console.log('  sampleRate:', ad.sampleRate);
console.log('  numberOfChannels:', ad.numberOfChannels);

// Also try with getChannelData to count samples
if (typeof ad.getChannelData === 'function') {
  const channelData = ad.getChannelData(0);
  console.log('  channelData length:', channelData.length);
  console.log('  computed duration:', channelData.length / ad.sampleRate);
}

fs.unlinkSync(testFile);