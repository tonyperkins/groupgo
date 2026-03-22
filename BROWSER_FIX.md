# WSL Browser Tool Fix

If the `browser_subagent` or Playwright-based tests (like `cinemark_test.py`) fail with `ECONNREFUSED` or missing Chromium errors in WSL, follow these steps to restore functionality.

## The Problem
WSL (Ubuntu) often lacks the necessary Linux shared libraries (e.g., `libgbm`, `libnss3`) and the specific Chromium binary required by Playwright. Additionally, the system Node.js version may be too old to run modern Playwright commands.

## The Fix

### 1. Use the Portable Node.js
Always use the portable Node.js version stored in the project to ensure compatibility:
- Path: `/home/tony/cascadeprojects/groupgo/.node/bin/node`

### 2. Install Playwright Dependencies
Run the following command to install both the Chromium binary and the required system libraries:

```bash
sudo env PATH="/home/tony/cascadeprojects/groupgo/.node/bin:$PATH" npx playwright install --with-deps chromium
```

### 3. Start Browser Manually (WSL Fix)
In WSL, you must manually start a headless browser instance on port 9222 before using the agent's browser tool:

```bash
/root/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome --headless --remote-debugging-port=9222 --no-sandbox --disable-gpu about:blank &
```

### 4. Verification
Verify the installation by checking the CDP connection:

```bash
curl -s http://127.0.0.1:9222/json/version
```

## Future Reference
This setup ensures that the headless browser has the necessary environment to render pages and provide the CDP (Chrome DevTools Protocol) connection required by agentic tools.
