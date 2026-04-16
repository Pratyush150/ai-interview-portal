"""Detect AI-generated answers using heuristic signals."""
import re
from dataclasses import dataclass, field


@dataclass
class AIDetectionResult:
    likelihood: float  # 0.0 to 1.0
    signals: list[str] = field(default_factory=list)
    details: dict = field(default_factory=dict)


def analyze_answer(
    answer_text: str,
    time_to_respond_ms: int = 0,
    is_voice_input: bool = False,
) -> AIDetectionResult:
    """Analyze a candidate's answer for signs of AI generation."""
    signals = []
    scores = []
    word_count = len(answer_text.split())

    # Signal 1: Unusually long response for a spoken interview
    if word_count > 150:
        signals.append("unusually_long_response")
        scores.append(0.6)
    elif word_count > 100:
        scores.append(0.3)

    # Signal 2: AI-style structural markers
    ai_markers = [
        r"(?i)^(certainly|absolutely|great question|that'?s a great question)",
        r"(?i)(first[,.]?\s.*second[,.]?\s.*third)",
        r"(?i)(in summary|to summarize|in conclusion)",
        r"(?i)(it'?s worth noting|it'?s important to note)",
        r"(?i)(let me (explain|break|walk))",
        r"(?i)(here'?s (a|an|the|my)\s)",
        r"(?i)(there are (several|multiple|a few|many) (key|important|main))",
        r"\d+\.\s",  # numbered lists
        r"(?i)(additionally|furthermore|moreover)",
        r"(?i)(leverag(e|ing)|utilize|utilizing)",
        r"(?i)(comprehensive|holistic|multifaceted)",
        r"(?i)(delve|delving)",
    ]
    marker_count = sum(1 for p in ai_markers if re.search(p, answer_text))
    if marker_count >= 3:
        signals.append("high_ai_marker_density")
        scores.append(0.8)
    elif marker_count >= 2:
        signals.append("moderate_ai_markers")
        scores.append(0.5)

    # Signal 3: Typing speed analysis (text input only)
    if not is_voice_input and time_to_respond_ms > 0:
        chars_per_ms = len(answer_text) / max(time_to_respond_ms, 1)
        if chars_per_ms > 0.05:  # 10x faster than typical typing
            signals.append("impossibly_fast_typing")
            scores.append(0.9)
        elif chars_per_ms > 0.02:
            signals.append("suspiciously_fast_typing")
            scores.append(0.6)

    # Signal 4: Overly sophisticated vocabulary
    sophisticated_words = [
        'paradigm', 'leverage', 'utilize', 'facilitate', 'comprehensive',
        'subsequently', 'aforementioned', 'notwithstanding', 'efficacy',
        'juxtapose', 'synergy', 'holistic', 'multifaceted', 'paramount',
        'delve', 'tapestry', 'nuanced', 'robust', 'seamlessly',
    ]
    soph_count = sum(1 for w in sophisticated_words if w in answer_text.lower())
    if soph_count >= 3:
        signals.append("unusual_vocabulary_density")
        scores.append(0.5)

    # Signal 5: Voice input should have natural disfluencies
    if is_voice_input and word_count > 30:
        has_disfluency = bool(re.search(
            r"(?i)(um+|uh+|hmm+|like,?\s|you know|i mean|sort of|kind of|well,?\s)",
            answer_text
        ))
        if not has_disfluency:
            signals.append("no_disfluency_in_speech")
            scores.append(0.3)

    # Signal 6: Formatted lists in spoken answer (unlikely in natural speech)
    if is_voice_input and re.search(r'(\d+[\.\)]\s|[-*]\s)', answer_text):
        signals.append("formatted_list_in_speech")
        scores.append(0.4)

    # Calculate overall likelihood
    likelihood = 0.0
    if scores:
        likelihood = min(1.0, sum(scores) / max(len(scores), 1))

    return AIDetectionResult(
        likelihood=round(likelihood, 2),
        signals=signals,
        details={
            "word_count": word_count,
            "marker_count": marker_count,
            "soph_word_count": soph_count,
        }
    )
