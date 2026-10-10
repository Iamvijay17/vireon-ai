/**
 * Minimal, dependency-free file sniffing for uploads. The client's Content-Type
 * header is only a hint; what a file IS comes from its own first bytes.
 */

/** @returns {{kind:'image'|'video', contentType:string, ext:string}|null} */
function sniffMedia(head) {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return { kind: 'image', contentType: 'image/jpeg', ext: 'jpg' };
  }
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { kind: 'image', contentType: 'image/png', ext: 'png' };
  }
  // ISO base media (MP4 / MOV): a box type at bytes 4-8.
  if (head.length >= 12) {
    const box = head.toString('latin1', 4, 8);
    if (box === 'ftyp') {
      const brand = head.toString('latin1', 8, 12);
      return brand.startsWith('qt') ? { kind: 'video', contentType: 'video/quicktime', ext: 'mov' } : { kind: 'video', contentType: 'video/mp4', ext: 'mp4' };
    }
    if (['moov', 'mdat', 'wide', 'free'].includes(box)) return { kind: 'video', contentType: 'video/quicktime', ext: 'mov' };
  }
  return null;
}

/** Width/height from the image header (PNG IHDR / JPEG SOFn). null if it cannot be read. */
function readImageSize(buf, contentType) {
  try {
    if (contentType === 'image/png') {
      if (buf.length < 24) return null;
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (contentType === 'image/jpeg') {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) {
          i += 1;
          continue;
        }
        const marker = buf[i + 1];
        if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
          i += 2;
          continue;
        }
        const length = buf.readUInt16BE(i + 2);
        // SOF0..SOF15 except DHT(C4), JPG(C8), DAC(CC)
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        i += 2 + length;
      }
    }
  } catch {
    /* fall through */
  }
  return null;
}

module.exports = { sniffMedia, readImageSize };
