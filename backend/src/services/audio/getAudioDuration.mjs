import decode from 'audio-decode';
import fs from 'fs/promises';

const filePath = process.argv[2];
if (!filePath) {
  process.stderr.write('No file path provided');
  process.exit(1);
}

try {
  const buf = await fs.readFile(filePath);
  const audioData = await decode(buf);
  // audioData = { channelData: [Float32Array, ...], sampleRate }
  // Total samples per channel = channelData[0].length
  // Duration = totalSamples / sampleRate
  const totalSamples = audioData.channelData[0].length;
  const duration = totalSamples / audioData.sampleRate;
  process.stdout.write(String(duration));
} catch (err) {
  process.stderr.write(err.message);
  process.exit(1);
}
