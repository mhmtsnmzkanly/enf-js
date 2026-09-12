# Recipe 4: Append-Only Write-Ahead Log (WAL) & Event Sourcing

This recipe demonstrates a crash-resilient, deterministic **Write-Ahead Log (WAL)** and **Event Sourcing engine** for financial ledgers, transactional state machines, and immutable audit trails using **ENF (Event Notation Format)**.

---

## 1. Architectural Overview

In event-sourced architectures, state is never directly overwritten. Instead, every mutation is committed as an immutable event to an append-only log. Current application state is reconstructed by replaying the log from the beginning (or from a snapshot).

```mermaid
flowchart TD
    App[Bank Ledger State Machine] -->|1. Append Event| WAL[ENF Write-Ahead Log: ledger.wal]
    WAL -->|2. fsync()| Disk[(Durable Disk Storage)]
    Disk -->|3. Acknowledge| App
    
    subgraph Crash Recovery
        CorruptDisk[(WAL with incomplete write)] --> Replayer[ENF Replay Engine]
        Replayer -->|Parse up to last valid ';'| RestoredState[Deterministic Recovered State]
    end
```

### Why ENF Excels at WAL & Event Sourcing
1. **Crash Resilience:** Because every ENF statement requires an explicit terminating semicolon (`;`), an un-flushed partial write at the end of a file (caused by a power cut or process crash) is trivially detectable (`E_UNEXPECTED_EOF`). The engine safely replays up to the last valid `;` without losing previous transactions.
2. **Canonical Audit Trails:** The `format()` API outputs deterministic, canonical formatting (2 spaces, 1 member per line), making event files directly inspectable via `git diff` or human auditing tools.
3. **High Replay Speed:** Parsing 100,000 statements takes less than 1 second (~200,000 events/sec), enabling sub-second state recovery.

---

## 2. Production Implementation: `ENFWriteAheadLog.js`

```javascript
import { openSync, readFileSync, appendFileSync, ftruncateSync, closeSync, statSync, fsyncSync } from 'node:fs';
import { tryParse, stringify, format } from '@mhmtsnmzkanly/enf-js';

export class ENFWriteAheadLog {
  constructor(filePath) {
    this.filePath = filePath;
    this.fd = openSync(this.filePath, 'a+');
  }

  // Append an event record and guarantee durability to disk
  append(event) {
    // ENF wire serialization: name [value];\n
    const entry = stringify([event]) + '\n';
    appendFileSync(this.fd, entry, { encoding: 'utf8' });
    fsyncSync(this.fd); // Flush filesystem cache to physical storage
  }

  // Replay the WAL and restore the in-memory state machine
  replay(applyEvent) {
    const rawContent = readFileSync(this.filePath, 'utf8');
    if (!rawContent.trim()) return 0;

    const result = tryParse(rawContent);

    if (result.ok) {
      // Clean log with no corruption
      for (const event of result.value) {
        applyEvent(event);
      }
      return result.value.length;
    }

    // Handle Crash Recovery (partial write at EOF)
    if (result.error.code === 'E_UNEXPECTED_EOF' || result.error.code === 'E_EXPECTED_SEMICOLON') {
      console.warn('[WAL Recovery] Detected incomplete write at EOF. Truncating to last safe delimiter...');
      
      const lastSemicolon = rawContent.lastIndexOf(';');
      if (lastSemicolon === -1) {
        // No valid statement exists
        ftruncateSync(this.fd, 0);
        return 0;
      }

      // Safe content up to the final semicolon
      const safeContent = rawContent.slice(0, lastSemicolon + 1);
      const safeResult = tryParse(safeContent);

      if (!safeResult.ok) {
        throw new Error(`[WAL Corruption] Failed to parse recovered WAL: ${safeResult.error.message}`);
      }

      for (const event of safeResult.value) {
        applyEvent(event);
      }

      // Truncate the file to remove the corrupted trailing bytes
      const safeByteLength = Buffer.byteLength(safeContent, 'utf8') + 1; // +1 for newline
      ftruncateSync(this.fd, safeByteLength);
      console.log(`[WAL Recovery] Successfully restored ${safeResult.value.length} events.`);
      return safeResult.value.length;
    }

    throw new Error(`[WAL Fatal] Unrecoverable log syntax error: ${result.error.message}`);
  }

  close() {
    closeSync(this.fd);
  }
}
```

---

## 3. Financial Ledger State Machine Example

```javascript
import { ENFWriteAheadLog } from './ENFWriteAheadLog.js';

class BankAccountLedger {
  constructor(walPath) {
    this.wal = new ENFWriteAheadLog(walPath);
    this.balances = new Map(); // AccountId -> Balance
    this.sequence = 0;

    // Restore state from disk on startup
    const eventCount = this.wal.replay((event) => this.apply(event));
    console.log(`[Ledger Boot] Restored state from ${eventCount} committed events.`);
  }

  // State Transition Reducer
  apply(event) {
    this.sequence++;
    switch (event.name) {
      case 'account.created': {
        const { id, initial_balance } = event.value;
        this.balances.set(id, initial_balance);
        break;
      }

      case 'account.deposit': {
        const { id, amount } = event.value;
        const current = this.balances.get(id) || 0;
        this.balances.set(id, current + amount);
        break;
      }

      case 'account.transfer': {
        const { from, to, amount } = event.value;
        const fromBal = this.balances.get(from) || 0;
        const toBal = this.balances.get(to) || 0;
        if (fromBal < amount) throw new Error(`Insufficient funds for account ${from}`);
        this.balances.set(from, fromBal - amount);
        this.balances.set(to, toBal + amount);
        break;
      }
    }
  }

  // Public Command Methods (Must write to WAL BEFORE applying to RAM)
  createAccount(id, initialBalance) {
    const event = { name: 'account.created', value: { id, initial_balance: initialBalance } };
    this.wal.append(event);
    this.apply(event);
  }

  transfer(from, to, amount) {
    const event = { name: 'account.transfer', value: { from, to, amount } };
    this.wal.append(event);
    this.apply(event);
  }

  getBalance(id) {
    return this.balances.get(id) ?? 0;
  }
}

// Usage Demo
const ledger = new BankAccountLedger('/tmp/ledger.enf');

ledger.createAccount('acc_alice', 1000);
ledger.createAccount('acc_bob', 250);
ledger.transfer('acc_alice', 'acc_bob', 150);

console.log('Alice Balance:', ledger.getBalance('acc_alice')); // 850
console.log('Bob Balance:', ledger.getBalance('acc_bob'));     // 400
```

---

## 4. Snapshot Compaction Pattern

When a WAL accumulates millions of events, replaying from zero on boot becomes slow. The solution is taking a periodic snapshot and truncating the log:

```javascript
import { writeFileSync } from 'node:fs';
import { format } from '@mhmtsnmzkanly/enf-js';

export function compactSnapshot(accountsMap, snapshotFile) {
  // Serialize current state as an authoritative snapshot document
  const snapshotEvents = Array.from(accountsMap.entries()).map(([id, balance]) => ({
    name: 'account.snapshot',
    value: { id, balance, compacted_at: Date.now() }
  }));

  // Write in canonical format for human review
  const formattedText = format(stringify(snapshotEvents));
  writeFileSync(snapshotFile, formattedText, 'utf8');
}
```
