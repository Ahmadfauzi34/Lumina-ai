import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  describe('edge cases', () => {
    let mathRandomSpy: ReturnType<typeof vi.spyOn>;
    let dateNowSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      mathRandomSpy = vi.spyOn(Math, 'random');
      dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1234567890);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should handle Math.random() returning 0', () => {
      // 0.toString(36) is "0", so substring(2,9) is ""
      mathRandomSpy.mockReturnValue(0);
      expect(generateId()).toBe('1234567890-');
    });

    it('should handle Math.random() returning exactly 0.5', () => {
      // 0.5.toString(36) is "0.i", substring(2,9) is "i"
      mathRandomSpy.mockReturnValue(0.5);
      expect(generateId()).toBe('1234567890-i');
    });

    it('should handle Math.random() returning a value with many decimal places', () => {
      // This will ensure it truncates to exactly 7 characters for the random part
      mathRandomSpy.mockReturnValue(0.123456789012345);

      const id = generateId();
      expect(id.startsWith('1234567890-')).toBe(true);
      expect(id.length).toBe('1234567890-'.length + 7);
    });
  });
});
