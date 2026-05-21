import type {
  ActivityEvent,
  Candidate,
  CandidateStatus,
  CheatFlag,
  InterviewSession,
  Language,
  Role,
  TranscriptTurn,
} from "@/types";

// ─────────────────────────────────────────────────────────────────────────
// Roles
// ─────────────────────────────────────────────────────────────────────────

export const ROLES: Role[] = [
  {
    id: "role_swe_backend_mid",
    title: "Software Engineer II — Backend",
    family: "Engineering",
    seniority: "mid",
    department: "Engineering",
    location: "Bengaluru",
    minYears: 2,
    maxYears: 5,
    salaryMin: 18_00_000,
    salaryMax: 32_00_000,
    skills: ["Python", "PostgreSQL", "Docker", "REST APIs", "AWS", "Git"],
    openings: 3,
    applicants: 47,
    createdAt: "2026-04-08T05:30:00Z",
  },
  {
    id: "role_swe_platform_senior",
    title: "Senior Software Engineer — Platform",
    family: "Engineering",
    seniority: "senior",
    department: "Engineering",
    location: "Bengaluru / Remote",
    minYears: 5,
    maxYears: 9,
    salaryMin: 38_00_000,
    salaryMax: 65_00_000,
    skills: ["Go", "Kubernetes", "gRPC", "Distributed Systems", "PostgreSQL"],
    openings: 2,
    applicants: 31,
    createdAt: "2026-04-12T05:30:00Z",
  },
  {
    id: "role_data_eng_mid",
    title: "Data Engineer",
    family: "Data",
    seniority: "mid",
    department: "Data Platform",
    location: "Hyderabad",
    minYears: 3,
    maxYears: 6,
    salaryMin: 22_00_000,
    salaryMax: 38_00_000,
    skills: ["SQL", "Python", "Airflow", "Spark", "Snowflake", "dbt"],
    openings: 2,
    applicants: 28,
    createdAt: "2026-04-04T05:30:00Z",
  },
  {
    id: "role_ml_senior",
    title: "Senior Machine Learning Engineer",
    family: "AI",
    seniority: "senior",
    department: "AI",
    location: "Bengaluru",
    minYears: 5,
    maxYears: 10,
    salaryMin: 45_00_000,
    salaryMax: 80_00_000,
    skills: ["Python", "PyTorch", "LLMs", "MLOps", "Distributed training"],
    openings: 2,
    applicants: 19,
    createdAt: "2026-04-15T05:30:00Z",
  },
  {
    id: "role_ios_mid",
    title: "iOS Engineer",
    family: "Mobile",
    seniority: "mid",
    department: "Mobile",
    location: "Mumbai",
    minYears: 2,
    maxYears: 6,
    salaryMin: 20_00_000,
    salaryMax: 40_00_000,
    skills: ["Swift", "SwiftUI", "UIKit", "REST", "Combine"],
    openings: 1,
    applicants: 14,
    createdAt: "2026-04-18T05:30:00Z",
  },
  {
    id: "role_pm_mid",
    title: "Product Manager",
    family: "Product",
    seniority: "mid",
    department: "Product",
    location: "Bengaluru",
    minYears: 3,
    maxYears: 6,
    salaryMin: 25_00_000,
    salaryMax: 45_00_000,
    skills: ["Product strategy", "A/B testing", "SQL", "Roadmapping"],
    openings: 1,
    applicants: 22,
    createdAt: "2026-04-02T05:30:00Z",
  },
  {
    id: "role_design_mid",
    title: "Senior Product Designer",
    family: "Design",
    seniority: "mid",
    department: "Design",
    location: "Bengaluru / Remote",
    minYears: 3,
    maxYears: 7,
    salaryMin: 22_00_000,
    salaryMax: 42_00_000,
    skills: ["Figma", "User research", "Prototyping", "Design systems"],
    openings: 1,
    applicants: 17,
    createdAt: "2026-04-20T05:30:00Z",
  },
  {
    id: "role_sre_senior",
    title: "Senior Site Reliability Engineer",
    family: "Engineering",
    seniority: "senior",
    department: "Infrastructure",
    location: "Pune",
    minYears: 5,
    maxYears: 9,
    salaryMin: 36_00_000,
    salaryMax: 62_00_000,
    skills: ["Kubernetes", "Terraform", "AWS", "Prometheus", "Linux"],
    openings: 2,
    applicants: 11,
    createdAt: "2026-04-22T05:30:00Z",
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Candidates — 50 generated with deterministic mock data
// ─────────────────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  "Priya", "Rahul", "Arjun", "Ananya", "Vikram", "Neha", "Aditya", "Kavya",
  "Karthik", "Riya", "Siddharth", "Meera", "Akash", "Tanvi", "Rohan", "Ishita",
  "Manish", "Pooja", "Saurabh", "Divya", "Nikhil", "Aishwarya", "Abhishek",
  "Sneha", "Varun", "Anjali", "Harsh", "Shreya", "Devansh", "Aanya",
  "Yash", "Nisha", "Aryan", "Vaishnavi", "Kunal", "Swati", "Pranav",
  "Bhavana", "Tushar", "Lakshmi", "Shubham", "Jaya", "Rohit", "Sanjana",
  "Aman", "Ritika", "Mohit", "Pallavi", "Tarun", "Aparna",
];

const LAST_NAMES = [
  "Sharma", "Verma", "Iyer", "Reddy", "Kumar", "Patel", "Nair", "Menon",
  "Krishnan", "Gupta", "Agarwal", "Joshi", "Rao", "Banerjee", "Chatterjee",
  "Bose", "Bhat", "Pillai", "Shetty", "Pandey", "Mishra", "Tiwari", "Singh",
  "Kapoor", "Mehta", "Shah", "Desai", "Naidu", "Chowdhury", "Pal",
];

const CITIES = [
  "Bengaluru",
  "Mumbai",
  "Pune",
  "Hyderabad",
  "Chennai",
  "Delhi",
  "Gurgaon",
  "Noida",
  "Kolkata",
  "Ahmedabad",
];

const COMPANIES = [
  "Razorpay",
  "Swiggy",
  "Flipkart",
  "Zomato",
  "PhonePe",
  "Paytm",
  "Freshworks",
  "Zerodha",
  "CRED",
  "Meesho",
  "Zoho",
  "Infosys",
  "TCS",
  "Wipro",
  "Tata 1mg",
  "Cult.fit",
];

const STATUSES: CandidateStatus[] = [
  "applied",
  "ai_screened",
  "shortlisted",
  "human_round",
  "offered",
  "hired",
  "rejected",
];

const LANGUAGES: Language[] = [
  "English",
  "Hindi",
  "Tamil",
  "Telugu",
  "Marathi",
  "Bengali",
  "Kannada",
];

// Tiny deterministic PRNG so output is stable across renders.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], rnd: () => number) {
  return arr[Math.floor(rnd() * arr.length)]!;
}

function randomName(rnd: () => number) {
  return `${pick(FIRST_NAMES, rnd)} ${pick(LAST_NAMES, rnd)}`;
}

function buildCandidate(i: number): Candidate {
  const rnd = mulberry32(1000 + i);
  const role = ROLES[i % ROLES.length]!;
  const name = randomName(rnd);
  const slug = name.toLowerCase().replace(/[^a-z]/g, "");
  const status = pick(STATUSES, rnd);
  // weight scores by status (rejected → low, hired → high)
  const baseScore =
    status === "hired"
      ? 8 + rnd() * 1.5
      : status === "offered"
        ? 7.5 + rnd() * 1.5
        : status === "rejected"
          ? 3 + rnd() * 3
          : 5 + rnd() * 4;
  const overall = Math.min(9.8, Math.max(2.5, baseScore));
  const yearsExp =
    role.minYears + rnd() * (role.maxYears - role.minYears + 1.5);
  const langCount = 1 + Math.floor(rnd() * 2.5);
  const languages = Array.from(
    new Set(Array.from({ length: langCount }, () => pick(LANGUAGES, rnd))),
  );
  if (!languages.includes("English")) languages.unshift("English");
  const skillCount = 4 + Math.floor(rnd() * 3);
  const skills = Array.from(
    new Set(
      Array.from({ length: skillCount }, () => pick(role.skills, rnd)),
    ),
  );
  const appliedDaysAgo = Math.floor(rnd() * 28);
  const lastDaysAgo = Math.floor(rnd() * appliedDaysAgo);
  const appliedAt = new Date(
    Date.now() - appliedDaysAgo * 86_400_000,
  ).toISOString();
  const lastActivityAt = new Date(
    Date.now() - lastDaysAgo * 86_400_000,
  ).toISOString();
  const correctness = Math.min(10, overall + (rnd() - 0.4) * 2);
  const depth = Math.min(10, overall + (rnd() - 0.5) * 1.6);
  const communication = Math.min(10, overall + (rnd() - 0.3) * 1.8);
  const relevance = Math.min(10, overall + (rnd() - 0.5) * 1.2);
  return {
    id: `cand_${i.toString().padStart(3, "0")}`,
    name,
    email: `${slug}@${pick(["gmail.com", "outlook.com", "yahoo.in"], rnd)}`,
    phone: `+91 9${Math.floor(100000000 + rnd() * 900000000)}`,
    city: pick(CITIES, rnd),
    roleId: role.id,
    status,
    appliedAt,
    lastActivityAt,
    experienceYears: Number(yearsExp.toFixed(1)),
    currentTitle:
      role.title.replace(/Senior\s/, "").replace(/\s—.*/, "") || role.title,
    currentCompany: pick(COMPANIES, rnd),
    noticePeriod: pick(["Immediate", "15 days", "30 days", "60 days"], rnd),
    expectedCtc: Math.round((role.salaryMin + rnd() * (role.salaryMax - role.salaryMin)) / 100000) * 100000,
    languages,
    skills,
    overallScore: Number(overall.toFixed(1)),
    percentile: Math.min(99, Math.max(8, Math.round(overall * 10 + (rnd() - 0.5) * 8))),
    scoreBreakdown: {
      correctness: Number(correctness.toFixed(1)),
      depth: Number(depth.toFixed(1)),
      communication: Number(communication.toFixed(1)),
      relevance: Number(relevance.toFixed(1)),
    },
    aiLikelihood: Number((rnd() * (overall < 4 ? 0.6 : 0.25)).toFixed(2)),
    resumeSummary: `${Number(yearsExp.toFixed(1))} years building production ${role.family.toLowerCase()} systems. Led ${1 + Math.floor(rnd() * 3)} cross-team initiatives at ${pick(COMPANIES, rnd)}.`,
    highlights: [
      "Owned end-to-end migration of legacy service to event-driven architecture",
      "Reduced p99 latency from 1.2s to 280ms by reworking the cache hierarchy",
      "Mentored 4 junior engineers; ran the design-review forum for the org",
    ],
    strengths: [
      "Clear architectural reasoning under load",
      "Strong on tradeoffs — picks the boring solution when correct",
      "Communicates risk early without hand-wringing",
    ],
    improvements: [
      "Defaulted to in-memory caching without addressing eviction",
      "Skipped failure-mode discussion until prompted twice",
    ],
  };
}

export const CANDIDATES: Candidate[] = Array.from({ length: 50 }, (_, i) =>
  buildCandidate(i),
);

// Keep one well-known candidate as the canonical example for /candidates/[id]
CANDIDATES[0] = {
  ...CANDIDATES[0]!,
  id: "cand_priya_sharma",
  name: "Priya Sharma",
  email: "priya.sharma@gmail.com",
  phone: "+91 9874512300",
  city: "Bengaluru",
  roleId: "role_swe_backend_mid",
  status: "shortlisted",
  experienceYears: 4.2,
  currentTitle: "Software Engineer",
  currentCompany: "Razorpay",
  noticePeriod: "30 days",
  expectedCtc: 28_00_000,
  languages: ["English", "Hindi", "Tamil"],
  skills: ["Python", "PostgreSQL", "FastAPI", "Docker", "AWS", "Redis", "Celery"],
  overallScore: 8.4,
  percentile: 91,
  scoreBreakdown: {
    correctness: 8.6,
    depth: 8.1,
    communication: 9.0,
    relevance: 8.0,
  },
  aiLikelihood: 0.08,
  resumeSummary:
    "4 years building payment-flow services at Razorpay. Led the migration of the refunds service to an event-driven model that cut reconciliation lag from 6h to 4 minutes.",
  highlights: [
    "Owned refunds service migration; cut reconciliation lag from 6h to 4 min.",
    "Designed retry-budget framework adopted org-wide for tier-1 services.",
    "Mentored 3 junior engineers; ran the API-design forum for 9 months.",
  ],
  strengths: [
    "Sharp on idempotency and retry semantics — gave a precise example involving the refund-state machine.",
    "Reasoned about Postgres replication lag without prompting; named specific failure modes.",
    "Communicated tradeoffs clearly; flagged risk before being asked.",
  ],
  improvements: [
    "Defaulted to in-memory caching without addressing eviction or cache stampede.",
    "Skipped monitoring discussion on the system-design question until prompted twice.",
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// Interview transcript & cheat flags for the canonical candidate
// ─────────────────────────────────────────────────────────────────────────

const PRIYA_TRANSCRIPT: TranscriptTurn[] = [
  {
    id: "t1",
    speaker: "interviewer",
    text:
      "Hello Priya, thanks for joining today. I'm the AI interviewer for the Software Engineer II role at Razorpay. We'll spend about 45 minutes — first your background, then a deeper dive into a couple of technical areas. Could you start with a one-minute introduction focused on what you're most proud of building?",
    timestamp: 4,
    stage: "intro",
  },
  {
    id: "t2",
    speaker: "candidate",
    text:
      "Hi, I'm Priya. I've been at Razorpay for about four years on the payments-platform team. The piece I'm proudest of is the refunds service rewrite — we moved off a polling model to an event-driven one and brought reconciliation lag from six hours down to about four minutes.",
    timestamp: 38,
    stage: "intro",
    score: 8.5,
    topic: "self-introduction",
  },
  {
    id: "t3",
    speaker: "interviewer",
    text:
      "That's a substantial change. Walk me through the architecture before and after — what specifically did you own, and what was the failure mode of the old polling model?",
    timestamp: 62,
    stage: "background",
  },
  {
    id: "t4",
    speaker: "candidate",
    text:
      "The old model polled the bank settlement files every 30 minutes and reconciled them against a Postgres ledger. Two problems: the polling created bursty load on the ledger, and any delayed file pushed reconciliation out by hours. I owned the new ingestion pipeline — Kafka topic per partner, a stateful consumer that materialises a per-payment state machine, and the reconciliation worker that closes out terminal states. The old service still exists as a dual-write fallback for one partner.",
    timestamp: 134,
    stage: "background",
    score: 8.8,
    topic: "system architecture",
  },
  {
    id: "t5",
    speaker: "interviewer",
    text:
      "Good. On the state machine — how did you handle out-of-order events? A refund-completed before a refund-initiated, for instance.",
    timestamp: 152,
    stage: "background",
  },
  {
    id: "t6",
    speaker: "candidate",
    text:
      "We keyed by refund-id and used the partner's monotonic sequence number when present; when it wasn't, we accepted the event but parked it in a pending bucket until the prerequisite arrived, with a 30-minute eviction. The state machine itself is idempotent — replays are no-ops if the target state is already reached or unreachable.",
    timestamp: 209,
    stage: "background",
    score: 9.0,
    topic: "event ordering",
  },
  {
    id: "t7",
    speaker: "interviewer",
    text:
      "Let's switch gears. Design a rate limiter for an API gateway that handles roughly 50,000 requests per second across 200 instances. Walk me through the data structure, where state lives, and how you avoid the obvious failure modes.",
    timestamp: 234,
    stage: "core",
  },
  {
    id: "t8",
    speaker: "candidate",
    text:
      "I'd start with a token bucket per API key, stored in Redis with a Lua script for atomic decrement. Each instance writes through to Redis on every request — that's the simple version. At 50K rps that's 50K Redis ops, which a single cluster handles, but the round-trip adds latency, so I'd add an instance-local bucket that pre-fetches tokens in batches of, say, 100, and refills against Redis when low. Failure modes: Redis outage — fail open with local-only buckets, accept some over-allowance for the duration. Hot keys — shard by hashing the key into N sub-buckets. Clock drift — use Redis's TIME command, not local clocks.",
    timestamp: 358,
    stage: "core",
    score: 9.1,
    topic: "rate limiting design",
  },
  {
    id: "t9",
    speaker: "interviewer",
    text:
      "Nice. The instance-local pre-fetch — how do you reconcile the case where an instance pre-fetches 100 tokens and then crashes with 60 unused?",
    timestamp: 376,
    stage: "core",
  },
  {
    id: "t10",
    speaker: "candidate",
    text:
      "Honest answer — we'd lose those tokens. The bucket would over-throttle for one window. Acceptable tradeoff for the latency win, but I'd document it and tune the batch size based on the typical instance lifetime versus the refill cost.",
    timestamp: 412,
    stage: "core",
    score: 8.7,
    topic: "rate limiting design",
  },
  {
    id: "t11",
    speaker: "interviewer",
    text:
      "Now a debugging scenario. Your refunds service starts returning 500s on roughly 2% of requests at peak hours, but the rate looks fine off-peak. Walk me through your investigation.",
    timestamp: 438,
    stage: "core",
  },
  {
    id: "t12",
    speaker: "candidate",
    text:
      "First, slice the 500s by partner, by region, and by request shape — see if it correlates. Then check downstream: ledger Postgres, Redis, Kafka. Two-percent at peak smells like resource contention — connection pool exhaustion most likely. I'd look at active connections versus pool size, slow-query log on Postgres, and whether we're hitting the Kafka consumer rebalance window. If pool exhaustion, raise the pool but more importantly find which query is holding connections — usually a missing index or a long transaction.",
    timestamp: 542,
    stage: "core",
    score: 8.4,
    topic: "debugging",
  },
  {
    id: "t13",
    speaker: "interviewer",
    text:
      "You mentioned you'd cache aggressively earlier. How would you handle cache stampede on a hot key?",
    timestamp: 560,
    stage: "follow_up",
  },
  {
    id: "t14",
    speaker: "candidate",
    text:
      "Honestly I didn't address that earlier — I'd use single-flight or a probabilistic early refresh. Probabilistic: each fetch decides whether to refresh based on a coin flip weighted by how close the entry is to expiry. Stops the thundering herd without locks.",
    timestamp: 605,
    stage: "follow_up",
    score: 7.8,
    topic: "caching",
  },
  {
    id: "t15",
    speaker: "interviewer",
    text:
      "Alright, last question. Tell me about a technical decision you made that you'd reverse today.",
    timestamp: 624,
    stage: "wrap_up",
  },
  {
    id: "t16",
    speaker: "candidate",
    text:
      "We rolled our own retry framework instead of using the platform's. It worked, but every team had to learn our knobs, and when the platform team shipped theirs we ended up with two. I should have invested two weeks earlier in helping the platform team and adopted theirs. Lesson: pick the boring solution unless there's a clear differentiator.",
    timestamp: 698,
    stage: "wrap_up",
    score: 8.6,
    topic: "self-reflection",
  },
];

const PRIYA_CHEAT_FLAGS: CheatFlag[] = [
  {
    id: "cf1",
    type: "tab_switch",
    timestamp: 312,
    severity: "low",
    description:
      "Tab focus left the interview window for 4 seconds during the system-design question.",
  },
  {
    id: "cf2",
    type: "paste_detected",
    timestamp: 421,
    severity: "medium",
    description:
      "Paste event in the code editor; 142 characters. Content matched the candidate's earlier scratch buffer.",
    evidence: "function rateLimitMiddleware(req, res, next) { ... }",
  },
];

export const PRIYA_INTERVIEW: InterviewSession = {
  id: "sess_priya_001",
  candidateId: "cand_priya_sharma",
  roleId: "role_swe_backend_mid",
  startedAt: "2026-04-26T09:30:00+05:30",
  durationSec: 798,
  stage: "finished",
  transcript: PRIYA_TRANSCRIPT,
  cheatFlags: PRIYA_CHEAT_FLAGS,
  cheatScore: 0.18,
  videoUrl: undefined,
};

// ─────────────────────────────────────────────────────────────────────────
// Activity feed
// ─────────────────────────────────────────────────────────────────────────

export const ACTIVITY: ActivityEvent[] = CANDIDATES.slice(0, 14).map((c, i) => {
  const role = ROLES.find((r) => r.id === c.roleId)!;
  const types: ActivityEvent["type"][] = [
    "interview_completed",
    "shortlisted",
    "application",
    "offered",
    "rejected",
    "hired",
  ];
  return {
    id: `act_${i}`,
    type: types[i % types.length]!,
    candidateId: c.id,
    candidateName: c.name,
    roleId: role.id,
    roleTitle: role.title,
    at: new Date(Date.now() - i * 3_600_000 - i * 740_000).toISOString(),
    meta: { score: c.overallScore },
  };
});

// ─────────────────────────────────────────────────────────────────────────
// Aggregates for /dashboard and /analytics
// ─────────────────────────────────────────────────────────────────────────

export function statusCounts() {
  const counts: Record<CandidateStatus, number> = {
    applied: 0,
    ai_screened: 0,
    shortlisted: 0,
    human_round: 0,
    offered: 0,
    hired: 0,
    rejected: 0,
  };
  for (const c of CANDIDATES) counts[c.status]++;
  return counts;
}

export function fundFunnelData() {
  const c = statusCounts();
  return [
    { name: "Applied", value: CANDIDATES.length },
    {
      name: "AI Screened",
      value:
        c.ai_screened +
        c.shortlisted +
        c.human_round +
        c.offered +
        c.hired +
        c.rejected,
    },
    {
      name: "Shortlisted",
      value: c.shortlisted + c.human_round + c.offered + c.hired,
    },
    { name: "Offered", value: c.offered + c.hired },
    { name: "Hired", value: c.hired },
  ];
}

export function timeToHireTrend() {
  return [
    { week: "W14", days: 28 },
    { week: "W15", days: 24 },
    { week: "W16", days: 22 },
    { week: "W17", days: 19 },
    { week: "W18", days: 17 },
    { week: "W19", days: 15 },
    { week: "W20", days: 14 },
  ];
}

export function scoreDistribution() {
  const buckets: Record<string, number> = {
    "0-2": 0,
    "2-4": 0,
    "4-6": 0,
    "6-8": 0,
    "8-10": 0,
  };
  for (const c of CANDIDATES) {
    const b =
      c.overallScore < 2
        ? "0-2"
        : c.overallScore < 4
          ? "2-4"
          : c.overallScore < 6
            ? "4-6"
            : c.overallScore < 8
              ? "6-8"
              : "8-10";
    buckets[b]!++;
  }
  return Object.entries(buckets).map(([range, count]) => ({ range, count }));
}

export function skillHeatmap() {
  // Top skills × score buckets (low / mid / high)
  const skills = ["Python", "PostgreSQL", "Docker", "AWS", "Kubernetes", "Go"];
  return skills.map((s) => {
    const matching = CANDIDATES.filter((c) => c.skills.includes(s));
    return {
      skill: s,
      low: matching.filter((c) => c.overallScore < 5).length,
      mid: matching.filter((c) => c.overallScore >= 5 && c.overallScore < 7.5)
        .length,
      high: matching.filter((c) => c.overallScore >= 7.5).length,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

export function findCandidate(id: string) {
  return CANDIDATES.find((c) => c.id === id);
}
export function findRole(id: string) {
  return ROLES.find((r) => r.id === id);
}
export function candidatesForRole(roleId: string) {
  return CANDIDATES.filter((c) => c.roleId === roleId);
}
export function getInterviewBySessionId(_sessionId: string) {
  // Single canonical session for the demo
  return PRIYA_INTERVIEW;
}
