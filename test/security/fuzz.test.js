import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, tryParse, stringify } from '../../src/index.js';

const SEED = 0x5eed1234;
const ITERATIONS = Number.parseInt(process.env.ENF_FUZZ_ITERATIONS ?? '2000', 10);
if (!Number.isSafeInteger(ITERATIONS) || ITERATIONS < 1) throw new Error('ENF_FUZZ_ITERATIONS must be a positive safe integer');
const MUTATION_ITERATIONS = Math.max(1, Math.floor(ITERATIONS / 4));
const ROUNDTRIP_ITERATIONS = Math.max(1, Math.floor(ITERATIONS / 2));
function prng(seed) {
  let state = seed >>> 0;
  return () => { state = (state + 0x6d2b79f5) | 0; let t = Math.imul(state ^ state >>> 15, 1 | state); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function pick(random, values) { return values[Math.floor(random() * values.length)]; }

test(`random input never hangs or leaks internal exceptions (seed ${SEED}, iterations ${ITERATIONS})`, () => {
  const random = prng(SEED);
  const alphabet = 'abcXYZ019._-{}[]:,;"\\/\n\t😀';
  for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    let source = '';
    const length = Math.floor(random() * 200);
    for (let i = 0; i < length; i++) source += pick(random, [...alphabet]);
    const result = tryParse(source);
    assert.equal(typeof result.ok, 'boolean', `seed=${SEED} iteration=${iteration}`);
  }
});

test(`truncated and delimiter-mutated documents terminate (seed ${SEED}, iterations ${MUTATION_ITERATIONS})`, () => {
  const random = prng(SEED ^ 0xabc);
  const valid = 'message.send {id:17,text:"hello",items:[1,2,3]};ping;';
  for (let i = 0; i <= valid.length; i++) assert.equal(typeof tryParse(valid.slice(0, i)).ok, 'boolean');
  for (let i = 0; i < MUTATION_ITERATIONS; i++) {
    const at = Math.floor(random() * (valid.length + 1));
    const source = valid.slice(0, at) + pick(random, ['{', '}', '[', ']', ',', ';', '\\']) + valid.slice(at);
    assert.equal(typeof tryParse(source).ok, 'boolean');
  }
});

function randomValue(random, depth = 3) {
  const kinds = depth ? ['null', 'bool', 'number', 'string', 'array', 'object'] : ['null', 'bool', 'number', 'string'];
  switch (pick(random, kinds)) {
    case 'null': return null;
    case 'bool': return random() < 0.5;
    case 'number': return Math.floor(random() * 2000) - 1000 + (random() < 0.3 ? 0.25 : 0);
    case 'string': return pick(random, ['', 'text', 'a\nb', '😀', '"\\']);
    case 'array': return Array.from({ length: Math.floor(random() * 4) }, () => randomValue(random, depth - 1));
    default: {
      const out = {};
      for (let i = 0; i < Math.floor(random() * 4); i++) out[`key_${i}`] = randomValue(random, depth - 1);
      return out;
    }
  }
}

test(`generated values round-trip (seed ${SEED}, iterations ${ROUNDTRIP_ITERATIONS})`, () => {
  const random = prng(SEED ^ 0xdef);
  for (let i = 0; i < ROUNDTRIP_ITERATIONS; i++) {
    const events = [{ name: `fuzz.event_${i}`, value: randomValue(random) }];
    assert.deepEqual(parse(stringify(events)), events, `seed=${SEED} iteration=${i}`);
  }
});
