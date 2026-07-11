#!/usr/bin/env node
import { readFileSync, writeFileSync, renameSync, unlinkSync, statSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';
import { runCli } from '../src/cli.js';

function writeFileAtomic(file, content) {
  const temporary = join(dirname(file), `.${basename(file)}.${process.pid}.tmp`);
  try {
    const mode = statSync(file).mode & 0o777;
    writeFileSync(temporary, content, { encoding: 'utf8', mode });
    renameSync(temporary, file);
  } catch (error) {
    try { unlinkSync(temporary); } catch {}
    throw error;
  }
}

const io = {
  readFile: (file) => readFileSync(file, 'utf8'),
  readStdin: () => readFileSync(0, 'utf8'),
  writeFileAtomic,
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
};

process.exitCode = runCli(process.argv.slice(2), io);
