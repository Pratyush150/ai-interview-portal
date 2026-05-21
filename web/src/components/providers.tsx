"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={client}>
        <TooltipProvider delayDuration={120}>{children}</TooltipProvider>
      </QueryClientProvider>
    </NextThemesProvider>
  );
}
