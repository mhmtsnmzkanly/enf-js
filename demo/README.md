# ENF WebSocket Chat Demo

## What It Demonstrates

This small chat application demonstrates the published `@mhmtsnmzkanly/enf-js`
API over WebSocket text frames:

- `parse` and `tryParse` for ordered event documents and untrusted network input
- `stringify` for every outgoing application frame
- `format` in the browser protocol inspector
- `DEFAULT_LIMITS`, with lower application-specific parser limits
- `ENFSyntaxError`, `ENFTypeError`, and `ENFLimitError` handling
- Multiple ENF statements in one WebSocket frame and mandatory semicolons
- Full event names with namespace segments (for example, `chat.message.send`)
- `null`, booleans, integers, floats, strings, arrays, objects, and nested values
- Unicode, emoji, and safe escaping of quotes, backslashes, and newlines
- Structured `system.error` events without exposing server internals

The shared chat logic is runtime-independent. Only the HTTP/WebSocket adapter
differs between Node.js and Deno.

## Requirements

Node.js 18 or newer is required by the main package tooling. The Node.js demo
uses the `ws` runtime dependency; ENF itself is imported from the published
`@mhmtsnmzkanly/enf-js@1.0.0` package. Deno uses its native `Deno.serve` and
`Deno.upgradeWebSocket` APIs plus Deno's `npm:` compatibility import, so it does
not need the Node `ws` package.

## Run with Node.js

```sh
cd demo
npm install
npm run start:node
```

`npm run start` is an equivalent shortcut.

## Run with Deno

```sh
cd demo
npm run start:deno
```

The script uses the default port without environment access. To configure
`PORT` explicitly, run the server directly with the optional environment
permission:

```sh
deno run --allow-net --allow-read --allow-env=PORT server.js
```

## Open the Client

Open the served page at:

```text
http://localhost:8090
```

The WebSocket endpoint is:

```text
ws://localhost:8090/ws
```

Set `PORT` to use another port. The client builds the endpoint from the page's
host and chooses `ws` or `wss` to match the page protocol.

## ENF Events

| Direction | Event | Purpose |
| --- | --- | --- |
| Client → Server | `client.hello` | Opens a chat session |
| Server → Client | `session.ready` | Confirms the session |
| Client → Server | `chat.message.send` | Sends a message |
| Server → Client | `chat.message.created` | Broadcasts a created message |
| Client → Server | `chat.typing.start` | Starts typing state |
| Client → Server | `chat.typing.stop` | Stops typing state |
| Server → Client | `chat.typing.changed` | Broadcasts typing state |
| Server → Client | `chat.history` | Sends the in-memory recent history |
| Client → Server | `presence.list.request` | Requests active users |
| Server → Client | `presence.list` | Returns active users and count |
| Server → Client | `presence.joined` | Announces a new user |
| Server → Client | `presence.left` | Announces a departing user |
| Client → Server | `system.ping` | Measures a client/server round trip |
| Server → Client | `system.pong` | Returns the ping timestamp and server time |
| Server → Client | `system.notice` | Sends an informational notice |
| Server → Client | `system.error` | Reports a structured protocol/application error |

Event names remain complete strings during dispatch; namespace segments are not
converted into JavaScript property paths.

## Protocol Inspector

The browser shows the most recent raw outgoing frame, raw incoming frame, and
the readable representation produced by `format()`. It also displays the
effective parser limits and structured errors returned by the server. A frame
may contain several ordered events, and the client dispatches every parsed
record in sequence.

## Project Files

- `client.html` — self-contained HTML, CSS, browser WebSocket client, and ENF UI
- `server.js` — shared chat/validation logic with Node.js and Deno adapters
- `package.json` — private demo package and its two runtime dependencies

## Security Notes

- Incoming ENF is processed with `tryParse()` and constrained parser limits.
- WebSocket text frames have a maximum size and event payloads are validated.
- User content is rendered with `textContent`, never `innerHTML`.
- Binary WebSocket frames are rejected; ENF 1.0 is used here as text and does
  not provide native binary or file payloads.
- Message and typing events have simple in-memory rate limits.
- Server-generated IDs, timestamps, and usernames are not trusted from clients.
- This demo intentionally provides no production authentication or authorization.

## Limitations

- Message history is in memory only and is lost when the process stops.
- There is no persistent storage, authentication, TLS, room/private chat, or
  horizontal scaling.
- It is an educational protocol demonstration, not a production deployment
  example.
