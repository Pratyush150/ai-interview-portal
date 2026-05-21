/**
 * Backend client for /api/company endpoints.
 *
 * The FastAPI backend identifies a workspace by its `name` field (not an
 * email). On login we send `{ name, password }`; on signup `{ name, email,
 * password }`. The response carries an `auth_token` that we persist for
 * subsequent authenticated calls (job creation, applications listing).
 *
 * Same base-URL detection as lib/api.ts — falls back to same-origin in
 * production (when FastAPI serves the static export at :8000) and to
 * http://localhost:8000 in dev (when Next.js serves at :3000).
 */

function apiBase(): string {
  if (typeof window === "undefined") return "";
  const override = process.env.NEXT_PUBLIC_API_BASE;
  if (override) return override.replace(/\/$/, "");
  if (window.location.port === "3000") return "http://localhost:8000";
  return "";
}

export interface AuthOk {
  company_id: string;
  auth_token: string;
  name?: string;
  slug?: string;
}

export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function realLogin(name: string, password: string): Promise<AuthOk> {
  // Prefer the slug-aware route so we get `slug` back. Falls back to legacy
  // /api/company/login for older backends.
  const r = await fetch(`${apiBase()}/api/auth/company/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, password }),
  });
  if (r.status === 404) {
    const r2 = await fetch(`${apiBase()}/api/company/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password }),
    });
    if (!r2.ok) {
      const detail = await safeDetail(r2);
      throw new AuthError(r2.status, detail || `Login failed (${r2.status})`);
    }
    return r2.json();
  }
  if (!r.ok) {
    const detail = await safeDetail(r);
    throw new AuthError(r.status, detail || `Login failed (${r.status})`);
  }
  return r.json();
}

export async function realSignup(
  name: string,
  email: string,
  password: string,
): Promise<AuthOk> {
  const r = await fetch(`${apiBase()}/api/company`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  if (!r.ok) {
    const detail = await safeDetail(r);
    throw new AuthError(r.status, detail || `Signup failed (${r.status})`);
  }
  const ok = (await r.json()) as AuthOk;
  // The legacy /api/company endpoint doesn't return a slug. Derive it from
  // the company name so the dashboard can route /c/{slug}/... correctly.
  if (!ok.slug) {
    ok.slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "company";
  }
  return ok;
}

// ─── Candidate auth (separate identity model from companies) ───

export interface CandidateAuthOk {
  candidate_id: string;
  name: string;
  email: string;
  auth_token: string;
}

export async function candidateSignup(
  name: string,
  email: string,
  password: string,
): Promise<CandidateAuthOk> {
  const r = await fetch(`${apiBase()}/api/candidate/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  if (!r.ok) {
    const detail = await safeDetail(r);
    throw new AuthError(r.status, detail || `Signup failed (${r.status})`);
  }
  return r.json();
}

export async function candidateLogin(
  email: string,
  password: string,
): Promise<CandidateAuthOk> {
  const r = await fetch(`${apiBase()}/api/candidate/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) {
    const detail = await safeDetail(r);
    throw new AuthError(r.status, detail || `Sign in failed (${r.status})`);
  }
  return r.json();
}

// ─── Job + apply API used by the new candidate flow ───

export interface JobRow {
  id: string;
  title: string;
  description: string;
  required_skills: string;
  role_family: string;
  seniority: string;
  min_experience_years: number;
  max_experience_years: number;
  department: string;
  employment_type: string;
  status: string;
  company_name: string;
  application_count?: number;
}

export async function fetchJobs(params: {
  role_family?: string;
  skill?: string;
  experience?: number;
  q?: string;
}): Promise<JobRow[]> {
  const sp = new URLSearchParams();
  if (params.role_family) sp.set("role_family", params.role_family);
  if (params.skill) sp.set("skill", params.skill);
  if (params.experience != null && !Number.isNaN(params.experience)) {
    sp.set("min_experience_years", String(params.experience));
    sp.set("max_experience_years", String(params.experience));
  }
  if (params.q) sp.set("q", params.q);
  const r = await fetch(`${apiBase()}/api/jobs?${sp.toString()}`);
  if (!r.ok) throw new AuthError(r.status, `Couldn't load jobs (${r.status})`);
  return r.json();
}

export async function fetchJob(jobId: string): Promise<JobRow> {
  const r = await fetch(`${apiBase()}/api/jobs/${jobId}`);
  if (!r.ok) throw new AuthError(r.status, `Couldn't load job (${r.status})`);
  return r.json();
}

export async function fetchRoleCatalog(): Promise<{
  role_families: { role_family: string; display_name: string; default_skills: string[] }[];
  seniority_tiers: string[];
}> {
  const r = await fetch(`${apiBase()}/api/roles`);
  if (!r.ok) throw new AuthError(r.status, "Couldn't load roles catalog");
  return r.json();
}

export async function applyToJob(
  jobId: string,
  resume: File,
  candidateToken: string,
): Promise<{
  application_id: string;
  invite_token: string;
  candidate_id: string;
  duplicate?: boolean;
}> {
  const fd = new FormData();
  fd.append("resume", resume);
  const r = await fetch(`${apiBase()}/api/jobs/${jobId}/apply`, {
    method: "POST",
    headers: { Authorization: `Bearer ${candidateToken}` },
    body: fd,
  });
  if (!r.ok) {
    const detail = await safeDetail(r);
    throw new AuthError(r.status, detail || `Apply failed (${r.status})`);
  }
  return r.json();
}

export async function fetchMyApplications(token: string) {
  const r = await fetch(`${apiBase()}/api/candidate/me/applications`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new AuthError(r.status, "Couldn't load applications");
  return r.json();
}

// ─── Recruiter side: create + list a company's jobs ───

export interface JobCreatePayload {
  title: string;
  description: string;
  required_skills: string;
  role_family: string;
  seniority: string;
  min_experience_years: number;
  max_experience_years: number;
  department?: string;
  employment_type?: string;
}

export async function createJob(
  companyId: string,
  token: string,
  payload: JobCreatePayload,
): Promise<{ job_id: string; title: string }> {
  const r = await fetch(`${apiBase()}/api/company/${companyId}/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const detail = await safeDetail(r);
    throw new AuthError(r.status, detail || `Couldn't post job (${r.status})`);
  }
  return r.json();
}

export async function fetchCompanyJobs(
  companyId: string,
  token: string,
): Promise<JobRow[]> {
  const r = await fetch(`${apiBase()}/api/company/${companyId}/jobs`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new AuthError(r.status, "Couldn't load company jobs");
  return r.json();
}

export async function fetchCompanyApplications(
  companyId: string,
  token: string,
): Promise<Record<string, unknown>[]> {
  const r = await fetch(`${apiBase()}/api/company/${companyId}/applications`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new AuthError(r.status, "Couldn't load applications");
  return r.json();
}

// ─── Tenant-scoped (slug-aware) endpoints — preferred going forward ───

function tenantHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export interface TenantDashboard {
  company: { id: string; name: string; slug: string };
  active_jobs: number;
  applications: number;
  interviews_started: number;
  interviews_finished: number;
  quota_monthly: number;
}

export async function fetchTenantDashboard(
  slug: string,
  token: string,
): Promise<TenantDashboard> {
  const r = await fetch(`${apiBase()}/api/c/${slug}/dashboard`, {
    headers: tenantHeaders(token),
  });
  if (!r.ok) throw new AuthError(r.status, "Couldn't load dashboard");
  return r.json();
}

export async function fetchTenantJobs(
  slug: string,
  token: string,
): Promise<JobRow[]> {
  const r = await fetch(`${apiBase()}/api/c/${slug}/jobs`, {
    headers: tenantHeaders(token),
  });
  if (!r.ok) throw new AuthError(r.status, "Couldn't load jobs");
  return r.json();
}

export async function createTenantJob(
  slug: string,
  token: string,
  payload: JobCreatePayload,
): Promise<{ job_id: string; title: string }> {
  const r = await fetch(`${apiBase()}/api/c/${slug}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...tenantHeaders(token) },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const detail = await safeDetail(r);
    throw new AuthError(r.status, detail || `Couldn't create job (${r.status})`);
  }
  return r.json();
}

export async function fetchTenantApplications(
  slug: string,
  token: string,
): Promise<Record<string, unknown>[]> {
  const r = await fetch(`${apiBase()}/api/c/${slug}/applications`, {
    headers: tenantHeaders(token),
  });
  if (!r.ok) throw new AuthError(r.status, "Couldn't load applications");
  return r.json();
}

export interface InviteLink {
  application_id: string;
  candidate_name: string | null;
  candidate_email: string | null;
  invite_token: string;
  invite_url: string;
  status: string;
  invite_expires_at: string | null;
  invite_used_at: string | null;
  invite_revoked_at: string | null;
  session_id: string | null;
  session_status: string | null;
  total_score: number | null;
  created_at: string;
}

export async function fetchTenantLinks(
  slug: string,
  jobId: string,
  token: string,
): Promise<InviteLink[]> {
  const r = await fetch(`${apiBase()}/api/c/${slug}/jobs/${jobId}/links`, {
    headers: tenantHeaders(token),
  });
  if (!r.ok) throw new AuthError(r.status, "Couldn't load links");
  return r.json();
}

export interface GenerateLinksPayload {
  candidates?: { name?: string | null; email: string }[];
  count?: number;
  expires_in_days?: number;
  send_email?: boolean;
}

export async function generateTenantLinks(
  slug: string,
  jobId: string,
  token: string,
  payload: GenerateLinksPayload,
): Promise<{ created: InviteLink[]; count: number }> {
  const r = await fetch(`${apiBase()}/api/c/${slug}/jobs/${jobId}/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...tenantHeaders(token) },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const detail = await safeDetail(r);
    throw new AuthError(r.status, detail || `Couldn't generate links (${r.status})`);
  }
  return r.json();
}

export async function revokeTenantLink(
  slug: string,
  inviteToken: string,
  token: string,
): Promise<{ revoked: boolean }> {
  const r = await fetch(
    `${apiBase()}/api/c/${slug}/links/${inviteToken}`,
    { method: "DELETE", headers: tenantHeaders(token) },
  );
  if (!r.ok) {
    const detail = await safeDetail(r);
    throw new AuthError(r.status, detail || `Couldn't revoke link (${r.status})`);
  }
  return r.json();
}

async function safeDetail(r: Response): Promise<string | null> {
  try {
    const j = await r.json();
    if (typeof j?.detail === "string") return j.detail;
    if (typeof j?.message === "string") return j.message;
  } catch {
    /* ignore */
  }
  return null;
}
