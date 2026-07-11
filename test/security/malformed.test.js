import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, stringify } from '../../src/index.js';

test('raw lone surrogates are rejected by parser and serializer', () => {
  assert.throws(() => parse(`x "${String.fromCharCode(0xd800)}";`), (error) => error.code === 'E_INVALID_STRING');
  assert.throws(() => stringify([{ name: 'x', value: String.fromCharCode(0xdc00) }]), (error) => error.code === 'E_INVALID_STRING');
});

test('deep hostile input stops at the configured limit', () => {
  const source = `x ${'['.repeat(1000)}0${']'.repeat(1000)};`;
  assert.throws(() => parse(source), (error) => error.code === 'E_MAX_DEPTH');
});
