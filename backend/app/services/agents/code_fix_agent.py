"""
Code Fix Suggestion Agent

Provides generic fix suggestions based on detected bugs.
"""

from typing import List, Dict


def suggest_fix(bugs: List[str]) -> Dict[str, str]:
    """
    Generate fix suggestions for detected bugs.

    Args:
        bugs: List of detected bug categories

    Returns:
        Dictionary mapping bug types to suggested fixes
    """

    fix_mapping = {
        "Compilation error": "Fix syntax errors. Check for missing semicolons, brackets, or incorrect variable declarations.",
        "Logic failure": "Check input handling and conditions. Verify your algorithm logic and edge cases.",
        "Partial logic failure": "Review edge cases and boundary conditions. Some test cases are failing.",
        "Runtime error": "Check for null/undefined access, array index out of bounds, or division by zero.",
        "Time limit exceeded": "Optimize your algorithm. Consider using better data structures or reducing time complexity.",
        "Memory limit exceeded": "Reduce memory usage. Avoid creating unnecessary data structures or large arrays.",
        "No test results available": "Unable to analyze. Please ensure code compiles and runs correctly."
    }

    suggestions = {}

    for bug in bugs:
        if bug in fix_mapping:
            suggestions[bug] = fix_mapping[bug]
        else:
            suggestions[bug] = "Review your code for potential issues."

    return suggestions
