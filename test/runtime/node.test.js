import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, stringify, format } from '../../src/index.js';

test('Node.js ESM runtime smoke', () => {
  const events = parse('runtime.node {ok:true};');
  assert.deepEqual(events, [{ name: 'runtime.node', value: { ok: true } }]);
  assert.equal(stringify(events), 'runtime.node {ok:true};');
  assert.match(format('runtime.node {ok:true};'), /runtime\.node/);
});
