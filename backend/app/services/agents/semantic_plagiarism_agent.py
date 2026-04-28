"""
Semantic Plagiarism Detection Agent

Uses CodeBERT embeddings for semantic code similarity detection.
Compares submissions using cosine similarity of code embeddings.
"""

import os
import torch
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from bson import ObjectId

# Lazy load transformers to avoid startup delay
_tokenizer = None
_model = None
_model_loaded = False

CODEBERT_MODEL = "microsoft/codebert-base"
SIMILARITY_THRESHOLD = 0.85
MAX_CODE_LENGTH = 512


def load_codebert_model():
    """
    Lazy load CodeBERT model and tokenizer.

    Returns:
        Tuple of (tokenizer, model) or (None, None) if loading fails
    """
    global _tokenizer, _model, _model_loaded

    if _model_loaded:
        return _tokenizer, _model

    try:
        from transformers import AutoTokenizer, AutoModel

        print(f"[SemanticPlagiarism] Loading CodeBERT model: {CODEBERT_MODEL}")

        _tokenizer = AutoTokenizer.from_pretrained(CODEBERT_MODEL)
        _model = AutoModel.from_pretrained(CODEBERT_MODEL)

        # Set model to evaluation mode
        _model.eval()

        # Move to GPU if available
        if torch.cuda.is_available():
            _model = _model.cuda()
            print("[SemanticPlagiarism] Using GPU for inference")
        else:
            print("[SemanticPlagiarism] Using CPU for inference")

        _model_loaded = True
        print("[SemanticPlagiarism] CodeBERT model loaded successfully")

        return _tokenizer, _model

    except Exception as e:
        print(f"[SemanticPlagiarism] Failed to load CodeBERT: {e}")
        _model_loaded = True  # Prevent repeated load attempts
        return None, None


async def compute_embedding(code: str) -> Optional[List[float]]:
    """
    Compute semantic embedding for code using CodeBERT.

    Args:
        code: Source code string

    Returns:
        Embedding vector as list of floats, or None if failed
    """

    tokenizer, model = load_codebert_model()

    if tokenizer is None or model is None:
        return None

    try:
        # Truncate code if too long
        code = code[:MAX_CODE_LENGTH * 4]  # Rough char limit before tokenization

        # Tokenize code
        inputs = tokenizer(
            code,
            return_tensors="pt",
            truncation=True,
            max_length=MAX_CODE_LENGTH,
            padding=True
        )

        # Move to GPU if available
        if torch.cuda.is_available():
            inputs = {k: v.cuda() for k, v in inputs.items()}

        # Run through model (no gradient computation needed)
        with torch.no_grad():
            outputs = model(**inputs)

        # Mean pooling of last hidden state
        # Shape: (batch_size, sequence_length, hidden_size) -> (batch_size, hidden_size)
        last_hidden_state = outputs.last_hidden_state
        attention_mask = inputs["attention_mask"]

        # Expand attention mask for broadcasting
        mask_expanded = attention_mask.unsqueeze(-1).expand(last_hidden_state.size()).float()

        # Sum embeddings where mask is 1, divide by number of tokens
        sum_embeddings = torch.sum(last_hidden_state * mask_expanded, dim=1)
        sum_mask = torch.clamp(mask_expanded.sum(dim=1), min=1e-9)
        mean_pooled = sum_embeddings / sum_mask

        # Convert to list
        embedding = mean_pooled.squeeze().cpu().numpy().tolist()

        return embedding

    except Exception as e:
        print(f"[SemanticPlagiarism] Embedding computation failed: {e}")
        return None


def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """
    Compute cosine similarity between two vectors.

    Args:
        vec1: First embedding vector
        vec2: Second embedding vector

    Returns:
        Cosine similarity score (0 to 1)
    """

    try:
        from sklearn.metrics.pairwise import cosine_similarity as sklearn_cosine

        # Reshape for sklearn
        v1 = np.array(vec1).reshape(1, -1)
        v2 = np.array(vec2).reshape(1, -1)

        similarity = sklearn_cosine(v1, v2)[0][0]
        return float(similarity)

    except ImportError:
        # Fallback: manual cosine similarity
        vec1 = np.array(vec1)
        vec2 = np.array(vec2)

        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)

        if norm1 == 0 or norm2 == 0:
            return 0.0

        return float(dot_product / (norm1 * norm2))


async def detect_semantic_plagiarism(db, submission: dict) -> Dict[str, Any]:
    """
    Detect plagiarism using semantic code embeddings.

    Compares current submission against past evaluated submissions
    for the same assessment (chronological detection).

    Args:
        db: Database instance
        submission: Current submission dictionary

    Returns:
        Dictionary containing:
        - plagiarism_score: Similarity percentage (0-100)
        - similar_submission_id: ID of most similar submission (if any)
        - code_embedding: Computed embedding vector
    """

    result = {
        "plagiarism_score": 0,
        "similar_submission_id": None,
        "code_embedding": None
    }

    code = submission.get("code", "")
    if not code or len(code.strip()) < 20:
        return result

    # Compute embedding for current submission
    current_embedding = await compute_embedding(code)

    if current_embedding is None:
        print("[SemanticPlagiarism] Could not compute embedding, skipping detection")
        return result

    result["code_embedding"] = current_embedding

    # Get submission identifiers
    assessment_id = submission.get("assessment_id")
    current_submission_id = submission.get("_id")
    current_submitted_at = submission.get("submitted_at")

    if not assessment_id:
        return result

    try:
        # Build query for past evaluated/finalized submissions
        query = {
            "assessment_id": assessment_id,
            "status": {"$in": ["evaluated", "reviewed", "finalized"]}
        }

        # Exclude current submission
        if current_submission_id:
            query["_id"] = {"$ne": current_submission_id}

        # Only compare against submissions submitted BEFORE current one
        if current_submitted_at:
            query["submitted_at"] = {"$lt": current_submitted_at}

        # Fetch last 20 past evaluated submissions
        past_submissions = await db.coding_submissions.find(
            query,
            {"_id": 1, "code": 1, "code_embedding": 1, "student_id": 1}
        ).sort("submitted_at", -1).limit(20).to_list(length=20)

        # No past evaluated submissions to compare against
        if not past_submissions:
            return result

        max_similarity = 0.0
        most_similar_id = None

        for other_submission in past_submissions:
            other_code = other_submission.get("code", "")

            # Skip empty or very short code
            if not other_code or len(other_code.strip()) < 20:
                continue

            # Use cached embedding if available, otherwise compute
            other_embedding = other_submission.get("code_embedding")

            if other_embedding is None:
                other_embedding = await compute_embedding(other_code)

                # Cache the computed embedding
                if other_embedding:
                    try:
                        await db.coding_submissions.update_one(
                            {"_id": other_submission["_id"]},
                            {"$set": {"code_embedding": other_embedding}}
                        )
                    except Exception:
                        pass  # Non-critical, continue

            if other_embedding is None:
                continue

            # Compute similarity
            similarity = cosine_similarity(current_embedding, other_embedding)

            if similarity > max_similarity:
                max_similarity = similarity
                most_similar_id = str(other_submission["_id"])

        # Apply threshold and calculate score
        if max_similarity >= SIMILARITY_THRESHOLD:
            result["plagiarism_score"] = int(max_similarity * 100)
            result["similar_submission_id"] = most_similar_id
        elif max_similarity >= 0.7:
            # Moderate similarity warning
            result["plagiarism_score"] = int(max_similarity * 100)
            result["similar_submission_id"] = most_similar_id

        return result

    except Exception as e:
        print(f"[SemanticPlagiarism] Detection failed: {e}")
        return result


async def get_embedding_for_storage(code: str) -> Optional[List[float]]:
    """
    Public helper to compute embedding for storage purposes.

    Args:
        code: Source code string

    Returns:
        Embedding vector or None
    """
    return await compute_embedding(code)
