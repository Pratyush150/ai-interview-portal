"""Compliance primitives — AEDT (automated employment decision tool) notice.

Pure, dependency-free notice text so it is safe to import anywhere (no DB, no
network, no API keys). Backs the candidate consent gate required by NYC Local
Law 144 and the transparency obligations of the EU AI Act (employment AI is
"high-risk"). The notice is *versioned*: when the disclosure text changes, bump
NOTICE_VERSION so a fresh acknowledgement is recorded against the new text.
"""
from __future__ import annotations

# Bump when the disclosure wording below changes. Acknowledgements are stored
# against the version the candidate actually saw, so an audit can prove exactly
# what each candidate consented to.
NOTICE_VERSION = "2026-06-01"

# Headline + plain-language disclosure bullets. Kept deliberately concise and
# non-legalese so a candidate can actually read it.
_TITLE = "Notice: this interview uses an automated decision tool"

_BULLETS = [
    "This assessment uses an automated employment decision tool (AEDT) — an "
    "AI system that helps evaluate your responses. It may include an aptitude "
    "round, an AI-led voice interview, and (for some roles) a coding round.",
    "The AI produces scores and a summary that a human recruiter reviews. The "
    "AI does not make the final hiring decision on its own.",
    "The qualifications and characteristics the tool assesses are job-related "
    "skills, knowledge, and communication relevant to the role you applied for.",
    "Your responses, audio, and any code you submit are processed to generate "
    "your evaluation and are retained as part of your application record.",
    "You may request an alternative assessment or a reasonable accommodation. "
    "Choosing this will not by itself disqualify your application.",
]

# What an alternative-assessment request means, shown when the job enables it.
_ALT_ASSESSMENT = (
    "If you would prefer not to be evaluated by the automated tool, you can "
    "request an alternative assessment. A recruiter will follow up by email."
)


def current_notice(*, alt_assessment_enabled: bool = False) -> dict:
    """Return the candidate-facing AEDT notice payload for the active version.

    `alt_assessment_enabled` toggles whether the alternative-assessment line is
    included (it mirrors the job's `alt_assessment_enabled` flag).
    """
    notice = {
        "version": NOTICE_VERSION,
        "title": _TITLE,
        "bullets": list(_BULLETS),
        "alt_assessment_enabled": bool(alt_assessment_enabled),
    }
    if alt_assessment_enabled:
        notice["alt_assessment_note"] = _ALT_ASSESSMENT
    return notice
