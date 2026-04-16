"""Detect AI-generated answers using heuristic signals.

Design notes
------------
Short answers (< ~25 words) carry almost no usable signal, so we report 0.0
and let the upstream combiner skip the LLM's guess as well. For longer
answers we combine multiple independent signals and take the MAX rather
than the mean so one weak hit doesn't inflate the score.
"""
import re
from dataclasses import dataclass, field


@dataclass
class AIDetectionResult:
    likelihood: float  # 0.0 to 1.0
    signals: list[str] = field(default_factory=list)
    details: dict = field(default_factory=dict)
    confident: bool = False  # True when answer is long enough to judge


# Threshold below which we do not trust any detection verdict.
MIN_WORDS_FOR_DETECTION = 25


def analyze_answer(
    answer_text: str,
    time_to_respond_ms: int = 0,
    is_voice_input: bool = False,
) -> AIDetectionResult:
    """Analyze a candidate's answer for signs of AI generation."""
    signals = []
    scores = []
    word_count = len(answer_text.split())

    # Too short to make any meaningful judgement — short greetings, "yes",
    # "I agree", etc. must not accrue a false-positive score.
    if word_count < MIN_WORDS_FOR_DETECTION:
        return AIDetectionResult(
            likelihood=0.0,
            signals=[],
            details={"word_count": word_count, "reason": "too_short"},
            confident=False,
        )

    # Signal 1: Unusually long response for a spoken interview
    if word_count > 200:
        signals.append("unusually_long_response")
        scores.append(0.55)
    elif word_count > 140:
        scores.append(0.25)

    # Signal 2: AI-style structural markers (require several hits)
    ai_markers = [
        r"(?i)^(certainly|absolutely|great question|that'?s a great question)",
        r"(?i)(first[,.]?\s.*second[,.]?\s.*third)",
        r"(?i)(in summary|to summarize|in conclusion)",
        r"(?i)(it'?s worth noting|it'?s important to note)",
        r"(?i)(let me (explain|break|walk))",
        r"(?i)(there are (several|multiple|a few|many) (key|important|main))",
        r"\d+\.\s",  # numbered lists
        r"(?i)(additionally|furthermore|moreover)",
        r"(?i)(leverag(e|ing)|utiliz(e|ing))",
        r"(?i)(comprehensive|holistic|multifaceted)",
        r"(?i)(delve|delving)",
    ]
    marker_count = sum(1 for p in ai_markers if re.search(p, answer_text))
    if marker_count >= 4:
        signals.append("high_ai_marker_density")
        scores.append(0.75)
    elif marker_count >= 3:
        signals.append("moderate_ai_markers")
        scores.append(0.45)

    # Signal 3: Typing speed analysis (text input only, requires long answer)
    if not is_voice_input and time_to_respond_ms > 0 and word_count > 40:
        chars_per_ms = len(answer_text) / max(time_to_respond_ms, 1)
        if chars_per_ms > 0.08:  # >80 chars/sec = clearly pasted
            signals.append("impossibly_fast_typing")
            scores.append(0.85)
        elif chars_per_ms > 0.04:  # >40 chars/sec = suspiciously fast
            signals.append("suspiciously_fast_typing")
            scores.append(0.5)

    # Signal 4: Overly sophisticated vocabulary density
    sophisticated_words = [
        'paradigm', 'leverage', 'utilize', 'facilitate', 'comprehensive',
        'subsequently', 'aforementioned', 'notwithstanding', 'efficacy',
        'juxtapose', 'synergy', 'holistic', 'multifaceted', 'paramount',
        'delve', 'tapestry', 'nuanced', 'seamlessly',
    ]
    soph_count = sum(1 for w in sophisticated_words if w in answer_text.lower())
    # Require density relative to answer length (>= 1 per 25 words AND >= 4 total)
    if soph_count >= 4 and soph_count / max(word_count, 1) > 0.04:
        signals.append("unusual_vocabulary_density")
        scores.append(0.4)

    # Signal 5: Voice input longer than 60 words with zero disfluency is
    # suspicious. Shorter spoken answers may naturally be fluent.
    if is_voice_input and word_count > 60:
        has_disfluency = bool(re.search(
            r"(?i)(um+|uh+|hmm+|\blike\b|you know|i mean|sort of|kind of)",
            answer_text
        ))
        if not has_disfluency:
            signals.append("no_disfluency_in_speech")
            scores.append(0.25)

    # Signal 6: Formatted lists in a spoken answer (unlikely in natural speech)
    if is_voice_input and re.search(r'(^\d+[\.\)]\s|^\s*[-*]\s)', answer_text, re.M):
        signals.append("formatted_list_in_speech")
        scores.append(0.35)

    # Combine with MAX rather than mean so one signal can't dilute another,
    # but cap at 0.9 — heuristics alone should never claim certainty.
    likelihood = min(0.9, max(scores)) if scores else 0.0

    return AIDetectionResult(
        likelihood=round(likelihood, 2),
        signals=signals,
        details={
            "word_count": word_count,
            "marker_count": marker_count,
            "soph_word_count": soph_count,
        },
        confident=True,
    )
