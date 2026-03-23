"""
Submission Analysis Agent

Analyzes code submission metadata:
- Language detection
- Code length measurement
- Complexity estimation
"""


def analyze_submission(submission: dict) -> dict:
    """
    Analyze a code submission and return metadata.

    Args:
        submission: Dictionary containing submission data with 'code' and 'language' keys

    Returns:
        Dictionary with analysis results:
        - language: Programming language used
        - code_length: Number of lines in the code
        - estimated_complexity: "low", "medium", or "high"
    """

    code = submission.get("code", "")
    language = submission.get("language", "unknown")

    # Count non-empty lines
    lines = [line for line in code.split("\n") if line.strip()]
    code_length = len(lines)

    # Estimate complexity based on line count
    if code_length < 50:
        estimated_complexity = "low"
    elif code_length < 150:
        estimated_complexity = "medium"
    else:
        estimated_complexity = "high"

    return {
        "language": language,
        "code_length": code_length,
        "estimated_complexity": estimated_complexity
    }
