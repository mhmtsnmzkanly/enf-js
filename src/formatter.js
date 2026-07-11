import { parse } from './parser.js';
import { formatEvents } from './serializer.js';

/** @param {string} source @param {import('./parser.js').ParseOptions} [options] @returns {string} */
export function format(source, options) {
  return formatEvents(parse(source, options));
}
