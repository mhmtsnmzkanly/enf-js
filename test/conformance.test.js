import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, format } from '../src/index.js';

function fixtures(group) {
  return JSON.parse(readFileSync(new URL(`../conformance/${group}/cases.json`, import.meta.url), 'utf8'));
}

test('valid conformance fixtures', () => {
  for (const fixture of fixtures('valid')) assert.deepEqual(parse(fixture.source), fixture.expected, fixture.name);
});

test('invalid conformance fixtures', () => {
  for (const fixture of fixtures('invalid')) assert.throws(() => parse(fixture.source), (error) => error.code === fixture.error, fixture.name);
});

test('canonical conformance fixtures', () => {
  for (const fixture of fixtures('canonical')) assert.equal(format(fixture.source), fixture.canonical, fixture.name);
});
