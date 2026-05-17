import { describe, it, expect } from 'vitest';
import { generateId } from './utils';

describe('generateId', () => {
  it('should generate a string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
  });

  it('should generate unique IDs', () => {
    const ids = new Set<string>();
    const count = 10000;
    for (let i = 0; i < count; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(count);
  });

  it('should have correct format (timestamp-randomString)', () => {
    const id = generateId();
    const parts = id.split('-');

    expect(parts.length).toBe(2);

    const timestamp = Number(parts[0]);
    expect(Number.isNaN(timestamp)).toBe(false);
    expect(timestamp).toBeGreaterThan(0);

    // Verify it's a recent timestamp
    // Assuming the test runs within a few minutes of Date.now()
    const now = Date.now();
    expect(timestamp).toBeLessThanOrEqual(now);
    expect(timestamp).toBeGreaterThan(now - 10000); // within last 10 seconds

    const randomStr = parts[1];
    expect(randomStr.length).toBeLessThanOrEqual(7);
    expect(randomStr.length).toBeGreaterThan(0);
    expect(/^[a-z0-9]+$/.test(randomStr)).toBe(true);
  });
});
