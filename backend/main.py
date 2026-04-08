"""Compatibility entrypoint.

Use either:
  uvicorn main:app --reload
or:
  uvicorn app.main:app --reload
"""

from app.main import app
