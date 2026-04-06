"""
Intelligent Bug Detection Agent (Enhanced)

Advanced bug detection using test results, AST analysis, and error outputs.
Context-aware detection with improved accuracy for syntax, runtime, and logic errors.
"""

from typing import List, Dict, Any, Optional, Set


def detect_bugs(
    test_results: List[Dict[str, Any]],
    ast_analysis: Optional[Dict[str, Any]] = None,
    stderr: Optional[str] = None,
    compile_output: Optional[str] = None
) -> List[str]:
    """
    Detect bugs based on test results, AST analysis, and error outputs.

    Args:
        test_results: List of test case results from Judge0 execution
        ast_analysis: AST analysis output (loops, nesting_depth, complexity, etc.)
        stderr: Runtime error string (optional)
        compile_output: Compilation error output (optional)

    Returns:
        List of detected bug categories (no duplicates, always meaningful)
    """
    bugs: Set[str] = set()

    # Handle empty test results
    if not test_results:
        return ["No test results available"]

    # Priority 1: Syntax/Compilation Errors
    syntax_bug = _detect_syntax_error(compile_output, test_results)
    if syntax_bug:
        return [syntax_bug]

    # Priority 2: Runtime Errors
    runtime_bug = _detect_runtime_error(stderr, test_results)
    if runtime_bug:
        return [runtime_bug]

    # Count passed/failed tests
    passed_count = sum(1 for r in test_results if r.get("passed", False))
    total_count = len(test_results)

    # Priority 3: Logic Analysis
    logic_bugs = _analyze_test_logic(passed_count, total_count, test_results)
    bugs.update(logic_bugs)

    # Priority 4: Arithmetic/Formula Logic
    arithmetic_bugs = _detect_arithmetic_logic(test_results)
    bugs.update(arithmetic_bugs)

    # Priority 5: AST-based Code Quality Issues
    if ast_analysis:
        quality_bugs = _analyze_code_structure(ast_analysis, total_count)
        bugs.update(quality_bugs)

    # Ensure we always return a meaningful list
    return list(bugs) if bugs else ["Logic error in code"]


def _detect_syntax_error(
    compile_output: Optional[str],
    test_results: List[Dict[str, Any]]
) -> Optional[str]:
    """
    Detect and categorize syntax/compilation errors.

    Args:
        compile_output: Compilation error string (optional)
        test_results: Test results to check for compile_output

    Returns:
        Specific syntax error message or None
    """
    # Check parameter
    if compile_output and compile_output.strip():
        compile_lower = compile_output.lower()

        if "syntax" in compile_lower or "invalid" in compile_lower:
            return "Syntax error (invalid syntax or missing bracket)"
        elif "undeclared" in compile_lower or "undefined" in compile_lower:
            return "Syntax error (undefined variable or function)"
        elif "expected" in compile_lower:
            return "Syntax error (missing or unexpected token)"
        else:
            return "Compilation error"

    # Check test results
    for result in test_results:
        result_compile = result.get("compile_output")
        if result_compile and result_compile.strip():
            compile_lower = result_compile.lower()

            if "syntax" in compile_lower or "invalid" in compile_lower:
                return "Syntax error (invalid syntax or missing bracket)"
            elif "undeclared" in compile_lower or "undefined" in compile_lower:
                return "Syntax error (undefined variable or function)"
            elif "expected" in compile_lower:
                return "Syntax error (missing or unexpected token)"
            else:
                return "Compilation error"

    return None


def _detect_runtime_error(
    stderr: Optional[str],
    test_results: List[Dict[str, Any]]
) -> Optional[str]:
    """
    Detect specific runtime errors.

    Args:
        stderr: Runtime error string (optional)
        test_results: Test results to check for stderr

    Returns:
        Specific runtime error message or None
    """
    # Check parameter
    if stderr and stderr.strip():
        error_type = _extract_specific_error(stderr)
        if error_type:
            return error_type

    # Check test results
    for result in test_results:
        result_stderr = result.get("stderr")
        if result_stderr and result_stderr.strip():
            error_type = _extract_specific_error(result_stderr)
            if error_type:
                return error_type

    return None


def _extract_specific_error(error_string: str) -> Optional[str]:
    """
    Extract specific runtime error type.

    Args:
        error_string: Full error string

    Returns:
        Specific error message or None
    """
    error_lower = error_string.lower()

    # Python-specific errors
    if "zerodivisionerror" in error_lower:
        return "Division by zero error"
    if "indexerror" in error_lower or "index out of range" in error_lower:
        return "Index out of bounds"
    if "valueerror" in error_lower:
        return "Invalid input format"
    if "typeerror" in error_lower:
        return "Type error (wrong data type operation)"
    if "nameerror" in error_lower:
        return "Undefined variable or function"
    if "keyerror" in error_lower:
        return "Dictionary key not found"
    if "attributeerror" in error_lower:
        return "Missing attribute or method"
    if "recursion" in error_lower or "stack overflow" in error_lower:
        return "Infinite recursion or stack overflow"

    # C/C++ errors
    if "segmentation fault" in error_lower:
        return "Segmentation fault (memory access violation)"
    if "floating point" in error_lower:
        return "Floating point exception"

    # Java errors
    if "nullpointerexception" in error_lower:
        return "Null pointer exception"
    if "arrayindexoutofboundsexception" in error_lower:
        return "Array index out of bounds"

    return None


def _analyze_test_logic(
    passed_count: int,
    total_count: int,
    test_results: List[Dict[str, Any]]
) -> Set[str]:
    """
    Analyze logic errors based on test case results.

    Args:
        passed_count: Number of passed test cases
        total_count: Total number of test cases
        test_results: Test results list

    Returns:
        Set of detected logic bugs
    """
    bugs: Set[str] = set()

    # No tests or all passed - no logic bugs
    if total_count == 0 or passed_count == total_count:
        return bugs

    # Complete logic failure (all tests failed, no compile/runtime errors)
    if passed_count == 0:
        bugs.add("Incorrect logic implementation")

    # Partial logic failure (some tests pass, some fail)
    elif passed_count > 0 and passed_count < total_count:
        bugs.add("Incorrect logic for some test cases")

    return bugs


def _detect_arithmetic_logic(test_results: List[Dict[str, Any]]) -> Set[str]:
    """
    Detect arithmetic and formula logic errors based on output pattern mismatch.

    Args:
        test_results: Test results list

    Returns:
        Set of detected arithmetic bugs
    """
    bugs: Set[str] = set()
    numeric_mismatch_count = 0

    for result in test_results:
        if result.get("passed", False):
            continue

        expected = str(result.get("expected_output", "")).strip()
        actual = str(result.get("actual_output", "")).strip()

        # Skip if no actual output (likely runtime/compile error)
        if not expected or not actual:
            continue

        # Try numeric comparison for pattern mismatch detection
        try:
            expected_num = float(expected)
            actual_num = float(actual)

            # Both are numbers but don't match - arithmetic/formula issue
            if expected_num != actual_num:
                numeric_mismatch_count += 1
        except (ValueError, TypeError):
            # Non-numeric outputs - not an arithmetic issue
            pass

    # Only add arithmetic bug if we see numeric output mismatches
    if numeric_mismatch_count > 0:
        bugs.add("Incorrect arithmetic or formula logic")

    return bugs


def _analyze_code_structure(
    ast_analysis: Dict[str, Any],
    total_tests: int
) -> Set[str]:
    """
    Analyze code structure for quality issues.
    
    NOTE: Does NOT flag missing loops/iteration - that would be assuming
    problem requirements. Only flags observable code quality issues.

    Args:
        ast_analysis: AST analysis results
        total_tests: Total number of test cases

    Returns:
        Set of structure-related bugs (only real observed issues)
    """
    bugs: Set[str] = set()

    # Check for deep nesting (observable code smell)
    nesting_depth = ast_analysis.get("nesting_depth", 0)
    if nesting_depth > 4:
        bugs.add("Deep nesting may indicate complex logic")

    # NOTE: Removed "Missing iterative logic" detection
    # We do NOT assume problems require loops based on ast_analysis.loops == 0
    # Many valid problems (e.g., square of number) don't need loops

    # NOTE: Removed complexity and recursion flags
    # These are not bugs - just implementation choices

    return bugs
