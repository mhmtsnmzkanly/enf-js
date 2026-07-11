import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, stringify, format, ENFTypeError } from '../../src/index.js';

test('parse/stringify and format preserve the data model', () => {
  const source = 'message.send{id:17,text:"hello",tags:["a","b"]};ping;zero -0;';
  const value = parse(source);
  assert.deepEqual(parse(stringify(value)), value);
  assert.deepEqual(parse(format(source)), value);
  assert.equal(Object.is(parse(stringify(value))[2].value, -0), true);
});

test('canonical formatting is stable', () => {
  const canonical = 'message.send {\n  id: 17,\n  data: {\n    ok: true\n  }\n};\nping;\n';
  assert.equal(format('message.send{id:17,data:{ok:true}};ping;'), canonical);
  assert.equal(format(canonical), canonical);
});

test('serializer rejects unsupported and unsafe JS values', () => {
  const cycle = []; cycle.push(cycle);
  const sparse = new Array(2); sparse[0] = 1;
  for (const value of [NaN, Infinity, 9007199254740992, 1n, undefined, () => {}, cycle, sparse, new Date()]) {
    assert.throws(() => stringify([{ name: 'x', value }]), (error) => error instanceof ENFTypeError);
  }
  assert.throws(() => stringify([{ name: 'Bad' }]), (error) => error.code === 'E_INVALID_EVENT_NAME');
  assert.throws(() => stringify([{ name: 'x', value: { bad_key_ok: 1, 'bad-key': 2 } }]), (error) => error.code === 'E_INVALID_KEY');
  assert.throws(() => stringify([{ name: 'x', value: { get id() { return 1; } } }]), (error) => error instanceof ENFTypeError);
  assert.throws(() => stringify([{ name: 'x', value: { [Symbol('id')]: 1 } }]), (error) => error instanceof ENFTypeError);
  const hidden = {};
  Object.defineProperty(hidden, 'id', { value: 1 });
  assert.throws(() => stringify([{ name: 'x', value: hidden }]), (error) => error instanceof ENFTypeError);
});

test('format rejects invalid input rather than recovering', () => {
  assert.throws(() => format('x {id:1,id:2};'), (error) => error.code === 'E_DUPLICATE_KEY');
});
