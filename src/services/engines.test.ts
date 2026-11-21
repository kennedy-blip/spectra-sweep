import { describe, expect, it } from 'vitest';
import { CRITICAL_UT, EARTH_BASELINE_UT, WATCH_UT, classifyEmf } from './emfEngine';
import { BEACON_PRESETS, FLAG_HZ, SCAN_HIGH_HZ, SCAN_LOW_HZ } from './ultrasonicEngine';
import { APK_FILENAME, APK_PATH, APK_VERSION } from './apk';

describe('EMF thresholds', () => {
  it('keeps Earth normal, watch and critical bands distinct', () => {
    expect(EARTH_BASELINE_UT).toBe(45);
    expect(WATCH_UT).toBeGreaterThan(EARTH_BASELINE_UT);
    expect(CRITICAL_UT).toBeGreaterThan(WATCH_UT);
  });

  it('classifies across the full sweep range', () => {
    const cases: [number, string][] = [
      [0, 'nominal'],
      [46, 'nominal'],
      [89.9, 'nominal'],
      [90, 'watch'],
      [159.9, 'watch'],
      [160, 'critical'],
      [900, 'critical'],
    ];
    for (const [ut, expected] of cases) expect(classifyEmf(ut)).toBe(expected);
  });
});

describe('ultrasonic band', () => {
  it('scans the documented 15.0–22.5 kHz window', () => {
    expect(SCAN_LOW_HZ).toBe(15000);
    expect(SCAN_HIGH_HZ).toBe(22500);
    expect(FLAG_HZ).toBe(18000);
    expect(FLAG_HZ).toBeGreaterThan(SCAN_LOW_HZ);
    expect(FLAG_HZ).toBeLessThan(SCAN_HIGH_HZ);
  });

  it('every synthetic beacon sits above the flag line and inside the band', () => {
    expect(BEACON_PRESETS).toHaveLength(3);
    for (const p of BEACON_PRESETS) {
      expect(p.hz).toBeGreaterThanOrEqual(FLAG_HZ);
      expect(p.hz).toBeLessThanOrEqual(SCAN_HIGH_HZ);
      expect(p.note.length).toBeGreaterThan(30);
    }
    expect(BEACON_PRESETS.map((p) => p.hz)).toEqual([19200, 20100, 18400]);
  });
});

describe('APK distribution contract', () => {
  it('points at the artifact the CI workflow publishes', () => {
    expect(APK_PATH).toBe('/releases/spectrasweep-release.apk');
    expect(APK_FILENAME).toBe('SpectraSweep-Privacy-v1.0.0.apk');
    expect(APK_VERSION).toBe('v1.0.0-arm64');
  });
});
