"""Pre-interview deep analysis ('preflight').

Runs once when an InterviewSession is created, AFTER the resume has been
parsed and the JD has been loaded. Produces a structured "interview brief"
that the interviewer (Sara) gets in the system prompt as the first thing
she sees — so she walks in knowing what to probe, what claims to verify,
what JD requirements are missing from the resume, and a good opening.

This is the difference between "an LLM with the candidate's skills as a
string" and "an interviewer who has already read the resume against the
job description before the call".
"""
from __future__ import annotations

import json
import os
from dotenv import load_dotenv
from groq import Groq

load_dotenv()


PREFLIGHT_PROMPT = """\
You are a senior hiring manager preparing notes for a 22-minute technical interview.
Read the candidate's resume and the job description carefully and produce a STRUCTURED
brief that the interviewer will use to steer the conversation.

Output STRICT JSON, no markdown, no commentary outside the JSON. Schema:

{
  "summary": "2-3 sentence summary of fit between this candidate and this role.",
  "gaps_to_probe": ["specific area where resume is thin vs. JD requirements — phrased as a probe, not a description"],
  "claimed_unverified_skills": ["skill the resume claims but does not back up with a concrete project"],
  "depth_test_topics": ["topic where the resume implies depth — probe to see if it's real"],
  "jd_requirements_unmet": ["JD requirement with no resume evidence"],
  "strengths_to_acknowledge": ["genuine strength visible in the resume — interviewer should reference this warmly"],
  "opening_question_seed": "1-sentence seed for a strong opening question after the candidate's self-intro",
  "risk_flags": ["concrete risk factors — gaps, job-hopping, unexplained gaps, mismatched seniority"]
}

Rules:
- Each list has 0-5 short, concrete items. Empty list is fine if nothing applies.
- Be specific and actionable. "Probe AWS depth" is bad; "Resume mentions 'AWS' as a skill but
  no specific service used in any project — probe which service and at what scale" is good.
- Do not invent. If a JD requirement is missing from the resume, say so; do not guess.
- Match the brief to the seniority level — a 'mid' candidate isn't expected to have lead projects.
"""


def build_interview_brief(resume_json: dict, job_row: dict | None, seniority: str = "mid") -> dict:
    """Run the preflight analysis. Returns {} on any failure (engine handles
    a missing brief gracefully — the interview still works, just less informed)."""
    api_key = os.getenv("GROQ_API_KEY")
    model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    if not api_key or api_key.startswith("PASTE"):
        return {}

    # Compose the user message with both pieces of context.
    resume_blob = {
        "experience_summary": resume_json.get("experience_summary", ""),
        "experience_years": resume_json.get("experience_years"),
        "skills": resume_json.get("skills", [])[:30],
        "domains": resume_json.get("domains", []),
        "key_projects": resume_json.get("key_projects", []),
        "education": resume_json.get("education", ""),
    }
    job_blob = {}
    if job_row:
        job_blob = {
            "title": job_row.get("title", ""),
            "role_family": job_row.get("role_family", ""),
            "seniority": job_row.get("seniority", seniority),
            "min_years": job_row.get("min_experience_years"),
            "max_years": job_row.get("max_experience_years"),
            "required_skills": job_row.get("required_skills", ""),
            "description": (job_row.get("description") or "")[:2000],
        }

    user_msg = (
        f"SENIORITY TIER: {seniority}\n\n"
        f"=== JOB DESCRIPTION ===\n{json.dumps(job_blob, indent=2)}\n\n"
        f"=== CANDIDATE RESUME ===\n{json.dumps(resume_blob, indent=2)}\n\n"
        "Produce the interview brief in the JSON schema above."
    )

    try:
        client = Groq(api_key=api_key)
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": PREFLIGHT_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.3,
            max_tokens=900,
            response_format={"type": "json_object"},
        )
        raw = completion.choices[0].message.content.strip()
        data = json.loads(raw)
        # Best-effort hygiene: keep only the keys we expect, with list defaults.
        out = {
            "summary": str(data.get("summary", ""))[:600],
            "gaps_to_probe": list(data.get("gaps_to_probe", []))[:5],
            "claimed_unverified_skills": list(data.get("claimed_unverified_skills", []))[:5],
            "depth_test_topics": list(data.get("depth_test_topics", []))[:5],
            "jd_requirements_unmet": list(data.get("jd_requirements_unmet", []))[:5],
            "strengths_to_acknowledge": list(data.get("strengths_to_acknowledge", []))[:5],
            "opening_question_seed": str(data.get("opening_question_seed", ""))[:300],
            "risk_flags": list(data.get("risk_flags", []))[:5],
        }
        return out
    except Exception:
        return {}
