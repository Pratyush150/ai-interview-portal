import { format, formatDistanceToNow } from "date-fns";

const IST_TZ = "Asia/Kolkata";

export function rupees(n: number, opts?: { compact?: boolean }) {
  if (opts?.compact) {
    if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
    if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
    if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
    return `₹${n}`;
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function lakhs(n: number) {
  // Indian salary convention: render in LPA
  return `₹${(n / 1_00_000).toFixed(1)} LPA`;
}

export function ist(date: Date | string, fmt = "d MMM, h:mm a") {
  const d = typeof date === "string" ? new Date(date) : date;
  // Render IST regardless of viewer's locale.
  const istDate = new Date(d.toLocaleString("en-US", { timeZone: IST_TZ }));
  return `${format(istDate, fmt)} IST`;
}

export function relative(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
}

export function pct(n: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

export function score(n: number) {
  return n.toFixed(1);
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
