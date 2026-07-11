// ENF WebSocket Chat Demo.  This is intentionally a small, in-memory teaching
// application, not an authentication or production chat server.

const isDeno = typeof globalThis.Deno?.serve === 'function' && typeof globalThis.Deno?.upgradeWebSocket === 'function';
const {
  parse, tryParse, stringify, format, DEFAULT_LIMITS,
  ENFSyntaxError, ENFTypeError, ENFLimitError,
} = await import(isDeno
  ? 'npm:@mhmtsnmzkanly/enf-js@1.0.0'
  : '@mhmtsnmzkanly/enf-js');

// These are deliberately lower than ENF's safe general-purpose defaults.  A
// WebSocket frame limit protects transport resources; parser limits protect the
// structure inside a frame.  Neither replaces application validation below.
const CHAT_LIMITS = {
  ...DEFAULT_LIMITS,
  maxSourceLength: 64 * 1024,
  maxStatements: 16,
  maxDepth: 12,
  maxArrayLength: 100,
  maxObjectEntries: 32,
  maxStringLength: 4_096,
};
const MAX_FRAME_BYTES = 64 * 1024;
const MAX_HISTORY = 50;
const MESSAGE_INTERVAL_MS = 450;
const TYPING_INTERVAL_MS = 300;
// Deno's documented minimum command deliberately omits --allow-env.  Read PORT
// when that optional permission is granted, otherwise keep the promised 8080
// fallback instead of failing startup.
function configuredPort() {
  if (!isDeno) return process.env.PORT;
  try { return Deno.env.get('PORT'); } catch { return undefined; }
}
const PORT = Number.parseInt(configuredPort() || '8090', 10) || 8090;

const clients = new Set();
const messageHistory = [];
let nextSession = 1;
let nextMessage = 1;

const byteLength = (text) => new TextEncoder().encode(text).byteLength;
const now = () => Date.now();
const id = (kind, number) => `${kind}_${number.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const hasControlCharacter = (text) => /[\u0000-\u001f\u007f-\u009f]/.test(text);

function publicUsers() {
  return [...clients].filter((client) => client.ready).map((client) => client.username).sort((a, b) => a.localeCompare(b));
}

// Every outgoing application message comes from ENF records.  In particular,
// never interpolate chat text into protocol text: stringify() escapes quotes,
// backslashes, newlines and Unicode safely and always appends semicolons.
function sendEvents(client, events) {
  if (!client.transport.isOpen()) return;
  try {
    const text = stringify(events);
    client.transport.send(text);
  } catch (error) {
    // A server-authored ENF value should be valid; do not leak internals if a
    // programming error occurs anyway.
    console.error('Could not serialize outbound ENF:', error instanceof Error ? error.name : 'unknown error');
  }
}

function broadcast(events, except = null) {
  for (const client of clients) if (client.ready && client !== except) sendEvents(client, events);
}

function errorDetails(error) {
  const details = { enf_code: error.code || 'E_UNKNOWN' };
  if (error instanceof ENFSyntaxError) {
    details.line = error.line;
    details.column = error.column;
  } else if (error instanceof ENFLimitError) {
    details.limit = true;
  } else if (error instanceof ENFTypeError) {
    details.type = true;
  }
  return details;
}

function sendError(client, code, message, details = {}) {
  sendEvents(client, [{ name: 'system.error', value: { code, message, details } }]);
}

function markViolation(client, code, message, details) {
  client.violations++;
  sendError(client, code, message, details);
  // A malformed frame is recoverable. Repeated abuse is not kept forever.
  if (client.violations >= 3) client.transport.close(1008, 'Too many protocol violations');
}

function setTyping(client, typing) {
  if (!client.ready || client.typing === typing) return;
  client.typing = typing;
  broadcast([{ name: 'chat.typing.changed', value: { username: client.username, typing } }], client);
}

function leave(client) {
  if (!clients.delete(client) || !client.ready) return;
  if (client.typing) setTyping(client, false);
  broadcast([{ name: 'presence.left', value: { username: client.username } }]);
}

function requireReady(client) {
  if (client.ready) return true;
  sendError(client, 'HANDSHAKE_REQUIRED', 'Send client.hello before this event.');
  return false;
}

function validUsername(value) {
  return typeof value === 'string' && value === value.trim() && value.length > 0
    && value.length <= 24 && !hasControlCharacter(value);
}

function handleEvent(client, event) {
  // Event names are complete strings, not object/property paths. This explicit
  // switch is the allow-list and makes unknown protocol events harmless.
  switch (event.name) {
    case 'client.hello': {
      if (client.ready) return sendError(client, 'ALREADY_READY', 'client.hello is accepted only once per connection.');
      const value = event.value;
      if (!isPlainObject(value) || !validUsername(value.username) || typeof value.client_version !== 'string') {
        return sendError(client, 'INVALID_HELLO', 'client.hello requires a non-empty username and client_version strings.');
      }
      client.ready = true;
      client.username = value.username;
      client.sessionId = id('session', nextSession++);
      client.connectedAt = now();
      // One text frame deliberately contains multiple ENF statements. Clients
      // must dispatch parse()'s ordered event array, not assume one event/frame.
      sendEvents(client, [
        { name: 'session.ready', value: { session_id: client.sessionId, username: client.username, connected_at: client.connectedAt, resumed: false } },
        { name: 'presence.list', value: { count: publicUsers().length, users: publicUsers() } },
        { name: 'chat.history', value: { messages: messageHistory } },
        { name: 'system.notice', value: { message: 'Connected. ENF events may be batched in one WebSocket frame.', latency_ms: 0.0, capabilities: { binary: false, comments: false }, examples: [null, true, 12.5, ['nested', { object: true }]] } },
      ]);
      broadcast([{ name: 'presence.joined', value: { username: client.username } }], client);
      return;
    }
    case 'chat.message.send': {
      if (!requireReady(client)) return;
      const value = event.value;
      if (!isPlainObject(value) || typeof value.text !== 'string' || value.text.trim().length === 0 || value.text.length > 2_000
        || !(value.reply_to === null || typeof value.reply_to === 'string')) {
        return sendError(client, 'INVALID_MESSAGE', 'text must be a non-empty string up to 2,000 characters; reply_to must be a string or null.');
      }
      if (now() - client.lastMessageAt < MESSAGE_INTERVAL_MS) return sendError(client, 'RATE_LIMITED', 'Please wait briefly before sending another message.');
      client.lastMessageAt = now();
      setTyping(client, false);
      const message = { id: id('message', nextMessage++), username: client.username, text: value.text, reply_to: value.reply_to, created_at: now() };
      messageHistory.push(message);
      if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
      broadcast([{ name: 'chat.message.created', value: message }]);
      return;
    }
    case 'chat.typing.start':
    case 'chat.typing.stop': {
      if (!requireReady(client)) return;
      if (now() - client.lastTypingAt < TYPING_INTERVAL_MS) return;
      client.lastTypingAt = now();
      setTyping(client, event.name === 'chat.typing.start');
      return;
    }
    case 'presence.list.request':
      if (requireReady(client)) sendEvents(client, [{ name: 'presence.list', value: { count: publicUsers().length, users: publicUsers() } }]);
      return;
    case 'system.ping':
      if (!requireReady(client)) return;
      if (!isPlainObject(event.value) || !Number.isFinite(event.value.timestamp)) return sendError(client, 'INVALID_PING', 'system.ping requires a finite numeric timestamp.');
      sendEvents(client, [{ name: 'system.pong', value: { timestamp: event.value.timestamp, server_time: now() } }]);
      return;
    default:
      return sendError(client, 'UNKNOWN_EVENT', `The event '${event.name}' is not supported by this demo.`);
  }
}

function receiveText(client, raw) {
  if (typeof raw !== 'string') return markViolation(client, 'BINARY_NOT_SUPPORTED', 'ENF 1.0 demo messages must be text frames.', { enf_code: 'E_BINARY_FRAME' });
  if (byteLength(raw) > MAX_FRAME_BYTES) return markViolation(client, 'FRAME_TOO_LARGE', 'The WebSocket text frame is too large.', { enf_code: 'E_MAX_FRAME_BYTES' });
  // Network input is untrusted, so tryParse() makes syntax/limit/type failures
  // data rather than uncaught exceptions. parse() remains used for trusted debug
  // formatting below, demonstrating both APIs.
  const result = tryParse(raw, CHAT_LIMITS);
  if (!result.ok) return markViolation(client, 'INVALID_MESSAGE', 'The incoming ENF document is invalid.', errorDetails(result.error));
  if (result.value.length === 0) return sendError(client, 'INVALID_MESSAGE', 'An ENF frame must contain at least one statement.');
  try {
    // format() invokes parse() internally. Calling it only after tryParse()
    // succeeds keeps debugging behavior separate from untrusted parsing.
    format(raw, CHAT_LIMITS);
  } catch { /* impossible for a successful parse; retained as a defensive demo */ }
  for (const event of result.value) handleEvent(client, event);
}

function attachSocket(transport) {
  const client = { transport, sessionId: null, username: null, ready: false, typing: false, connectedAt: 0, lastMessageAt: 0, lastTypingAt: 0, violations: 0 };
  clients.add(client);
  transport.onText((text, binary) => binary ? receiveText(client, null) : receiveText(client, text));
  transport.onClose(() => leave(client));
}

function startup(runtime) {
  console.log(`\nENF WebSocket Chat Demo\n\nRuntime: ${runtime}\nHTTP:    http://localhost:${PORT}\nWS:      ws://localhost:${PORT}/ws\n`);
}

if (isDeno) {
  const clientHtml = await Deno.readTextFile(new URL('./client.html', import.meta.url));
  Deno.serve({ port: PORT }, (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/') return new Response(clientHtml, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (url.pathname !== '/ws') return new Response('Not found', { status: 404 });
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket upgrade required', { status: 426 });
    const { socket, response } = Deno.upgradeWebSocket(request);
    const transport = {
      send: (text) => socket.send(text), close: (code, reason) => socket.close(code, reason), isOpen: () => socket.readyState === WebSocket.OPEN,
      onText: (callback) => socket.addEventListener('message', (event) => callback(event.data, typeof event.data !== 'string')),
      onClose: (callback) => socket.addEventListener('close', callback),
    };
    attachSocket(transport);
    return response;
  });
  startup('Deno');
} else {
  const [{ createServer }, { readFile }, { WebSocketServer }] = await Promise.all([
    import('node:http'), import('node:fs/promises'), import('ws'),
  ]);
  const clientHtml = await readFile(new URL('./client.html', import.meta.url), 'utf8');
  const server = createServer((request, response) => {
    const pathname = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname;
    if (pathname !== '/') { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(clientHtml);
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });
  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname;
    if (pathname !== '/ws') { socket.destroy(); return; }
    wss.handleUpgrade(request, socket, head, (ws) => {
      const transport = {
        send: (text) => ws.send(text), close: (code, reason) => ws.close(code, reason), isOpen: () => ws.readyState === ws.OPEN,
        onText: (callback) => ws.on('message', (data, isBinary) => callback(isBinary ? null : data.toString('utf8'), isBinary)),
        onClose: (callback) => ws.once('close', callback),
      };
      attachSocket(transport);
    });
  });
  wss.on('error', (error) => console.error('WebSocket server error:', error.message));
  server.listen(PORT, () => startup('Node.js'));
}
