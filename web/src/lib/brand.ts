/**
 * Single source of truth for brand strings.
 *
 * The product brand is ApertureAI. Edit this file (and only this file)
 * to rename, change the support email, or set the production domain.
 */

export const BRAND_NAME = "ApertureAI";
export const BRAND_TAGLINE =
  "AI-led interviews that scale with your hiring";
export const BRAND_DESCRIPTION =
  "Voice-first AI interviewer that adapts to role and seniority. Generate candidate links in bulk, review structured reports, hire faster.";

// TODO: production domain — left as a placeholder until we cut the DNS over.
export const BRAND_DOMAIN = "apertureai.com";

// Internal sales address — receives lead-notification emails.
export const SUPPORT_EMAIL = "sales@apertureai.com";
export const CONTACT_EMAIL = "hello@apertureai.com";

// Demo workspace credentials (matches DemoCorp seed in backend/database.py).
export const DEMO_WORKSPACE = "DemoCorp";
export const DEMO_WORKSPACE_SLUG = "democorp";
export const DEMO_PASSWORD = "demo1234";

// Year shown in the footer copyright.
export const BRAND_YEAR = new Date().getFullYear();
