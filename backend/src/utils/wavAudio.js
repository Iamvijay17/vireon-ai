const fs = require('fs').promises;

// Qwen3-TTS's Gradio endpoint returns raw WAV data (despite the app saving
// it with a .mp3 extension/audio.mpeg content-type - browsers still play it
// fine via content sniffing, see AudioService). That means dialogue turns
// can be merged into one file with plain PCM concatenation - no ffmpeg
// dependency needed, which this dev environment doesn't have.

// Walks RIFF chunks to find 'fmt ' and 'data', tolerating any extra chunks
// (e.g. 'LIST', 'fact') a WAV encoder might insert between them.
function parseWav(buffer) {
  if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Not a valid WAV file');
  }

  let offset = 12;
  let fmt = null;
  let dataOffset = null;
  let dataSize = null;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkDataStart = offset + 8;

    if (chunkId === 'fmt ') {
      fmt = {
        audioFormat: buffer.readUInt16LE(chunkDataStart),
        channels: buffer.readUInt16LE(chunkDataStart + 2),
        sampleRate: buffer.readUInt32LE(chunkDataStart + 4),
        byteRate: buffer.readUInt32LE(chunkDataStart + 8),
        blockAlign: buffer.readUInt16LE(chunkDataStart + 12),
        bitsPerSample: buffer.readUInt16LE(chunkDataStart + 14),
      };
    } else if (chunkId === 'data') {
      dataOffset = chunkDataStart;
      dataSize = chunkSize;
    }

    // Chunks are word-aligned - a 1-byte pad follows an odd-sized chunk.
    offset = chunkDataStart + chunkSize + (chunkSize % 2);
  }

  if (!fmt || dataOffset === null) {
    throw new Error('WAV file missing fmt or data chunk');
  }

  return { fmt, data: buffer.subarray(dataOffset, dataOffset + dataSize) };
}

function buildWavBuffer(fmt, dataBuffer) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataBuffer.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(fmt.audioFormat || 1, 20);
  header.writeUInt16LE(fmt.channels, 22);
  header.writeUInt32LE(fmt.sampleRate, 24);
  header.writeUInt32LE(fmt.byteRate, 28);
  header.writeUInt16LE(fmt.blockAlign, 32);
  header.writeUInt16LE(fmt.bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataBuffer.length, 40);
  return Buffer.concat([header, dataBuffer]);
}

// Silence is digital zero for signed PCM, so a plain zero-filled buffer
// works regardless of bit depth. Rounded down to a whole blockAlign so
// multi-channel samples never get split mid-frame.
function silenceBuffer(fmt, seconds) {
  const bytes = Math.round(seconds * fmt.byteRate);
  const aligned = bytes - (bytes % fmt.blockAlign);
  return Buffer.alloc(Math.max(aligned, 0));
}

/**
 * Merge several WAV files (e.g. one per dialogue turn) into a single WAV,
 * inserting a short silence between each pair. All inputs must share the
 * same sample rate/channels/bit depth - true here since every turn comes
 * from the same TTS model, but checked explicitly rather than assumed.
 * `gapSecondsForIndex(i)` gets the gap length *before* turn i (i >= 1).
 */
async function concatWavFiles(filePaths, gapSecondsForIndex) {
  const parsed = [];
  for (const filePath of filePaths) {
    const buffer = await fs.readFile(filePath);
    parsed.push(parseWav(buffer));
  }

  const fmt = parsed[0].fmt;
  for (const { fmt: otherFmt } of parsed) {
    if (
      otherFmt.sampleRate !== fmt.sampleRate ||
      otherFmt.channels !== fmt.channels ||
      otherFmt.bitsPerSample !== fmt.bitsPerSample
    ) {
      throw new Error('Cannot merge dialogue turns: inconsistent WAV format between turns');
    }
  }

  const parts = [];
  parsed.forEach(({ data }, i) => {
    if (i > 0) parts.push(silenceBuffer(fmt, gapSecondsForIndex(i)));
    parts.push(data);
  });

  const combinedData = Buffer.concat(parts);
  const durationSeconds = Math.round((combinedData.length / fmt.byteRate) * 100) / 100;

  return { buffer: buildWavBuffer(fmt, combinedData), durationSeconds };
}

module.exports = { parseWav, buildWavBuffer, concatWavFiles };
