import test from 'node:test';
import assert from 'node:assert/strict';
import { runCli } from '../../src/cli.js';

function harness(files = {}, stdin = '') {
  let stdout = '', stderr = '';
  const writes = [];
  const io = {
    readFile: (file) => { if (!(file in files)) throw new Error('not found'); return files[file]; },
    readStdin: () => stdin,
    writeFileAtomic: (file, text) => writes.push([file, text]),
    stdout: (text) => { stdout += text; }, stderr: (text) => { stderr += text; },
  };
  return { io, writes, output: () => ({ stdout, stderr }) };
}

test('check and stdin format behavior', () => {
  const check = harness({ 'a.enf': 'ping;' });
  assert.equal(runCli(['check', 'a.enf'], check.io), 0);
  assert.equal(check.output().stdout, 'OK 1 event\n');
  const format = harness({}, 'x{id:1};');
  assert.equal(runCli(['format'], format.io), 0);
  assert.equal(format.output().stdout, 'x {\n  id: 1\n};\n');
});

test('invalid --write never writes', () => {
  const h = harness({ 'bad.enf': 'x {id:1,id:2};' });
  assert.equal(runCli(['format', '--write', 'bad.enf'], h.io), 1);
  assert.equal(h.writes.length, 0);
  assert.match(h.output().stderr, /E_DUPLICATE_KEY/);
});

test('valid --write uses the atomic IO operation', () => {
  const h = harness({ 'a.enf': 'x{id:1};' });
  assert.equal(runCli(['format', '--write', 'a.enf'], h.io), 0);
  assert.deepEqual(h.writes, [['a.enf', 'x {\n  id: 1\n};\n']]);
});
