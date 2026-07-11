import { parse } from './parser.js';
import { format } from './formatter.js';
import { ENFError, ENFSyntaxError } from './errors.js';

const USAGE = `Usage:
  enf check [file|-]
  enf format [--write] [file|-]
`;

function describe(error) {
  if (error instanceof ENFSyntaxError) return `${error.code}: ${error.message} at ${error.line}:${error.column}\n`;
  if (error instanceof ENFError) return `${error.code}: ${error.message}\n`;
  return `E_IO: ${error.message}\n`;
}

export function runCli(args, io) {
  const [command, ...rest] = args;
  if (command === '--help' || command === '-h') { io.stdout(USAGE); return 0; }
  if (command !== 'check' && command !== 'format') { io.stderr(USAGE); return 2; }
  const write = rest.includes('--write');
  const operands = rest.filter((arg) => arg !== '--write');
  if (operands.length > 1 || (command === 'check' && write)) { io.stderr(USAGE); return 2; }
  const file = operands[0] ?? '-';
  if (write && file === '-') { io.stderr('E_USAGE: --write requires a file\n'); return 2; }
  let source;
  try { source = file === '-' ? io.readStdin() : io.readFile(file); }
  catch (error) { io.stderr(describe(error)); return 2; }
  try {
    if (command === 'check') {
      const events = parse(source);
      io.stdout(`OK ${events.length} event${events.length === 1 ? '' : 's'}\n`);
    } else {
      const output = format(source);
      if (write) io.writeFileAtomic(file, output);
      else io.stdout(output);
    }
    return 0;
  } catch (error) {
    if (!(error instanceof ENFError)) throw error;
    io.stderr(describe(error));
    return 1;
  }
}
