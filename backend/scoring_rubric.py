"""Scoring rubric for consistent, rubric-based evaluation."""

SCORING_RUBRIC = """
SCORING RUBRIC — Evaluate each answer on these 4 dimensions (0-10 each):

1. CORRECTNESS (0-10): Is the answer factually correct?
   0-2: Fundamentally wrong or nonsensical
   3-4: Partially correct but major errors
   5-6: Mostly correct with minor errors
   7-8: Correct with good understanding
   9-10: Perfectly correct with nuanced understanding

2. DEPTH (0-10): How deep is the understanding?
   0-2: Surface-level or memorized definition only
   3-4: Basic understanding, no elaboration
   5-6: Moderate depth, some examples
   7-8: Deep understanding with practical examples
   9-10: Expert-level insight, trade-offs discussed

3. COMMUNICATION (0-10): How clearly is the answer expressed?
   0-2: Incoherent or unable to express ideas
   3-4: Disorganized but understandable
   5-6: Clear but could be more structured
   7-8: Well-structured and concise
   9-10: Excellent communication, perfectly organized

4. RELEVANCE (0-10): Does the answer address the question?
   0-2: Completely off-topic
   3-4: Tangentially related
   5-6: Addresses the question but wanders
   7-8: Directly relevant and focused
   9-10: Precisely targeted, addresses all parts

Final score = average of all 4 dimensions, rounded to 1 decimal.

CRITICAL: Be consistent. A "5" always means the same thing regardless of candidate.
Do NOT inflate scores. Most competent answers should score 5-7. Only truly exceptional answers score 8+.
Provide the score breakdown for each dimension.
"""

AI_DETECTION_PROMPT = """
AI-GENERATED ANSWER DETECTION:
Evaluate whether this answer appears to be AI-generated. Look for:
- Overly structured responses with numbered lists
- Phrases like "certainly", "great question", "it's worth noting", "let me explain"
- Unnaturally perfect grammar with no hesitation markers
- Generic examples that don't draw from personal experience
- Buzzwords: "leverage", "utilize", "comprehensive", "holistic", "delve"
- Answers that sound like documentation rather than conversation

STRICT CALIBRATION RULES — follow these carefully to avoid false positives:
- If the answer is under 25 words, set ai_likelihood = 0.0. Short greetings,
  acknowledgements ("yes", "I agree", "thanks"), and one-sentence replies do
  NOT carry enough signal to judge. Do not penalize brevity.
- Default ai_likelihood is 0.05 when you have no clear evidence. NEVER use
  0.2 or 0.3 as a "just in case" default.
- Only report ai_likelihood > 0.4 when at least TWO independent red flags
  are present (e.g. numbered list AND buzzword density, or impossibly long
  AND perfectly structured).
- Report ai_likelihood > 0.7 only when the answer reads clearly like
  LLM output: perfect structure, multiple AI markers, and zero personal
  detail.
- Human-like indicators that should PULL the score down toward 0.0:
  personal anecdotes, specific project / company / team names, mid-sentence
  corrections, filler words, uncertainty ("I think", "maybe", "I'm not sure"),
  colloquial phrasing.
"""
