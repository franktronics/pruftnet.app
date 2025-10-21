#include <catch2/catch_test_macros.hpp>

#include <vector>
#include <string>

TEST_CASE("Basic functionality tests", "[basic]") {
    
    SECTION("Vector operations") {
        std::vector<int> vec = {1, 2, 3, 4, 5};
        
        REQUIRE(vec.size() == 5);
        REQUIRE(vec[0] == 1);
        REQUIRE(vec[4] == 5);
        
        vec.push_back(6);
        REQUIRE(vec.size() == 6);
        REQUIRE(vec.back() == 6);
    }
    
    SECTION("String operations") {
        std::string str = "Hello";
        
        REQUIRE(str.length() == 5);
        REQUIRE(str == "Hello");
        
        str += " World";
        REQUIRE(str == "Hello World");
        REQUIRE(str.length() == 11);
    }
    
    SECTION("Basic arithmetic") {
        int a = 10;
        int b = 20;
        
        REQUIRE(a + b == 30);
        REQUIRE(b - a == 10);
        REQUIRE(a * 2 == 20);
        REQUIRE(b / 2 == 10);
    }
}

TEST_CASE("Memory operations", "[basic][memory]") {
    
    SECTION("Array bounds") {
        int arr[5] = {1, 2, 3, 4, 5};
        
        REQUIRE(arr[0] == 1);
        REQUIRE(arr[4] == 5);
        
        // Modify array
        arr[2] = 10;
        REQUIRE(arr[2] == 10);
    }
    
    SECTION("Dynamic allocation") {
        int* ptr = new int(42);
        
        REQUIRE(*ptr == 42);
        
        *ptr = 100;
        REQUIRE(*ptr == 100);
        
        delete ptr;
    }
}