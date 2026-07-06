import { loginAction } from "@/server/auth-actions";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <div className="card p-6 page-enter">
      <p className="eyebrow mb-1.5">00 · Access</p>
      <h1 className="mb-1 text-xl font-bold tracking-tight">Welcome back</h1>
      <p className="mb-6 text-sm text-text-muted">
        Sign in to open your trading desk.
      </p>
      <AuthForm mode="login" action={loginAction} />
    </div>
  );
}
