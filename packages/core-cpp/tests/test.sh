#!/bin/bash

TEST_NAME=$(basename "$1" .cpp)
TEST_EXECUTABLE="./build/$TEST_NAME"

if [ ! -f "$TEST_EXECUTABLE" ]; then
  echo "Error: Test executable not found: $TEST_EXECUTABLE"
  echo "Did you run 'pnpm run build:test' first?"
  exit 1
fi

echo "Running test: $TEST_NAME"
echo "================================"

if [[ "$TEST_NAME" == *"sniffer"* ]] && [[ "$OSTYPE" == "linux-gnu"* ]]; then
  echo "This test requires sudo privileges"
  sudo "$TEST_EXECUTABLE"
else
  "$TEST_EXECUTABLE"
fi

EXIT_CODE=$?

echo "================================"
if [ $EXIT_CODE -eq 0 ]; then
  echo "Test passed!"
else
  echo "Test failed with exit code: $EXIT_CODE"
fi

exit $EXIT_CODE
