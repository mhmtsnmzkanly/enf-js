import { ENFTypeError, ENFLimitError } from './errors.js';
import { DEFAULT_LIMITS, EVENT_NAME, KEY } from './parser.js';

/** @returns {never} */
function fail(message, code = 'E_UNSUPPORTED_VALUE') { throw new ENFTypeError(message, code); }

function quoteString(value) {
  let out = '"';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    const ch = value[i];
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = value.charCodeAt(i + 1);
      if (low < 0xdc00 || low > 0xdfff) fail('String contains a lone high surrogate', 'E_INVALID_STRING');
      out += ch + value[++i];
    } else if (code >= 0xdc00 && code <= 0xdfff) fail('String contains a lone low surrogate', 'E_INVALID_STRING');
    else if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\b') out += '\\b';
    else if (ch === '\f') out += '\\f';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (code < 0x20) out += `\\u${code.toString(16).padStart(4, '0')}`;
    else out += ch;
  }
  return out + '"';
}

function numberText(value) {
  if (!Number.isFinite(value)) fail('Numbers must be finite', 'E_NON_FINITE_NUMBER');
  if (Number.isInteger(value) && !Number.isSafeInteger(value)) fail('Integers must be safe integers', 'E_UNSAFE_INTEGER');
  return Object.is(value, -0) ? '-0' : String(value);
}

function renderValue(value, pretty, level, ancestors) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return numberText(value);
  if (typeof value === 'string') {
    if (value.length > DEFAULT_LIMITS.maxStringLength) throw new ENFLimitError('Maximum string length exceeded', 'E_MAX_STRING_LENGTH');
    return quoteString(value);
  }
  if (typeof value !== 'object') fail(`Unsupported value type '${typeof value}'`);
  if (ancestors.has(value)) fail('Cyclic values are not supported', 'E_CYCLE');
  if (level >= DEFAULT_LIMITS.maxDepth) throw new ENFLimitError('Maximum nesting depth exceeded', 'E_MAX_DEPTH');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return renderArray(value, pretty, level, ancestors);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail('Only plain objects are supported');
    return renderObject(value, pretty, level, ancestors);
  } finally { ancestors.delete(value); }
}

function renderArray(value, pretty, level, ancestors) {
  if (value.length > DEFAULT_LIMITS.maxArrayLength) throw new ENFLimitError('Maximum array length exceeded', 'E_MAX_ARRAY_LENGTH');
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i)) fail('Sparse arrays are not supported', 'E_SPARSE_ARRAY');
  const items = value.map((item) => renderValue(item, pretty, level + 1, ancestors));
  if (!pretty || items.length === 0) return `[${items.join(',')}]`;
  const indent = '  '.repeat(level + 1);
  return `[\n${items.map((item) => indent + item).join(',\n')}\n${'  '.repeat(level)}]`;
}

function renderObject(value, pretty, level, ancestors) {
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key === 'symbol')) fail('Symbol properties are not supported');
  const keys = /** @type {string[]} */ (ownKeys);
  if (keys.length > DEFAULT_LIMITS.maxObjectEntries) throw new ENFLimitError('Maximum object entry count exceeded', 'E_MAX_OBJECT_ENTRIES');
  const entries = keys.map((key) => {
    if (!KEY.test(key)) fail(`Invalid object key '${key}'`, 'E_INVALID_KEY');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable) fail('Non-enumerable properties are not supported');
    if (!Object.hasOwn(descriptor, 'value')) fail('Accessor properties are not supported');
    return `${key}:${pretty ? ' ' : ''}${renderValue(descriptor.value, pretty, level + 1, ancestors)}`;
  });
  if (!pretty || entries.length === 0) return `{${entries.join(',')}}`;
  const indent = '  '.repeat(level + 1);
  return `{\n${entries.map((entry) => indent + entry).join(',\n')}\n${'  '.repeat(level)}}`;
}

function renderDocument(events, pretty) {
  if (!Array.isArray(events)) fail('stringify() expects an array of events', 'E_INVALID_ARGUMENT');
  if (events.length > DEFAULT_LIMITS.maxStatements) throw new ENFLimitError('Maximum statement count exceeded', 'E_MAX_STATEMENTS');
  const lines = events.map((event) => {
    if (event === null || typeof event !== 'object' || Array.isArray(event)) fail('Each event must be a plain record', 'E_INVALID_EVENT');
    const prototype = Object.getPrototypeOf(event);
    if (prototype !== Object.prototype && prototype !== null) fail('Each event must be a plain record', 'E_INVALID_EVENT');
    const ownKeys = Reflect.ownKeys(event);
    if (ownKeys.some((key) => typeof key === 'symbol')) fail('Symbol properties are not supported', 'E_INVALID_EVENT');
    const keys = /** @type {string[]} */ (ownKeys);
    if (!Object.hasOwn(event, 'name') || keys.some((key) => key !== 'name' && key !== 'value')) fail("Event records may contain only 'name' and optional 'value'", 'E_INVALID_EVENT');
    const nameDescriptor = Object.getOwnPropertyDescriptor(event, 'name');
    if (!nameDescriptor?.enumerable || !Object.hasOwn(nameDescriptor, 'value')) fail("Event 'name' must be an enumerable data property", 'E_INVALID_EVENT');
    if (typeof nameDescriptor.value !== 'string' || !EVENT_NAME.test(nameDescriptor.value)) fail(`Invalid event name '${nameDescriptor.value}'`, 'E_INVALID_EVENT_NAME');
    const valueDescriptor = Object.getOwnPropertyDescriptor(event, 'value');
    if (valueDescriptor && (!valueDescriptor.enumerable || !Object.hasOwn(valueDescriptor, 'value'))) fail("Event 'value' must be an enumerable data property", 'E_INVALID_EVENT');
    const value = valueDescriptor ? ` ${renderValue(valueDescriptor.value, pretty, 0, new Set())}` : '';
    return `${nameDescriptor.value}${value};`;
  });
  return pretty ? (lines.length ? lines.join('\n') + '\n' : '') : lines.join('');
}

/** @param {import('./parser.js').ENFEvent[]} events @returns {string} */
export function stringify(events) { return renderDocument(events, false); }
/** @param {import('./parser.js').ENFEvent[]} events @returns {string} */
export function formatEvents(events) { return renderDocument(events, true); }
