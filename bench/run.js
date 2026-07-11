import { parse, stringify } from '../src/index.js';
import { generateDocument, generateNested } from './generate.js';

const encoder = new TextEncoder();
const cases = [
  { name: 'small event', source: 'ping;', iterations: 100_000 },
  { name: 'large object', source: `data.event {items:[${Array.from({ length: 1000 }, (_, i) => `{id:${i},text:"item ${i}"}`).join(',')} ]};`, iterations: 100 },
  { name: '1,000 statements', source: generateDocument(1_000), iterations: 50 },
  { name: '100,000 statements', source: generateDocument(100_000), iterations: 2 },
  { name: 'deep nesting (64)', source: generateNested(64), iterations: 1_000 },
];

function measure(fn, iterations) {
  fn();
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  return performance.now() - start;
}

console.log('scenario\toperation\tbytes\toperations\telapsed_ms\tMB/s\tevents/s');
for (const scenario of cases) {
  const bytes = encoder.encode(scenario.source).length;
  const parsed = parse(scenario.source);
  for (const [operation, fn] of [
    ['parse', () => parse(scenario.source)],
    ['stringify', () => stringify(parsed)],
    ['parse+stringify', () => stringify(parse(scenario.source))],
  ]) {
    const elapsed = measure(fn, scenario.iterations);
    const seconds = elapsed / 1000;
    const throughput = bytes * scenario.iterations / 1024 / 1024 / seconds;
    const events = parsed.length * scenario.iterations / seconds;
    console.log(`${scenario.name}\t${operation}\t${bytes}\t${scenario.iterations}\t${elapsed.toFixed(2)}\t${throughput.toFixed(1)}\t${events.toFixed(0)}`);
  }
}
