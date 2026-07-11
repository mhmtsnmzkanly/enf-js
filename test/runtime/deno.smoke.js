import { parse, stringify } from '../../src/index.js';

function assert(condition, message) {
  if (!condition) throw new Error(message ?? 'assertion failed');
}

if (globalThis.Deno) {
  Deno.test('Deno native ESM runtime smoke', () => {
    const events = parse('runtime.deno {ok:true};');
    assert(events.length === 1 && events[0].name === 'runtime.deno' && events[0].value.ok === true);
    assert(stringify(events) === 'runtime.deno {ok:true};');
  });
}
