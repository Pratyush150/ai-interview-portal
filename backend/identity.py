"""Identity verification — front-of-funnel gate (Gap 3).

Provider-agnostic. A real integration (Stripe Identity, Persona, Onfido) plugs
in behind `start_verification()` by reading IDENTITY_PROVIDER + its API key from
the environment and returning a hosted-verification URL + reference. Until one
is configured, the built-in 'stub' provider records an immediately-verified
check so the gate and the whole candidate flow are exercisable end-to-end
without external credentials.

Deliberately dependency-free (env only, no network) so importing it is safe
everywhere and never needs API keys at import time.
"""
from __future__ import annotations

import os

# Known providers. Only 'stub' is implemented in-process; the others are
# recognised names a real integration would handle.
_KNOWN = {"stub", "stripe_identity", "persona", "onfido"}


def current_provider() -> str:
    """Which identity provider is configured. Defaults to the in-process stub."""
    p = (os.getenv("IDENTITY_PROVIDER") or "stub").strip().lower()
    return p if p in _KNOWN else "stub"


def is_stub() -> bool:
    return current_provider() == "stub"


def start_verification(application_id: str) -> dict:
    """Begin a verification. Returns {provider, status, reference, redirect_url}.

    Stub provider: returns status='verified' immediately (no external step). A
    real provider would create a session and return status='pending' plus a
    redirect_url to the hosted flow, with a webhook later flipping it to
    'verified'/'failed'.
    """
    provider = current_provider()
    if provider == "stub":
        return {
            "provider": "stub",
            "status": "verified",
            "reference": f"stub_{application_id}",
            "redirect_url": None,
        }
    # Real providers are not wired yet — surface clearly rather than pretending.
    return {
        "provider": provider,
        "status": "pending",
        "reference": None,
        "redirect_url": None,
        "note": f"Provider '{provider}' selected but not yet integrated; set up its API key + webhook.",
    }
