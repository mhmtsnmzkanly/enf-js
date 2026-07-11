import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, tryParse, ENFSyntaxError, ENFLimitError, ENFTypeError } from '../../src/index.js';

test('parse errors expose stable code and location', () => {
  assert.throws(() => parse('ok;\nBad;'), (error) => {
    assert.equal(error instanceof ENFSyntaxError, true);
    assert.equal(error.code, 'E_INVALID_EVENT_NAME');
    assert.deepEqual([error.offset, error.line, error.column], [4, 2, 1]);
    return true;
  });
});

test('tryParse is a non-throwing result API', () => {
  assert.deepEqual(tryParse('ping;'), { ok: true, value: [{ name: 'ping' }] });
  const result = tryParse('ping');
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_EXPECTED_SEMICOLON');
});

test('resource limits use ENFLimitError', () => {
  assert.throws(() => parse('ping;', { maxSourceLength: 4 }), (error) => error instanceof ENFLimitError && error.code === 'E_MAX_SOURCE_LENGTH');
  assert.throws(() => parse('a;b;', { maxStatements: 1 }), (error) => error instanceof ENFLimitError && error.code === 'E_MAX_STATEMENTS');
  assert.throws(() => parse('x [[[0]]];', { maxDepth: 2 }), (error) => error instanceof ENFLimitError && error.code === 'E_MAX_DEPTH');
  assert.throws(() => parse('x [1,2];', { maxArrayLength: 1 }), (error) => error.code === 'E_MAX_ARRAY_LENGTH');
  assert.throws(() => parse('x {a:1,b:2};', { maxObjectEntries: 1 }), (error) => error.code === 'E_MAX_OBJECT_ENTRIES');
  assert.throws(() => parse('x "ab";', { maxStringLength: 1 }), (error) => error.code === 'E_MAX_STRING_LENGTH');
  assert.throws(() => parse('x "😀";', { maxStringLength: 1 }), (error) => error.code === 'E_MAX_STRING_LENGTH');
  assert.equal(parse('x "😀";', { maxStringLength: 2 })[0].value, '😀');
});

test('invalid arguments and unsafe option increases are type errors', () => {
  assert.throws(() => parse(null), ENFTypeError);
  assert.throws(() => parse('', { maxDepth: 1000 }), ENFTypeError);
  assert.throws(() => parse('', { maxDepht: 1 }), (error) => error.code === 'E_INVALID_OPTION');
  assert.throws(() => parse('', null), (error) => error.code === 'E_INVALID_OPTION');
});
