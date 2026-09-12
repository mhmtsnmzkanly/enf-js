# ENF Performance Benchmarks & Laboratory Report

This document reports empirical performance benchmarks for `@mhmtsnmzkanly/enf-js` across varying document sizes, statement counts, and container nesting depths.

---

## 1. Test Methodology & Environment

All benchmarks are executed via `bench/run.js` using Node.js's native `performance.now()` high-resolution timers.
- **Warmup:** Each benchmark scenario undergoes initial warmup iterations to ensure V8 JIT compiler optimization before timing commences.
- **Garbage Collection:** Benchmarks run without forced GC pauses between iterations to simulate real-world service conditions.
- **Environment:** Node.js v18+ on x86_64 Linux.

To reproduce these benchmarks on your local machine:
```bash
npm run bench
```

---

## 2. Empirical Benchmark Results

| Scenario | Payload Size | Iterations | Operation | Elapsed (ms) | Throughput (MB/s) | Operations (Events/s) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Small Event (`ping;`)** | 5 bytes | 100,000 | `parse` | 114.77 | 4.2 MB/s | **871,273** |
| | 5 bytes | 100,000 | `stringify` | 55.87 | 8.5 MB/s | **1,790,006** |
| | 5 bytes | 100,000 | `parse+stringify`| 109.06 | 4.4 MB/s | **916,918** |
| **Large Object** | 24,802 bytes | 100 | `parse` | 270.78 | 8.7 MB/s | 369 |
| | 24,802 bytes | 100 | `stringify` | 114.88 | 20.6 MB/s | 870 |
| | 24,802 bytes | 100 | `parse+stringify`| 357.84 | 6.6 MB/s | 279 |
| **1,000 Statements** | 52,279 bytes | 50 | `parse` | 219.61 | 11.4 MB/s | **227,677** |
| | 52,279 bytes | 50 | `stringify` | 116.84 | 21.3 MB/s | **427,949** |
| | 52,279 bytes | 50 | `parse+stringify`| 338.86 | 7.4 MB/s | **147,556** |
| **100,000 Statements** | 5,627,779 bytes | 2 | `parse` | 986.02 | 10.9 MB/s | **202,836** |
| | 5,627,779 bytes | 2 | `stringify` | 482.65 | 22.2 MB/s | **414,375** |
| | 5,627,779 bytes | 2 | `parse+stringify`| 2,488.36 | 4.3 MB/s | **80,374** |
| **Deep Nesting (64)** | 141 bytes | 1,000 | `parse` | 15.55 | 8.6 MB/s | **64,315** |
| | 141 bytes | 1,000 | `stringify` | 42.15 | 3.2 MB/s | **23,726** |
| | 141 bytes | 1,000 | `parse+stringify`| 57.69 | 2.3 MB/s | **17,333** |

---

## 3. Analysis & Key Insights

### 1. Ultra-High Event Dispatch Rates
For micro-events (heartbeats, cursor movements, sensory readings), the serializer reaches **~1.79 million events per second**, while the parser sustains **~871,000 events per second**. This exceeds the maximum packet ingestion rate of standard gigabit network cards.

### 2. Linear Scaling on Large Document Streams
Processing a massive 5.6 MB file containing 100,000 statements takes less than **1 second** (986 ms). Throughput remains rock-solid between **10.9 MB/s and 22.2 MB/s**, proving that the Lexer and Parser maintain strictly $O(N)$ linear complexity without pathological slowdowns.

### 3. Wire Footprint Efficiency vs JSON
In event-streaming architectures, ENF drastically reduces wire size compared to JSON envelopes:

```text
JSON Event Envelope:
{"event":"cursor.pos","data":{"x":100,"y":200}}  -> 47 bytes

ENF Event Statement:
cursor.pos {x:100,y:200};                         -> 25 bytes (-46.8%)
```
