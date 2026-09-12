import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, symlinkSync, readFileSync, lstatSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse, tryParse, stringify, format, ENFLimitError, ENFTypeError, ENFSyntaxError } from '../../src/index.js';
import { runCli } from '../../src/cli.js';

test('serializer: lone surrogates are rejected with E_INVALID_STRING', () => {
  // Lone high surrogate at string end
  assert.throws(() => stringify([{ name: 'x', value: 'prefix\ud800' }]), (err) => err instanceof ENFTypeError && err.code === 'E_INVALID_STRING');
  // Lone high surrogate followed by a non-low surrogate
  assert.throws(() => stringify([{ name: 'x', value: '\ud800world' }]), (err) => err instanceof ENFTypeError && err.code === 'E_INVALID_STRING');
  // Lone low surrogate
  assert.throws(() => stringify([{ name: 'x', value: '\udc00' }]), (err) => err instanceof ENFTypeError && err.code === 'E_INVALID_STRING');
});

test('serializer: array non-index properties and sparse arrays are rejected', () => {
  // Custom non-index property
  const arrWithProp = [1, 2];
  arrWithProp.extra = 'poison';
  assert.throws(() => stringify([{ name: 'x', value: arrWithProp }]), (err) => err instanceof ENFTypeError && err.code === 'E_INVALID_ARRAY');

  // Symbol property
  const arrWithSym = [1];
  arrWithSym[Symbol('meta')] = 'hidden';
  assert.throws(() => stringify([{ name: 'x', value: arrWithSym }]), (err) => err instanceof ENFTypeError && err.code === 'E_INVALID_ARRAY');

  // Sparse array (empty slot)
  const sparseArr = [1, , 3]; // eslint-disable-line no-sparse-arrays
  assert.throws(() => stringify([{ name: 'x', value: sparseArr }]), (err) => err instanceof ENFTypeError && err.code === 'E_SPARSE_ARRAY');

  // Non-contiguous index
  const oobArr = [];
  oobArr[5] = 42;
  assert.throws(() => stringify([{ name: 'x', value: oobArr }]), (err) => err instanceof ENFTypeError && err.code === 'E_SPARSE_ARRAY');

  // Fractional or negative string property
  const negArr = [1];
  negArr['-1'] = 42;
  assert.throws(() => stringify([{ name: 'x', value: negArr }]), (err) => err instanceof ENFTypeError && err.code === 'E_INVALID_ARRAY');
});

test('serializer: DAG exponential expansion is bounded by MAX_SERIALIZED_NODES', () => {
  let node = 'leaf';
  for (let i = 0; i < 18; i++) {
    node = [node, node];
  }
  // 2^18 = 262,144 nodes, which exceeds MAX_SERIALIZED_NODES (100,000)
  assert.throws(() => stringify([{ name: 'dag', value: node }]), (err) => err instanceof ENFLimitError && err.code === 'E_MAX_STRUCTURE');
});

test('lexer: UTF-8 BOM is transparently stripped', () => {
  const bomSource = '\uFEFFevent { id: 100 };';
  assert.deepEqual(parse(bomSource), [{ name: 'event', value: { id: 100 } }]);
  assert.equal(format(bomSource), 'event {\n  id: 100\n};\n');
});

test('lexer: oversized identifiers trigger E_MAX_IDENTIFIER_LENGTH', () => {
  const hugeWord = 'a_' + 'x'.repeat(1025);
  assert.throws(() => parse(`${hugeWord};`), (err) => err instanceof ENFLimitError && err.code === 'E_MAX_IDENTIFIER_LENGTH');
});

test('parser: limitsFrom prototype pollution resistance', () => {
  const proto = { maxDepth: -5, maxStatements: -1 };
  const evilOptions = Object.create(proto);
  evilOptions.maxDepth = 10;
  // Should ignore inherited invalid properties and use own valid maxDepth
  const result = parse('ping;', evilOptions);
  assert.deepEqual(result, [{ name: 'ping' }]);
});

test('parser: scalar values require separating whitespace from event name', () => {
  assert.throws(() => parse('event"string";'), (err) => err instanceof ENFSyntaxError && err.code === 'E_UNEXPECTED_TOKEN');
  assert.throws(() => parse('x"x";'), (err) => err instanceof ENFSyntaxError && err.code === 'E_UNEXPECTED_TOKEN');
  // Containers do not require whitespace
  assert.deepEqual(parse('event{id:1};'), [{ name: 'event', value: { id: 1 } }]);
  assert.deepEqual(parse('event[true];'), [{ name: 'event', value: [true] }]);
});

test('tryParse: handles unexpected RangeError safely as E_MAX_DEPTH', () => {
  // tryParse returns { ok: false, error: ENFLimitError } when depth limit or recursion is hit
  const hugeDoc = `x ${'['.repeat(100)}0${']'.repeat(100)};`;
  const res = tryParse(hugeDoc);
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'E_MAX_DEPTH');
});

test('cli: writeFileAtomic failure returns exit code 2 with E_IO', () => {
  let stderr = '';
  const io = {
    readFile: () => 'ping;',
    writeFileAtomic: () => { throw new Error('ENOSPC: no space left on device'); },
    stdout: () => {},
    stderr: (msg) => { stderr += msg; },
  };
  const exitCode = runCli(['format', '--write', 'test.enf'], io);
  assert.equal(exitCode, 2);
  assert.equal(stderr, 'E_IO: ENOSPC: no space left on device\n');
});

test('cli: bin/enf.js preserves symlinks during atomic writes', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'enf-symlink-test-'));
  try {
    const targetFile = join(tempDir, 'actual.enf');
    const symlinkFile = join(tempDir, 'symlink.enf');
    writeFileSync(targetFile, 'item{val:1};', 'utf8');
    symlinkSync(targetFile, symlinkFile);

    assert.equal(lstatSync(symlinkFile).isSymbolicLink(), true);

    const binPath = join(process.cwd(), 'bin', 'enf.js');
    execFileSync(process.execPath, [binPath, 'format', '--write', symlinkFile]);

    // Symlink should remain a symlink
    assert.equal(lstatSync(symlinkFile).isSymbolicLink(), true);
    // Real file should contain formatted output
    assert.equal(readFileSync(targetFile, 'utf8'), 'item {\n  val: 1\n};\n');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
