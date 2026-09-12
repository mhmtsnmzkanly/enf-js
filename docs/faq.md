# Frequently Asked Questions (FAQ) & Troubleshooting

Common questions, syntax constraints, and troubleshooting tips for **ENF (Event Notation Format)** and `@mhmtsnmzkanly/enf-js`.

---

## Grammar & Syntax

### 1. Why are uppercase letters and hyphens rejected in event names?
**Error:** `E_INVALID_EVENT_NAME` for `Chat.Message` or `chat-message`.

**Rationale:** ENF event names are strictly constrained to:
```regex
^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$
```
This guarantees unambiguous identifier scanning without token lookaheads and prevents case-sensitivity collisions across cross-language systems (e.g., Python vs Go vs JavaScript).

**Fix:** Use lowercase names with dots for namespaces and underscores for multi-word segments:
`chat.message` or `chat.message_sent`.

---

### 2. Why are comments (`//` or `/* */`) not supported?
**Rationale:** ENF 1.0 is a compact **wire and streaming protocol**, not a human-edited configuration language (like YAML or JSONC). Adding trivia/comment preservation adds significant lexer complexity, slows down parsing throughput, and creates protocol ambiguity.

**Fix:** If you need comments for human documentation, document your schema externally in Markdown, TypeScript interfaces, or JSON Schema.

---

### 3. Why can't I use quoted object keys or hyphens (`{"user-id": 1}`)?
**Error:** `E_INVALID_KEY` or `E_UNEXPECTED_TOKEN`.

**Rationale:** ENF object keys must match `^[a-z][a-z0-9_]*$`. Quoting keys adds parsing overhead and visual noise. Restricting keys to clean lowercase identifiers ensures direct mapping to native object properties across all major programming languages.

**Fix:** Use `user_id` instead of `"user-id"`.

---

### 4. Why does `1e20` throw `E_NUMBER_RANGE`?
**Rationale:** In JavaScript, integers above $2^{53} - 1$ (`9,007,199,254,740,991`) lose precision due to IEEE-754 binary64 floating-point representation. ENF mandates that **all integer-valued numbers must be safe integers**. `1e20` produces `100000000000000000000`, which cannot be represented without rounding errors.

**Fix:** If you must transmit 64-bit integers (e.g., snowflake IDs, Bitcoin satoshis), encode them as decimal strings: `"100000000000000000000"`.

---

### 5. Why is a semicolon mandatory even on the last statement?
**Error:** `E_EXPECTED_SEMICOLON` or `E_UNEXPECTED_EOF`.

**Rationale:** Many formats suffer from parsing ambiguity due to "automatic semicolon insertion" or newline-dependent grammar rules. ENF requires `;` after every statement to make streaming framing 100% deterministic over TCP and IPC byte buffers.

---

### 6. I forgot a semicolon, but the error points to the next line. Why?
**Rationale:** In ENF, whitespace (including newlines) has no semantic meaning. If you write:
```enf
ping
message.send "hello";
```
The parser reads `ping` as an event name, and then expects either a value or a `;`. Seeing `message.send`, it interprets that as an invalid value token following `ping`.

**Fix:** Ensure every event ends with `;`.

---

## JavaScript API & Runtime

### 7. What is the bundle size for browser applications?
The minified browser ESM bundle (`dist/index.min.js`) has **zero runtime dependencies** and weighs **~8 KB** (less than **3 KB gzipped**).

---

### 8. Why does `stringify()` reject `Date`, `Map`, `Set`, or class instances?
**Error:** `E_UNSUPPORTED_VALUE` ("Only plain objects are supported").

**Rationale:** ENF 1.0 strictly serializes data representable across all programming languages (`null`, `boolean`, `number`, `string`, `Array`, and plain `Object`). A `Date` object serialized across languages causes timezone and format ambiguities.

**Fix:** Convert complex types to ISO strings, timestamps, or arrays before calling `stringify()`:
```javascript
const event = {
  name: 'order.created',
  value: { created_at: new Date().toISOString() }
};
```

---

### 9. Does ENF support incremental / streaming parsing?
The core `parse()` and `tryParse()` APIs operate on complete text strings. For streaming environments (TCP, sockets), use the delimited chunking pattern documented in [Recipe 2: IoT Telemetry](./recipes/2-iot-telemetry.md) and [Best Practices: Stream Framing](./best-practices.md#5-stream--tcp-framing-handling-fragmented-streams).

---

### 10. Can I send raw binary buffers over ENF?
No. ENF 1.0 does not include a native binary literal. Refer to [Recipe 1](./recipes/1-realtime-collaboration.md) and [Best Practices: Binary Strategy](./best-practices.md#6-binary-data-strategy-dual-channel-architecture) for the recommended **Dual-Channel Architecture** (ENF text frame for metadata + WebSocket binary frame for raw bytes).
