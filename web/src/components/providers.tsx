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

  // forcedTheme="dark" locks the UI to dark regardless of OS or
  // localStorage. We previously relied on defaultTheme="dark" + enableSystem
  // but next-themes' hydration script would strip the `dark` class for
  // users whose OS preferred light, producing the white-flash and
  // white-dropdown bugs. Re-enable the toggle by replacing forcedTheme
  // with defaultTheme.
  return (
    <NextThemesProvider attribute="class" forcedTheme="dark">
      <QueryClientProvider client={client}>
        <TooltipProvider delayDuration={120}>{children}</TooltipProvider>
      </QueryClientProvider>
    </NextThemesProvider>
  );
}
