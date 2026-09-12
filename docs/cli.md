# ENF Command-Line Interface (CLI) & CI/CD Guide

The `enf` command-line executable provides static verification, canonical formatting, and stream-checking for `.enf` files across Linux, macOS, and Windows.

---

## 1. Installation

### Global Installation
```bash
npm install --global @mhmtsnmzkanly/enf-js
```

### Local Project Execution (Recommended)
```bash
npx enf --help
```

---

## 2. Command Reference

### `enf check [file|-]`
Verifies the syntax and resource limits of an ENF document without producing output.

```bash
# Check a specific file
npx enf check telemetry.enf

# Check standard input
cat stream.enf | npx enf check
```

**Success Output:**
```text
OK 12 events
```

---

### `enf format [--write] [file|-]`
Formats an ENF document into canonical format (2 spaces per depth level, 1 member per line, trailing semicolons).

```bash
# Output formatted ENF to stdout
npx enf format unformatted.enf

# Format standard input to stdout
cat unformatted.enf | npx enf format

# In-place atomic rewrite
npx enf format --write document.enf
```

> **Atomic Safety Guarantee:** `format --write` writes output to a hidden temporary file in the same directory (`.filename.pid.tmp`) with preserved file mode permissions, then replaces the original file using an atomic `renameSync`. If a syntax error is encountered, the original file is **never touched**.

---

## 3. Exit Codes

The CLI follows standard POSIX exit code conventions:

| Exit Code | Meaning | Cause |
| :---: | :--- | :--- |
| `0` | **Success** | Document is valid and formatted cleanly. |
| `1` | **Syntax or Limit Error** | Invalid token, missing semicolon, duplicate key, or resource ceiling exceeded. |
| `2` | **Usage or I/O Error** | File not found, permission denied, or invalid CLI flags. |

---

## 4. Git Pre-Commit Hook Integration

Automatically format and validate all `.enf` files prior to committing using **Husky** and **lint-staged**:

### `package.json` Configuration
```json
{
  "lint-staged": {
    "*.enf": [
      "enf format --write",
      "enf check"
    ]
  }
}
```

Now, any attempted commit containing malformed ENF will be rejected before leaving the developer's workstation.

---

## 5. GitHub Actions CI Pipeline

Add an automated syntax verification step to your pull request workflow:

### `.github/workflows/verify-enf.yml`
```yaml
name: Verify ENF Documents

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  validate-enf:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 18

      - name: Install Project Dependencies
        run: npm ci

      - name: Verify All ENF Files
        run: |
          find . -name "*.enf" -not -path "*/node_modules/*" | while read file; do
            echo "Checking $file..."
            npx enf check "$file" || exit 1
          done
```
