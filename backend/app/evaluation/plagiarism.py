"""Structural code-similarity detection (winnowing over normalised tokens).

Why this design
---------------
* **Normalisation** turns identifiers into ``V``, numbers into ``N`` and strings into
  ``S`` while keeping keywords, operators and structure. Renaming variables, changing
  literals, reformatting or re-commenting does not hide a copy.
* **Winnowing** (Schleimer, Wilkerson & Aiken, 2003, the algorithm behind MOSS)
  selects a robust subset of k-gram hashes as a document fingerprint, so similarity
  can be computed quickly and the matching regions located.
* **Symmetric**: the score of a pair doesn't depend on which submission was evaluated
  first (the original agent only compared against already-evaluated work).
* Runs in a few MB of RAM, unlike CodeBERT/torch (~2 GB), which can still be enabled
  as an additional semantic signal via ``ENABLE_CODEBERT``.
"""

import hashlib
import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Set, Tuple

K = 5        # tokens per k-gram
WINDOW = 4   # winnowing window size
FLAG_THRESHOLD = 0.80
WARN_THRESHOLD = 0.60
MIN_TOKENS = 12  # very short programs are too generic to compare meaningfully

KEYWORDS = {
    # shared / C-family / Java / JS / Python keywords and common builtins kept verbatim
    "if", "else", "elif", "for", "while", "do", "switch", "case", "break", "continue", "return",
    "def", "class", "import", "from", "as", "try", "except", "catch", "finally", "throw", "throws",
    "raise", "with", "lambda", "yield", "pass", "in", "not", "and", "or", "is", "None", "True", "False",
    "null", "true", "false", "new", "this", "self", "public", "private", "protected", "static", "void",
    "int", "long", "float", "double", "char", "bool", "boolean", "string", "String", "auto", "const",
    "let", "var", "function", "struct", "include", "using", "namespace", "std", "print", "printf",
    "scanf", "cin", "cout", "input", "range", "len", "map", "list", "dict", "set", "vector", "System",
    "out", "println", "Scanner", "console", "log", "sort", "sorted", "append", "push_back",
}

_TOKEN_RE = re.compile(
    r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|`(?:\\.|[^`\\])*`'   # strings
    r"|\d+(?:\.\d+)?"                                              # numbers
    r"|[A-Za-z_]\w*"                                               # identifiers / keywords
    r"|==|!=|<=|>=|\+\+|--|&&|\|\||<<|>>|->|::|\*\*|//|[+\-*/%=<>!&|^~?:;,.(){}\[\]]"
)
_C_STYLE_COMMENTS = [re.compile(r"/\*.*?\*/", re.S), re.compile(r"//[^\n]*")]
_PY_COMMENTS = [re.compile(r'"""[\s\S]*?"""|\'\'\'[\s\S]*?\'\'\''), re.compile(r"#[^\n]*")]


@dataclass
class Fingerprint:
    hashes: Dict[int, List[int]]  # hash -> list of source line numbers (1-based)
    token_count: int


def _strip_comments(code: str, language: str) -> str:
    rules = _PY_COMMENTS if language == "python" else _C_STYLE_COMMENTS
    for rx in rules:
        code = rx.sub(lambda m: "\n" * m.group(0).count("\n"), code)
    return code


def tokenize(code: str, language: str = "python") -> List[Tuple[str, int]]:
    """Return (normalised token, line number) pairs."""
    code = _strip_comments(code or "", language)
    out: List[Tuple[str, int]] = []
    line_starts = [0] + [i + 1 for i, ch in enumerate(code) if ch == "\n"]

    def line_of(pos: int) -> int:
        lo, hi = 0, len(line_starts) - 1
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if line_starts[mid] <= pos:
                lo = mid
            else:
                hi = mid - 1
        return lo + 1

    for m in _TOKEN_RE.finditer(code):
        tok = m.group(0)
        if tok[0] in "\"'`":
            norm = "S"
        elif tok[0].isdigit():
            norm = "N"
        elif tok[0].isalpha() or tok[0] == "_":
            norm = tok if tok in KEYWORDS else "V"
        else:
            norm = tok
        out.append((norm, line_of(m.start())))
    return out


def _hash(s: str) -> int:
    return int.from_bytes(hashlib.blake2b(s.encode(), digest_size=8).digest(), "big")


def fingerprint(code: str, language: str = "python") -> Fingerprint:
    tokens = tokenize(code, language)
    if len(tokens) < K:
        return Fingerprint({}, len(tokens))
    grams = [(_hash(" ".join(t for t, _ in tokens[i:i + K])), tokens[i][1], tokens[i + K - 1][1])
             for i in range(len(tokens) - K + 1)]
    selected: Dict[int, List[int]] = {}
    last_pos = -1
    for start in range(0, max(1, len(grams) - WINDOW + 1)):
        window = grams[start:start + WINDOW]
        # rightmost minimum (standard winnowing tie-break)
        idx = min(range(len(window)), key=lambda j: (window[j][0], -j))
        pos = start + idx
        if pos != last_pos:
            h, l1, l2 = grams[pos]
            selected.setdefault(h, []).extend(range(l1, l2 + 1))
            last_pos = pos
    return Fingerprint(selected, len(tokens))


def similarity(a: Fingerprint, b: Fingerprint) -> float:
    """Overlap coefficient of fingerprints (robust when one program adds padding code)."""
    if a.token_count < MIN_TOKENS or b.token_count < MIN_TOKENS or not a.hashes or not b.hashes:
        return 0.0
    sa, sb = set(a.hashes), set(b.hashes)
    shared = len(sa & sb)
    return round(shared / min(len(sa), len(sb)), 4)


def matched_lines(a: Fingerprint, b: Fingerprint) -> Tuple[List[int], List[int]]:
    shared = set(a.hashes) & set(b.hashes)
    la: Set[int] = set()
    lb: Set[int] = set()
    for h in shared:
        la.update(a.hashes[h])
        lb.update(b.hashes[h])
    return sorted(la), sorted(lb)


def classify(score: float) -> str:
    if score >= FLAG_THRESHOLD:
        return "high"
    if score >= WARN_THRESHOLD:
        return "moderate"
    return "low"


def best_match(code: str, language: str, others: List[Tuple[str, str, str]]) -> Tuple[float, Optional[str]]:
    """Compare ``code`` with (submission_id, code, language) triples; return (best score, id).

    Only submissions in the same language are compared (cross-language detection is out of scope).
    """
    fp = fingerprint(code, language)
    best, best_id = 0.0, None
    for sid, other, other_lang in others:
        if other_lang != language:
            continue
        s = similarity(fp, fingerprint(other, other_lang))
        if s > best:
            best, best_id = s, sid
    return best, best_id


def pairwise_matrix(items: List[Tuple[str, str, str]]) -> List[dict]:
    """All same-language pairs above the warning threshold, most similar first."""
    fps = [(sid, fingerprint(code, lang), lang) for sid, code, lang in items]
    pairs = []
    for i in range(len(fps)):
        for j in range(i + 1, len(fps)):
            if fps[i][2] != fps[j][2]:
                continue
            s = similarity(fps[i][1], fps[j][1])
            if s >= WARN_THRESHOLD:
                pairs.append({"a": fps[i][0], "b": fps[j][0], "score": s, "level": classify(s)})
    return sorted(pairs, key=lambda p: p["score"], reverse=True)
