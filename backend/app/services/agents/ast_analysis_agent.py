"""
AST Analysis Agent

Uses tree-sitter to perform static analysis on source code.
Analyzes code structure, complexity, and patterns.
"""

from typing import Dict, Any, Optional, List

# Lazy load tree-sitter to handle import errors gracefully
_parser = None
_parser_initialized = False


def get_parser():
    """
    Get or initialize the tree-sitter parser with Python grammar.

    Returns:
        Configured Parser instance or None if initialization fails
    """
    global _parser, _parser_initialized

    if _parser_initialized:
        return _parser

    try:
        from tree_sitter import Language, Parser
        import tree_sitter_python as ts_python

        # Get the language - handle different API versions
        lang = ts_python.language()

        # Try to create Language object if needed (newer API)
        try:
            if not isinstance(lang, Language):
                lang = Language(lang)
        except (TypeError, Exception):
            pass  # Already a Language object or different API

        # Create parser
        _parser = Parser(lang)
        _parser_initialized = True
        print("[ASTAnalysis] Parser initialized successfully")
        return _parser

    except Exception as e:
        print(f"[ASTAnalysis] Failed to initialize parser: {e}")
        _parser_initialized = True  # Prevent repeated attempts
        return None


def count_node_types(node, counts: Dict[str, int]) -> None:
    """
    Recursively traverse AST and count specific node types.

    Args:
        node: Current AST node
        counts: Dictionary to accumulate counts
    """
    node_type = node.type

    # Count loops
    if node_type == "for_statement":
        counts["for_loops"] += 1
    elif node_type == "while_statement":
        counts["while_loops"] += 1

    # Count conditions
    if node_type == "if_statement":
        counts["if_statements"] += 1
    elif node_type == "elif_clause":
        counts["elif_clauses"] += 1
    elif node_type == "else_clause":
        counts["else_clauses"] += 1

    # Count function definitions
    if node_type == "function_definition":
        counts["functions"] += 1

    # Count return statements
    if node_type == "return_statement":
        counts["returns"] += 1

    # Count class definitions
    if node_type == "class_definition":
        counts["classes"] += 1

    # Count try/except blocks
    if node_type == "try_statement":
        counts["try_blocks"] += 1

    # Count list comprehensions
    if node_type == "list_comprehension":
        counts["list_comprehensions"] += 1

    # Recurse into children
    for child in node.children:
        count_node_types(child, counts)


def compute_nesting_depth(node, current_depth: int = 0) -> int:
    """
    Compute maximum nesting depth of control structures.

    Args:
        node: Current AST node
        current_depth: Current nesting level

    Returns:
        Maximum nesting depth found
    """
    max_depth = current_depth
    node_type = node.type

    # These node types increase nesting depth
    nesting_nodes = {
        "for_statement",
        "while_statement",
        "if_statement",
        "try_statement",
        "with_statement",
        "function_definition",
        "class_definition"
    }

    if node_type in nesting_nodes:
        current_depth += 1
        max_depth = max(max_depth, current_depth)

    # Recurse into children
    for child in node.children:
        child_depth = compute_nesting_depth(child, current_depth)
        max_depth = max(max_depth, child_depth)

    return max_depth


def detect_recursion(node, function_names: List[str] = None) -> bool:
    """
    Detect if any function calls itself (recursion).

    Args:
        node: Root AST node
        function_names: List to collect function names (internal use)

    Returns:
        True if recursion is detected
    """
    if function_names is None:
        function_names = []

    # First pass: collect all function names
    if node.type == "function_definition":
        # Get function name
        for child in node.children:
            if child.type == "identifier":
                function_names.append(child.text.decode("utf-8"))
                break

    # Recurse to find all function definitions
    for child in node.children:
        detect_recursion(child, function_names)

    # Second pass: check for recursive calls
    return _check_recursive_calls(node, function_names, set())


def _check_recursive_calls(
    node,
    function_names: List[str],
    current_function: set
) -> bool:
    """
    Check if any function contains a call to itself.

    Args:
        node: Current AST node
        function_names: List of defined function names
        current_function: Set of functions we're currently inside

    Returns:
        True if recursion detected
    """
    if node.type == "function_definition":
        # Get function name
        func_name = None
        for child in node.children:
            if child.type == "identifier":
                func_name = child.text.decode("utf-8")
                break

        if func_name:
            # Check this function's body for self-calls
            new_current = current_function | {func_name}
            for child in node.children:
                if _check_recursive_calls(child, function_names, new_current):
                    return True
        return False

    # Check for function calls
    if node.type == "call":
        # Get the function being called
        for child in node.children:
            if child.type == "identifier":
                called_name = child.text.decode("utf-8")
                if called_name in current_function:
                    return True
                break

    # Recurse into children
    for child in node.children:
        if _check_recursive_calls(child, function_names, current_function):
            return True

    return False


def has_nested_loops(node, loop_depth: int = 0) -> bool:
    """
    Check if code contains nested loops.

    Args:
        node: Current AST node
        loop_depth: Current loop nesting level

    Returns:
        True if nested loops are found
    """
    node_type = node.type

    # Check if this is a loop
    if node_type in ("for_statement", "while_statement"):
        if loop_depth >= 1:
            return True  # Found nested loop
        loop_depth += 1

    # Recurse into children
    for child in node.children:
        if has_nested_loops(child, loop_depth):
            return True

    return False


def estimate_complexity(
    total_loops: int,
    has_nested: bool,
    has_recursion: bool,
    nesting_depth: int,
    num_functions: int
) -> str:
    """
    Estimate code complexity based on analysis results.

    Args:
        total_loops: Total number of loops
        has_nested: Whether nested loops exist
        has_recursion: Whether recursion is detected
        nesting_depth: Maximum nesting depth
        num_functions: Number of function definitions

    Returns:
        Complexity level: "low", "medium", or "high"
    """
    # High complexity indicators
    if has_nested or has_recursion:
        return "high"

    if nesting_depth >= 4:
        return "high"

    if total_loops >= 3:
        return "high"

    # Medium complexity indicators
    if total_loops >= 1:
        return "medium"

    if nesting_depth >= 2:
        return "medium"

    if num_functions >= 3:
        return "medium"

    # Low complexity
    return "low"


def analyze_code_ast(code: str) -> Dict[str, Any]:
    """
    Analyze source code using AST parsing.

    Parses the code into an AST and extracts:
    - Loop counts (for, while)
    - Condition counts (if, elif, else)
    - Function/class definitions
    - Return statements
    - Nesting depth
    - Complexity estimation

    Args:
        code: Source code string (Python)

    Returns:
        Dictionary containing analysis results:
        {
            "loops": int,
            "conditions": int,
            "functions": int,
            "returns": int,
            "nesting_depth": int,
            "complexity": "low|medium|high",
            "details": {...}  # Additional metrics
        }
    """
    result = {
        "loops": 0,
        "conditions": 0,
        "functions": 0,
        "returns": 0,
        "nesting_depth": 0,
        "complexity": "low",
        "details": {
            "for_loops": 0,
            "while_loops": 0,
            "if_statements": 0,
            "elif_clauses": 0,
            "else_clauses": 0,
            "classes": 0,
            "try_blocks": 0,
            "list_comprehensions": 0,
            "has_recursion": False,
            "has_nested_loops": False,
            "parse_error": False
        }
    }

    if not code or not code.strip():
        return result

    try:
        parser = get_parser()

        # Handle parser initialization failure
        if parser is None:
            result["details"]["parse_error"] = True
            result["details"]["error_message"] = "Parser not available"
            return result

        # Parse the code
        code_bytes = code.encode("utf-8")
        tree = parser.parse(code_bytes)
        root_node = tree.root_node

        # Check for parse errors
        if root_node.has_error:
            result["details"]["parse_error"] = True

        # Count node types
        counts = {
            "for_loops": 0,
            "while_loops": 0,
            "if_statements": 0,
            "elif_clauses": 0,
            "else_clauses": 0,
            "functions": 0,
            "returns": 0,
            "classes": 0,
            "try_blocks": 0,
            "list_comprehensions": 0
        }
        count_node_types(root_node, counts)

        # Compute nesting depth
        nesting_depth = compute_nesting_depth(root_node)

        # Check for nested loops
        nested_loops = has_nested_loops(root_node)

        # Check for recursion
        has_recursion = detect_recursion(root_node)

        # Calculate totals
        total_loops = counts["for_loops"] + counts["while_loops"]
        total_conditions = (
            counts["if_statements"] +
            counts["elif_clauses"] +
            counts["else_clauses"]
        )

        # Estimate complexity
        complexity = estimate_complexity(
            total_loops=total_loops,
            has_nested=nested_loops,
            has_recursion=has_recursion,
            nesting_depth=nesting_depth,
            num_functions=counts["functions"]
        )

        # Populate result
        result["loops"] = total_loops
        result["conditions"] = total_conditions
        result["functions"] = counts["functions"]
        result["returns"] = counts["returns"]
        result["nesting_depth"] = nesting_depth
        result["complexity"] = complexity

        # Populate details
        result["details"]["for_loops"] = counts["for_loops"]
        result["details"]["while_loops"] = counts["while_loops"]
        result["details"]["if_statements"] = counts["if_statements"]
        result["details"]["elif_clauses"] = counts["elif_clauses"]
        result["details"]["else_clauses"] = counts["else_clauses"]
        result["details"]["classes"] = counts["classes"]
        result["details"]["try_blocks"] = counts["try_blocks"]
        result["details"]["list_comprehensions"] = counts["list_comprehensions"]
        result["details"]["has_recursion"] = has_recursion
        result["details"]["has_nested_loops"] = nested_loops

        return result

    except Exception as e:
        print(f"[ASTAnalysis] Error analyzing code: {e}")
        result["details"]["parse_error"] = True
        result["details"]["error_message"] = str(e)
        return result


def analyze_code_structure(code: str) -> Dict[str, Any]:
    """
    High-level wrapper for code structure analysis.

    Provides a simplified view suitable for the agent pipeline.

    Args:
        code: Source code string

    Returns:
        Simplified analysis dictionary
    """
    analysis = analyze_code_ast(code)

    return {
        "loops": analysis["loops"],
        "conditions": analysis["conditions"],
        "functions": analysis["functions"],
        "nesting_depth": analysis["nesting_depth"],
        "complexity": analysis["complexity"],
        "has_recursion": analysis["details"]["has_recursion"],
        "has_nested_loops": analysis["details"]["has_nested_loops"]
    }
