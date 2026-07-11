import { Lexer, Token } from './lexer.js';
import { ENFSyntaxError, ENFLimitError, ENFTypeError } from './errors.js';

export const DEFAULT_LIMITS = Object.freeze({
  maxSourceLength: 16 * 1024 * 1024,
  maxDepth: 64,
  maxStatements: 100_000,
  maxArrayLength: 10_000,
  maxObjectEntries: 10_000,
  maxStringLength: 256 * 1024,
});
/** @typedef {null | boolean | number | string | ENFValue[] | {[key: string]: ENFValue}} ENFValue */
/** @typedef {{name: string, value?: ENFValue}} ENFEvent */
/** @typedef {{maxSourceLength?: number, maxDepth?: number, maxStatements?: number, maxArrayLength?: number, maxObjectEntries?: number, maxStringLength?: number}} ParseOptions */
const EVENT_NAME = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;
const KEY = /^[a-z][a-z0-9_]*$/;

/** @param {ParseOptions} [options] */
function limitsFrom(options = {}) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new ENFTypeError('Parse options must be an object', 'E_INVALID_OPTION');
  }
  const limits = { ...DEFAULT_LIMITS };
  for (const key of Object.keys(options)) {
    if (!Object.hasOwn(DEFAULT_LIMITS, key)) throw new ENFTypeError(`Unknown parse option '${key}'`, 'E_INVALID_OPTION');
  }
  for (const key of Object.keys(DEFAULT_LIMITS)) {
    if (options[key] !== undefined) {
      if (!Number.isSafeInteger(options[key]) || options[key] < 1 || options[key] > DEFAULT_LIMITS[key]) {
        throw new ENFTypeError(`${key} must be an integer between 1 and ${DEFAULT_LIMITS[key]}`, 'E_INVALID_OPTION');
      }
      limits[key] = options[key];
    }
  }
  return limits;
}

class Parser {
  constructor(source, limits) {
    this.source = source;
    this.limits = limits;
    this.lexer = new Lexer(source, limits);
    this.current = this.lexer.next();
    this.depth = 0;
  }
  advance() { const token = this.current; this.current = this.lexer.next(); return token; }
  /** @returns {never} */
  fail(message, code, token = this.current) { throw new ENFSyntaxError(message, code, token.start); }
  expect(type, message, code) {
    if (this.current.type !== type) this.fail(message, code ?? (this.current.type === Token.EOF ? 'E_UNEXPECTED_EOF' : 'E_UNEXPECTED_TOKEN'));
    return this.advance();
  }

  document() {
    const events = [];
    while (this.current.type !== Token.EOF) {
      if (events.length >= this.limits.maxStatements) throw new ENFLimitError('Maximum statement count exceeded', 'E_MAX_STATEMENTS');
      events.push(this.statement());
    }
    return events;
  }

  statement() {
    if (this.current.type !== Token.WORD || !EVENT_NAME.test(this.current.text)) this.fail('Invalid event name', 'E_INVALID_EVENT_NAME');
    const eventToken = this.advance();
    const event = { name: eventToken.text };
    if (this.current.type === Token.EOF) {
      this.fail("Expected ';' after event", 'E_EXPECTED_SEMICOLON');
    } else if (this.current.type !== Token.SEMICOLON) {
      const scalar = ![Token.LBRACE, Token.LBRACKET].includes(this.current.type);
      if (scalar && this.current.start.offset === eventToken.end) this.fail('Scalar value must be separated from event name', 'E_UNEXPECTED_TOKEN');
      event.value = this.value();
    }
    this.expect(Token.SEMICOLON, "Expected ';' after event", 'E_EXPECTED_SEMICOLON');
    return event;
  }

  value() {
    switch (this.current.type) {
      case Token.STRING: case Token.NUMBER: return this.advance().value;
      case Token.WORD: {
        const keyword = this.current.text;
        if (keyword !== 'true' && keyword !== 'false' && keyword !== 'null') this.fail('Expected a value', 'E_UNEXPECTED_TOKEN');
        this.advance();
        return keyword === 'true' ? true : keyword === 'false' ? false : null;
      }
      case Token.LBRACKET: return this.array();
      case Token.LBRACE: return this.object();
      default: this.fail('Expected a value', 'E_UNEXPECTED_TOKEN');
    }
  }

  enterContainer() {
    this.depth++;
    if (this.depth > this.limits.maxDepth) throw new ENFLimitError('Maximum nesting depth exceeded', 'E_MAX_DEPTH');
  }
  array() {
    this.enterContainer();
    try {
      this.advance();
      const result = [];
      if (this.current.type !== Token.RBRACKET) {
        for (;;) {
          if (result.length >= this.limits.maxArrayLength) throw new ENFLimitError('Maximum array length exceeded', 'E_MAX_ARRAY_LENGTH');
          result.push(this.value());
          if (this.current.type !== Token.COMMA) break;
          this.advance();
          if (this.current.type === Token.RBRACKET) this.fail('Trailing comma is not allowed', 'E_UNEXPECTED_TOKEN');
        }
      }
      this.expect(Token.RBRACKET, "Expected ']'", 'E_UNEXPECTED_TOKEN');
      return result;
    } finally { this.depth--; }
  }
  object() {
    this.enterContainer();
    try {
      this.advance();
      const result = {};
      let count = 0;
      if (this.current.type !== Token.RBRACE) {
        for (;;) {
          if (count >= this.limits.maxObjectEntries) throw new ENFLimitError('Maximum object entry count exceeded', 'E_MAX_OBJECT_ENTRIES');
          if (this.current.type !== Token.WORD || !KEY.test(this.current.text)) this.fail('Invalid object key', 'E_INVALID_KEY');
          const keyToken = this.advance();
          const key = keyToken.text;
          if (Object.hasOwn(result, key)) this.fail(`Duplicate object key '${key}'`, 'E_DUPLICATE_KEY', keyToken);
          this.expect(Token.COLON, "Expected ':' after object key");
          Object.defineProperty(result, key, { value: this.value(), enumerable: true, writable: true, configurable: true });
          count++;
          if (this.current.type !== Token.COMMA) break;
          this.advance();
          if (this.current.type === Token.RBRACE) this.fail('Trailing comma is not allowed', 'E_UNEXPECTED_TOKEN');
        }
      }
      this.expect(Token.RBRACE, "Expected '}'", 'E_UNEXPECTED_TOKEN');
      return result;
    } finally { this.depth--; }
  }
}

/** @param {string} source @param {ParseOptions} [options] @returns {ENFEvent[]} */
export function parse(source, options) {
  if (typeof source !== 'string') throw new ENFTypeError('parse() expects a string', 'E_INVALID_ARGUMENT');
  const limits = limitsFrom(options);
  if (source.length > limits.maxSourceLength) throw new ENFLimitError('Maximum source length exceeded', 'E_MAX_SOURCE_LENGTH');
  return new Parser(source, limits).document();
}

/** @param {string} source @param {ParseOptions} [options] @returns {{ok: true, value: ENFEvent[]} | {ok: false, error: ENFSyntaxError | ENFLimitError | ENFTypeError}} */
export function tryParse(source, options) {
  try { return { ok: true, value: parse(source, options) }; }
  catch (error) {
    if (error instanceof ENFSyntaxError || error instanceof ENFLimitError || error instanceof ENFTypeError) return { ok: false, error };
    throw error;
  }
}

export { EVENT_NAME, KEY };
