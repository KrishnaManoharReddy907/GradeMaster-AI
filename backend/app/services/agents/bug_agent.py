"""
Bug Detection Agent

Analyzes test results to identify bugs in code submissions.
"""

from typing import List


def detect_bugs(test_results: List[dict]) -> List[str]:
    """
    Detect bugs based on test execution results.

    Args:
        test_results: List of test case results from Judge0 execution

    Returns:
        List of detected bug categories
    """

    if not test_results:
        return ["No test results available"]

    bugs = []

    # Check for compilation errors
    has_compile_error = False
    for result in test_results:
        compile_output = result.get("compile_output")
        if compile_output:
            has_compile_error = True
            break

    if has_compile_error:
        bugs.append("Compilation error")
        return bugs  # No point checking further if compilation failed

    # Count passed tests
    passed_count = sum(1 for result in test_results if result.get("passed", False))
    total_count = len(test_results)

    # Check for logic failures
    if passed_count == 0:
        bugs.append("Logic failure")
    elif passed_count < total_count:
        bugs.append("Partial logic failure")

    # Check for runtime errors
    for result in test_results:
        status_desc = result.get("status_description", "")
        if "Runtime Error" in status_desc:
            if "Runtime error" not in bugs:
                bugs.append("Runtime error")
        elif "Time Limit" in status_desc:
            if "Time limit exceeded" not in bugs:
                bugs.append("Time limit exceeded")
        elif "Memory" in status_desc:
            if "Memory limit exceeded" not in bugs:
                bugs.append("Memory limit exceeded")

    return bugs if bugs else []
