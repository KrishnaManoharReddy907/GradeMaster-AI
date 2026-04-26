"""
Manual Evaluation Service — Phase 3
Hybrid evaluation engine for handwritten assignments.
Uses keyword matching + Gemini AI semantic evaluation.
"""

import os
import re
import json
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=GEMINI_API_KEY)
MODEL_NAME = "gemini-2.5-flash"


def keyword_match_score(student_answer: str, keywords: list, max_marks: float) -> dict:
    """Score based on keyword presence in student answer.
    
    Case-insensitive matching.
    Score = (matched / total_keywords) * max_marks
    """
    if not keywords:
        return {"score": max_marks, "matched": [], "total": 0}

    answer_lower = student_answer.lower()
    matched = [kw for kw in keywords if kw.lower() in answer_lower]
    
    score = round((len(matched) / len(keywords)) * max_marks, 2)
    
    return {
        "score": score,
        "matched": matched,
        "missed": [kw for kw in keywords if kw.lower() not in answer_lower],
        "total_keywords": len(keywords),
        "matched_count": len(matched),
    }


async def ai_evaluate(
    question_text: str,
    model_answer: str,
    student_answer: str,
    max_marks: float,
) -> dict:
    """Use Gemini to semantically evaluate student answer.
    
    Returns score and feedback.
    """
    prompt = f"""You are an experienced teacher evaluating a student's handwritten answer.

Question: {question_text}

Model Answer (correct answer): {model_answer}

Student's Answer: {student_answer}

Maximum Marks: {max_marks}

Evaluate the student's answer based on:
1. Correctness — Is the answer factually correct?
2. Completeness — Does it cover all key points from the model answer?
3. Clarity — Is the answer well-written and clear?

Return ONLY valid JSON (no markdown, no code blocks):
{{
  "score": <number between 0 and {max_marks}>,
  "feedback": "<short feedback for the student, 1-2 sentences>",
  "correctness": "<good/partial/poor>",
  "completeness": "<complete/partial/incomplete>"
}}"""

    try:
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.1,
                max_output_tokens=1000,
                response_mime_type="application/json",
                thinking_config=types.ThinkingConfig(thinking_budget=0),
            ),
        )

        content = response.text.strip()
        
        # Gemini 2.5 Flash may include thinking/reasoning before JSON
        # Strategy: find the JSON object anywhere in the response
        parsed = _extract_json(content)
        
        if not parsed:
            print(f"[ManualEval] Could not extract JSON from response: {content[:200]}")
            return {"score": 0, "feedback": "AI evaluation failed to parse", "correctness": "", "completeness": ""}
        
        score = min(float(parsed.get("score", 0)), max_marks)
        score = max(score, 0)  # Clamp to 0
        
        return {
            "score": round(score, 2),
            "feedback": parsed.get("feedback", ""),
            "correctness": parsed.get("correctness", ""),
            "completeness": parsed.get("completeness", ""),
        }
    except Exception as e:
        print(f"[ManualEval] AI evaluation failed: {e}")
        return {"score": 0, "feedback": f"AI evaluation error: {str(e)}", "correctness": "", "completeness": ""}


def _extract_json(text: str) -> dict | None:
    """Robustly extract a JSON object from text that may contain markdown, thinking, etc."""
    # Strategy 1: Try parsing the whole text as JSON
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    
    # Strategy 2: Strip markdown code blocks
    cleaned = re.sub(r'```(?:json)?\s*', '', text)
    cleaned = re.sub(r'```', '', cleaned).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    
    # Strategy 3: Find JSON object with regex (handles thinking text before/after)
    json_match = re.search(r'\{[^{}]*"score"[^{}]*\}', text, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass
    
    # Strategy 4: Find any JSON object
    json_match = re.search(r'\{[^{}]+\}', text, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass
    
    return None


async def evaluate_answer(question_data: dict, student_answer: str) -> dict:
    """Evaluate a single answer using hybrid approach.
    
    Final score = average of keyword_score and ai_score.
    """
    question_id = question_data.get("question_id", "")
    question_text = question_data.get("question_text", "")
    model_answer = question_data.get("model_answer", "")
    keywords = question_data.get("keywords", [])
    max_marks = float(question_data.get("marks", 0))

    # Handle empty/missing answer
    if not student_answer or not student_answer.strip():
        return {
            "question_id": question_id,
            "keyword_score": 0,
            "ai_score": 0,
            "final_score": 0,
            "max_marks": max_marks,
            "feedback": "No answer provided",
            "correctness": "poor",
            "completeness": "incomplete",
            "keywords_matched": [],
            "keywords_missed": keywords,
        }

    # Step 1: Keyword matching
    kw_result = keyword_match_score(student_answer, keywords, max_marks)
    
    # Step 2: AI evaluation
    ai_result = await ai_evaluate(question_text, model_answer, student_answer, max_marks)
    
    # Step 3: Final score = average
    keyword_score = kw_result["score"]
    ai_score = ai_result["score"]
    
    if keywords:
        final_score = round((keyword_score + ai_score) / 2, 2)
    else:
        # No keywords defined — use only AI score
        final_score = ai_score

    return {
        "question_id": question_id,
        "keyword_score": keyword_score,
        "ai_score": ai_score,
        "final_score": final_score,
        "max_marks": max_marks,
        "feedback": ai_result.get("feedback", ""),
        "correctness": ai_result.get("correctness", ""),
        "completeness": ai_result.get("completeness", ""),
        "keywords_matched": kw_result.get("matched", []),
        "keywords_missed": kw_result.get("missed", []),
    }


async def evaluate_all(questions: list, student_answers: dict) -> dict:
    """Evaluate all questions for a manual assignment.
    
    Args:
        questions: List of question dicts from assessment (manual_questions)
        student_answers: Dict mapping question labels to answers {"Q1": "answer", "Q2": "answer"}
    
    Returns:
        {
            "total_score": sum of final_scores,
            "total_marks": sum of max_marks,
            "percentage": float,
            "results": [per-question results]
        }
    """
    results = []
    total_score = 0
    total_marks = 0

    for question in questions:
        q_id = question.get("question_id", "")
        
        # Find matching student answer (try Q1, q1, 1, etc.)
        student_answer = ""
        for key in [q_id, q_id.upper(), q_id.lower(), q_id.replace("Q", "").replace("q", "")]:
            if key in student_answers:
                student_answer = student_answers[key]
                break
        
        result = await evaluate_answer(question, student_answer)
        results.append(result)
        
        total_score += result["final_score"]
        total_marks += result["max_marks"]

    percentage = round((total_score / total_marks) * 100, 2) if total_marks > 0 else 0

    return {
        "total_score": round(total_score, 2),
        "total_marks": total_marks,
        "percentage": percentage,
        "results": results,
    }
