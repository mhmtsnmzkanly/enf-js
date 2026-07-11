import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../src/index.js';

test('JSON string escapes and surrogate pairs', () => {
  const value = parse('x "\\\"\\\\\\/\\b\\f\\n\\r\\t\\u0061\\uD83D\\uDE00";')[0].value;
  assert.equal(value, '"\\/\b\f\n\r\ta😀');
  for (const source of ['x "\\q";', 'x "\\u12";', 'x "\\uD800";', 'x "\\uDC00";', 'x "a\nb";']) assert.throws(() => parse(source), (error) => error.code === 'E_INVALID_STRING' || error.code === 'E_UNEXPECTED_EOF');
});

test('JSON number domain and safe integers', () => {
  for (const source of ['x 01;', 'x +1;', 'x .5;', 'x 1.;', 'x 1e;', 'x NaN;', 'x Infinity;', 'x 9007199254740992;', 'x 9007199254740992.0;', 'x 1e20;']) assert.throws(() => parse(source));
  assert.equal(parse('x 1.5e2;')[0].value, 150);
  const negativeZero = parse('x -0;')[0].value;
  assert.equal(Object.is(negativeZero, -0), true);
});
