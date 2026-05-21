/**
 * Public lead intake — POST /api/leads. No auth.
 */

function apiBase(): string {
  if (typeof window === "undefined") return "";
  const override = process.env.NEXT_PUBLIC_API_BASE;
  if (override) return override.replace(/\/$/, "");
  if (window.location.port === "3000") return "http://localhost:8000";
  return "";
}

export interface LeadPayload {
  kind: "company" | "individual";
  company_name: string | null;
  contact_name: string;
  email: string;
  phone: string | null;
  role_count: number | null;
  use_case: string | null;
  source: string;
}

export async function submitLead(p: LeadPayload): Promise<{ lead_id: string; status: string }> {
  const r = await fetch(`${apiBase()}/api/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p),
  });
  if (!r.ok) {
    let msg = `Lead submission failed (${r.status})`;
    try {
      const j = await r.json();
      if (typeof j?.detail === "string") msg = j.detail;
    } catch {}
    throw new Error(msg);
  }
  return r.json();
}
