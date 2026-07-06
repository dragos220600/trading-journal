import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Already signed in? Straight to the desk.
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent-soft to-accent-fill font-bold text-accent-ink shadow-[0_0_18px_-4px_rgba(34,211,238,0.6)]"
            aria-hidden
          >
            L
          </span>
          <div className="leading-tight">
            <span className="block font-bold tracking-wide">LEDGER</span>
            <span className="num block text-[10px] tracking-[0.18em] text-text-faint">
              V1.0 · TERMINAL
            </span>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
