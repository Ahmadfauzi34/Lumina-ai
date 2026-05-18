import { describe, it, expect, beforeEach } from 'vitest';
import { ToolPipeline } from './tool-pipeline';

describe('ToolPipeline', () => {
  let pipeline: any; // Using any to access private methods for testing

  beforeEach(() => {
    pipeline = new ToolPipeline();
  });


  describe('validateType', () => {
    const testCases = [
      // string
      { value: 'hello', expectedType: 'string', result: true },
      { value: '', expectedType: 'string', result: true },
      { value: String('test'), expectedType: 'string', result: true },
      { value: 123, expectedType: 'string', result: false },
      { value: true, expectedType: 'string', result: false },
      { value: {}, expectedType: 'string', result: false },
      { value: [], expectedType: 'string', result: false },
      { value: null, expectedType: 'string', result: false },
      { value: undefined, expectedType: 'string', result: false },

      // number
      { value: 123, expectedType: 'number', result: true },
      { value: 0, expectedType: 'number', result: true },
      { value: -1.5, expectedType: 'number', result: true },
      { value: Infinity, expectedType: 'number', result: true },
      { value: -Infinity, expectedType: 'number', result: true },
      { value: Number.MAX_VALUE, expectedType: 'number', result: true },
      { value: NaN, expectedType: 'number', result: false },
      { value: '123', expectedType: 'number', result: false },
      { value: true, expectedType: 'number', result: false },
      { value: {}, expectedType: 'number', result: false },
      { value: [], expectedType: 'number', result: false },
      { value: null, expectedType: 'number', result: false },
      { value: undefined, expectedType: 'number', result: false },

      // boolean
      { value: true, expectedType: 'boolean', result: true },
      { value: false, expectedType: 'boolean', result: true },
      { value: Boolean(1), expectedType: 'boolean', result: true },
      { value: 'true', expectedType: 'boolean', result: false },
      { value: 1, expectedType: 'boolean', result: false },
      { value: 0, expectedType: 'boolean', result: false },
      { value: {}, expectedType: 'boolean', result: false },
      { value: [], expectedType: 'boolean', result: false },
      { value: null, expectedType: 'boolean', result: false },
      { value: undefined, expectedType: 'boolean', result: false },

      // array
      { value: [], expectedType: 'array', result: true },
      { value: [1, 2, 3], expectedType: 'array', result: true },
      { value: ['a', 'b'], expectedType: 'array', result: true },
      { value: new Array(5), expectedType: 'array', result: true },
      { value: '[]', expectedType: 'array', result: false },
      { value: 123, expectedType: 'array', result: false },
      { value: true, expectedType: 'array', result: false },
      { value: {}, expectedType: 'array', result: false },
      { value: null, expectedType: 'array', result: false },
      { value: undefined, expectedType: 'array', result: false },

      // object
      { value: {}, expectedType: 'object', result: true },
      { value: { a: 1 }, expectedType: 'object', result: true },
      { value: Object.create(null), expectedType: 'object', result: true },
      { value: new Date(), expectedType: 'object', result: true },
      { value: null, expectedType: 'object', result: false }, // null is not an object according to validateType
      { value: [], expectedType: 'object', result: false }, // array is not an object according to validateType
      { value: '{}', expectedType: 'object', result: false },
      { value: 123, expectedType: 'object', result: false },
      { value: true, expectedType: 'object', result: false },
      { value: undefined, expectedType: 'object', result: false },

      // unknown types should default to true
      { value: 'value', expectedType: 'unknown_type', result: true },
      { value: 123, expectedType: 'custom', result: true },
      { value: null, expectedType: 'any', result: true },
      { value: undefined, expectedType: 'whatever', result: true }
    ];

    it.each(testCases)(
      'should return $result when checking if $value is $expectedType',
      ({ value, expectedType, result }) => {
        expect(pipeline.validateType(value, expectedType)).toBe(result);
      }
    );
  });
});
