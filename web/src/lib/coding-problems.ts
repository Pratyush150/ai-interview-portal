/**
 * Per-role coding problems served at the end of the interview.
 *
 * After the spoken theory rounds wrap up, the candidate gets ONE problem
 * matched (loosely) to the role_family they're interviewing for, and is
 * asked for PSEUDOCODE — not a runnable submission. We don't grade
 * compilation; the engine evaluates the submitted text as another turn.
 *
 * Keeping problems in code (not the DB) is deliberate: the recruiter can
 * add new ones via PR without a schema change, and the candidate UI can
 * fall back to a generic backend problem if their role family isn't in
 * the lookup yet.
 */

export interface CodingProblem {
  title: string;
  prompt: string;
  examples?: { input: string; output: string }[];
  hint?: string;
}

const GENERIC: CodingProblem = {
  title: "Top-K most-frequent words",
  prompt:
    "Given a list of strings, return the K most-frequently occurring strings (ties broken alphabetically). Outline your approach in pseudocode — focus on the data structures, complexity, and edge cases, NOT compilable syntax.",
  examples: [
    { input: '["the", "day", "is", "the", "day"], K=1', output: '["the"]' },
    { input: '["a", "b", "c", "a", "b", "a"], K=2', output: '["a", "b"]' },
  ],
  hint: "A hash map for counts plus a heap of size K is enough. State its O(N log K) bound.",
};

export const CODING_PROBLEMS: Record<string, CodingProblem> = {
  software_engineering: {
    title: "Two-sum follow-up: closest pair to target",
    prompt:
      "Given an array of integers and a target sum, return the PAIR of indices whose values sum closest to the target (use absolute difference as tie-breaker). Outline the approach in pseudocode — discuss data structures, time/space, and how you'd handle duplicates and very large arrays.",
    hint: "Hash map of complements gets you to O(n); a sort + two-pointer is O(n log n) but simpler.",
  },
  fullstack_engineering: {
    title: "Optimistic UI for a like button",
    prompt:
      "Pseudocode the end-to-end flow for an optimistic 'like' on a feed item: client-side state update, async POST, error rollback, and reconciliation if a stale state was rendered. Describe the local cache, the inflight tracker, and the rollback rule. PSEUDOCODE only.",
    hint: "AbortController for racing requests; revert to the server-confirmed state on error, not the pre-click state.",
  },
  genai_engineering: {
    title: "Streaming RAG with context budget",
    prompt:
      "Pseudocode a RAG pipeline that retrieves top-k chunks, fits them into an N-token context budget (longest-fit first with deduplication), and streams the LLM response. Describe the embedding lookup, the dedup step, and what to do when chunks exceed the budget. PSEUDOCODE only.",
    hint: "Embed query → cosine-similarity → MMR for diversity → token-greedy pack → call LLM with streaming.",
  },
  database_engineering: {
    title: "Sliding window join",
    prompt:
      "Pseudocode a 24-hour sliding-window join between an `orders` table and an `events` table on user_id, producing rows where an event happened within 24h before its matching order. Describe indexes, partitioning, and how you'd run this incrementally (not full rescan).",
    hint: "Index (user_id, event_ts); incremental run uses a watermark on event_ts and orders.created_at.",
  },
  cloud_engineering: {
    title: "Cost-aware autoscaler",
    prompt:
      "Pseudocode the decision logic for an autoscaler on a stateless API: scale up when p99 > SLO for 2 consecutive windows, scale down when CPU < 30% AND queue depth < 5 for 10 minutes. Add a cost guardrail capping max instances per env. Describe inputs and the action rule.",
    hint: "Hysteresis matters — different up vs. down thresholds prevent thrash. Always cap to a daily $ budget.",
  },
  mobile_engineering: {
    title: "Offline-first queue with retry",
    prompt:
      "Pseudocode an offline-first action queue for a mobile app: local persistence, FIFO ordering, exponential backoff retry, and conflict handling when the server state diverges. Describe the local record, the syncer loop, and the merge rule.",
    hint: "Persist BEFORE optimistic UI; idempotency keys keep retries safe.",
  },
  machine_learning: {
    title: "Online vs offline training reconciliation",
    prompt:
      "Pseudocode the training/serving consistency for a ranking model: offline batch trains weekly, online learner updates hourly. Describe how the two models converge, what feature parity you guarantee, and the rollback rule if the online learner drifts.",
    hint: "A/B traffic split + shadow scoring + a parity test on a holdout cohort is the standard pattern.",
  },
  devops_engineering: {
    title: "Blue/green deploy guardrails",
    prompt:
      "Pseudocode the deploy script's go/no-go logic: ramp 5% → 25% → 100% with health checks at each stage, automatic rollback on error-rate > 1% sustained for 60s, and a hard freeze if downstream dependency error rate spikes. Describe inputs and the state machine.",
    hint: "Latency p99, error rate, dependency error rate — three independent guardrails; ANY trip → rollback.",
  },
  embedded_systems: {
    title: "ISR-safe ring buffer",
    prompt:
      "Pseudocode a single-producer (ISR) / single-consumer (main loop) ring buffer for sensor samples. Describe the head/tail indices, why writes from the ISR are safe without locks, and what happens on overrun.",
    hint: "If only the producer moves head and only the consumer moves tail, and indices are atomic-aligned, you don't need a mutex.",
  },
  vlsi_engineering: {
    title: "Synchronous FIFO between two clock domains",
    prompt:
      "Pseudocode the control logic for a clock-domain-crossing FIFO with gray-coded pointers and a 2-flop synchronizer on each side. Describe the full / empty signals and how you avoid metastability.",
    hint: "Gray coding ensures only one bit toggles per increment — that's what makes the 2-flop sync safe.",
  },
  electrical_engineering: {
    title: "Closed-loop PI controller",
    prompt:
      "Pseudocode a PI controller for regulating output voltage on a buck converter: input setpoint, measured Vout, sample period, gains Kp and Ki, integrator anti-windup. Describe the loop and the saturation logic.",
    hint: "Clamp the integrator when the actuator saturates — otherwise it winds up and overshoots on recovery.",
  },
  mechanical_engineering: {
    title: "Bolt sizing under combined load",
    prompt:
      "Pseudocode the calculation that picks the smallest bolt grade (M-series, ISO) capable of carrying a known axial preload AND a known shear load with a safety factor of 2.5. Describe inputs, the failure modes you check, and the iteration over standard sizes.",
    hint: "Check tensile (Sy), shear (~0.577×Sy), and bearing — pick the size that satisfies the worst-case.",
  },
  civil_engineering: {
    title: "Rebar requirement for a beam",
    prompt:
      "Pseudocode the calculation that returns the area of tension steel required for a simply-supported RCC beam per IS 456: inputs are span, factored UDL, beam depth, fck, fy. Describe the assumptions, the moment equation, and the section-check at the end.",
    hint: "Mu = 0.87·fy·Ast·(d - 0.42·xu); solve for Ast and then verify the section is under-reinforced.",
  },
  backend_engineering: {
    title: "Idempotent payment-capture API",
    prompt:
      "Sketch (in pseudocode) the server logic for an idempotent /capture endpoint: same Idempotency-Key on retry must not double-charge. Describe the schema you'd use to track keys and the failure modes you guard against. PSEUDOCODE only — focus on the algorithm and data layout.",
    hint: "Mention the unique constraint on (merchant_id, idempotency_key) and what to do on a partial write.",
  },
  frontend_engineering: {
    title: "Debounced typeahead",
    prompt:
      "In pseudocode, design a typeahead component that fires search after 200ms of keystroke quiet, cancels stale in-flight requests, and recovers gracefully on a network error. Outline the state machine — NOT runnable React.",
    hint: "AbortController + a request-token are usually cleaner than a setTimeout race.",
  },
  android_engineering: {
    title: "Offline-first like button",
    prompt:
      "Pseudocode an offline-first 'like' for a feed item: optimistic UI, durable enqueue, retry on reconnect, and conflict resolution if the server state diverged. Don't write Kotlin — describe the queue, the local DB record, and the reconcile step.",
  },
  ios_engineering: {
    title: "Image prefetch for a feed",
    prompt:
      "Pseudocode an image prefetcher for a vertically scrolling feed: cap memory, cancel out-of-window requests, share an in-flight fetch across cells. Describe data structures and the cancellation rule.",
  },
  data_engineering: {
    title: "De-dupe a streaming event log",
    prompt:
      "Pseudocode a streaming dedupe of events keyed by (user_id, action_id) within a 24-hour window. Discuss state size, watermarking, and what happens on a late arrival.",
  },
  data_science: {
    title: "A/B test sample size",
    prompt:
      "In pseudocode + math, outline the sample-size calculation for an A/B test detecting a 2% lift on a 5% baseline conversion at alpha=0.05, power=0.8. Then describe how you'd actually run it (assignment, monitoring, stopping rules).",
  },
  ml_engineering: {
    title: "Online feature freshness",
    prompt:
      "Pseudocode an online feature store read: given a user_id, return the freshest aggregate features for inference with a 5ms p99 budget. Describe the storage choice, TTL strategy, and graceful degradation.",
  },
  devops_sre: {
    title: "Rollback decision logic",
    prompt:
      "Pseudocode the deploy-pipeline guard that decides whether to auto-rollback based on error-rate and latency over a sliding window. Describe inputs, thresholds, and the rollback action.",
  },
  qa_automation: {
    title: "Flaky-test triage",
    prompt:
      "Pseudocode the algorithm that classifies a failing test as 'flaky' vs. 'truly broken' from its last 30 runs across branches. Describe inputs, signals, and the cut-off.",
  },
  security_engineering: {
    title: "Rate limiter for a login endpoint",
    prompt:
      "Pseudocode a per-IP-and-account rate limiter for /login with exponential backoff, lockout, and CAPTCHA escalation. Describe the storage and the failure-open behaviour.",
  },
};

export function getCodingProblem(roleFamily: string | null | undefined): CodingProblem {
  if (!roleFamily) return GENERIC;
  return CODING_PROBLEMS[roleFamily] ?? GENERIC;
}
