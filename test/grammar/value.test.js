import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../src/index.js';

test('all v1 value types parse to native values', () => {
  const events = parse('n null;t true;f false;i -17;x 1.25e2;s "a\\n😀";a [1,"x",null];o {id:17,active:true};');
  assert.deepEqual(events.map((event) => event.value), [null, true, false, -17, 125, 'a\n😀', [1, 'x', null], { id: 17, active: true }]);
});

test('object prototype names are data, not prototype mutation', () => {
  const value = parse('x {constructor:1,prototype:2,null:3};')[0].value;
  assert.equal(Object.hasOwn(value, 'constructor'), true);
  assert.equal(value.constructor, 1);
  assert.equal(value.null, 3);
  assert.equal({}.polluted, undefined);
});

test('tuple, bareword string, comments, quoted keys, and trailing commas are rejected', () => {
  for (const source of ['x (1,2);', 'x hello;', 'x /* no */ null;', 'x {"id":1};', 'x [1,];', 'x {id:1,};']) {
    assert.throws(() => parse(source));
  }
});

test('duplicate object keys are rejected', () => {
  assert.throws(() => parse('x {id:1,id:2};'), (error) => error.code === 'E_DUPLICATE_KEY');
});
