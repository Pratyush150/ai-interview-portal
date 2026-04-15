"""Groq LLM client. Provider-agnostic interface — swap to Ollama later by
replacing this module, keeping ask_llm() signature stable."""
import os
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

SYSTEM_PROMPT = (
    "You are a professional technical interviewer specializing in software "
    "engineering, AI/ML, and robotics. Conduct interviews in English. Ask one "
    "question at a time. Keep responses concise (1-3 sentences). Be warm but "
    "rigorous. Probe deeper when answers are vague. Move through stages: "
    "intro → background → technical → wrap-up."
)


def ask_llm(user_text: str, history: list[dict] | None = None) -> str:
    api_key = os.getenv("GROQ_API_KEY")
    model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    if not api_key or api_key.startswith("PASTE"):
        raise RuntimeError("GROQ_API_KEY missing in .env — get one at console.groq.com")

    client = Groq(api_key=api_key)
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": user_text})

    completion = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.7,
        max_tokens=300,
    )
    return completion.choices[0].message.content.strip()
