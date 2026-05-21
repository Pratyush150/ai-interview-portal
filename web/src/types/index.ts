export type CandidateStatus =
  | "applied"
  | "ai_screened"
  | "shortlisted"
  | "human_round"
  | "offered"
  | "hired"
  | "rejected";

export type Language =
  | "English"
  | "Hindi"
  | "Tamil"
  | "Telugu"
  | "Marathi"
  | "Bengali"
  | "Kannada";

export type Difficulty = "easy" | "medium" | "hard";

export type InterviewStage =
  | "intro"
  | "background"
  | "core"
  | "follow_up"
  | "wrap_up"
  | "finished";

export interface Role {
  id: string;
  title: string;
  family: string;
  seniority: "intern" | "entry" | "mid" | "senior" | "lead" | "principal";
  department: string;
  location: string;
  minYears: number;
  maxYears: number;
  salaryMin: number;
  salaryMax: number;
  skills: string[];
  openings: number;
  applicants: number;
  createdAt: string;
}

export interface Candidate {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  roleId: string;
  status: CandidateStatus;
  appliedAt: string;
  lastActivityAt: string;
  experienceYears: number;
  currentTitle: string;
  currentCompany: string;
  noticePeriod: string;
  expectedCtc: number;
  languages: Language[];
  skills: string[];
  overallScore: number; // 0-10
  percentile: number; // 0-100
  scoreBreakdown: {
    correctness: number;
    depth: number;
    communication: number;
    relevance: number;
  };
  aiLikelihood: number; // 0-1
  resumeSummary: string;
  highlights: string[];
  strengths: string[];
  improvements: string[];
}

export interface TranscriptTurn {
  id: string;
  speaker: "interviewer" | "candidate";
  text: string;
  timestamp: number; // seconds from session start
  stage: InterviewStage;
  score?: number;
  ai_likelihood?: number;
  topic?: string;
}

export interface CheatFlag {
  id: string;
  type:
    | "tab_switch"
    | "paste_detected"
    | "extension_detected"
    | "phone_suspected"
    | "excessive_motion"
    | "camera_blocked"
    | "suspicious_shortcut";
  timestamp: number;
  severity: "low" | "medium" | "high";
  description: string;
  evidence?: string;
}

export interface InterviewSession {
  id: string;
  candidateId: string;
  roleId: string;
  startedAt: string;
  durationSec: number;
  stage: InterviewStage;
  transcript: TranscriptTurn[];
  cheatFlags: CheatFlag[];
  videoUrl?: string;
  cheatScore: number; // 0-1
}

export interface ActivityEvent {
  id: string;
  type:
    | "application"
    | "interview_completed"
    | "shortlisted"
    | "rejected"
    | "offered"
    | "hired";
  candidateId: string;
  candidateName: string;
  roleId: string;
  roleTitle: string;
  at: string;
  meta?: Record<string, string | number>;
}
