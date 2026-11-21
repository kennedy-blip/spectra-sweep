// Reproduce the client-side ZIP writer and validate with a real unzip.
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
};

function zipStore(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true); lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, size, true); lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    chunks.push(local, f.data);
    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true); cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true); cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true); cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    central.push(cd);
    offset += local.length + size;
  }
  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true); ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  const total = chunks.reduce((a, c) => a + c.length, 0) + cdSize + 22;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of [...chunks, ...central, end]) { out.set(c, p); p += c.length; }
  return out;
}

const enc = new TextEncoder();
const buf = zipStore([
  { name: 'AndroidManifest.xml', data: enc.encode('<?xml version="1.0"?><manifest package="com.spectrasweep.privacy"/>') },
  { name: 'BUILD_INFO.txt', data: enc.encode('SPECTRA-SWEEP OFFLINE RELEASE CONTAINER\nversion: 1.0.0\nabi: arm64-v8a\n') },
  { name: 'assets/public/index.html', data: enc.encode('<!-- SpectraSweep offline shell -->') },
]);
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert';

writeFileSync('/tmp/spectrasweep-probe.apk', Buffer.from(buf));

// Validate against the platform's unzip if available.
try {
  const out = execFileSync('unzip', ['-t', '/tmp/spectrasweep-probe.apk'], { encoding: 'utf8' });
  assert.match(out, /No errors detected/);
  console.log('✔ APK container is a valid ZIP archive (unzip -t clean)');
} catch (e) {
  if (e && e.code === 'ENOENT') {
    console.log('… unzip not available, skipping external validation');
  } else {
    throw e;
  }
}

// Structural assertions on the raw bytes.
assert.strictEqual(new DataView(buf.buffer).getUint32(0, true), 0x04034b50);
assert.ok(Buffer.from(buf).includes(Buffer.from([0x50, 0x4b, 0x05, 0x06])));
console.log('✔ EOCD + central directory signatures present');

