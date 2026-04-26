"""
Text Processing Service — Phase 2
Cleans OCR text and segments it into question-wise answers.
Uses Google Gemini API (google-genai) for intelligent text cleaning and fallback segmentation.
"""

import os
import re
import json
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Initialize Gemini client
client = genai.Client(api_key=GEMINI_API_KEY)

# Use Gemini 2.0 Flash (fast, free tier friendly)
MODEL_NAME = "gemini-2.5-flash"


async def clean_text(raw_text: str) -> str:
    """Clean OCR-extracted text using Gemini AI.
    
    Fixes:
    - Spelling mistakes from OCR misreads
    - Repeated/duplicated words
    - Broken line breaks mid-word
    - Normalizes formatting
    
    Does NOT:
    - Add new content
    - Change the meaning
    - Remove question labels (Q1, Q2, etc.)
    """
    if not raw_text or not raw_text.strip():
        return ""

    # Remove page separators from PDF OCR (--- Page N ---)
    cleaned = re.sub(r'---\s*Page\s*\d+\s*---\n*', '', raw_text)

    prompt = f"""Fix OCR errors in the following handwritten text:

- Correct spelling mistakes caused by OCR misreads
- Remove repeated/duplicated words or phrases
- Fix broken words split across lines
- Keep the original meaning exactly the same
- Do NOT add any new content or information
- Keep question labels like Q1, Q2, Q1), Q2), 1., 2. etc. exactly as they are
- Preserve the question-answer structure

Text:
{cleaned}

Return ONLY the cleaned text, nothing else."""

    try:
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.1,
                max_output_tokens=2000,
            ),
        )
        result = response.text.strip()
        print(f"[TextProcessing] Gemini clean_text succeeded ({len(result)} chars)")
        return result
    except Exception as e:
        print(f"[TextProcessing] Gemini clean_text failed: {e}")
        # Fallback: basic cleanup without AI
        return _basic_cleanup(cleaned)


def _basic_cleanup(text: str) -> str:
    """Basic text cleanup without AI (fallback).
    
    - Removes extra whitespace
    - Fixes common OCR artifacts
    - Normalizes line breaks
    """
    # Remove common OCR artifacts
    text = re.sub(r'[า์ำ]', '', text)  # Thai/special char artifacts
    # Collapse multiple spaces
    text = re.sub(r'[ \t]+', ' ', text)
    # Collapse 3+ newlines into 2
    text = re.sub(r'\n{3,}', '\n\n', text)
    # Strip each line
    lines = [line.strip() for line in text.split('\n')]
    return '\n'.join(lines).strip()


async def segment_answers(cleaned_text: str) -> list[dict]:
    """Split cleaned text into question-wise answers.
    
    Strategy:
    1. Try regex-based splitting first (fast, no API call)
    2. If regex fails (< 1 question found), use Gemini as fallback
    
    Returns:
    [
        {"question": "Q1", "answer": "..."},
        {"question": "Q2", "answer": "..."},
    ]
    """
    if not cleaned_text or not cleaned_text.strip():
        return []

    # Step 1: Try regex split
    regex_result = _regex_segment(cleaned_text)
    if len(regex_result) >= 1:
        return regex_result

    # Step 2: Fallback to Gemini
    print("[TextProcessing] Regex segmentation failed, using Gemini fallback")
    return await _ai_segment(cleaned_text)


def _regex_segment(text: str) -> list[dict]:
    """Split text by question markers using regex.
    
    Supports patterns like:
    - Q1: / Q1) / Q1. / Q 1:
    - q1: / q1)
    - 1. / 1) / 1:
    - (Q1) / (1)
    """
    # Find all question starts
    matches = list(re.finditer(
        r'(?:^|\n)\s*(?:\(?[Qq]\s*(\d+)\)?[\s:.)]+|(\d+)\s*[:.)\]]+)',
        text
    ))

    if not matches:
        return []

    results = []
    for i, match in enumerate(matches):
        q_num = match.group(1) or match.group(2)
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        
        answer_text = text[start:end].strip()
        
        # Strip the question text portion — look for A)/A:/Ans: marker
        # The text between Q marker and A marker is the question, after A is the answer
        a_match = re.search(r'\n\s*[Aa](?:ns)?[\s:.)]+', answer_text)
        if a_match:
            # Everything after "A)" is the actual answer
            answer_text = answer_text[a_match.end():].strip()
        else:
            # Try inline A) pattern (same line)
            a_inline = re.match(r'.*?[Aa](?:ns)?[\s:.)]+(.+)', answer_text, re.DOTALL)
            if a_inline:
                answer_text = a_inline.group(1).strip()
        
        if answer_text:
            results.append({
                "question": f"Q{q_num}",
                "answer": answer_text
            })

    return results


async def _ai_segment(text: str) -> list[dict]:
    """Use Gemini to segment text into question-answer pairs (fallback)."""
    prompt = f"""Split the following text into separate question-answer pairs.

The text is from a handwritten assignment scanned via OCR. Find where each question/answer starts.

Return ONLY a valid JSON array in this exact format (no markdown, no code blocks, no extra text):
[
  {{"question": "Q1", "answer": "the answer text"}},
  {{"question": "Q2", "answer": "the answer text"}}
]

If you cannot identify separate questions, return the entire text as Q1.

Text:
{text}"""

    try:
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.0,
                max_output_tokens=2000,
            ),
        )

        content = response.text.strip()
        
        # Clean markdown code blocks if present
        content = re.sub(r'^```(?:json)?\s*', '', content)
        content = re.sub(r'\s*```$', '', content)
        
        parsed = json.loads(content)
        
        if isinstance(parsed, list):
            # Validate structure
            validated = []
            for item in parsed:
                if isinstance(item, dict) and "question" in item and "answer" in item:
                    validated.append({
                        "question": str(item["question"]),
                        "answer": str(item["answer"]),
                    })
            return validated if validated else [{"question": "Q1", "answer": text}]
        
        return [{"question": "Q1", "answer": text}]

    except json.JSONDecodeError as e:
        print(f"[TextProcessing] Gemini segmentation JSON parse failed: {e}")
        return [{"question": "Q1", "answer": text}]
    except Exception as e:
        print(f"[TextProcessing] Gemini segmentation failed: {e}")
        return [{"question": "Q1", "answer": text}]


async def process_text(raw_text: str, questions: list = None) -> dict:
    """Full pipeline: clean text → segment answers.
    
    If questions are provided, uses a single AI call to clean + map answers
    to specific question IDs (much more accurate).
    
    If no questions provided, falls back to generic clean → segment pipeline.
    
    Returns:
    {
        "cleaned_text": "...",
        "answers": [
            {"question": "Q1", "answer": "..."},
            ...
        ],
        "total_questions": N
    }
    """
    if questions and len(questions) > 0:
        return await _process_with_questions(raw_text, questions)
    
    # Fallback: generic clean → segment
    cleaned = await clean_text(raw_text)
    answers = await segment_answers(cleaned)
    
    return {
        "cleaned_text": cleaned,
        "answers": answers,
        "total_questions": len(answers),
    }


async def _process_with_questions(raw_text: str, questions: list) -> dict:
    """Clean OCR text AND map answers to known questions in a single Gemini call.
    
    This is much more accurate than separate clean → segment steps because
    Gemini knows exactly what questions exist and can map text accordingly.
    
    Args:
        raw_text: Raw OCR-extracted text (may contain errors, line breaks, etc.)
        questions: List of question dicts with 'question_id' and 'question_text'
    """
    if not raw_text or not raw_text.strip():
        return {
            "cleaned_text": "",
            "answers": [],
            "total_questions": 0,
        }

    # Build question list for the prompt
    question_list = []
    for i, q in enumerate(questions):
        qid = q.get("question_id", f"Q{i+1}")
        qtext = q.get("question_text", q.get("text", f"Question {i+1}"))
        question_list.append(f"  {qid}: {qtext}")
    
    questions_str = "\n".join(question_list)

    prompt = f"""You are an expert at reading and reconstructing OCR-extracted handwritten text.

CONTEXT: When OCR reads handwritten text, it often scrambles the word order because it reads text blocks by their physical position on the page rather than reading order. Your job is to reconstruct what the student actually wrote.

The assignment has these questions:
{questions_str}

The raw OCR text (words may be in WRONG ORDER due to handwriting OCR):
---
{raw_text}
---

Your task:
1. Reconstruct the student's original sentences from the jumbled OCR words. Use the question topics as context to understand what the student was trying to say.
2. Map each reconstructed answer to the correct question.
3. Fix obvious OCR character errors (e.g., "teh" → "the", "leaming" → "learning").

RULES:
- The student's answers are about the topics in the questions above — use that context to reconstruct coherent sentences
- Use ONLY the words present in the OCR text — do NOT invent or add new words/content
- Remove OCR artifacts like "•", "A)", random dots, etc.
- Include ALL of the student's content — do not skip or truncate anything
- Each answer should read as a natural, coherent paragraph
- If you cannot determine which question a piece of text belongs to, assign it to the most relevant question based on content

Return ONLY a valid JSON object (no markdown, no code blocks):
{{"cleaned_text": "the full reconstructed text", "answers": [{{"question": "Q1", "answer": "reconstructed answer for Q1"}}, {{"question": "Q2", "answer": "reconstructed answer for Q2"}}]}}"""

    try:
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.1,
                max_output_tokens=8192,
            ),
        )

        content = response.text.strip()
        
        # Clean markdown code blocks if present
        content = re.sub(r'^```(?:json)?\s*', '', content)
        content = re.sub(r'\s*```$', '', content)
        
        parsed = json.loads(content)
        
        if isinstance(parsed, dict):
            answers = parsed.get("answers", [])
            cleaned_text = parsed.get("cleaned_text", "")
            
            # Validate answers structure
            validated_answers = []
            for item in answers:
                if isinstance(item, dict) and "question" in item and "answer" in item:
                    validated_answers.append({
                        "question": str(item["question"]),
                        "answer": str(item["answer"]),
                    })
            
            if validated_answers:
                print(f"[TextProcessing] AI mapped {len(validated_answers)} answers to questions")
                return {
                    "cleaned_text": cleaned_text or raw_text,
                    "answers": validated_answers,
                    "total_questions": len(validated_answers),
                }

        # If parsing failed, fall back to generic pipeline
        print("[TextProcessing] AI question-mapping returned unexpected format, falling back")
    except json.JSONDecodeError as e:
        print(f"[TextProcessing] AI question-mapping JSON parse failed: {e}")
    except Exception as e:
        print(f"[TextProcessing] AI question-mapping failed: {e}")

    # Fallback: generic clean → segment
    cleaned = await clean_text(raw_text)
    answers = await segment_answers(cleaned)
    return {
        "cleaned_text": cleaned,
        "answers": answers,
        "total_questions": len(answers),
    }

