"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

export function Toaster(props: ToasterProps) {
  const { theme = "system" } = useTheme();
  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:shadow-sm",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-[var(--primary)] group-[.toast]:text-white",
          cancelButton: "group-[.toast]:bg-secondary group-[.toast]:text-foreground",
        },
      }}
      {...props}
    />
  );
}
