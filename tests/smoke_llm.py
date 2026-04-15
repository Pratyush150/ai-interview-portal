"""Smoke test: ask Groq a simple interview question.
Usage: python tests/smoke_llm.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.llm.groq_client import ask_llm

reply = ask_llm("Hi, I am ready to start the interview.")
print(f"LLM reply: {reply}")
