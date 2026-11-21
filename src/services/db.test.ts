import { describe, expect, it } from 'vitest';
import { pinHash } from './db';

describe('vault PIN digest', () => {
  it('is deterministic for the same PIN', () => {
    expect(pinHash('1234')).toBe(pinHash('1234'));
  });

  it('differs for every 4-digit permutation sample', () => {
    const seen = new Set<string>();
    for (const p of ['0000', '1234', '4321', '1111', '9876', '5678', '2468', '1357', '9999', '1000']) {
      seen.add(pinHash(p));
    }
    expect(seen.size).toBe(10);
  });

  it('rejects cross-length collisions', () => {
    expect(pinHash('12')).not.toBe(pinHash('1234'));
  });

  it('is url-safe / stable', () => {
    expect(pinHash('0420')).toMatch(/^[0-9a-z]+$/);
  });
});
