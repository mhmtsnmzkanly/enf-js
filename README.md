# ENF

> A compact event-driven communication protocol for WebSockets, TCP, IPC, event buses, and logs.

**ENF — Event Notation Format** is a compact text format for ordered event messages. It is event-first rather than a general-purpose JSON replacement.

```enf
message.send {id: 17, text: "hello"};
typing.start {user_id: 42};
ping;
```

## Why ENF?

Event-driven applications commonly wrap every message in an object containing an event name and payload:

```json
{
  "event": "message.send",
  "data": {
    "id": 17,
    "text": "hello"
  }
}
```

ENF makes the event name part of the notation itself:

```enf
message.send {id: 17, text: "hello"};
```

ENF provides:

* Mandatory event names
* Optional JSON-like values
* Deterministic statement boundaries
* A small, portable grammar
* Canonical compact and formatted output
* Finite parser resource limits
* No runtime dependencies
* Browser, Node.js, and Deno support

ENF deliberately avoids implicit newline rules, bare strings, comments, tuple syntax, parser recovery, and other features that could introduce ambiguity or hide data loss.

## Installation

### npm

```sh
npm install @mhmtsnmzkanly/enf-js
```

```js
import {
  parse,
  stringify,
  format,
} from '@mhmtsnmzkanly/enf-js';
```

The package is ESM-only and has no runtime dependencies.

### Browser via jsDelivr

The prebuilt ESM bundle can be loaded directly in modern browsers:

```html
<script type="module">
  import {
    parse,
    stringify,
  } from 'https://cdn.jsdelivr.net/npm/@mhmtsnmzkanly/enf-js@1.0.0/dist/index.min.js';

  const events = parse('browser.ready {ok:true};');

  console.log(events);
  console.log(stringify(events));
</script>
```

Pin an exact version in production to avoid receiving unexpected changes from a newer release.

### Runtime support

| Component             | Browser |     Node.js | Deno |
| --------------------- | ------: | ----------: | ---: |
| Parser and serializer |     Yes |         Yes |  Yes |
| Formatter             |     Yes |         Yes |  Yes |
| JavaScript API        |     Yes |         Yes |  Yes |
| CLI                   |      No | Node.js 18+ |   No |

The core library uses platform-independent standard JavaScript APIs.

The `enf` command-line executable is a Node.js wrapper that uses `node:fs`, `node:path`, and `process`.

## Quick Start

```js
import {
  parse,
  stringify,
  format,
} from '@mhmtsnmzkanly/enf-js';

const events = parse('message.send {id:17};ping;');

console.log(events);
```

Result:

```js
[
  {
    name: 'message.send',
    value: {
      id: 17,
    },
  },
  {
    name: 'ping',
  },
]
```

Serialize events into compact ENF:

```js
const source = stringify(events);

console.log(source);
// message.send {id:17};ping;
```

Format valid ENF:

```js
const output = format('message.send{id:17};');

console.log(output);
```

Result:

```enf
message.send {
  id: 17
};
```

## Browser

### jsDelivr

```html
<script type="module">
  import {
    parse,
    stringify,
    format,
  } from 'https://cdn.jsdelivr.net/npm/@mhmtsnmzkanly/enf-js@1.0.0/dist/index.min.js';

  const events = parse(`
    app.started {version: "1.0.0"};
    user.connected {id: 17};
  `);

  console.log(stringify(events));
</script>
```

### Local ESM bundle

When working inside the cloned repository:

```html
<script type="module">
  import {
    parse,
    stringify,
  } from './dist/index.min.js';

  const events = parse('browser.ready {ok:true};');

  console.log(stringify(events));
</script>
```

The repository contains a browser smoke fixture. Dynamic Chromium execution was unavailable in the release environment because the container exited before loading the page. Browser compatibility was therefore verified through the platform-independent source and bundle import surface rather than a successful browser execution in that environment.

## Node.js

```js
import {
  parse,
  stringify,
} from '@mhmtsnmzkanly/enf-js';

const events = parse('node.ready;');

console.log(stringify(events));
```

The library is ESM-only.

Node.js 18 or newer is required for the CLI and package tooling.

## Deno

Deno can load the package through npm compatibility:

```js
import {
  parse,
  stringify,
} from 'npm:@mhmtsnmzkanly/enf-js@1.0.0';

const events = parse('deno.ready;');

console.log(stringify(events));
```

The jsDelivr ESM bundle can also be imported by URL:

```js
import {
  parse,
} from 'https://cdn.jsdelivr.net/npm/@mhmtsnmzkanly/enf-js@1.0.0/dist/index.min.js';

console.log(parse('deno.ready;'));
```

## WebSocket Chat Demo

A complete WebSocket chat demo is available under [`demo/`](./demo). It shows
ENF parsing, serialization, formatting, multiple statements per frame,
structured errors, parser limits, presence and typing events, message history,
and Node.js/Deno interoperability. The browser client is a self-contained
[`client.html`](./demo/client.html) file. It is an educational, in-memory demo,
not a production chat service.

### Node.js

```sh
cd demo
npm install
npm run start:node
```

### Deno

```sh
cd demo
npm run start:deno
```

Then open:

```text
http://localhost:8090
```

See [`demo/README.md`](./demo/README.md) for the event reference, protocol
inspector notes, and security boundaries.

## Syntax

An ENF document contains zero or more event statements:

```text
document  = { statement } ;
statement = event-name, [ value ], ";" ;
```

Every statement consists of:

1. An event name
2. An optional value
3. A mandatory semicolon

```enf
ping;
message.send "hello";
user.update {id: 17, active: true};
queue.replace [1, 2, 3];
```

Whitespace, including line breaks, is insignificant.

Scalar values require whitespace after the event name:

```enf
message.send "hello";
counter.set 17;
feature.toggle true;
```

Objects and arrays may immediately follow the event name:

```enf
user.update{id: 17};
queue.replace[1, 2, 3];
```

For readability, adding a space is recommended:

```enf
user.update {id: 17};
queue.replace [1, 2, 3];
```

## Event Names

Event names are case-sensitive ASCII namespace names.

```text
^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$
```

Valid examples:

```text
ping
message.send
chat.message_sent
file.upload_v2.started
user2.session.created
```

Invalid examples:

```text
Chat.Message
_chat.started
chat-message
.system
system.
system..ready
```

Rules:

* An event name must begin with a lowercase ASCII letter.
* Each namespace segment must begin with a lowercase ASCII letter.
* Segments may contain lowercase letters, digits, and underscores.
* Dots separate namespace segments.
* Hyphens are not allowed.
* Uppercase letters are not allowed.
* Empty namespace segments are not allowed.

The parser preserves the complete event name as a single string:

```js
{
  name: 'chat.message.sent',
}
```

The parser does not convert namespace segments into nested objects or property paths.

## Values

ENF supports:

* `null`
* Booleans
* Numbers
* Strings
* Arrays
* Objects

### Null

```enf
cache.result null;
```

### Booleans

```enf
feature.enabled true;
feature.disabled false;
```

### Numbers

```enf
counter.set 17;
temperature.set -2.5;
measurement.set 1.25e3;
negative.zero -0;
```

Numbers use JSON lexical grammar and ECMAScript `Number` semantics.

The following forms are invalid:

```text
NaN
Infinity
-Infinity
+1
01
.5
1.
```

All parsed numbers must produce finite IEEE-754 binary64 values.

Any integer-valued result must also be a JavaScript safe integer. This rule applies even when the source uses decimal or exponent notation.

For example, values such as the following are rejected:

```text
9007199254740992
9007199254740992.0
1e20
```

Negative zero is preserved.

### Strings

Strings use double quotes and JSON-compatible escape sequences:

```enf
message.send "hello";
message.multiline "line one\nline two";
path.set "C:\\projects\\enf";
unicode.set "\u0041";
```

Supported escapes include:

```text
\"
\\
\/
\b
\f
\n
\r
\t
\uXXXX
```

Malformed escape sequences and lone Unicode surrogates are rejected.

### Arrays

```enf
queue.replace [1, 2, 3];
users.select ["alice", "bob"];
matrix.set [[1, 2], [3, 4]];
```

Arrays:

* Preserve order
* May contain any ENF value
* Cannot contain trailing commas
* Cannot represent sparse JavaScript arrays

Invalid:

```enf
queue.replace [1, 2,];
```

### Objects

```enf
user.update {
  id: 17,
  name: "Mehmet",
  active: true
};
```

Object keys must match:

```text
^[a-z][a-z0-9_]*$
```

Valid keys:

```text
id
user_id
version2
```

Invalid keys:

```text
User
-user
user-name
"quoted key"
```

Quoted object keys are not supported.

Duplicate keys are invalid:

```enf
user.update {
  id: 17,
  id: 42
};
```

This produces `E_DUPLICATE_KEY`. ENF does not use silent last-write-wins behavior.

Trailing commas are invalid:

```enf
user.update {
  id: 17,
};
```

## Statement Separators

A semicolon is required after every statement, including the last:

```enf
ping;
pong;
```

This is invalid:

```enf
ping
```

Newlines do not terminate statements:

```enf
ping
pong;
```

Because whitespace is insignificant, the example above is not interpreted as two independent statements.

Mandatory semicolons provide deterministic stream framing and unambiguous parser behavior.

## Comments

ENF 1.0 does not support comments.

Invalid examples:

```enf
// comment
ping;
```

```enf
/* comment */
ping;
```

Protocol payloads have one canonical data interpretation, and formatters do not require a trivia-preserving syntax tree.

## JavaScript API

```js
import {
  parse,
  tryParse,
  stringify,
  format,
  DEFAULT_LIMITS,
  ENFSyntaxError,
  ENFTypeError,
  ENFLimitError,
} from '@mhmtsnmzkanly/enf-js';
```

### `parse(source, limits?)`

Parses an ENF document and returns an ordered array of event records.

```js
const events = parse('message.send {id:17};ping;');
```

Throws:

* `ENFSyntaxError` for invalid ENF
* `ENFLimitError` when a resource limit is exceeded
* `ENFTypeError` for invalid API arguments

### `tryParse(source, limits?)`

Returns a result object instead of throwing for parse failures:

```js
const result = tryParse('message.send {id:17};');

if (result.ok) {
  console.log(result.value);
} else {
  console.error(result.error.code);
}
```

Result shapes:

```js
{
  ok: true,
  value: events,
}
```

```js
{
  ok: false,
  error,
}
```

### `stringify(events)`

Serializes event records into compact ENF:

```js
const source = stringify([
  {
    name: 'message.send',
    value: {
      id: 17,
      text: 'hello',
    },
  },
  {
    name: 'ping',
  },
]);

console.log(source);
// message.send {id:17,text:"hello"};ping;
```

`stringify()` validates event names and JavaScript values before producing output.

### `format(source, limits?)`

Formats valid ENF into canonical, human-readable output:

```js
const output = format('message.send{id:17,text:"hello"};');
```

Result:

```enf
message.send {
  id: 17,
  text: "hello"
};
```

Invalid ENF is rejected. The formatter never writes recovered or partial parser output.

### `DEFAULT_LIMITS`

Contains the reference parser's default finite resource limits.

Applications may lower limits per parse operation but cannot raise them beyond the implementation's safe maxima.

## Event Records

Parsed events are represented as native JavaScript objects:

```js
{
  name: 'message.send',
  value: {
    id: 17,
    text: 'hello',
  },
}
```

Events without a value omit the `value` property:

```js
{
  name: 'ping',
}
```

Event order is always preserved.

## CLI

The CLI is available after installing the package:

```sh
npm install --global @mhmtsnmzkanly/enf-js
```

Alternatively, use it from a local project installation:

```sh
npx enf check file.enf
```

### Check a file

```sh
enf check file.enf
```

### Format to standard output

```sh
enf format file.enf
```

### Format a file in place

```sh
enf format --write file.enf
```

### Read from standard input

```sh
cat file.enf | enf check
cat file.enf | enf format
```

### Exit codes

| Code | Meaning                                |
| ---: | -------------------------------------- |
|  `0` | Success                                |
|  `1` | Invalid ENF or resource limit exceeded |
|  `2` | Usage or I/O failure                   |

`format --write` uses a temporary file and atomic rename.

Invalid input never modifies the destination file.

The CLI requires Node.js 18 or newer and is not intended for browser or Deno execution.

## Errors

### `ENFSyntaxError`

Reports invalid ENF syntax and includes:

```js
{
  code,
  offset,
  line,
  column,
}
```

Programs should branch on the error class and stable error code rather than matching the human-readable message.

```js
try {
  parse('message.send {id:};');
} catch (error) {
  if (error instanceof ENFSyntaxError) {
    console.error(error.code);
    console.error(error.line);
    console.error(error.column);
  }
}
```

### `ENFLimitError`

Reports parser resource-limit violations separately from syntax errors.

### `ENFTypeError`

Reports:

* Invalid API arguments
* Unsupported JavaScript values
* Invalid event records
* Cyclic values
* Exotic objects
* Unsafe numeric values

## Resource Limits

The reference parser uses finite limits by default:

| Resource              |                   Default |
| --------------------- | ------------------------: |
| Source length         |                    16 MiB |
| Container depth       |                        64 |
| Events                |                   100,000 |
| Array elements        |                    10,000 |
| Object entries        |                    10,000 |
| Decoded string length | 262,144 UTF-16 code units |

Decoded string length is measured using JavaScript UTF-16 code units, equivalent to `string.length`.

Examples:

```text
"a"  → 1 code unit
"ğ"  → 1 code unit
"😀" → 2 code units
```

This is not a transport byte limit.

Network applications should independently enforce UTF-8 byte limits and maximum message or frame sizes.

## File and Binary Data

ENF 1.0 does not define a native binary value type.

ENF can describe file-transfer events and metadata:

```enf
file.upload.started {
  id: "upload_17",
  name: "photo.jpg",
  size: 184291,
  mime_type: "image/jpeg"
};
```

The raw file bytes should be transported through the underlying protocol:

* WebSocket binary frames
* TCP framing
* HTTP uploads
* IPC byte channels

A typical WebSocket flow could use:

```text
1. ENF text frame    → file.upload.started {...};
2. Binary frame      → raw file bytes
3. ENF text frame    → file.upload.completed {...};
```

Binary data can technically be encoded as a string, such as Base64, but ENF does not treat that as native binary support.

## Security

Use finite transport-level message limits in addition to ENF parser limits.

The parser:

* Uses bounded recursive descent
* Rejects duplicate object keys
* Rejects lone Unicode surrogates
* Never evaluates input
* Does not interpret event names as property paths
* Does not return partial parse success
* Rejects values outside the supported number domain

The serializer rejects:

* Cycles
* Exotic objects
* Sparse arrays
* Unsafe integers
* Non-finite numbers
* Unsupported JavaScript types

### Untrusted JavaScript objects

`stringify()` is not a sandbox for hostile live JavaScript objects.

Proxy traps can:

* Execute arbitrary code
* Mutate values during introspection
* Throw arbitrary exceptions
* Prevent termination

Copy untrusted in-process objects into inert, caller-controlled plain data before passing them to `stringify()`.

## Specification

The normative, implementation-independent ENF 1.0 specification is available at:

[`docs/specification.md`](./docs/specification.md)

When the README, examples, implementation, and specification disagree, the specification is the source of truth.

## Conformance

Language-neutral conformance fixtures are located under:

```text
conformance/
  valid/
  invalid/
  canonical/
```

These fixtures can be used to verify implementations written in other programming languages.

Run the JavaScript reference implementation against the fixtures with:

```sh
npm test
```

## Development

Clone the repository and install development dependencies:

```sh
git clone https://github.com/mhmtsnmzkanly/enf-js.git
cd enf-js
npm install
```

Run validation:

```sh
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
npm run build:types
npm run bench
```

Run the deterministic fuzz workload with more iterations:

```sh
ENF_FUZZ_ITERATIONS=100000 npm test
```

Build the browser ESM bundle:

```sh
npm run build
```

Generate declarations:

```sh
npm run build:types
```

Inspect the npm package contents:

```sh
npm pack --dry-run
```

## License

ENF is released under the [MIT License](./LICENSE).
