import { describe, it, expect, beforeEach } from 'vitest';
import { ToolPipeline } from './tool-pipeline';

describe('ToolPipeline', () => {
  let pipeline: any; // Using any to access private methods for testing

  beforeEach(() => {
    pipeline = new ToolPipeline();
  });

  describe('validateType', () => {
    it('should correctly validate string types', () => {
      expect(pipeline.validateType('hello', 'string')).toBe(true);
      expect(pipeline.validateType('', 'string')).toBe(true);

      expect(pipeline.validateType(123, 'string')).toBe(false);
      expect(pipeline.validateType(true, 'string')).toBe(false);
      expect(pipeline.validateType({}, 'string')).toBe(false);
      expect(pipeline.validateType([], 'string')).toBe(false);
      expect(pipeline.validateType(null, 'string')).toBe(false);
      expect(pipeline.validateType(undefined, 'string')).toBe(false);
    });

    it('should correctly validate number types', () => {
      expect(pipeline.validateType(123, 'number')).toBe(true);
      expect(pipeline.validateType(0, 'number')).toBe(true);
      expect(pipeline.validateType(-1.5, 'number')).toBe(true);

      expect(pipeline.validateType(NaN, 'number')).toBe(false); // Should reject NaN
      expect(pipeline.validateType('123', 'number')).toBe(false);
      expect(pipeline.validateType(true, 'number')).toBe(false);
      expect(pipeline.validateType({}, 'number')).toBe(false);
      expect(pipeline.validateType([], 'number')).toBe(false);
      expect(pipeline.validateType(null, 'number')).toBe(false);
      expect(pipeline.validateType(undefined, 'number')).toBe(false);
    });

    it('should correctly validate boolean types', () => {
      expect(pipeline.validateType(true, 'boolean')).toBe(true);
      expect(pipeline.validateType(false, 'boolean')).toBe(true);

      expect(pipeline.validateType('true', 'boolean')).toBe(false);
      expect(pipeline.validateType(1, 'boolean')).toBe(false);
      expect(pipeline.validateType(0, 'boolean')).toBe(false);
      expect(pipeline.validateType({}, 'boolean')).toBe(false);
      expect(pipeline.validateType([], 'boolean')).toBe(false);
      expect(pipeline.validateType(null, 'boolean')).toBe(false);
      expect(pipeline.validateType(undefined, 'boolean')).toBe(false);
    });

    it('should correctly validate array types', () => {
      expect(pipeline.validateType([], 'array')).toBe(true);
      expect(pipeline.validateType([1, 2, 3], 'array')).toBe(true);
      expect(pipeline.validateType(['a', 'b'], 'array')).toBe(true);

      expect(pipeline.validateType('[]', 'array')).toBe(false);
      expect(pipeline.validateType(123, 'array')).toBe(false);
      expect(pipeline.validateType(true, 'array')).toBe(false);
      expect(pipeline.validateType({}, 'array')).toBe(false);
      expect(pipeline.validateType(null, 'array')).toBe(false);
      expect(pipeline.validateType(undefined, 'array')).toBe(false);
    });

    it('should correctly validate object types', () => {
      expect(pipeline.validateType({}, 'object')).toBe(true);
      expect(pipeline.validateType({ a: 1 }, 'object')).toBe(true);

      expect(pipeline.validateType(null, 'object')).toBe(false); // null should not be an object
      expect(pipeline.validateType([], 'object')).toBe(false); // arrays should not be objects
      expect(pipeline.validateType('{}', 'object')).toBe(false);
      expect(pipeline.validateType(123, 'object')).toBe(false);
      expect(pipeline.validateType(true, 'object')).toBe(false);
      expect(pipeline.validateType(undefined, 'object')).toBe(false);
    });

    it('should return true for unknown types', () => {
      expect(pipeline.validateType('value', 'unknown_type')).toBe(true);
      expect(pipeline.validateType(123, 'custom')).toBe(true);
    });
  });
});
