#!/bin/bash
set -e

APP_DIR="$(cd "$(dirname "$0")/app" && pwd)"
PORT=3000
PID_FILE="/tmp/poke-trainer-dev.pid"

echo "=== Poke-Trainer Pro - Init Script ==="
echo ""

# Step 1: Install dependencies
echo "[1/5] Installing dependencies..."
cd "$APP_DIR"
npm install --silent 2>&1 | tail -1

# Step 2: Run tests
echo "[2/5] Running tests..."
npm test 2>&1
TEST_EXIT=$?

if [ $TEST_EXIT -ne 0 ]; then
  echo "FAIL: Tests failed with exit code $TEST_EXIT"
  exit 1
fi

# Step 3: Build check
echo "[3/5] Building project..."
npm run build 2>&1 | tail -5
BUILD_EXIT=$?

if [ $BUILD_EXIT -ne 0 ]; then
  echo "FAIL: Build failed with exit code $BUILD_EXIT"
  exit 1
fi

# Step 4: Start dev server and health check
echo "[4/5] Starting dev server on port $PORT..."
npm run dev -- -p $PORT &
DEV_PID=$!
echo $DEV_PID > "$PID_FILE"

# Wait for server to be ready
MAX_RETRIES=30
RETRY=0
while [ $RETRY -lt $MAX_RETRIES ]; do
  if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT" | grep -q "200"; then
    echo "  Server is ready!"
    break
  fi
  RETRY=$((RETRY + 1))
  sleep 1
done

if [ $RETRY -eq $MAX_RETRIES ]; then
  echo "FAIL: Server did not start within ${MAX_RETRIES}s"
  kill $DEV_PID 2>/dev/null
  rm -f "$PID_FILE"
  exit 1
fi

# Step 5: Shutdown
echo "[5/5] Shutting down dev server..."
kill $DEV_PID 2>/dev/null
rm -f "$PID_FILE"
wait $DEV_PID 2>/dev/null

echo ""
echo "=== All checks passed! ==="
