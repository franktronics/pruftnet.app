# Core Package Tests

This directory contains unit tests for the core C++ components using Catch2 framework.

## Running Tests

### Using pnpm (recommended)
From project root:
```bash
pnpm test
```

From core package:
```bash
cd packages/core
pnpm test
```

### Direct script execution
```bash
cd packages/core/tests
./run_tests.sh
```

### Manual Method
1. Navigate to tests directory and create a build directory:
```bash
cd packages/core/tests
mkdir -p build
cd build
```

2. Configure with CMake:
```bash
cmake ..
```

3. Build:
```bash
cmake --build . --parallel
```

4. Run tests:
```bash
./core_tests
```

## Adding New Tests

1. Create a new `.test.cpp` file in the `tests/` directory
2. Include the Catch2 header: `#include <catch2/catch_test_macros.hpp>`
3. If your test needs additional core source files, add them to `test_sources.txt`:
   ```
   # Edit test_sources.txt and add the relative path from core/src/cpp/
   utils/your_module/your_file.cpp
   ```
4. Write test cases using Catch2 syntax:

```cpp
#include <catch2/catch_test_macros.hpp>
#include "utils/buffer/your_module.hpp"  // Use relative path from core/src/cpp

TEST_CASE("Your test description", "[tag]") {
    SECTION("Specific test case") {
        // Your test code
        REQUIRE(condition == expected);
    }
}
```

5. The CMake configuration will automatically discover and build your new tests

## Source File Management

- `test_sources.txt`: Contains the list of core source files needed for testing
- Only files listed here will be compiled (avoiding N-API dependencies)
- Add new source files as needed when creating tests that depend on them

## Test Structure

- `ring_buffer.test.cpp`: Tests for the RingBuffer class
- `basic_test.test.cpp`: Basic functionality tests (example)
- More test files can be added following the same pattern (must end with `.test.cpp`)
- All tests are compiled into a single executable: `core_tests`
- All tests are isolated in this `tests/` directory

## Dependencies

- Catch2 v3.x (automatically downloaded by CMake if not found)
- C++17 compiler
- CMake 3.16+

## Test Categories

Tests are organized with tags:
- `[ring_buffer]`: RingBuffer functionality tests
- `[basic]`: Basic C++ functionality tests
- `[memory]`: Memory-related tests

You can run specific test categories if needed:
```bash
./core_tests "[ring_buffer]"  # Run only ring buffer tests
./core_tests "[basic]"        # Run only basic tests
```