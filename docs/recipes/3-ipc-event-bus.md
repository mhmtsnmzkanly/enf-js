# Recipe 3: Process-to-Process (IPC) & Message-Broker Event Bus

This recipe demonstrates high-performance, ordered **Inter-Process Communication (IPC)** using **Unix Domain Sockets (UDS)** and an event-bus bridge for worker pools and microservices with **ENF (Event Notation Format)**.

---

## 1. Architectural Overview

When communicating between co-located processes on Linux/POSIX hosts (e.g., an HTTP gateway forwarding jobs to background worker processes), Unix Domain Sockets bypass the TCP network stack, providing microsecond round-trips.

```mermaid
flowchart LR
    Master[Master / API Gateway] -->|Unix Domain Socket /tmp/enf-bus.sock| Broker[ENF IPC Event Broker]
    Broker -->|job.dispatch {id, task};| Worker1[Worker Process 1]
    Broker -->|job.dispatch {id, task};| Worker2[Worker Process 2]
    Worker1 -->|job.progress {id, pct: 50};| Broker
    Worker1 -->|job.completed {id, result};| Broker
    Broker -.->|Optional Bridge| Redis[(Redis Streams / NATS)]
```

### Why ENF for Local IPC?
- **Stream Framing Without Delimiter Hacking:** Messages sent across domain sockets arrive as continuous byte streams. ENF's mandatory terminating semicolon (`;`) provides self-delimiting frames without needing length prefixes.
- **Ordered Execution:** ENF guarantees that an event list `[A, B, C]` is deserialized and processed strictly in sequence.
- **Inspectable UNIX Pipes:** You can tap into the socket using standard Unix tools: `socat - UNIX-CONNECT:/tmp/enf-bus.sock` or `nc -U /tmp/enf-bus.sock`.

---

## 2. Production Implementation

### IPC Broker: `EventBroker.js` (Unix Domain Socket Server)

```javascript
import { createServer } from 'node:net';
import { unlinkSync } from 'node:fs';
import { tryParse, stringify, DEFAULT_LIMITS } from '@mhmtsnmzkanly/enf-js';

const SOCKET_PATH = '/tmp/enf-bus.sock';

// Clean up stale socket file if it exists
try { unlinkSync(SOCKET_PATH); } catch {}

const IPC_LIMITS = Object.freeze({
  ...DEFAULT_LIMITS,
  maxSourceLength: 512 * 1024,  // 512 KB per IPC burst
  maxStatements: 256,
  maxDepth: 8,
});

class IPCEventBroker {
  constructor() {
    this.workers = new Set();
    this.producers = new Set();
    this.jobQueue = [];
    this.activeWorkers = new Map(); // socket -> currentJobId
  }

  registerProducer(socket) {
    this.producers.add(socket);
    console.log('[Broker] Producer connected');
  }

  registerWorker(socket, workerType) {
    this.workers.add(socket);
    this.activeWorkers.set(socket, null);
    console.log(`[Broker] Worker registered: ${workerType}`);
    this.drainQueue();
  }

  removeSocket(socket) {
    this.producers.delete(socket);
    this.workers.delete(socket);
    this.activeWorkers.delete(socket);
  }

  enqueueJob(job) {
    this.jobQueue.push(job);
    this.drainQueue();
  }

  drainQueue() {
    if (this.jobQueue.length === 0) return;

    for (const worker of this.workers) {
      if (this.activeWorkers.get(worker) === null) {
        const job = this.jobQueue.shift();
        if (!job) break;

        this.activeWorkers.set(worker, job.id);
        const wire = stringify([
          { name: 'job.dispatch', value: job }
        ]);
        worker.write(wire + '\n');
      }
    }
  }

  broadcastStatus(event) {
    const wire = stringify([event]);
    for (const producer of this.producers) {
      producer.write(wire + '\n');
    }
  }
}

const broker = new IPCEventBroker();

const server = createServer((socket) => {
  let buffer = '';

  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');

    // Semicolon-delimited IPC stream processing
    let semicolonIndex;
    while ((semicolonIndex = buffer.indexOf(';')) !== -1) {
      const statement = buffer.slice(0, semicolonIndex + 1);
      buffer = buffer.slice(semicolonIndex + 1);

      const result = tryParse(statement, IPC_LIMITS);
      if (result.ok) {
        for (const event of result.value) {
          handleIPCEvent(socket, event);
        }
      } else if (result.error.code === 'E_UNEXPECTED_EOF') {
        // Recover from semicolon inside quoted string
        buffer = statement + buffer;
        break;
      } else {
        console.error('[Broker Protocol Error]', result.error.message);
        socket.destroy();
        return;
      }
    }
  });

  socket.on('close', () => broker.removeSocket(socket));
});

function handleIPCEvent(socket, event) {
  switch (event.name) {
    case 'client.identify':
      if (event.value.role === 'producer') {
        broker.registerProducer(socket);
      } else if (event.value.role === 'worker') {
        broker.registerWorker(socket, event.value.type);
      }
      break;

    case 'job.submit':
      // Producer enqueues work: job.submit {id: "j_10", task: "render_pdf", user_id: 42};
      broker.enqueueJob(event.value);
      socket.write(stringify([{ name: 'job.queued', value: { id: event.value.id } }]) + '\n');
      break;

    case 'job.progress':
      // Worker reports progress: job.progress {id: "j_10", pct: 50};
      broker.broadcastStatus(event);
      break;

    case 'job.completed':
      // Worker finished task: job.completed {id: "j_10", duration_ms: 142};
      broker.activeWorkers.set(socket, null);
      broker.broadcastStatus(event);
      broker.drainQueue(); // Pull next job
      break;
  }
}

server.listen(SOCKET_PATH, () => {
  console.log(`ENF IPC Event Broker listening on ${SOCKET_PATH}`);
});
```

---

### Worker Process: `Worker.js`

```javascript
import { createConnection } from 'node:net';
import { stringify, tryParse } from '@mhmtsnmzkanly/enf-js';

const client = createConnection('/tmp/enf-bus.sock', () => {
  console.log('[Worker] Connected to IPC Broker');

  // Register as background worker
  client.write(stringify([
    { name: 'client.identify', value: { role: 'worker', type: 'image_processor' } }
  ]) + '\n');
});

let buffer = '';
client.on('data', (chunk) => {
  buffer += chunk.toString('utf8');

  let idx;
  while ((idx = buffer.indexOf(';')) !== -1) {
    const statement = buffer.slice(0, idx + 1);
    buffer = buffer.slice(idx + 1);

    const result = tryParse(statement);
    if (!result.ok) continue;

    for (const event of result.value) {
      if (event.name === 'job.dispatch') {
        executeJob(client, event.value);
      }
    }
  }
});

async function executeJob(socket, job) {
  console.log(`[Worker] Starting job: ${job.id}`);

  // Emit progress update
  socket.write(stringify([
    { name: 'job.progress', value: { id: job.id, pct: 50 } }
  ]) + '\n');

  await new Promise((r) => setTimeout(r, 200)); // Simulate async CPU work

  // Emit completion
  socket.write(stringify([
    { name: 'job.completed', value: { id: job.id, output: `processed_${job.id}.png` } }
  ]) + '\n');
}
```

---

## 3. Microservice Bridge Pattern (Publishing to Redis Streams / NATS)

When bridging local IPC events into a distributed message broker, ENF can be published directly into Redis Streams or NATS subjects without transcoding to JSON:

```javascript
// Example: Bridging ENF events to Redis Pub/Sub or Streams
import { stringify } from '@mhmtsnmzkanly/enf-js';

export function publishToMessageBroker(redisClient, streamKey, event) {
  // Transmit compact ENF string directly into Redis Stream
  const rawENF = stringify([event]);
  redisClient.xAdd(streamKey, '*', { enf: rawENF });
}
```
