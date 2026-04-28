"""Role-specific interview profiles.

A profile is a compact description of HOW to interview a candidate for a
particular (role_family, seniority) combination. It drives:
    - stage turn limits (total question count varies by seniority)
    - stage-specific interviewer objectives (what to probe)
    - topic categories (what subject areas to mix across)
    - depth instruction (how hard to push)
    - rubric emphasis (which scoring dimensions matter most)

Design: a base objective per (family, stage), plus a seniority overlay
that raises the bar. This keeps the matrix compact while still producing
genuinely different interviews for an intern vs. a staff engineer.
"""
from __future__ import annotations

from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# Seniority tiers
# ---------------------------------------------------------------------------

SENIORITY_TIERS = [
    "intern",      # 0 YoE, exploring
    "entry",       # 0-2 YoE
    "mid",         # 2-5 YoE
    "senior",      # 5-9 YoE
    "lead",        # 9-14 YoE, leads small teams
    "principal",   # 14+ YoE, cross-org scope
]

# Years mapping used for search filters and auto-detection from resume.
SENIORITY_YEARS = {
    "intern":    (0, 0),
    "entry":     (0, 2),
    "mid":       (2, 5),
    "senior":    (5, 9),
    "lead":      (9, 14),
    "principal": (14, 40),
}


def infer_seniority(years: float | int | None) -> str:
    if years is None:
        return "mid"
    y = float(years)
    if y < 0.5:  return "intern"
    if y < 2:    return "entry"
    if y < 5:    return "mid"
    if y < 9:    return "senior"
    if y < 14:   return "lead"
    return "principal"


# Total turns and per-stage turn limits scale with seniority.
# intro + background + core + follow_up + wrap_up = TOTAL
TURN_BUDGETS = {
    "intern":    {"intro": 1, "background": 2, "core": 3,  "follow_up": 1, "wrap_up": 1},   # 8
    "entry":     {"intro": 1, "background": 3, "core": 5,  "follow_up": 2, "wrap_up": 1},   # 12
    "mid":       {"intro": 2, "background": 3, "core": 8,  "follow_up": 3, "wrap_up": 2},   # 18
    "senior":    {"intro": 2, "background": 4, "core": 11, "follow_up": 5, "wrap_up": 2},   # 24
    "lead":      {"intro": 2, "background": 4, "core": 13, "follow_up": 7, "wrap_up": 2},   # 28
    "principal": {"intro": 2, "background": 5, "core": 15, "follow_up": 8, "wrap_up": 2},   # 32
}


# Depth instruction appended to every technical-stage prompt.
DEPTH_BY_SENIORITY = {
    "intern": (
        "Keep the bar at textbook / coursework level. Ask about fundamentals "
        "and small exercises. Accept conceptual answers; do not demand production experience."
    ),
    "entry": (
        "Aim at new-grad / junior level. Probe core fundamentals, small project "
        "experience, and how they reason through problems. One clarifying follow-up per answer is enough."
    ),
    "mid": (
        "Aim at IC-level delivery. Expect clear project ownership, concrete numbers, and correct tradeoff "
        "reasoning on familiar tech. Push once for depth on every answer."
    ),
    "senior": (
        "Aim at senior IC. Expect architectural judgment, tradeoff fluency, failure-mode awareness, and "
        "cross-team collaboration. Push two levels deep on every non-trivial answer until they hit a limit."
    ),
    "lead": (
        "Aim at tech lead / manager-of-ICs. Expect system-level thinking, mentoring, "
        "prioritization, and influence across teams. Probe how they make DECISIONS, not just how they code."
    ),
    "principal": (
        "Aim at principal / staff level. Expect multi-year technical strategy, org-wide impact, handling "
        "ambiguity, and making calls under incomplete information. Challenge every claim — no hand-waving."
    ),
}


# Rubric weights by role family. The scoring rubric has four dimensions:
# correctness, depth, communication, relevance. Weights must sum to 1.0 and
# they're used as a hint to the evaluator about what matters most for THIS role.
RUBRIC_WEIGHTS = {
    # Engineering roles — correctness/depth dominate
    "software_engineering":    {"correctness": 0.35, "depth": 0.30, "communication": 0.15, "relevance": 0.20},
    "data_engineering":        {"correctness": 0.35, "depth": 0.30, "communication": 0.15, "relevance": 0.20},
    "data_science":            {"correctness": 0.30, "depth": 0.30, "communication": 0.20, "relevance": 0.20},
    "machine_learning":        {"correctness": 0.30, "depth": 0.35, "communication": 0.15, "relevance": 0.20},
    "devops_sre":              {"correctness": 0.35, "depth": 0.30, "communication": 0.15, "relevance": 0.20},
    "mobile_engineering":      {"correctness": 0.35, "depth": 0.30, "communication": 0.15, "relevance": 0.20},
    "qa_testing":              {"correctness": 0.30, "depth": 0.25, "communication": 0.20, "relevance": 0.25},
    "security_engineering":    {"correctness": 0.40, "depth": 0.30, "communication": 0.10, "relevance": 0.20},
    "embedded_systems":        {"correctness": 0.40, "depth": 0.30, "communication": 0.10, "relevance": 0.20},
    "mechanical_engineering":  {"correctness": 0.35, "depth": 0.30, "communication": 0.15, "relevance": 0.20},
    "electrical_engineering":  {"correctness": 0.35, "depth": 0.30, "communication": 0.15, "relevance": 0.20},
    "civil_engineering":       {"correctness": 0.35, "depth": 0.25, "communication": 0.20, "relevance": 0.20},
    # Product roles — communication and relevance matter more
    "product_management":      {"correctness": 0.20, "depth": 0.25, "communication": 0.30, "relevance": 0.25},
    "ux_ui_design":            {"correctness": 0.15, "depth": 0.25, "communication": 0.30, "relevance": 0.30},
    # Business / MBA roles — communication-heavy
    "consulting":              {"correctness": 0.20, "depth": 0.25, "communication": 0.30, "relevance": 0.25},
    "investment_banking_finance": {"correctness": 0.30, "depth": 0.25, "communication": 0.25, "relevance": 0.20},
    "marketing":               {"correctness": 0.15, "depth": 0.25, "communication": 0.30, "relevance": 0.30},
    "hr_people":               {"correctness": 0.15, "depth": 0.20, "communication": 0.35, "relevance": 0.30},
    "operations_management":   {"correctness": 0.25, "depth": 0.25, "communication": 0.25, "relevance": 0.25},
    "business_analyst":        {"correctness": 0.25, "depth": 0.25, "communication": 0.25, "relevance": 0.25},
    "product_marketing":       {"correctness": 0.15, "depth": 0.25, "communication": 0.30, "relevance": 0.30},
    "sales":                   {"correctness": 0.15, "depth": 0.20, "communication": 0.35, "relevance": 0.30},
}


# ---------------------------------------------------------------------------
# Role profile dataclass
# ---------------------------------------------------------------------------

@dataclass
class RoleProfile:
    role_family: str
    display_name: str
    topic_categories: list[str]
    # Stage prompts are templates — the {{depth}} token is filled per-seniority.
    intro_prompt: str
    background_prompt: str
    core_prompt: str
    follow_up_prompt: str
    wrap_up_prompt: str
    interviewer_persona: str = (
        "You are a senior practitioner conducting a structured interview. "
        "Be professional, warm at the intro, and rigorous during the technical sections."
    )
    # Skills that are worth automatically asking about when the JD is vague.
    default_skills: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Role profiles — engineering
# ---------------------------------------------------------------------------

_SOFTWARE_ENG = RoleProfile(
    role_family="software_engineering",
    display_name="Software Engineer",
    topic_categories=[
        "system design & architecture",
        "data structures & algorithms",
        "databases & storage",
        "APIs & distributed systems",
        "testing & debugging",
        "deployment & CI/CD",
        "concurrency & performance",
        "security & input validation",
        "code quality & maintainability",
    ],
    interviewer_persona=(
        "You are a staff software engineer at a strong product company. Tough but fair. "
        "You ask one question at a time, you never accept hand-waving, and you always "
        "follow up with why / what tradeoffs / what failure modes."
    ),
    intro_prompt=(
        "Greet the candidate briefly. Confirm their name and target role, and ask for a "
        "one-minute self-introduction focused on what they're most proud of building."
    ),
    background_prompt=(
        "Probe their actual contributions vs. what the team did. For each project they mention, ask: "
        "their specific ownership, the tech stack AND why it was chosen, team size, request volume / data "
        "volume, and one concrete failure they debugged. Refuse vague answers."
    ),
    core_prompt=(
        "Run a deep technical block. Pick TWO of the following and rotate: system design at realistic scale, "
        "an algorithm / data-structure probe with complexity analysis, a debugging scenario (\"p99 jumped 3x after "
        "deploy — walk me through it\"), a code-review question, and a SQL-vs-NoSQL / push-vs-pull / sync-vs-async tradeoff. "
        "Always follow up each answer with a pointed why/failure-mode question. {{depth}}"
    ),
    follow_up_prompt=(
        "Return to earlier answers and hunt the weak spots: vague claims, unstated assumptions, ignored edge "
        "cases, lack of monitoring/observability, and undefended tradeoff calls. Challenge one architectural "
        "choice directly: 'Convince me X is right; why not Y?' "
    ),
    wrap_up_prompt=(
        "Ask two closers: (1) the hardest bug they ever debugged — full process, and (2) a technical decision they "
        "got wrong and what they learned. End with a concise, honest summary of strengths and one improvement area."
    ),
    default_skills=["Python", "Go", "Java", "SQL", "REST APIs", "Docker"],
)


_DATA_ENG = RoleProfile(
    role_family="data_engineering",
    display_name="Data Engineer",
    topic_categories=[
        "ETL/ELT pipelines",
        "data modeling & warehousing",
        "streaming & batch processing",
        "SQL performance tuning",
        "orchestration (Airflow/Dagster)",
        "data quality & observability",
        "cloud data platforms",
        "schema evolution & backfills",
    ],
    interviewer_persona=(
        "You are a lead data engineer. You care about correctness, idempotency, and cost. You push back on "
        "naive pipelines and always ask about failure recovery and data-quality checks."
    ),
    intro_prompt=(
        "Greet the candidate. Ask about their current role and the most complex pipeline they own (volume, "
        "SLAs, freshness)."
    ),
    background_prompt=(
        "For each pipeline they mention: what is the source, the transformation framework, the sink, the SLA, "
        "and how do failures get detected and replayed? Drill on WHY that architecture over a simpler alternative."
    ),
    core_prompt=(
        "Technical block: (1) design a pipeline that moves X rows/day from source to warehouse with end-to-end SLA, "
        "(2) a SQL tuning question on a slow query, (3) dimensional modeling — star vs. wide table tradeoffs, "
        "(4) exactly-once semantics in streaming. {{depth}}"
    ),
    follow_up_prompt=(
        "Challenge: what happens on a partial failure mid-batch? How do backfills work without double-counting? "
        "How do you detect silent schema drift before downstream dashboards break?"
    ),
    wrap_up_prompt=(
        "Closers: (1) a pipeline outage they had to debug under pressure, (2) a data-quality bug that made it "
        "to stakeholders — what did they change. Honest summary."
    ),
    default_skills=["SQL", "Python", "Airflow", "Spark", "Snowflake", "dbt"],
)


_DATA_SCI = RoleProfile(
    role_family="data_science",
    display_name="Data Scientist",
    topic_categories=[
        "statistics & hypothesis testing",
        "A/B testing & experimentation",
        "regression & classification modeling",
        "causal inference",
        "feature engineering",
        "model evaluation metrics",
        "SQL & data wrangling",
        "business translation of results",
    ],
    interviewer_persona=(
        "You are a principal data scientist. You care about whether the candidate can translate a vague "
        "business problem into a measurable one, pick the right metric, and interpret results honestly."
    ),
    intro_prompt="Greet. Ask about a project where their analysis actually changed a business decision.",
    background_prompt=(
        "Probe: what was the exact business question, what data was available, what baseline did they beat, how "
        "was success measured, and what did the stakeholder do with the result? Push on whether correlation was "
        "confused with causation."
    ),
    core_prompt=(
        "Technical block mix: (1) design an A/B test for a specific product change including sample-size math, "
        "(2) explain the bias-variance tradeoff with a concrete example, (3) pick the right metric for a given "
        "business question and justify it, (4) a SQL question requiring window functions. {{depth}}"
    ),
    follow_up_prompt=(
        "Challenge their experimentation rigor: novelty effects, peeking, multiple testing, Simpson's paradox. "
        "Ask what they would do if the A/B test was flat but leadership demanded a ship decision."
    ),
    wrap_up_prompt=(
        "Closers: a time they had to tell a stakeholder the data said NO; and the most surprising insight from their data."
    ),
    default_skills=["SQL", "Python", "pandas", "scikit-learn", "statistics", "A/B testing"],
)


_ML = RoleProfile(
    role_family="machine_learning",
    display_name="ML / AI Engineer",
    topic_categories=[
        "modeling fundamentals",
        "deep learning architectures",
        "training infra & distributed training",
        "inference & serving at scale",
        "data pipelines for ML",
        "evaluation & offline/online metrics",
        "ML ops & drift monitoring",
        "LLM / foundation model tuning",
    ],
    interviewer_persona=(
        "You are a staff ML engineer. You distinguish people who've built and shipped models from those who've "
        "only read papers. Push for production-level thinking: latency, cost, monitoring, failure modes."
    ),
    intro_prompt="Greet. Ask about the most impactful model they shipped to production and the metric it moved.",
    background_prompt=(
        "For each model: training data source & volume, architecture choice, offline eval setup, online eval setup, "
        "retraining cadence, and what went wrong after launch."
    ),
    core_prompt=(
        "Technical block: (1) design an end-to-end ML system for a specific task with throughput and latency targets, "
        "(2) a pointed question on loss functions / regularization / optimizer choices, (3) how to handle distribution "
        "shift post-launch, (4) evaluation methodology for a ranking or generative system. {{depth}}"
    ),
    follow_up_prompt=(
        "Hunt for rigor gaps: leakage, train-test contamination, reward hacking, unmonitored drift, and whether "
        "offline metrics actually predicted online impact."
    ),
    wrap_up_prompt=(
        "Closers: a model that looked great offline but failed in production; the hardest debugging session in ML they've had."
    ),
    default_skills=["Python", "PyTorch", "TensorFlow", "NumPy", "MLflow", "CUDA"],
)


_DEVOPS = RoleProfile(
    role_family="devops_sre",
    display_name="DevOps / SRE",
    topic_categories=[
        "Linux & networking fundamentals",
        "Kubernetes & container orchestration",
        "CI/CD pipelines",
        "observability (logs, metrics, traces)",
        "incident response & postmortems",
        "infrastructure-as-code",
        "reliability (SLI/SLO/error budgets)",
        "cloud cost & security hardening",
    ],
    interviewer_persona=(
        "You are a principal SRE. You want people who calmly reason during incidents, write postmortems that "
        "change systems, and design for failure from day one."
    ),
    intro_prompt="Greet. Ask about the worst production incident they've been on-call for.",
    background_prompt=(
        "For the incident: what was the user impact, how was it detected, what was the root cause, what was the "
        "fix, and what systemic change came out of the postmortem? Push hard if the answer is just 'we restarted it'."
    ),
    core_prompt=(
        "Technical block: (1) design CI/CD + rollout strategy for a service that deploys many times/day, "
        "(2) how would you set SLOs for a user-facing API and what error budget behaviour, "
        "(3) debug-a-box question: host showing 100%% CPU but app is idle — walk through investigation, "
        "(4) tradeoffs between rolling vs. canary vs. blue/green. {{depth}}"
    ),
    follow_up_prompt=(
        "Challenge: cost vs. reliability tradeoffs, multi-region failover assumptions, secret rotation, "
        "and whether their monitoring would actually catch a gradual degradation (not just an outage)."
    ),
    wrap_up_prompt="Closers: an on-call night that taught them something; and an automation they regret building.",
    default_skills=["Linux", "Kubernetes", "Terraform", "AWS", "Prometheus", "Bash"],
)


_MOBILE = RoleProfile(
    role_family="mobile_engineering",
    display_name="Mobile Engineer",
    topic_categories=[
        "iOS / Android platform fundamentals",
        "UI frameworks (SwiftUI/Compose/RN)",
        "app lifecycle & memory management",
        "networking & offline-first",
        "app performance & battery",
        "release pipelines & beta channels",
        "crash reporting & observability",
        "accessibility",
    ],
    interviewer_persona="You are a senior mobile engineer. You care about performance, battery, and crash-free sessions.",
    intro_prompt="Greet. Ask for the most-used app feature they've shipped.",
    background_prompt=(
        "Probe: DAU/MAU scale, crash-free rate, how they measured perf, how they handled flaky networks, and "
        "how they managed long release cycles with app stores."
    ),
    core_prompt=(
        "Technical block: (1) design an offline-first feature with sync conflict resolution, "
        "(2) platform-specific memory / lifecycle question, "
        "(3) a performance scenario — scroll jank on a list screen, how to diagnose, "
        "(4) how to roll back a bad release fast. {{depth}}"
    ),
    follow_up_prompt="Challenge: accessibility, localization, slow device behaviour, low-end network behaviour.",
    wrap_up_prompt="Closers: a crash they hunted; a feature they killed because users didn't use it.",
    default_skills=["Swift", "Kotlin", "iOS", "Android", "REST", "GraphQL"],
)


_QA = RoleProfile(
    role_family="qa_testing",
    display_name="QA / SDET",
    topic_categories=[
        "test strategy (pyramid, shift-left)",
        "unit / integration / E2E tradeoffs",
        "test automation frameworks",
        "flaky test management",
        "performance & load testing",
        "API contract testing",
        "test data management",
        "release quality metrics",
    ],
    interviewer_persona="You are a lead SDET. You push candidates on what to automate vs. leave manual, and on how to keep suites fast and non-flaky.",
    intro_prompt="Greet. Ask about the test strategy they're proudest of and what it changed.",
    background_prompt="Probe coverage goals, flakiness rate, how failures are triaged, and ROI of each automation level.",
    core_prompt=(
        "Technical block: (1) design a test strategy for a new payment flow, (2) how to diagnose and fix a flaky E2E test, "
        "(3) writing a contract test for a shared API, (4) load-test plan for a launch. {{depth}}"
    ),
    follow_up_prompt="Challenge: how to resist 'just ship it' pressure without being a blocker; how to keep CI under 10 min.",
    wrap_up_prompt="Closers: a bug that escaped to prod and why; a test they wrote that caught something big.",
    default_skills=["Selenium", "Playwright", "pytest", "JUnit", "k6", "REST"],
)


_SECURITY = RoleProfile(
    role_family="security_engineering",
    display_name="Security Engineer",
    topic_categories=[
        "application security (OWASP top 10)",
        "authentication & authorization",
        "cryptography fundamentals",
        "threat modeling",
        "cloud security",
        "incident response",
        "secure SDLC",
        "vulnerability management",
    ],
    interviewer_persona="You are a principal security engineer. You probe for depth — surface buzzwords are a red flag.",
    intro_prompt="Greet. Ask about a vulnerability they disclosed or remediated end to end.",
    background_prompt="Probe: discovery method, blast radius, who was affected, remediation, follow-up detections.",
    core_prompt=(
        "Technical block: (1) explain OAuth 2.1 + PKCE end-to-end and the attacks it prevents, "
        "(2) threat-model a new feature (e.g. file upload), "
        "(3) when would you choose symmetric vs asymmetric crypto and why, "
        "(4) detect and contain a compromised IAM role in AWS. {{depth}}"
    ),
    follow_up_prompt="Challenge: risk prioritization when everything looks critical; zero-trust tradeoffs; developer friction.",
    wrap_up_prompt="Closers: the scariest vuln they've seen; a security decision they regret making too strict or too loose.",
    default_skills=["OWASP", "Burp Suite", "IAM", "TLS", "Python", "SIEM"],
)


_EMBEDDED = RoleProfile(
    role_family="embedded_systems",
    display_name="Embedded / Firmware Engineer",
    topic_categories=[
        "microcontroller architectures",
        "RTOS & scheduling",
        "C / C++ low-level",
        "interrupts & DMA",
        "communication protocols (I2C, SPI, UART, CAN)",
        "memory-constrained optimization",
        "hardware debugging (JTAG, logic analyzer)",
        "power management",
    ],
    interviewer_persona="You are a senior firmware engineer. You care about correctness under constrained resources and determinism.",
    intro_prompt="Greet. Ask about the most complex embedded system they've shipped and its constraints.",
    background_prompt="Probe: MCU choice, RTOS vs bare-metal, memory footprint, power budget, and why each choice was made.",
    core_prompt=(
        "Technical block: (1) write an ISR that avoids priority inversion, "
        "(2) debug a flaky I2C communication, "
        "(3) when to use DMA vs polling vs interrupts, "
        "(4) how to reduce active power in a battery-powered device. {{depth}}"
    ),
    follow_up_prompt="Challenge: OTA updates without bricking, bootloader design, and test strategy for timing-sensitive code.",
    wrap_up_prompt="Closers: a Heisenbug caused by timing/EMI; a hardware-software interaction that surprised them.",
    default_skills=["C", "C++", "FreeRTOS", "ARM Cortex-M", "I2C", "SPI"],
)


_MECH = RoleProfile(
    role_family="mechanical_engineering",
    display_name="Mechanical Engineer",
    topic_categories=[
        "statics & dynamics",
        "thermodynamics & heat transfer",
        "materials & failure modes",
        "CAD & tolerancing (GD&T)",
        "manufacturing processes (CNC, injection molding, sheet metal)",
        "FEA / simulation",
        "design for manufacturability",
        "product lifecycle & supplier management",
    ],
    interviewer_persona="You are a senior mechanical design engineer. You push on whether the candidate understands WHY a part is shaped the way it is.",
    intro_prompt="Greet. Ask about a part or assembly they designed from concept to production.",
    background_prompt="Probe loads, safety factor, material choice, manufacturing method, and what failed during validation.",
    core_prompt=(
        "Technical block: (1) back-of-envelope stress on a given loading, "
        "(2) material selection for a hot/corrosive environment, "
        "(3) DFM review of a bracket — where would you push back, "
        "(4) tolerance stack-up on a 4-part assembly. {{depth}}"
    ),
    follow_up_prompt="Challenge: cost vs. weight tradeoffs; supplier qualification; accelerated life testing plan.",
    wrap_up_prompt="Closers: a part that passed FEA but failed in the field; a lesson from a production ramp.",
    default_skills=["SolidWorks", "CATIA", "GD&T", "FEA", "ANSYS", "DFM"],
)


_ELEC = RoleProfile(
    role_family="electrical_engineering",
    display_name="Electrical Engineer",
    topic_categories=[
        "analog circuit design",
        "digital logic & FPGAs",
        "power electronics",
        "PCB layout & signal integrity",
        "EMC / EMI compliance",
        "communication / RF",
        "test & measurement",
        "component sourcing & qualification",
    ],
    interviewer_persona="You are a senior EE. You push on physical intuition — not just simulation results.",
    intro_prompt="Greet. Ask about a board or circuit they designed end to end.",
    background_prompt="Probe: power budget, noise targets, why each IC was chosen, rev history, and EMC results.",
    core_prompt=(
        "Technical block: (1) design a low-noise power supply for an ADC, "
        "(2) debug an SI issue on a high-speed trace, "
        "(3) tradeoffs of LDO vs switcher, "
        "(4) bring-up sequence for a new board. {{depth}}"
    ),
    follow_up_prompt="Challenge: EMC pre-compliance strategy; thermal derating; what changes between prototype and mass production.",
    wrap_up_prompt="Closers: a bug that only showed up at high temperature or low voltage; a layout change that saved a design.",
    default_skills=["Altium", "KiCad", "SPICE", "Oscilloscope", "C", "Verilog"],
)


_CIVIL = RoleProfile(
    role_family="civil_engineering",
    display_name="Civil / Structural Engineer",
    topic_categories=[
        "structural analysis (beams, frames)",
        "concrete & steel design codes",
        "geotechnical fundamentals",
        "construction methods & sequencing",
        "project management & schedules",
        "site safety",
        "surveying & drawings",
        "sustainability & materials",
    ],
    interviewer_persona="You are a senior structural engineer. You probe code fluency and site-awareness.",
    intro_prompt="Greet. Ask about a project they stamped or led engineering for.",
    background_prompt="Probe: loads considered, code edition used, soil conditions, and any design change driven by site reality.",
    core_prompt=(
        "Technical block: (1) size a beam for a given load using the appropriate code, "
        "(2) pick a foundation type for given soil, (3) walk through a construction sequencing conflict, "
        "(4) handle a site-observed crack — triage steps. {{depth}}"
    ),
    follow_up_prompt="Challenge: schedule vs. safety tradeoffs; QA/QC on site; change-order management.",
    wrap_up_prompt="Closers: a project that taught them humility; a design decision they would redo.",
    default_skills=["AutoCAD", "Revit", "STAAD", "ETABS", "IS/ACI/Eurocode", "MS Project"],
)


# ---------------------------------------------------------------------------
# Role profiles — product & design
# ---------------------------------------------------------------------------

_PM = RoleProfile(
    role_family="product_management",
    display_name="Product Manager",
    topic_categories=[
        "product sense & user empathy",
        "prioritization frameworks",
        "metrics & KPI design",
        "A/B testing & experimentation",
        "stakeholder communication",
        "roadmap strategy",
        "technical collaboration",
        "estimation & sizing",
    ],
    interviewer_persona=(
        "You are a senior PM at a product-led company. You push candidates to show opinion, not checklist thinking. "
        "You probe whether they can pick the right problem and kill the wrong ones."
    ),
    intro_prompt="Greet. Ask about a product decision they made that was controversial internally.",
    background_prompt=(
        "For the decision: what was the user problem, what data, what alternatives did they kill, how did they "
        "sell it to engineering and leadership, and what was the result."
    ),
    core_prompt=(
        "Three classic PM blocks: (1) product-sense — 'how would you improve X for Y user?' with a clear framework, "
        "(2) metrics — 'your DAU dropped 10%% overnight, diagnose,' (3) prioritization — pick between three features "
        "with partial info and defend it. {{depth}}"
    ),
    follow_up_prompt=(
        "Challenge: what would make them kill the feature they just pitched? What signal would make them pivot in 3 months?"
    ),
    wrap_up_prompt="Closers: a feature they shipped that flopped; a metric that taught them their mental model was wrong.",
    default_skills=["Roadmapping", "A/B testing", "SQL", "Stakeholder management", "Product strategy"],
)


_UX = RoleProfile(
    role_family="ux_ui_design",
    display_name="UX / UI Designer",
    topic_categories=[
        "user research methods",
        "information architecture",
        "interaction patterns",
        "visual design fundamentals",
        "accessibility (WCAG)",
        "design systems",
        "prototyping & validation",
        "cross-functional collaboration",
    ],
    interviewer_persona="You are a design lead. You want opinions backed by research, not taste arguments.",
    intro_prompt="Greet. Ask them to walk through one portfolio piece — problem, process, decision.",
    background_prompt="Probe: research method, user pain, why specific design choices, handoff process, post-launch measurement.",
    core_prompt=(
        "Blocks: (1) critique an existing UI and propose changes, (2) design an IA for a specific product, "
        "(3) how to validate a design cheaply before handoff, (4) accessibility pitfalls of a flow. {{depth}}"
    ),
    follow_up_prompt="Challenge: how do they disagree with a PM or engineer? What evidence would change their mind?",
    wrap_up_prompt="Closers: a redesign that users hated; a research insight that changed product direction.",
    default_skills=["Figma", "User research", "Prototyping", "Design systems", "Accessibility"],
)


# ---------------------------------------------------------------------------
# Role profiles — business / MBA
# ---------------------------------------------------------------------------

_CONSULTING = RoleProfile(
    role_family="consulting",
    display_name="Management Consultant",
    topic_categories=[
        "case interview — profitability",
        "case interview — market entry",
        "case interview — M&A",
        "market sizing",
        "structured problem solving",
        "quantitative estimation",
        "stakeholder communication",
        "industry awareness",
    ],
    interviewer_persona=(
        "You are a partner at a top-tier consulting firm. You care about structure, MECE thinking, and a clear "
        "recommendation — not a recitation of frameworks."
    ),
    intro_prompt="Greet. Ask them to introduce themselves in 60 seconds and say which industry interests them most.",
    background_prompt=(
        "For each project / internship: what was the client's real problem, what did THEY personally own, what was "
        "the analytical approach, and what was the final recommendation the partner took to the client?"
    ),
    core_prompt=(
        "Run one full case end-to-end. Pick one: (a) profitability — 'retailer's margins are down 20%%, why?', "
        "(b) market sizing — 'how many diapers are sold in India per year?', (c) market entry — 'should Client X "
        "enter Brazil?'. Interrupt naturally with data as they ask for it. Score their structure, their math, "
        "and their ability to synthesize into a recommendation. {{depth}}"
    ),
    follow_up_prompt=(
        "After the case: stress-test the recommendation. 'What if the assumption on X is wrong? At what point "
        "would your answer flip?' Push them to articulate the weakest link in their logic."
    ),
    wrap_up_prompt=(
        "Closers: (1) a time they disagreed with a senior stakeholder and how they handled it, (2) why consulting "
        "over industry. Honest summary."
    ),
    default_skills=["Case solving", "Excel", "PowerPoint", "Market sizing", "Client communication"],
)


_FINANCE = RoleProfile(
    role_family="investment_banking_finance",
    display_name="Finance / Investment Banking",
    topic_categories=[
        "financial statement analysis",
        "valuation (DCF, comps, precedents)",
        "M&A accretion/dilution",
        "LBO mechanics",
        "markets & macro awareness",
        "Excel modeling",
        "capital structure",
        "deal execution",
    ],
    interviewer_persona="You are a VP in investment banking. You care about technical fluency — candidates must be snappy on valuation math.",
    intro_prompt="Greet. Ask them to pitch a recent deal or stock they've been following.",
    background_prompt=(
        "Probe: what drove their thesis, what's the valuation approach, what could go wrong. No fluff."
    ),
    core_prompt=(
        "Technical rapid-fire: (1) walk me through a DCF, (2) how do three statements link, (3) accretion/dilution "
        "intuition on an all-stock deal, (4) LBO — what drives returns. Follow each with 'what if [X] changed?'. {{depth}}"
    ),
    follow_up_prompt=(
        "Harder: WACC sensitivity, terminal value assumptions, synergies haircut, and a curveball market question."
    ),
    wrap_up_prompt="Closers: why this firm, and what they'd do if the deal team disagreed with their model.",
    default_skills=["Excel modeling", "Valuation", "Accounting", "PowerPoint", "DCF", "LBO"],
)


_MARKETING = RoleProfile(
    role_family="marketing",
    display_name="Marketing Manager",
    topic_categories=[
        "brand positioning",
        "go-to-market strategy",
        "performance / growth marketing",
        "content & SEO",
        "analytics & attribution",
        "customer segmentation",
        "campaign design",
        "budget allocation",
    ],
    interviewer_persona="You are a marketing director. You push for measurable impact and an opinion on brand.",
    intro_prompt="Greet. Ask about a campaign they ran end-to-end and the result.",
    background_prompt="Probe: goal, audience, channel mix, budget, measurement plan, and what they'd change.",
    core_prompt=(
        "Blocks: (1) GTM plan for a specific product in a specific market, (2) diagnose a CAC jump, "
        "(3) how to split budget across channels with diminishing returns, (4) positioning vs. a strong incumbent. {{depth}}"
    ),
    follow_up_prompt="Challenge attribution assumptions; push on incrementality testing; brand vs. performance tension.",
    wrap_up_prompt="Closers: a campaign that flopped and why; a time they changed the brand voice and stakeholders pushed back.",
    default_skills=["GTM strategy", "Performance marketing", "SEO", "Analytics", "Brand", "Budgeting"],
)


_HR = RoleProfile(
    role_family="hr_people",
    display_name="HR / People Operations",
    topic_categories=[
        "talent acquisition",
        "performance management",
        "compensation & benefits",
        "employee relations",
        "diversity & inclusion",
        "organizational design",
        "HR analytics",
        "employment law basics",
    ],
    interviewer_persona="You are a CHRO. You care about judgment under ambiguity and balancing people with business.",
    intro_prompt="Greet. Ask about a people program they built and its measurable impact.",
    background_prompt="Probe: the problem, the stakeholders, the data, the rollout, and how they measured impact.",
    core_prompt=(
        "Scenarios: (1) a high-performer is mistreating peers — what do you do, (2) design a performance review process "
        "from scratch for 200 people, (3) a team's attrition jumps — diagnose, (4) pay-equity gap found — remediation plan. {{depth}}"
    ),
    follow_up_prompt="Challenge: confidentiality limits, legal risk, and how to say no to a senior leader.",
    wrap_up_prompt="Closers: a hard conversation they facilitated; a policy they killed.",
    default_skills=["Talent acquisition", "Performance management", "Employment law", "HR analytics", "Stakeholder management"],
)


_OPS = RoleProfile(
    role_family="operations_management",
    display_name="Operations Manager",
    topic_categories=[
        "process design & improvement",
        "supply chain & logistics",
        "demand / capacity planning",
        "six sigma / lean",
        "KPI design & dashboards",
        "vendor management",
        "cost optimization",
        "risk & continuity planning",
    ],
    interviewer_persona="You are a VP of operations. You push on metrics, tradeoffs, and execution discipline.",
    intro_prompt="Greet. Ask about a process they owned and the SLA they held it to.",
    background_prompt="Probe: volume, cost, quality metric, failure modes, and their biggest process improvement.",
    core_prompt=(
        "Blocks: (1) design the operational KPIs for a new service line, (2) reduce cycle time on a given process "
        "without hurting quality, (3) a supplier defaults on capacity — action plan, (4) tradeoff between inventory "
        "cost and service level. {{depth}}"
    ),
    follow_up_prompt="Challenge: how they handle a KPI that incentivizes the wrong behavior; vendor concentration risk.",
    wrap_up_prompt="Closers: a process change they rolled back; the metric they trust least.",
    default_skills=["Lean", "Six Sigma", "SQL", "Excel", "Vendor management", "Capacity planning"],
)


_BA = RoleProfile(
    role_family="business_analyst",
    display_name="Business Analyst",
    topic_categories=[
        "requirements gathering",
        "process mapping",
        "SQL & data analysis",
        "KPIs & dashboards",
        "user acceptance testing",
        "stakeholder management",
        "documentation (BRD/FRD)",
        "root-cause analysis",
    ],
    interviewer_persona="You are a senior BA. You value precision and the ability to translate between business and engineering.",
    intro_prompt="Greet. Ask about a requirement they gathered that changed significantly during a project.",
    background_prompt="Probe: methodology, stakeholders, conflict handling, how ambiguity was reduced, and post-delivery validation.",
    core_prompt=(
        "Blocks: (1) write user stories for a described feature with clear acceptance criteria, "
        "(2) a SQL question on joins + aggregation, (3) diagnose a KPI drop with the data provided, "
        "(4) map an AS-IS vs TO-BE process. {{depth}}"
    ),
    follow_up_prompt="Challenge: scope creep; conflicting stakeholders; incomplete requirements.",
    wrap_up_prompt="Closers: a requirement they got wrong; a dashboard that actually changed a decision.",
    default_skills=["SQL", "Excel", "BRD writing", "Process mapping", "Stakeholder management", "Power BI"],
)


_PMM = RoleProfile(
    role_family="product_marketing",
    display_name="Product Marketing Manager",
    topic_categories=[
        "positioning & messaging",
        "launch strategy",
        "competitive intelligence",
        "pricing & packaging",
        "customer research",
        "sales enablement",
        "content strategy",
        "cross-functional collaboration",
    ],
    interviewer_persona="You are a senior PMM. You push on crisp positioning over buzzwords.",
    intro_prompt="Greet. Ask them to position a product they love in one sentence.",
    background_prompt="Probe: launch they owned, messaging tests, sales feedback loop, and measurable impact.",
    core_prompt=(
        "Blocks: (1) write a one-line positioning statement and defend it, (2) launch plan for a new tier, "
        "(3) response to a competitor's feature launch, (4) pricing test design. {{depth}}"
    ),
    follow_up_prompt="Challenge: conflict with product on roadmap; conflict with sales on enablement; positioning trade-offs.",
    wrap_up_prompt="Closers: a launch that underperformed and the messaging lesson; a competitor they underestimated.",
    default_skills=["Positioning", "Messaging", "Launch strategy", "Competitive analysis", "Sales enablement"],
)


_SALES = RoleProfile(
    role_family="sales",
    display_name="Enterprise Sales",
    topic_categories=[
        "discovery & qualification (BANT/MEDDIC)",
        "pipeline management",
        "negotiation & closing",
        "objection handling",
        "account planning",
        "forecasting",
        "channel / partner sales",
        "CRM hygiene",
    ],
    interviewer_persona="You are a sales director. You want people who can ask hard questions early and forecast honestly.",
    intro_prompt="Greet. Ask about the biggest deal they closed and how they got in.",
    background_prompt="Probe: ACV, sales cycle, discovery method, champion-building, and what almost killed the deal.",
    core_prompt=(
        "Role-play + scenarios: (1) cold discovery call — 5 minutes, (2) objection handling on price, "
        "(3) multi-threading a stalled deal, (4) forecast call — how do they call a commit deal. {{depth}}"
    ),
    follow_up_prompt="Challenge: a deal stuck in procurement, a champion leaves, and honesty on forecast.",
    wrap_up_prompt="Closers: a deal they lost and why; a discovery question that changed how they sell.",
    default_skills=["MEDDIC", "BANT", "Salesforce", "Forecasting", "Negotiation", "Account planning"],
)


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

ALL_PROFILES: dict[str, RoleProfile] = {
    p.role_family: p for p in [
        _SOFTWARE_ENG, _DATA_ENG, _DATA_SCI, _ML, _DEVOPS, _MOBILE, _QA,
        _SECURITY, _EMBEDDED, _MECH, _ELEC, _CIVIL,
        _PM, _UX,
        _CONSULTING, _FINANCE, _MARKETING, _HR, _OPS, _BA, _PMM, _SALES,
    ]
}


def list_role_families() -> list[dict]:
    return [
        {"role_family": p.role_family, "display_name": p.display_name,
         "default_skills": p.default_skills}
        for p in ALL_PROFILES.values()
    ]


def get_profile(role_family: str | None) -> RoleProfile:
    if not role_family:
        return _SOFTWARE_ENG
    return ALL_PROFILES.get(role_family, _SOFTWARE_ENG)


def get_turn_budget(seniority: str | None) -> dict:
    s = seniority if seniority in TURN_BUDGETS else "mid"
    return TURN_BUDGETS[s]


def get_depth_instruction(seniority: str | None) -> str:
    s = seniority if seniority in DEPTH_BY_SENIORITY else "mid"
    return DEPTH_BY_SENIORITY[s]


def get_rubric_weights(role_family: str | None) -> dict:
    return RUBRIC_WEIGHTS.get(role_family or "", RUBRIC_WEIGHTS["software_engineering"])


# ---------------------------------------------------------------------------
# Mock JDs — one per role family. Used to seed the demo company.
# ---------------------------------------------------------------------------

MOCK_JDS = [
    # Engineering
    {
        "role_family": "software_engineering", "seniority": "mid",
        "title": "Software Engineer II (Backend)",
        "department": "Engineering",
        "min_experience_years": 2, "max_experience_years": 5,
        "required_skills": "Python, PostgreSQL, Docker, REST APIs, AWS, Git",
        "description": (
            "We're hiring a backend engineer to own a set of services powering our checkout flow "
            "(~2M requests/day). You'll design APIs, optimize SQL, and partner with platform to "
            "ship reliably. You should have 2-5 years building production services in Python or Go, "
            "written meaningful SQL, and debugged production incidents end-to-end."
        ),
    },
    {
        "role_family": "software_engineering", "seniority": "senior",
        "title": "Senior Software Engineer — Platform",
        "department": "Engineering",
        "min_experience_years": 5, "max_experience_years": 9,
        "required_skills": "Go, Kubernetes, gRPC, Distributed Systems, PostgreSQL, Observability",
        "description": (
            "Lead technical direction on our core platform services. You'll design multi-tenant "
            "systems, set API patterns org-wide, mentor mid-level engineers, and own reliability of "
            "tier-0 services. Looking for 5-9 years of production experience, strong systems design, "
            "and a history of shipping large migrations without outages."
        ),
    },
    {
        "role_family": "data_engineering", "seniority": "mid",
        "title": "Data Engineer",
        "department": "Data",
        "min_experience_years": 3, "max_experience_years": 6,
        "required_skills": "SQL, Python, Airflow, Spark, Snowflake, dbt",
        "description": (
            "Build and own pipelines that move billions of events/day from Kafka into Snowflake. "
            "You'll design models with dbt, manage Airflow DAGs, and build data-quality checks. "
            "3-6 years of experience with production pipelines and strong SQL fluency required."
        ),
    },
    {
        "role_family": "data_science", "seniority": "mid",
        "title": "Data Scientist",
        "department": "Data",
        "min_experience_years": 2, "max_experience_years": 5,
        "required_skills": "SQL, Python, A/B testing, pandas, scikit-learn, statistics",
        "description": (
            "Partner with Product to run experiments, build models, and influence roadmap. You'll "
            "design A/B tests, build forecasting models, and present results to leadership. Strong "
            "statistics foundation and hands-on SQL required."
        ),
    },
    {
        "role_family": "machine_learning", "seniority": "senior",
        "title": "Senior Machine Learning Engineer",
        "department": "AI",
        "min_experience_years": 5, "max_experience_years": 10,
        "required_skills": "Python, PyTorch, LLMs, MLOps, Distributed training, Kubernetes",
        "description": (
            "Own end-to-end ML systems in production — data, training, serving, monitoring. You'll "
            "ship LLM-powered features, handle retraining pipelines, and set ML best practices. "
            "5+ years shipping models in production and fluency with modern LLM stack required."
        ),
    },
    {
        "role_family": "devops_sre", "seniority": "senior",
        "title": "Senior Site Reliability Engineer",
        "department": "Infrastructure",
        "min_experience_years": 5, "max_experience_years": 9,
        "required_skills": "Kubernetes, Terraform, AWS, Prometheus, Linux, On-call",
        "description": (
            "Own reliability of tier-0 systems. Set SLOs, run incident response, design CI/CD, and "
            "reduce toil through automation. Strong Linux fundamentals, Kubernetes in prod, and "
            "incident-driven postmortems are essential."
        ),
    },
    {
        "role_family": "mobile_engineering", "seniority": "mid",
        "title": "iOS Engineer",
        "department": "Mobile",
        "min_experience_years": 2, "max_experience_years": 6,
        "required_skills": "Swift, SwiftUI, UIKit, REST, Combine, XCTest",
        "description": (
            "Build customer-facing features for our iOS app (10M DAU). You'll own features end-to-end "
            "including shipping to the App Store, crash-free rate, and performance. 2+ years shipping "
            "real iOS apps and fluency in Swift/SwiftUI required."
        ),
    },
    {
        "role_family": "qa_testing", "seniority": "mid",
        "title": "SDET — Automation",
        "department": "Quality",
        "min_experience_years": 3, "max_experience_years": 6,
        "required_skills": "Playwright, pytest, CI/CD, API testing, Test strategy",
        "description": (
            "Own test strategy and automation across our web stack. Reduce flakiness, build contract "
            "tests, and keep CI under 10 minutes. Strong engineering skills — this is an engineering "
            "role, not a click-through-testing role."
        ),
    },
    {
        "role_family": "security_engineering", "seniority": "senior",
        "title": "Senior Application Security Engineer",
        "department": "Security",
        "min_experience_years": 5, "max_experience_years": 10,
        "required_skills": "AppSec, OWASP, Threat modeling, Python, AWS, Secure SDLC",
        "description": (
            "Partner with engineering to ship secure code. Run threat models on new features, triage "
            "findings, and drive remediation. Strong AppSec fundamentals and cloud security expected."
        ),
    },
    {
        "role_family": "embedded_systems", "seniority": "mid",
        "title": "Embedded Firmware Engineer",
        "department": "Hardware",
        "min_experience_years": 3, "max_experience_years": 7,
        "required_skills": "C, C++, FreeRTOS, ARM Cortex-M, I2C, SPI, OTA",
        "description": (
            "Build firmware for battery-powered IoT devices. Own power budget, OTA updates, and "
            "comms stack. 3+ years with ARM microcontrollers and production-grade firmware required."
        ),
    },
    {
        "role_family": "mechanical_engineering", "seniority": "mid",
        "title": "Mechanical Design Engineer",
        "department": "Hardware",
        "min_experience_years": 3, "max_experience_years": 7,
        "required_skills": "SolidWorks, GD&T, FEA, DFM, Injection molding, Tolerancing",
        "description": (
            "Design injection-molded and sheet-metal parts for consumer hardware. Own DFM reviews "
            "with suppliers, tolerance stack-ups, and field-failure investigations. Strong CAD + "
            "manufacturing intuition required."
        ),
    },
    {
        "role_family": "electrical_engineering", "seniority": "mid",
        "title": "Electrical Engineer — Hardware",
        "department": "Hardware",
        "min_experience_years": 3, "max_experience_years": 7,
        "required_skills": "Altium, KiCad, Analog design, Power electronics, SI, EMC",
        "description": (
            "Design mixed-signal PCBs for consumer and industrial products. Own schematic, layout, "
            "bring-up, and EMC pre-compliance. Must have taken a board from schematic to mass "
            "production."
        ),
    },
    {
        "role_family": "civil_engineering", "seniority": "mid",
        "title": "Structural Engineer",
        "department": "Projects",
        "min_experience_years": 3, "max_experience_years": 8,
        "required_skills": "STAAD, ETABS, IS codes, AutoCAD, Site supervision, RCC design",
        "description": (
            "Design and oversee structural components for mid-rise construction. Fluency in Indian "
            "codes (or ACI/Eurocode), STAAD/ETABS modeling, and comfort on-site are required."
        ),
    },
    # Product & Design
    {
        "role_family": "product_management", "seniority": "mid",
        "title": "Product Manager",
        "department": "Product",
        "min_experience_years": 3, "max_experience_years": 6,
        "required_skills": "Product strategy, A/B testing, SQL, Roadmapping, Stakeholder management",
        "description": (
            "Own a product area end to end — strategy, roadmap, execution, measurement. Partner with "
            "engineering and design to ship features that move metrics. Strong analytical + "
            "communication skills required."
        ),
    },
    {
        "role_family": "ux_ui_design", "seniority": "mid",
        "title": "Senior Product Designer",
        "department": "Design",
        "min_experience_years": 3, "max_experience_years": 7,
        "required_skills": "Figma, User research, Prototyping, Design systems, Accessibility",
        "description": (
            "Design high-impact surfaces of our core product. Partner with PM and Eng, run research, "
            "ship end-to-end. Portfolio with shipped work and strong opinions required."
        ),
    },
    # Business / MBA
    {
        "role_family": "consulting", "seniority": "entry",
        "title": "Associate Consultant (MBA hire)",
        "department": "Strategy",
        "min_experience_years": 0, "max_experience_years": 3,
        "required_skills": "Case solving, Excel, PowerPoint, Market sizing, Communication",
        "description": (
            "Join our strategy consulting practice as an Associate. Fresh MBA or 1-3 YoE. You'll "
            "support partners on client engagements across profitability, market entry, and M&A. "
            "Structured thinking and strong presentation skills required."
        ),
    },
    {
        "role_family": "investment_banking_finance", "seniority": "entry",
        "title": "Investment Banking Analyst",
        "department": "IBD",
        "min_experience_years": 0, "max_experience_years": 2,
        "required_skills": "Excel modeling, DCF, LBO, Accounting, PowerPoint, Valuation",
        "description": (
            "Analyst role supporting deal teams on M&A and capital markets. Expect intense hours, "
            "rigorous modeling work, and client exposure. Strong quantitative aptitude essential."
        ),
    },
    {
        "role_family": "marketing", "seniority": "mid",
        "title": "Growth Marketing Manager",
        "department": "Marketing",
        "min_experience_years": 3, "max_experience_years": 6,
        "required_skills": "Performance marketing, SEO, Analytics, A/B testing, Budget management",
        "description": (
            "Own paid + organic growth channels. You'll design experiments, optimize CAC, and scale "
            "profitable channels. Strong analytical chops and channel-specific expertise required."
        ),
    },
    {
        "role_family": "hr_people", "seniority": "mid",
        "title": "HR Business Partner",
        "department": "People",
        "min_experience_years": 4, "max_experience_years": 8,
        "required_skills": "Performance management, Stakeholder management, HR analytics, Employment law",
        "description": (
            "HRBP for a 200-person engineering org. Partner with leaders on talent, performance, "
            "and org design. Balance business needs with employee advocacy."
        ),
    },
    {
        "role_family": "operations_management", "seniority": "mid",
        "title": "Operations Manager",
        "department": "Operations",
        "min_experience_years": 4, "max_experience_years": 8,
        "required_skills": "Process design, SQL, Excel, Vendor management, KPI dashboards, Lean",
        "description": (
            "Own the operational backbone of our fulfillment network. Design KPIs, run vendors, and "
            "drive cost/quality improvements. Comfortable with SQL and data-driven decisions."
        ),
    },
    {
        "role_family": "business_analyst", "seniority": "entry",
        "title": "Business Analyst",
        "department": "Strategy",
        "min_experience_years": 0, "max_experience_years": 3,
        "required_skills": "SQL, Excel, BRD, Process mapping, Stakeholder management, Power BI",
        "description": (
            "Work with product and business stakeholders to define requirements, build dashboards, "
            "and run analyses. Strong SQL and written communication required."
        ),
    },
    {
        "role_family": "product_marketing", "seniority": "mid",
        "title": "Product Marketing Manager",
        "department": "Marketing",
        "min_experience_years": 3, "max_experience_years": 7,
        "required_skills": "Positioning, Messaging, Launch strategy, Competitive intelligence, Sales enablement",
        "description": (
            "Own positioning, launches, and enablement for a product line. Partner with product, "
            "sales, and marketing to bring features to market. Sharp writing and research required."
        ),
    },
    {
        "role_family": "sales", "seniority": "senior",
        "title": "Senior Enterprise Account Executive",
        "department": "Sales",
        "min_experience_years": 5, "max_experience_years": 10,
        "required_skills": "MEDDIC, Salesforce, Negotiation, Forecasting, Multi-threading, SaaS",
        "description": (
            "Close six-to-seven-figure SaaS deals with enterprise accounts. Own discovery, "
            "multi-threading, and forecasting accuracy. MEDDIC/MEDDPICC preferred."
        ),
    },
]
