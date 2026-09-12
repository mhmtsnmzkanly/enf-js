# ENF Production Engineering Recipes

> **Industrial-grade architectures and production patterns for ENF (Event Notation Format).**

This directory contains standalone, production-ready implementation recipes demonstrating where ENF fundamentally outperforms JSON, Protobuf, and bespoke protocols. Each recipe addresses one of the primary architectures highlighted in [`docs/for-who.md`](../for-who.md).

---

## Recipe Catalog

| Recipe | Architecture & Problem Domain | Core ENF Advantage Showcased |
| :--- | :--- | :--- |
| [**1. Real-Time Collaboration**](./1-realtime-collaboration.md) | Multiplayer canvas, shared state sync, and live cursor tracking. | High-frequency event batching, zero JSON wrapper bloat, valueless presence signals (`user.idle;`). |
| [**2. IoT & Telemetry Ingestion**](./2-iot-telemetry.md) | Sensor data collection, edge gateways, and TCP/Serial daemon streams. | Deterministic semicolon framing, resilient stream chunking, cellular byte conservation. |
| [**3. IPC & Microservice Event Bus**](./3-ipc-event-bus.md) | Inter-process communication over Unix Domain Sockets & pub-sub workers. | Low-overhead streaming serialization, ordered execution guarantees, queue multiplexing. |
| [**4. Event Sourcing & Append-Only WAL**](./4-event-sourcing-wal.md) | Financial ledgers, write-ahead logs (WAL), audit trails, and crash replay. | Append-only corruption resilience, canonical formatting for git-diff audits, snapshot compaction. |
| [**5. Hardened Ingress Gateway**](./5-hardened-gateway.md) | Internet-facing public WebSocket endpoints vulnerable to abuse. | Zero-allocation error routing with `tryParse()`, strict domain limits, automatic poison-pill quarantine. |

---

## Philosophy of These Recipes

1. **No Pseudocode:** All recipes feature syntactically valid, production-structured JavaScript/TypeScript code using `@mhmtsnmzkanly/enf-js`.
2. **Defensive by Default:** Every example implements bounded buffers, timeout guards, and resource limits.
3. **Transport Decoupled:** While WebSocket and Unix Sockets are highlighted, the patterns adapt cleanly to TCP, named pipes, Redis streams, and NATS.
