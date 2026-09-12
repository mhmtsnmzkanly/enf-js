# ENF Security Model & Vulnerability Policy

This document outlines the security architecture, threat model, mitigation mechanisms, and vulnerability disclosure policy for **ENF (Event Notation Format)** and its reference JavaScript implementation `@mhmtsnmzkanly/enf-js`.

---

## 1. Threat Model & Security Boundaries

ENF is designed to parse and serialize structured event messages exchanged across untrusted network boundaries (WebSockets, TCP sockets, IPC pipes, and log inputs).

```mermaid
flowchart TD
    UntrustedInput[Untrusted Network / Ingress Data] --> TransportBoundary[Transport Boundary (TLS, Frame Cap)]
    TransportBoundary --> ENFParser[ENF Parser (tryParse)]
    
    subgraph Defenses Inside Parser
        FiniteLimits[Finite Resource Limits (Depth, Length, Strings)]
        SurrogateCheck[Surrogate Pair & Control Char Validator]
        SafeIntCheck[Safe Integer & Finite Number Validator]
        DuplicateKeyCheck[Duplicate Key Rejection]
    end
    
    ENFParser --> Defenses Inside Parser
    Defenses Inside Parser --> SafeDataModel[Safe In-Memory JS Event Array]
```

### In-Scope Threats Mitigated by ENF
- **Denial-of-Service via Nesting Bombs:** Unlimited recursive containers exhausting the JavaScript call stack.
- **Memory Exhaustion (OOM):** Unbounded string allocations and giant single-statement documents.
- **Surrogate Code Unit Exploits:** Ill-formed Unicode sequences designed to bypass downstream web application firewalls (WAFs).
- **Silent Data Overwrite:** Duplicate object keys altering business logic via last-write-wins semantics.
- **Numeric Precision Poisoning:** Out-of-range floating-point integers (`> 2^53 - 1`) causing silent rounding errors in financial or identifier fields.

### Out-of-Scope (Caller Responsibilities)
- **Transport Security:** ENF is a presentation-layer notation. Encryption (TLS/WSS), transport frame caps, and IP rate-limiting must be enforced by the transport layer.
- **In-Process VM Isolation for Live Objects:** `stringify()` asserts properties on existing JavaScript objects, but it is **not** a sandbox against hostile `Proxy` traps or active code execution during introspection.

---

## 2. Detailed Attack Vectors & Mitigations

### 2.1. Resource Exhaustion & Denial-of-Service
| Threat | Attack Scenario | ENF Defense Mechanism |
| :--- | :--- | :--- |
| **Stack Overflow** | `[[[[[[[[...]]]]]]]]` (Deep nesting) | Enforced `maxDepth` (default: 64). Recursing beyond this depth throws `ENFLimitError` (`E_MAX_DEPTH`) before the V8 call stack exhausts. |
| **Memory Allocation Bomb** | Single multi-megabyte string | Enforced `maxStringLength` (default: 262,144 UTF-16 code units) evaluated during escape scanning. |
| **Source Flood** | Giant continuous text stream | Enforced `maxSourceLength` (default: 16 MiB). |
| **Statement Exhaustion** | Millions of tiny statements in one frame | Enforced `maxStatements` (default: 100,000 statements). |

### 2.2. Prototype Pollution & Object Injection
- **Parser Isolation:** The parser populates plain objects using `Object.defineProperty()` with standard own-enumerable properties. It never sets `__proto__` as an internal accessor.
- **Serializer Prototype Hygiene:** `stringify()` explicitly verifies that every serialized object has a prototype equal to `Object.prototype` or `null`. Objects with customized prototype chains, foreign constructors, or Symbol properties are rejected immediately with `ENFTypeError`.

### 2.3. Unicode Surrogate Hygiene
JavaScript strings are indexed by UTF-16 code units. Attackers frequently exploit lone surrogate code points (`U+D800` through `U+DFFF`) to trigger desynchronization bugs between different parsing tiers.
- **Rule:** A high surrogate must be immediately paired with a low surrogate.
- **Mitigation:** The lexer validates all raw and escaped (`\uXXXX`) surrogate sequences. Isolated high surrogates, isolated low surrogates, or inverted surrogate pairs are rejected with `E_INVALID_STRING`.

### 2.4. Numeric Precision & Integer Range
- **Rule:** Number source text must match RFC 8259 JSON grammar without extensions (`NaN`, `Infinity`, `+1`, and leading zeroes are rejected).
- **Safe Integer Boundary:** If a number evaluates to an integer, it MUST fall within the inclusive ECMAScript safe integer range:
  $$-(2^{53} - 1) \le n \le (2^{53} - 1)$$
  Any number exceeding this range (such as `9007199254740992` or `1e20`) is rejected with `E_NUMBER_RANGE`.

### 2.5. Duplicate Object Key Attack
In standard JSON, `{ "role": "user", "role": "admin" }` is accepted, silently promoting privileges if the parser resolves last-write-wins.
- **ENF Mitigation:** Duplicate keys trigger an immediate `E_DUPLICATE_KEY` syntax error.

---

## 3. Untrusted In-Process Objects: The Proxy Trap Warning

> [!WARNING]
> **`stringify()` is not a JavaScript sandbox.**

If your application receives live, interactive JavaScript objects from third-party plugins or un-isolated script realms:
```javascript
// Malicious in-process object
const hostile = new Proxy({}, {
  get(target, prop) {
    while (true) {} // Infinite loop DoS
  }
});
```
Because `stringify()` must inspect object properties via `Reflect.ownKeys` and `getOwnPropertyDescriptor`, a malicious Proxy trap will execute host JavaScript code.

### Security Directive
Before passing in-memory object graphs from untrusted runtime contexts to `stringify()`, serialize them into an inert copy using explicit schema mapping or pure property copies.

---

## 4. Vulnerability Disclosure Policy

If you discover a security vulnerability or potential denial-of-service vector in `@mhmtsnmzkanly/enf-js`:

1. **Do NOT open a public GitHub issue.**
2. Report the vulnerability privately via GitHub Security Advisories or by emailing the project maintainers.
3. Include a reproducible proof-of-concept (POC), observed behavior, and system environment details.
4. Maintainers will acknowledge receipt within 48 hours and work with you on a coordinated disclosure schedule.
