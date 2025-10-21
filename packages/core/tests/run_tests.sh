#!/bin/bash

# Script to build and run tests using CMake from tests directory

set -e  # Exit on any error

echo "Building and running Core tests..."

# Create build directory for tests
BUILD_DIR="build"
mkdir -p "$BUILD_DIR"

# Navigate to build directory
cd "$BUILD_DIR"

# Configure with CMake
echo "Configuring tests with CMake..."
cmake ..

# Build
echo "Building tests..."
cmake --build . --parallel $(nproc)

# Run tests
echo "Running tests..."
echo "========================"
./ring_buffer_tests

echo ""
echo "✅ Tests completed successfully!"