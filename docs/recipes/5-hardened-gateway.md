# Recipe 5: Hardened Internet-Facing Gateway with Anti-DoS Quarantining

This recipe demonstrates an **anti-abuse, denial-of-service resilient WebSocket gateway** designed for public, untrusted Internet ingress using **ENF (Event Notation Format)**.

---

## 1. Architectural Overview

Public real-time gateways (chat APIs, webhook ingresses, gaming servers) are frequent targets of malicious payloads:
- **Nesting Bombs:** Deeply nested objects (`[[[[...]]]]`) designed to exhaust parser call stacks.
- **Payload Bloat:** Giant strings designed to force Out-Of-Memory (OOM) heap crashes.
- **Fuzzing & Poison Pills:** Corrupted syntax sent continuously to stall the event loop via exception allocations.

```mermaid
flowchart TD
    PublicInternet[Untrusted Internet Traffic] --> TransportCheck{Frame Size <= 16KB?}
    TransportCheck -- No --> RejectFrame[Close 1009 Frame Too Large]
    TransportCheck -- Yes --> ParseGuard[tryParse with Hardened Limits]
    
    ParseGuard -- Limit / Syntax Error --> ViolationTracker[Increment Violations Counter]
    ViolationTracker --> ThresholdExceeded{Violations >= 3?}
    ThresholdExceeded -- Yes --> Quarantine[Close 1008 Policy Violation + IP Quarantine]
    ThresholdExceeded -- No --> SendError[Send system.error {code, line, column}]
    
    ParseGuard -- Success --> Dispatcher[Dispatch Verified Events]
```

### Why ENF Is Naturally Resilient
1. **Built-in Finite Resource Limits:** ENF enforces depth, length, statement, and string boundaries *during parsing*, stopping recursion before a stack overflow can occur.
2. **`tryParse()` Prevents CPU Spikes:** Rejecting 50,000 invalid requests per second does not trigger V8 stack-trace compilation.
3. **Strict Number Range:** Disallowing `NaN`, `Infinity`, and unsafe integers prevents numerical poisoning in backend business logic.

---

## 2. Production Implementation: `HardenedGateway.js`

```javascript
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { tryParse, stringify, DEFAULT_LIMITS, ENFSyntaxError, ENFLimitError } from '@mhmtsnmzkanly/enf-js';

const MAX_FRAME_BYTES = 16 * 1024; // 16 KB hard transport cap
const MAX_VIOLATIONS_BEFORE_BAN = 3;
const QUARANTINE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

// Domain-constrained limits: far stricter than general defaults
const GATEWAY_LIMITS = Object.freeze({
  ...DEFAULT_LIMITS,
  maxSourceLength: 16 * 1024,   // 16 KB string limit
  maxStatements: 8,             // Max 8 events per frame
  maxDepth: 4,                  // Max 4 levels of nested objects/arrays
  maxArrayLength: 25,           // Arrays capped at 25 items
  maxObjectEntries: 20,         // Objects capped at 20 keys
  maxStringLength: 1024,        // Strings capped at 1,024 characters
});

class SecurityManager {
  constructor() {
    this.quarantinedIPs = new Map(); // IP -> expireTimestamp
  }

  isBanned(ip) {
    const expiresAt = this.quarantinedIPs.get(ip);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
      this.quarantinedIPs.delete(ip);
      return false;
    }
    return true;
  }

  quarantine(ip) {
    this.quarantinedIPs.set(ip, Date.now() + QUARANTINE_DURATION_MS);
    console.warn(`[Security Alert] Quarantined hostile IP: ${ip} for 10 minutes.`);
  }
}

const security = new SecurityManager();
const server = createServer();
const wss = new WebSocketServer({ server, maxPayload: MAX_FRAME_BYTES });

wss.on('connection', (ws, req) => {
  const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (security.isBanned(clientIP)) {
    ws.close(1008, 'IP address is temporarily quarantined.');
    return;
  }

  const client = {
    ws,
    ip: clientIP,
    violations: 0,
    authenticated: false,
    send(events) {
      if (ws.readyState === ws.OPEN) {
        ws.send(stringify(events));
      }
    }
  };

  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      recordViolation(client, 'E_BINARY_DISALLOWED', 'Binary frames not accepted');
      return;
    }

    const rawText = data.toString('utf8');

    // Safe, non-throwing ingress validation
    const result = tryParse(rawText, GATEWAY_LIMITS);

    if (!result.ok) {
      const err = result.error;
      const details = {
        code: err.code,
        message: err.message,
      };

      if (err instanceof ENFSyntaxError) {
        details.line = err.line;
        details.column = err.column;
      }

      recordViolation(client, err.code, 'Protocol verification failed', details);
      return;
    }

    if (result.value.length === 0) {
      recordViolation(client, 'E_EMPTY_FRAME', 'Frames must contain at least one statement');
      return;
    }

    // Dispatch valid, safe events
    for (const event of result.value) {
      routeEvent(client, event);
    }
  });
});

function recordViolation(client, code, reason, details = {}) {
  client.violations++;
  console.warn(`[Violation] ${client.ip} violation count: ${client.violations} (${code})`);

  // Provide immediate structured feedback
  client.send([
    { name: 'system.error', value: { code, reason, details } }
  ]);

  if (client.violations >= MAX_VIOLATIONS_BEFORE_BAN) {
    security.quarantine(client.ip);
    client.ws.close(1008, 'Excessive protocol violations');
  }
}

function routeEvent(client, event) {
  switch (event.name) {
    case 'auth.login':
      // e.g. auth.login {token: "jwt_..."};
      client.authenticated = true;
      client.send([{ name: 'auth.success', value: { user_id: 'usr_99' } }]);
      break;

    case 'system.ping':
      // Heartbeat
      client.send([{ name: 'system.pong', value: { server_time: Date.now() } }]);
      break;

    default:
      if (!client.authenticated) {
        recordViolation(client, 'E_UNAUTHORIZED', 'Authentication required prior to dispatching commands.');
        return;
      }
      console.log(`[Dispatched] ${event.name} from ${client.ip}`);
  }
}

server.listen(8000, () => {
  console.log('Hardened Anti-DoS ENF Gateway running on port 8000');
});
```

---

## 3. Resilience Testing Under Hostile Input

The table below demonstrates how the hardened gateway responds to standard automated exploits:

| Exploit Type | Attack Payload Example | Gateway Response | CPU/Memory Effect |
| :--- | :--- | :--- | :--- |
| **Stack Overflow (Nesting Bomb)** | `[[[[[[[[[[ 1 ]]]]]]]]]]` (Depth > 4) | Rejected via `E_MAX_DEPTH` (Limit Violation) | **0% memory spike** (Stops at depth 4) |
| **Duplicate Key Collision** | `{id: 1, id: 2};` | Rejected via `E_DUPLICATE_KEY` (Syntax Violation) | Immediate rejection |
| **Unsafe Integer Poisoning** | `account.set {balance: 9007199254740992};` | Rejected via `E_NUMBER_RANGE` | Prevents float rounding exploit |
| **Continuous Fuzzing** | Random corrupted bytes | After 3 violations: **IP Quarantined (Close 1008)** | IP blocked; zero further event loop impact |
