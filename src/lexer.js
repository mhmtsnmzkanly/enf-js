import { ENFSyntaxError, ENFLimitError } from './errors.js';

export const Token = Object.freeze({
  WORD: 'word', STRING: 'string', NUMBER: 'number', TRUE: 'true', FALSE: 'false', NULL: 'null',
  LBRACE: '{', RBRACE: '}', LBRACKET: '[', RBRACKET: ']', COLON: ':', COMMA: ',', SEMICOLON: ';', EOF: 'eof',
});

const PUNCTUATION = new Set(['{', '}', '[', ']', ':', ',', ';']);
const SIMPLE_ESCAPES = Object.freeze({ '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' });

function isWhitespace(ch) { return ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n'; }
function isDigit(ch) { return ch >= '0' && ch <= '9'; }
function isHex(ch) { return isDigit(ch) || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F'); }
function isWordChar(ch) { return ch !== undefined && !isWhitespace(ch) && !PUNCTUATION.has(ch) && ch !== '"'; }

export class Lexer {
  constructor(source, limits) {
    this.source = source;
    this.limits = limits;
    this.offset = 0;
    this.line = 1;
    this.column = 1;
  }

  location() { return { offset: this.offset, line: this.line, column: this.column }; }
  peek(ahead = 0) { return this.source[this.offset + ahead]; }
  advance() {
    const ch = this.source[this.offset++];
    if (ch === '\n') { this.line++; this.column = 1; }
    else if (ch === '\r') {
      if (this.peek() !== '\n') { this.line++; this.column = 1; }
    } else this.column++;
    return ch;
  }
  /** @returns {never} */
  fail(message, code, location = this.location()) { throw new ENFSyntaxError(message, code, location); }
  skipWhitespace() { while (isWhitespace(this.peek())) this.advance(); }

  next() {
    this.skipWhitespace();
    const start = this.location();
    const ch = this.peek();
    if (ch === undefined) return { type: Token.EOF, start, end: this.offset };
    if (PUNCTUATION.has(ch)) { this.advance(); return { type: ch, text: ch, start, end: this.offset }; }
    if (ch === '"') return this.scanString(start);
    if (ch === '-' || isDigit(ch)) return this.scanNumber(start);
    if (isWordChar(ch)) return this.scanWord(start);
    this.fail(`Unexpected character ${JSON.stringify(ch)}`, 'E_UNEXPECTED_TOKEN', start);
  }

  scanWord(start) {
    while (isWordChar(this.peek())) this.advance();
    const text = this.source.slice(start.offset, this.offset);
    return { type: Token.WORD, text, value: text, start, end: this.offset };
  }

  scanNumber(start) {
    if (this.peek() === '-') this.advance();
    if (!isDigit(this.peek())) this.fail("Expected a digit after '-'", 'E_INVALID_NUMBER', start);
    if (this.peek() === '0') {
      this.advance();
      if (isDigit(this.peek())) this.fail('Leading zeroes are not allowed', 'E_INVALID_NUMBER', start);
    } else while (isDigit(this.peek())) this.advance();
    if (this.peek() === '.') {
      this.advance();
      if (!isDigit(this.peek())) this.fail('Expected a digit after the decimal point', 'E_INVALID_NUMBER', start);
      while (isDigit(this.peek())) this.advance();
    }
    if (this.peek() === 'e' || this.peek() === 'E') {
      this.advance();
      if (this.peek() === '+' || this.peek() === '-') this.advance();
      if (!isDigit(this.peek())) this.fail('Expected a digit in the exponent', 'E_INVALID_NUMBER', start);
      while (isDigit(this.peek())) this.advance();
    }
    if (isWordChar(this.peek())) this.fail('Invalid character after number', 'E_INVALID_NUMBER', start);
    const text = this.source.slice(start.offset, this.offset);
    const value = Number(text);
    if (!Number.isFinite(value)) this.fail('Number is outside the finite range', 'E_NUMBER_RANGE', start);
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) this.fail('Integer-valued number is outside the safe range', 'E_NUMBER_RANGE', start);
    return { type: Token.NUMBER, text, value, start, end: this.offset };
  }

  scanString(start) {
    this.advance();
    let value = '';
    while (this.peek() !== '"') {
      const ch = this.peek();
      if (ch === undefined) this.fail('Unterminated string', 'E_UNEXPECTED_EOF', start);
      if (ch.charCodeAt(0) < 0x20) this.fail('Unescaped control character in string', 'E_INVALID_STRING', this.location());
      if (ch !== '\\') {
        const unit = ch.charCodeAt(0);
        if (unit >= 0xdc00 && unit <= 0xdfff) this.fail('Lone low surrogate in string', 'E_INVALID_STRING', this.location());
        if (unit >= 0xd800 && unit <= 0xdbff) {
          const low = this.peek(1)?.charCodeAt(0);
          if (low < 0xdc00 || low > 0xdfff) this.fail('Lone high surrogate in string', 'E_INVALID_STRING', this.location());
          value += this.advance() + this.advance();
        } else value += this.advance();
      }
      else {
        const escapeLocation = this.location();
        this.advance();
        const escape = this.advance();
        if (escape === 'u') value += this.scanUnicodeEscape(escapeLocation);
        else if (Object.hasOwn(SIMPLE_ESCAPES, escape)) value += SIMPLE_ESCAPES[escape];
        else this.fail(`Invalid escape \\${escape ?? ''}`, 'E_INVALID_STRING', escapeLocation);
      }
      if (value.length > this.limits.maxStringLength) throw new ENFLimitError('Maximum string length exceeded', 'E_MAX_STRING_LENGTH');
    }
    this.advance();
    return { type: Token.STRING, text: this.source.slice(start.offset, this.offset), value, start, end: this.offset };
  }

  scanUnicodeEscape(location) {
    let hex = '';
    for (let i = 0; i < 4; i++) {
      if (!isHex(this.peek())) this.fail('Unicode escape requires four hex digits', 'E_INVALID_STRING', location);
      hex += this.advance();
    }
    const unit = Number.parseInt(hex, 16);
    if (unit >= 0xdc00 && unit <= 0xdfff) this.fail('Lone low surrogate escape', 'E_INVALID_STRING', location);
    if (unit < 0xd800 || unit > 0xdbff) return String.fromCharCode(unit);
    if (this.peek() !== '\\' || this.peek(1) !== 'u') this.fail('High surrogate must be followed by a low surrogate escape', 'E_INVALID_STRING', location);
    this.advance(); this.advance();
    let lowHex = '';
    for (let i = 0; i < 4; i++) {
      if (!isHex(this.peek())) this.fail('Low surrogate requires four hex digits', 'E_INVALID_STRING', location);
      lowHex += this.advance();
    }
    const low = Number.parseInt(lowHex, 16);
    if (low < 0xdc00 || low > 0xdfff) this.fail('High surrogate must be followed by a low surrogate escape', 'E_INVALID_STRING', location);
    return String.fromCharCode(unit, low);
  }
}
