"""Resume parsing: extract text from PDF and use LLM to analyze skills."""
import json
import os
import fitz  # PyMuPDF
from groq import Groq
from dotenv import load_dotenv

load_dotenv()


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract raw text from PDF bytes."""
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    text = "\n".join(page.get_text() for page in doc)
    doc.close()
    return text.strip()


def analyze_resume(resume_text: str) -> dict:
    """Use Groq LLM to extract structured info from resume text."""
    api_key = os.getenv("GROQ_API_KEY")
    model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    if not api_key:
        return {"skills": [], "experience_summary": resume_text[:500], "suggested_questions": []}

    client = Groq(api_key=api_key)
    prompt = f"""Analyze this resume and return a JSON object with:
{{
  "skills": ["list of technical skills found"],
  "experience_years": estimated total years of experience (number),
  "domains": ["areas of expertise"],
  "key_projects": ["brief description of notable projects"],
  "education": "highest education level and field",
  "experience_summary": "2-3 sentence summary of candidate's background",
  "suggested_questions": ["5 targeted interview questions based on this resume"]
}}

Resume text:
{resume_text[:4000]}

Return valid JSON only. No markdown."""

    completion = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=800,
        response_format={"type": "json_object"},
    )
    raw = completion.choices[0].message.content.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"skills": [], "experience_summary": resume_text[:500], "suggested_questions": []}
