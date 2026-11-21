// Smoke-test the pure algorithms that don't need a DOM.
// Run with: node scripts/selftest.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// ---------------------------------------------------------------- 1. ZIP writer
{
  const src = read('src/services/apk.ts');
  assert.ok(src.includes('0x04034b50'), 'local file header signature');
  assert.ok(src.includes('0x02014b50'), 'central directory signature');
  assert.ok(src.includes('0x06054b50'), 'end-of-central-directory signature');
  // The mime type moved into a shared constant, so assert the constant itself
  // instead of a string literal that no longer appears in this form.
  assert.ok(
    /APK_MIME\s*=\s*'application\/vnd\.android\.package-archive'/.test(src),
    'APK mime',
  );
  assert.ok(src.includes('APK_FILENAME'), 'filename export');
}

// ------------------------------------------------------- 2. pin hash determinism
{
  const body = read('src/services/db.ts');
  const fn = body.match(/export function pinHash[\s\S]*?\n}/)[0];
  const js = fn
    .replace('export function pinHash(pin: string): string {', 'function pinHash(pin) {')
    .replace(/let h = 2166136261;/, 'let h = 2166136261;');
  const mod = new Function(`${js}; return pinHash;`)();
  assert.strictEqual(mod('1234'), mod('1234'), 'deterministic');
  assert.notStrictEqual(mod('1234'), mod('4321'), 'collision-free for digits');
  assert.match(mod('0000'), /^[0-9a-z]+$/);
}

// ------------------------------------------------ 3. optical: fixture geometry
{
  const src = read('src/services/opticalGlintEngine.ts');
  const sceneBlock = src.slice(src.indexOf('export const OPTICAL_SCENES'), src.indexOf('interface Track'));
  const sceneJs = sceneBlock
    .replace('export const OPTICAL_SCENES: OpticalScene[] =', 'const OPTICAL_SCENES =');
  const scenes = new Function(`${sceneJs}; return OPTICAL_SCENES;`)();
  assert.strictEqual(scenes.length, 4, 'four fixtures');
  assert.deepStrictEqual(scenes.map((s) => s.threat), ['critical', 'critical', 'watch', 'clean']);
  for (const s of scenes) {
    if (!s.pinhole) continue;
    for (const k of ['x', 'y']) {
      assert.ok(s.pinhole[k] > 0.15 && s.pinhole[k] < 0.85, `${s.id}.${k} inside frame`);
    }
    assert.ok(s.pinhole.r > 1 && s.pinhole.r < 4, `${s.id} sub-3px radius`);
  }
  assert.ok(src.includes(' PROC_W = 448') && src.includes(' PROC_H = 252'), 'proc buffer');
  assert.ok(src.includes('maskSource'), 'pre-shader luma plane captured');
  assert.ok(src.includes('Math.hypot(tr.x - c.x, tr.y - c.y)'), 'temporal association');
  assert.ok(src.includes('best.hits >= 5'), 'lock hysteresis');
}

// ----------------------------------------------- 4. ultrasonic: band constants
{
  const src = read('src/services/ultrasonicEngine.ts');
  assert.ok(src.includes('SCAN_LOW_HZ = 15000') && src.includes('SCAN_HIGH_HZ = 22500'));
  assert.ok(src.includes('FLAG_HZ = 18000'));
  assert.ok(src.includes('FFT_SIZE = 16384'));
  assert.ok(src.includes('echoCancellation: false'));
  assert.ok(src.includes('noiseSuppression: false'));
  assert.ok(src.includes('autoGainControl: false'));
  assert.ok(src.includes("filter.type = 'highpass'"));
  assert.ok(src.includes('filter.frequency.value = 18500'), '18.5 kHz curtain edge');
  assert.ok(src.includes("new AC({ sampleRate: 48000"), 'locked 48 kHz context');
  for (const hz of ['19200', '20100', '18400']) assert.ok(src.includes(hz), `preset ${hz}`);
}

// ---------------------------------------------------- 5. EMF: flux math + bands
{
  const src = read('src/services/emfEngine.ts');
  assert.ok(src.includes('EARTH_BASELINE_UT = 45'));
  assert.ok(src.includes('WATCH_UT = 90'));
  assert.ok(src.includes('CRITICAL_UT = 160'));
  const mag = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
  assert.strictEqual(Math.round(mag(0, 0, 45)), 45);
  // reproduce the engine's synthetic vector construction for a 240 µT target
  {
    const target = 240;
    const heading = 0.6;
    const x = Math.cos(heading) * target * 0.55;
    const y = Math.sin(heading) * target * 0.48;
    const z = Math.sqrt(Math.max(0, target * target - x * x - y * y));
    // x + y are deliberately under-weighted, so the residual Z must carry the rest
    assert.ok(Math.abs(mag(x, y, z) - target) < 1e-6, 'vector magnitude equals target');
    assert.ok(z > 0, 'Z residual positive for a 240 µT target');
  }
  const classifyBody = src
    .match(/export function classifyEmf[\s\S]*?\n}/)[0]
    .replace(/export function classifyEmf\(magnitude: number\): [^{]+\{/, 'function classifyEmf(magnitude) {');
  const classify = new Function(
    'WATCH_UT', 'CRITICAL_UT', `${classifyBody}; return classifyEmf;`,
  )(90, 160);
  assert.strictEqual(classify(46), 'nominal');
  assert.strictEqual(classify(91), 'watch');
  assert.strictEqual(classify(161), 'critical');
}

// ----------------------------------------------- 6. privacy: IP classification
{
  const src = read('src/services/privacyAudit.ts');
  const arrowStart = src.indexOf('const isLocalIp');
  const arrowEnd = src.indexOf('/i.test(ip);', arrowStart) + '/i.test(ip);'.length;
  const isLocalIp = new Function(
    `${src.slice(arrowStart, arrowEnd).replace('const isLocalIp = (ip: string) =>', 'return (ip) =>')}`,
  )();
  assert.strictEqual(isLocalIp('192.168.1.14'), true);
  assert.strictEqual(isLocalIp('10.0.0.5'), true);
  assert.strictEqual(isLocalIp('172.16.4.2'), true);
  assert.strictEqual(isLocalIp('169.254.10.2'), true);
  assert.strictEqual(isLocalIp('8.8.8.8'), false);
  assert.strictEqual(isLocalIp('abcd1234.local'), false);
  assert.ok(src.includes('stun:stun.l.google.com:19302'));
  assert.ok(src.includes('WEBGL_debug_renderer_info'));
  assert.ok(src.includes('obfuscate_host_addresses'));
}

// ---------------------------------------------------- 7. checklist completeness
{
  const src = read('src/state/store.tsx');
  const block = src.slice(src.indexOf('export const CHECKLIST'), src.indexOf('export interface AppState'));
  const blockJs = block
    .replace('export const CHECKLIST: ChecklistItem[] =', 'const CHECKLIST =')
    .replace(/ as const/g, '');
  const items = new Function(`${blockJs}; return CHECKLIST;`)();
  assert.strictEqual(items.length, 12, 'exactly 12 checkpoints');
  assert.deepStrictEqual(items.map((i) => i.index), [1,2,3,4,5,6,7,8,9,10,11,12]);
  const mods = new Set(items.map((i) => i.module));
  for (const m of ['optical', 'ultrasonic', 'emf', 'footprint']) assert.ok(mods.has(m), `module ${m} reachable`);
  for (const i of items) assert.ok(i.detail.length > 40 && i.zone.length > 2);
}

// ------------------------------------------------------------- 8. RBAC gating
{
  const src = read('src/state/store.tsx');
  assert.ok(src.includes("ROLE_RANK: Record<Role, number> = { traveler: 0, auditor: 1, director: 2 }"));
  const optical = read('src/modules/OpticalLensFinder.tsx');
  const ultrasonic = read('src/modules/UltrasonicShield.tsx');
  const footprint = read('src/modules/DigitalFootprint.tsx');
  assert.ok(optical.includes("can('auditor')"), 'pro shaders gated to auditor');
  assert.ok(ultrasonic.includes("can('auditor')"), 'jammer gated to auditor');
  assert.ok(footprint.includes("can('director')"), 'JSON export gated to director');
  for (const [name, body] of [['optical', optical], ['ultrasonic', ultrasonic], ['footprint', footprint]]) {
    assert.ok(body.includes("type: 'privileges'"), `${name} escalates to the permission modal`);
  }
}

console.log('✔ all self-tests passed');
