# ENF 1.0 Specification

Status: normative draft for ENF 1.0.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY describe
requirements for conforming implementations.

## 1. Model

An ENF document is an ordered sequence of events. Each event has a namespaced
name and either no value or one value. Event order is significant.

```enf
message.send {id: 17, text: "hello"};
typing.start {user_id: 42};
ping;
```

## 2. Encoding and whitespace

Documents MUST be Unicode text. A byte-oriented transport MUST encode them as
UTF-8. Outside strings, only space (U+0020), tab (U+0009), carriage return
(U+000D), and line feed (U+000A) are whitespace. Whitespace has no semantic
meaning. Comments are not part of ENF 1.0.

## 3. Grammar

```ebnf
document      = { statement } ;
statement     = event-name, [ value ], ";" ;

event-name    = segment, { ".", segment } ;
segment       = lower, { lower | digit | "_" } ;

value         = null | boolean | number | string | array | object ;
null          = "null" ;
boolean       = "true" | "false" ;
array         = "[", [ value, { ",", value } ], "]" ;
object        = "{", [ member, { ",", member } ], "}" ;
member        = key, ":", value ;
key           = lower, { lower | digit | "_" } ;

number        = [ "-" ], integer, [ fraction ], [ exponent ] ;
integer       = "0" | nonzero, { digit } ;
fraction      = ".", digit, { digit } ;
exponent      = ( "e" | "E" ), [ "+" | "-" ], digit, { digit } ;

string        = '"', { string-char | escape }, '"' ;
escape        = "\\", ( '"' | "\\" | "/" | "b" | "f" | "n" |
                              "r" | "t" | ( "u", hex, hex, hex, hex ) ) ;

lower         = "a".."z" ;
nonzero       = "1".."9" ;
digit         = "0".."9" ;
hex           = digit | "a".."f" | "A".."F" ;
```

Token boundaries are determined by punctuation and whitespace. A scalar value
MUST be separated from its event name by at least one whitespace character.
An array or object value MAY immediately follow its event name. Every statement,
including the last, MUST end in `;`. Newlines never terminate statements.

## 4. Event names

The equivalent regular expression is:

```text
^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$
```

Names are ASCII-only and case-sensitive. A dot is a namespace separator.
Implementations MUST preserve the complete name and MUST NOT infer object paths
or dispatch behavior from it. Hyphens, empty segments, leading underscores,
leading/trailing dots, and uppercase letters are invalid.

## 5. Values

Strings use the JSON escape set shown in the grammar. Unescaped control
characters U+0000 through U+001F are invalid. A Unicode escape encodes one
UTF-16 code unit. A high surrogate MUST be immediately followed by a low
surrogate escape; lone or reversed surrogates are invalid.

Number source text MUST match the JSON lexical number grammar given in section
3. Leading `+`, leading zeroes, `.5`, `1.`, `NaN`, and infinities are invalid.
The JavaScript reference implementation converts accepted source text to an
IEEE-754 binary64 value using the semantics of ECMAScript `Number`. The result
MUST be finite. If the resulting binary64 value is integer-valued, it MUST be in
the inclusive safe-integer range `[-(2^53 - 1), 2^53 - 1]`, regardless of
whether the source used a fraction or exponent (therefore `1e20` is invalid).
Finite non-integer binary64 values are accepted even when decimal-to-binary
conversion rounds them. Negative zero is significant and MUST round-trip as
`-0`.

The JavaScript reference implementation measures `maxStringLength` after escape
decoding in UTF-16 code units, exactly as JavaScript `String.prototype.length`
does. It is not a UTF-8 byte count or Unicode scalar-value count. Consequently,
a supplementary Unicode character such as U+1F600 counts as two units. A parser
MUST enforce its documented unit consistently; cross-language implementations
MAY use a different unit only if their API documents that difference.

Arrays are ordered. Trailing commas are invalid.

Object keys use `^[a-z][a-z0-9_]*$`. Quoted keys and duplicate keys are
invalid. Object member order has no semantic meaning, though a serializer SHOULD
preserve the input order when its data model can do so.

## 6. Data model

A parsed document is an ordered list of records:

```json
[{"name":"message.send","value":{"id":17,"text":"hello"}}]
```

A valueless event omits the `value` member. Values map to the host language's
native null, boolean, number, string, array, and object types.

## 7. Errors

A parser MUST reject invalid input and MUST NOT return a partial successful
document. Error codes are stable; messages are informational. Syntax errors
carry `offset`, `line`, and `column`. Resource-limit failures are distinct from
syntax failures.

Core codes are `E_UNEXPECTED_TOKEN`, `E_INVALID_EVENT_NAME`,
`E_EXPECTED_SEMICOLON`, `E_INVALID_KEY`, `E_DUPLICATE_KEY`, `E_INVALID_NUMBER`,
`E_NUMBER_RANGE`, `E_INVALID_STRING`, and `E_UNEXPECTED_EOF`.

## 8. Limits

Implementations MUST provide finite limits for hostile input. The JavaScript
reference implementation defaults to: 16 MiB source, 64 nested containers,
100,000 statements, 10,000 array elements, 10,000 object entries, and 262,144
UTF-16 code units of decoded string length. Exceeding a limit MUST raise
a limit error, not a syntax error. Implementations MAY expose configuration
within their own safe maxima.

## 9. Serialization and canonical form

Serialization accepts only values representable by this specification. It MUST
reject cycles, sparse arrays, non-finite numbers, unsafe integers, unsupported
objects, invalid event names/keys, duplicate event record fields, and functions
or symbols.

The JavaScript `stringify()` function validates ordinary in-process values, but
it is not a sandbox for hostile live JavaScript objects. Introspection operations
such as `Array.isArray`, `Object.getPrototypeOf`, `Reflect.ownKeys`, and property
descriptor reads can invoke Proxy traps, execute user code, throw arbitrary
exceptions, mutate the inspected graph, or fail to terminate. Callers MUST NOT
treat `stringify()` as an isolation boundary for untrusted objects. Values from
an untrusted JavaScript realm SHOULD be copied into inert, caller-controlled
plain data before serialization.

Canonical formatting uses two spaces per container level, one member or element
per line for non-empty containers, one space between an event and its value, no
trailing commas, and one terminating semicolon plus newline per event. Empty
containers remain `{}` and `[]`.

For every accepted document `d`, parsing `stringify(parse(d))` MUST produce the
same data model as `parse(d)`. Formatting valid input MUST preserve the same data
model. Formatting invalid input MUST fail without output derived from partial
data.
