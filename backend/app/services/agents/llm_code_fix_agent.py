"""
LLM-based Code Fix Agent

Uses Ollama LLM to generate intelligent code fixes based on detected bugs.
Provides detailed explanations, suggested changes, and corrected code snippets.
"""

import os
from typing import Dict, Any, List, Optional

try:
    import ollama
    OLLAMA_AVAILABLE = True
except ImportError:
    OLLAMA_AVAILABLE = False

# Ollama configuration
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")


async def generate_code_fix(
    code: str,
    bugs: List[str],
    language: str = "python",
    test_cases: Optional[List[Dict[str, Any]]] = None,
    problem_description: Optional[str] = None
) -> Dict[str, Any]:
    """
    Generate intelligent code fixes using LLM.

    Args:
        code: Original source code
        bugs: List of detected bugs
        language: Programming language (python, cpp, java, javascript, etc.)
        test_cases: Optional list of test cases with input, expected_output, actual_output
        problem_description: Optional problem statement to provide context

    Returns:
        Dictionary containing:
        - fix_explanation: What is wrong and why
        - suggested_change: How to fix it
        - corrected_code: Optional corrected code snippet
    """

    # Handle no bugs case
    if not bugs or len(bugs) == 0:
        return {
            "fix_explanation": "Code is correct. No fixes needed.",
            "suggested_change": "No changes required.",
            "corrected_code": None
        }

    # Handle empty code
    if not code or not code.strip():
        return {
            "fix_explanation": "No code provided for analysis.",
            "suggested_change": "Please submit code for analysis.",
            "corrected_code": None
        }

    # Try LLM-based fix generation
    llm_response = await _generate_llm_fix(code, bugs, language, test_cases, problem_description)

    if llm_response:
        return llm_response

    # Fallback if LLM fails
    return _generate_fallback_fix(bugs)


def _get_first_failing_test_case(test_cases: Optional[List[Dict[str, Any]]]) -> Optional[Dict[str, Any]]:
    """
    Get the first visible failing test case from the list.

    Args:
        test_cases: List of test case dictionaries

    Returns:
        First failing test case or None
    """
    if not test_cases:
        return None

    for tc in test_cases:
        # Check if test case failed (actual != expected)
        actual = tc.get("actual_output", "")
        expected = tc.get("expected_output", "")
        passed = tc.get("passed", None)

        # If explicitly marked as failed or outputs don't match
        if passed is False or (actual and expected and str(actual).strip() != str(expected).strip()):
            return tc

    return None


async def _generate_llm_fix(
    code: str,
    bugs: List[str],
    language: str,
    test_cases: Optional[List[Dict[str, Any]]] = None,
    problem_description: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Generate fixes using Ollama LLM.

    Args:
        code: Source code
        bugs: List of detected bugs
        language: Programming language
        test_cases: Optional list of test cases with input, expected_output, actual_output
        problem_description: Optional problem statement to provide context

    Returns:
        Fix response dict or None if failed
    """

    if not OLLAMA_AVAILABLE:
        print("[LLMCodeFix] Ollama not available")
        return None

    # DEBUG: Log problem description
    print(f"[LLMCodeFix] DEBUG PROBLEM DESCRIPTION: {problem_description}")

    # Build prompt with enhanced context
    bugs_str = "\n".join([f"- {bug}" for bug in bugs])

    # Get first failing test case for context
    failing_test = _get_first_failing_test_case(test_cases)

    # Build problem description section - MUST BE AT TOP
    problem_section = ""
    if problem_description and problem_description.strip():
        problem_section = f"""## Problem Description (READ THIS FIRST):
{problem_description.strip()}

⚠️ STRICT INSTRUCTION: You MUST follow the problem description above. Do NOT assume a different problem.
"""
    else:
        problem_section = "## Problem Description: Not provided - use test case to understand the problem.\n"

    # Build test case context section
    test_case_section = ""
    if failing_test:
        test_input = failing_test.get("input", "N/A")
        expected_output = failing_test.get("expected_output", "N/A")
        actual_output = failing_test.get("actual_output", "N/A")

        test_case_section = f"""
## Failing Test Case:
Input: {test_input}
Expected Output: {expected_output}
Actual Output: {actual_output}
"""

    prompt = f"""{problem_section}
{test_case_section}
## Student Code:
```{language}
{code}
```

## Detected Bugs:
{bugs_str}

## ⛔ STRICT RULES (DO NOT VIOLATE):
1. You MUST solve the problem described above - NOT a different problem
2. Do NOT change the problem type (e.g., if problem is "square", do NOT implement "sum")
3. Do NOT invent new logic like loops, summation, or different algorithms
4. ONLY fix the existing mistake in the student's code
5. Keep the correction MINIMAL - change only what is necessary
6. The corrected code MUST produce the expected output

## Your Task:
1. **Explanation:** What mistake did the student make? Why does the code produce wrong output?

2. **Suggested Change:** What specific, minimal change fixes the bug?

3. **Corrected Code:** Provide the corrected code (complete, runnable)

REMEMBER: Fix the bug, do NOT rewrite the solution or change the problem."""

    try:
        client = ollama.Client(host=OLLAMA_HOST)

        response = client.chat(
            model=OLLAMA_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": f"You are an expert {language} code correction assistant. Your job is to fix bugs in student code submissions. CRITICAL: You must read and follow the problem description exactly. Do NOT guess or assume a different problem. Your fixes must be minimal - only correct the specific mistake. Never change the problem type or introduce new algorithms."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            options={
                "temperature": 0.2,
                "num_predict": 1200
            }
        )

        if response and "message" in response:
            return _parse_llm_response(response["message"]["content"], bugs, code, language)

        return None

    except Exception as e:
        print(f"[LLMCodeFix] LLM generation failed: {e}")
        return None


def _clean_markdown_code(code_text: str) -> str:
    """
    Remove markdown code block artifacts from code.

    Args:
        code_text: Code string potentially with markdown artifacts

    Returns:
        Clean code string
    """
    if not code_text:
        return ""

    code = code_text.strip()

    # Remove code blocks with language specifier (```python, ```cpp, etc.)
    if code.startswith("```"):
        lines = code.split('\n')
        # Remove first line (```language)
        if lines[0].startswith("```"):
            lines = lines[1:]
        # Remove last line if it's ```
        while lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        code = '\n'.join(lines)

    # Remove inline backticks if entire code is wrapped
    if code.startswith("`") and code.endswith("`") and code.count("`") == 2:
        code = code[1:-1]

    return code.strip()


def _extract_code_from_response(response_text: str) -> str:
    """
    Extract code block from response text even if not properly structured.

    Args:
        response_text: Full response text

    Returns:
        Extracted code or empty string
    """
    import re

    # Try to find code block with language specifier
    code_pattern = r'```(?:\w+)?\s*\n(.*?)```'
    matches = re.findall(code_pattern, response_text, re.DOTALL)

    if matches:
        # Return the last code block (usually the corrected code)
        return matches[-1].strip()

    return ""


def _parse_llm_response(
    response_text: str,
    bugs: Optional[List[str]] = None,
    original_code: Optional[str] = None,
    language: str = "python"
) -> Dict[str, Any]:
    """
    Parse LLM response into structured format with robust fallbacks.

    Args:
        response_text: Full LLM response
        bugs: Optional list of bugs for fallback generation
        original_code: Original student code for fallback
        language: Programming language

    Returns:
        Structured fix dictionary (never empty fields)
    """
    if not response_text or not response_text.strip():
        return _generate_fallback_fix(bugs or [])

    sections = {
        "fix_explanation": "",
        "suggested_change": "",
        "corrected_code": ""
    }

    response_text = response_text.strip()

    # Try multiple header formats for explanation
    explanation_headers = [
        "**Explanation:**", "**Explanation**:", "## Explanation", "Explanation:",
        "**1. Explanation:**", "1. **Explanation:**", "### Explanation"
    ]
    for header in explanation_headers:
        if header in response_text:
            exp_start = response_text.find(header) + len(header)
            next_section = _find_next_section(response_text, exp_start)
            sections["fix_explanation"] = response_text[exp_start:next_section].strip()
            break

    # Try multiple header formats for suggested change
    change_headers = [
        "**Suggested Change:**", "**Suggested Change**:", "## Suggested Change",
        "Suggested Change:", "**Fix:**", "## Fix", "**2. Suggested Change:**",
        "2. **Suggested Change:**", "### Suggested Change"
    ]
    for header in change_headers:
        if header in response_text:
            change_start = response_text.find(header) + len(header)
            next_section = _find_next_section(response_text, change_start)
            sections["suggested_change"] = response_text[change_start:next_section].strip()
            break

    # Try multiple header formats for corrected code
    code_headers = [
        "**Corrected Code:**", "**Corrected Code**:", "## Corrected Code",
        "Corrected Code:", "**Fixed Code:**", "## Fixed Code",
        "**3. Corrected Code:**", "3. **Corrected Code:**", "### Corrected Code"
    ]
    for header in code_headers:
        if header in response_text:
            code_start = response_text.find(header) + len(header)
            raw_code = response_text[code_start:].strip()
            sections["corrected_code"] = _clean_markdown_code(raw_code)
            break

    # If corrected_code still empty, try to extract any code block
    if not sections["corrected_code"]:
        extracted_code = _extract_code_from_response(response_text)
        if extracted_code:
            sections["corrected_code"] = extracted_code

    # Clean any remaining markdown from all fields
    sections["fix_explanation"] = _clean_markdown_text(sections["fix_explanation"])
    sections["suggested_change"] = _clean_markdown_text(sections["suggested_change"])
    sections["corrected_code"] = _clean_markdown_code(sections["corrected_code"])

    # FALLBACK: Ensure no empty fields
    if not sections["fix_explanation"]:
        clean_response = _clean_markdown_text(response_text)
        if clean_response:
            sections["fix_explanation"] = clean_response[:min(500, len(clean_response))]
        else:
            sections["fix_explanation"] = "The code contains logic errors that need to be fixed."

    if not sections["suggested_change"]:
        if bugs:
            sections["suggested_change"] = "Fix the following issues:\n" + "\n".join([f"- {bug}" for bug in bugs])
        else:
            sections["suggested_change"] = "Review and correct the code logic."

    if not sections["corrected_code"]:
        # Try to provide minimal guidance based on bugs
        if bugs and original_code:
            sections["corrected_code"] = f"# Original code needs fixing:\n# Issues: {', '.join(bugs)}\n# Please apply the suggested changes manually.\n{original_code}"
        else:
            sections["corrected_code"] = "Unable to generate corrected code. Please apply the suggested changes manually."

    return sections


def _find_next_section(text: str, start_pos: int) -> int:
    """
    Find the position of the next section header.

    Args:
        text: Full text
        start_pos: Position to start searching from

    Returns:
        Position of next section or end of text
    """
    section_markers = ["**Suggested", "**Corrected", "**Fix", "## Suggested", "## Corrected", "## Fix", "Suggested Change:", "Corrected Code:"]

    min_pos = len(text)
    for marker in section_markers:
        pos = text.find(marker, start_pos)
        if pos != -1 and pos < min_pos:
            min_pos = pos

    return min_pos


def _clean_markdown_text(text: str) -> str:
    """
    Clean markdown formatting from text while preserving content.

    Args:
        text: Text with potential markdown

    Returns:
        Clean text
    """
    if not text:
        return ""

    import re

    cleaned = text.strip()

    # Remove bold markers
    cleaned = re.sub(r'\*\*([^*]+)\*\*', r'\1', cleaned)

    # Remove italic markers
    cleaned = re.sub(r'\*([^*]+)\*', r'\1', cleaned)

    # Remove header markers
    cleaned = re.sub(r'^#+\s*', '', cleaned, flags=re.MULTILINE)

    # Remove inline code backticks (but not code blocks)
    cleaned = re.sub(r'`([^`]+)`', r'\1', cleaned)

    return cleaned.strip()


def _generate_fallback_fix(bugs: List[str]) -> Dict[str, Any]:
    """
    Generate fallback fix suggestions when LLM unavailable.

    Args:
        bugs: List of detected bugs

    Returns:
        Basic fix suggestions
    """
    explanations = []
    suggestions = []

    for bug in bugs:
        bug_lower = bug.lower()

        # Syntax errors
        if "syntax" in bug_lower:
            explanations.append("The code has syntax errors - invalid syntax or missing brackets/parentheses.")
            suggestions.append("- Check for missing colons, brackets, or parentheses\n- Verify indentation is correct")

        # Runtime errors
        elif "division by zero" in bug_lower:
            explanations.append("Code attempts division by zero, causing runtime error.")
            suggestions.append("- Add check: if divisor != 0 before division\n- Handle edge cases")

        elif "index out of bounds" in bug_lower:
            explanations.append("Code accesses array/list at invalid index.")
            suggestions.append("- Check array bounds before access\n- Use defensive index checks")

        elif "undefined variable" in bug_lower:
            explanations.append("Code references undefined variable or function.")
            suggestions.append("- Declare/define variable before use\n- Check variable name spelling")

        # Logic errors
        elif "logic" in bug_lower or "incorrect" in bug_lower:
            explanations.append("Code logic is incorrect or incomplete.")
            suggestions.append("- Review algorithm step by step\n- Check loop conditions\n- Trace through with sample input")

        elif "arithmetic" in bug_lower or "formula" in bug_lower:
            explanations.append("Arithmetic or formula calculation is wrong.")
            suggestions.append("- Verify mathematical formula correctness\n- Check operator precedence\n- Test with known values")

        # Structure issues
        elif "nesting" in bug_lower:
            explanations.append("Code has deep nesting, making logic hard to follow.")
            suggestions.append("- Extract nested code into separate functions\n- Use early returns to reduce nesting")

        elif "loop" in bug_lower or "iteration" in bug_lower:
            explanations.append("Missing or incorrect loop logic.")
            suggestions.append("- Add loop to process multiple items\n- Fix loop termination condition")

        # Default
        else:
            explanations.append(f"Bug detected: {bug}")
            suggestions.append("- Review code carefully\n- Trace execution logic\n- Add debug output")

    return {
        "fix_explanation": " ".join(explanations),
        "suggested_change": "\n".join(suggestions),
        "corrected_code": "Unable to generate corrected code. Please review the suggestions above."
    }


async def get_fix_for_bug(
    code: str,
    bug: str,
    language: str = "python",
    test_cases: Optional[List[Dict[str, Any]]] = None,
    problem_description: Optional[str] = None
) -> str:
    """
    Get fix for a single specific bug.

    Args:
        code: Source code
        bug: Single bug to fix
        language: Programming language
        test_cases: Optional list of test cases with input, expected_output, actual_output
        problem_description: Optional problem statement to provide context

    Returns:
        Fix suggestion string
    """
    result = await generate_code_fix(code, [bug], language, test_cases, problem_description)
    return result.get("suggested_change", "Review the code logic")


async def suggest_optimizations(
    code: str,
    language: str = "python"
) -> Dict[str, Any]:
    """
    Suggest code optimizations and improvements.

    Args:
        code: Source code
        language: Programming language

    Returns:
        Optimization suggestions
    """

    if not code or not code.strip():
        return {
            "optimization_tips": "No code provided",
            "performance_suggestions": None,
            "refactoring_ideas": None
        }

    if not OLLAMA_AVAILABLE:
        return {
            "optimization_tips": "LLM unavailable for optimization suggestions",
            "performance_suggestions": None,
            "refactoring_ideas": None
        }

    prompt = f"""Analyze this {language} code for optimization opportunities and suggest improvements.

## Code:
```{language}
{code}
```

## Suggestions:
Provide optimization ideas in this format:

**Performance Tips:** How to make the code faster

**Refactoring Ideas:** How to make the code cleaner and more maintainable

**Best Practices:** What {language} best practices should be applied

Be concise and specific."""

    try:
        client = ollama.Client(host=OLLAMA_HOST)

        response = client.chat(
            model=OLLAMA_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": f"You are an expert {language} code reviewer focused on optimization"
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            options={
                "temperature": 0.5,
                "num_predict": 600
            }
        )

        if response and "message" in response:
            return {
                "optimization_tips": response["message"]["content"],
                "performance_suggestions": None,
                "refactoring_ideas": None
            }

        return {
            "optimization_tips": "Unable to generate optimizations",
            "performance_suggestions": None,
            "refactoring_ideas": None
        }

    except Exception as e:
        print(f"[LLMCodeFix] Optimization suggestion failed: {e}")
        return {
            "optimization_tips": "Error generating suggestions",
            "performance_suggestions": None,
            "refactoring_ideas": None
        }
