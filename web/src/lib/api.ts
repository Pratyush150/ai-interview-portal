/**
 * Backend client for the live interview flow.
 *
 * In dev (Next.js dev server on :3000), API calls go to http://localhost:8000.
 * In production (Next.js static export served by FastAPI on :8000), the same
 * origin is used so calls go to /api/* directly. The base URL is picked at
 * runtime from window.location, with NEXT_PUBLIC_API_BASE as override.
 */

function apiBase(): string {
  if (typeof window === "undefined") return "";
  const override = process.env.NEXT_PUBLIC_API_BASE;
  if (override) return override.replace(/\/$/, "");
  // Dev: Next on 3000, FastAPI on 8000. Prod: same origin.
  if (window.location.port === "3000") return "http://localhost:8000";
  return "";
}

// Re-export so feature modules (hooks, components) don't each have to
// re-derive the base URL.
export function getApiBase(): string {
  return apiBase();
}

export interface SessionCreateBody {
  candidate_name?: string;
  resume_id?: string;
  job_id?: string;
  invite_token?: string;
  use_structured?: boolean;
  target_duration_min?: number;
}

export interface SessionResponse {
  session_id: string;
  stage: string;
  total_turns: number;
  is_finished: boolean;
  evaluations_count: number;
  avg_score: number | null;
  avg_ai_likelihood: number | null;
  cheating_flags_count: number;
  // Time-budget + interviewer surface
  target_duration_min: number;
  elapsed_min: number;
  remaining_min: number;
  stage_remaining_min: number;
  interviewer_name: string;
  role_family: string;
  seniority: string;
  // True for engineering roles that get an IDE round after the voice
  // interview, false for PM/Sales/HR/Marketing etc. — the frontend skips
  // straight from wrap_up to the report screen when false.
  has_coding_round: boolean;
}

export interface TurnResponse {
  reply: string;
  stage: string;
  total_turns: number;
  is_finished: boolean;
  audio_url: string | null;
  transcript: string | null;
  last_turn_score: number | null;
  elapsed_min: number;
  remaining_min: number;
  stage_remaining_min: number;
}

// ─── Report payload returned by GET /api/session/:id/report ───
export interface ReportEvidence {
  point: string;
  evidence: string;
}
export interface ReportTopic {
  topic: string;
  depth: "shallow" | "adequate" | "strong";
  score: number;
}
export interface ReportSynthesis {
  recommendation: "strong_hire" | "hire" | "lean_hire" | "lean_no" | "no_hire";
  recommendation_reason: string;
  summary_paragraph: string;
  top_strengths: ReportEvidence[];
  top_weaknesses: ReportEvidence[];
  topic_coverage: ReportTopic[];
  dimension_averages: {
    correctness: number;
    depth: number;
    communication: number;
    relevance: number;
  };
  vs_seniority_bar: "below" | "at" | "above";
  ai_integrity_note: string;
  next_round_focus: string[];
}
export interface CodingSubmission {
  title: string;
  language: string;
  code: string;
  score: number | null;
  correctness: number | null;
  depth: number | null;
  communication: number | null;
  relevance: number | null;
  strengths: string[] | null;
  weaknesses: string[] | null;
  notes: string | null;
  ai_likelihood: number | null;
}
export interface ReportEnvelope {
  session_id: string;
  interviewer_name: string;
  role_family: string;
  seniority: string;
  candidate_name: string | null;
  job_title: string;
  target_duration_min: number;
  elapsed_min: number;
  total_turns: number;
  evaluations_count: number;
  avg_score: number | null;
  avg_ai_likelihood: number | null;
  cheating_flags_count: number;
  cheating_flags: Record<string, unknown>[];
  topics_covered: string[];
  interview_brief: Record<string, unknown>;
  evaluations: Array<Record<string, unknown>>;
  coding_submissions?: CodingSubmission[];
  report: ReportSynthesis;
}

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown, message?: string) {
    super(message || `Request failed: ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

export async function createSession(body: SessionCreateBody): Promise<SessionResponse> {
  const r = await fetch(`${apiBase()}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    // Surface FastAPI's `detail` so the caller can branch on structured
    // errors (e.g. {error: "aptitude_required", aptitude_url: ...}).
    const body = await r.json().catch(() => ({}));
    throw new ApiError(r.status, body?.detail ?? body, body?.detail?.message);
  }
  return r.json();
}

export async function getSession(id: string): Promise<SessionResponse> {
  const r = await fetch(`${apiBase()}/api/session/${id}`);
  if (!r.ok) throw new Error(`getSession failed: ${r.status}`);
  return r.json();
}

export async function postAudioTurn(
  sessionId: string,
  audio: Blob,
): Promise<TurnResponse> {
  const fd = new FormData();
  fd.append("audio", audio, "turn.webm");
  const r = await fetch(`${apiBase()}/api/session/${sessionId}/audio-turn`, {
    method: "POST",
    body: fd,
  });
  if (!r.ok) {
    let detail: unknown = null;
    try {
      detail = await r.json();
    } catch {
      /* ignore */
    }
    const err = new Error(`audio-turn ${r.status}`) as Error & {
      status: number;
      detail: unknown;
    };
    err.status = r.status;
    err.detail = detail;
    throw err;
  }
  return r.json();
}

export async function postTextTurn(
  sessionId: string,
  text: string,
  timeToRespondMs = 0,
): Promise<TurnResponse> {
  const r = await fetch(`${apiBase()}/api/session/${sessionId}/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      time_to_respond_ms: timeToRespondMs,
      is_voice_input: false,
    }),
  });
  if (!r.ok) throw new Error(`turn ${r.status}`);
  return r.json();
}

export async function getJobs() {
  const r = await fetch(`${apiBase()}/api/jobs`);
  if (!r.ok) throw new Error(`getJobs failed: ${r.status}`);
  return r.json();
}

export async function getReport(sessionId: string): Promise<ReportEnvelope> {
  const r = await fetch(`${apiBase()}/api/session/${sessionId}/report`);
  if (!r.ok) throw new Error(`getReport failed: ${r.status}`);
  return r.json();
}

export function audioUrl(path: string | null | undefined) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${apiBase()}${path}`;
}
