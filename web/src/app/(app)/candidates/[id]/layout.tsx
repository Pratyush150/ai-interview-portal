import { CANDIDATES } from "@/lib/mock-data";

// Static export: enumerate all known candidate IDs so each gets a pre-rendered
// shell. The candidate page itself is a client component that fetches via mock-api.
export function generateStaticParams() {
  return CANDIDATES.map((c) => ({ id: c.id }));
}

export default function CandidateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
