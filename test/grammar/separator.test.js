import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, ENFSyntaxError } from '../../src/index.js';

test('every statement requires a semicolon', () => {
  assert.deepEqual(parse('ping;\npong;'), [{ name: 'ping' }, { name: 'pong' }]);
  assert.throws(() => parse('ping'), (error) => error instanceof ENFSyntaxError && error.code === 'E_EXPECTED_SEMICOLON');
  assert.throws(() => parse('ping\npong;'), (error) => error.code === 'E_UNEXPECTED_TOKEN');
  assert.throws(() => parse('ping;;'), (error) => error.code === 'E_INVALID_EVENT_NAME');
});

test('scalar values require whitespace while containers do not', () => {
  assert.deepEqual(parse('a "x";b{n:1};c[true];'), [
    { name: 'a', value: 'x' }, { name: 'b', value: { n: 1 } }, { name: 'c', value: [true] },
  ]);
  assert.throws(() => parse('a"x";'), (error) => error.code === 'E_UNEXPECTED_TOKEN');
});
