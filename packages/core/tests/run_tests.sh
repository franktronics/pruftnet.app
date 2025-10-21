#!/bin/bash

# Script to build and run all core tests

set -e  # Exit on any error

echo "🧪 Building and running Core tests..."

# Create build directory for tests
BUILD_DIR="build"
mkdir -p "$BUILD_DIR"

# Navigate to build directory
cd "$BUILD_DIR"

# Configure with CMake (only if not already configured or if CMakeLists.txt changed)
if [[ ! -f "Makefile" ]] || [[ "../CMakeLists.txt" -nt "Makefile" ]]; then
    echo "📦 Configuring tests with CMake..."
    cmake ..
fi

# Build
echo "🔨 Building tests..."
cmake --build . --parallel $(nproc)

# Run all tests
echo "🚀 Running all tests..."
echo "========================"
./core_tests --verbosity high --durations yes

echo ""
echo "✅ All tests completed successfully!"