import { useQuery } from "@tanstack/react-query";
import {
  ACTIVITY,
  CANDIDATES,
  PRIYA_INTERVIEW,
  ROLES,
  candidatesForRole,
  findCandidate,
  findRole,
  fundFunnelData,
  scoreDistribution,
  skillHeatmap,
  statusCounts,
  timeToHireTrend,
} from "./mock-data";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// All hooks intentionally return after a small delay so skeletons get a chance
// to render — feels more honest and exercises the loading paths.

export function useRoles() {
  return useQuery({
    queryKey: ["roles"],
    queryFn: async () => {
      await delay(180);
      return ROLES;
    },
  });
}

export function useCandidates() {
  return useQuery({
    queryKey: ["candidates"],
    queryFn: async () => {
      await delay(220);
      return CANDIDATES;
    },
  });
}

export function useCandidate(id: string) {
  return useQuery({
    queryKey: ["candidate", id],
    queryFn: async () => {
      await delay(220);
      const c = findCandidate(id);
      if (!c) throw new Error("Candidate not found");
      return c;
    },
  });
}

export function useRole(id: string | undefined) {
  return useQuery({
    queryKey: ["role", id],
    enabled: !!id,
    queryFn: async () => {
      await delay(140);
      return findRole(id!);
    },
  });
}

export function useCandidatesForRole(roleId: string) {
  return useQuery({
    queryKey: ["candidates-for-role", roleId],
    queryFn: async () => {
      await delay(180);
      return candidatesForRole(roleId);
    },
  });
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      await delay(140);
      const counts = statusCounts();
      const active = counts.ai_screened + counts.human_round;
      const pendingReview = counts.shortlisted;
      const hiredThisWeek = counts.hired;
      return {
        active,
        pendingReview,
        avgTimeToShortlistDays: 4.2,
        hiredThisWeek,
      };
    },
  });
}

export function useActivityFeed() {
  return useQuery({
    queryKey: ["activity"],
    queryFn: async () => {
      await delay(160);
      return ACTIVITY;
    },
  });
}

export function useFunnel() {
  return useQuery({
    queryKey: ["funnel"],
    queryFn: async () => {
      await delay(160);
      return fundFunnelData();
    },
  });
}

export function useTimeToHire() {
  return useQuery({
    queryKey: ["time-to-hire"],
    queryFn: async () => {
      await delay(160);
      return timeToHireTrend();
    },
  });
}

export function useScoreDistribution() {
  return useQuery({
    queryKey: ["score-dist"],
    queryFn: async () => {
      await delay(160);
      return scoreDistribution();
    },
  });
}

export function useSkillHeatmap() {
  return useQuery({
    queryKey: ["skill-heatmap"],
    queryFn: async () => {
      await delay(160);
      return skillHeatmap();
    },
  });
}

export function useInterviewSession(sessionId: string) {
  return useQuery({
    queryKey: ["session", sessionId],
    queryFn: async () => {
      await delay(220);
      return PRIYA_INTERVIEW;
    },
  });
}
