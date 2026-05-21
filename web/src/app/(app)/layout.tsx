import { Sidebar } from "@/components/app/sidebar";
import { Topbar } from "@/components/app/topbar";
import { CommandPalette } from "@/components/app/command-palette";
import { ShortcutHelp } from "@/components/app/shortcut-help";
import { GlobalKeyboard } from "@/components/app/global-keyboard";
import { RequireRole } from "@/components/app/require-role";
import { RECRUITER_ROLES } from "@/stores/auth-store";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireRole allow={RECRUITER_ROLES}>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
              {children}
            </div>
          </main>
        </div>
        <CommandPalette />
        <ShortcutHelp />
        <GlobalKeyboard />
      </div>
    </RequireRole>
  );
}
