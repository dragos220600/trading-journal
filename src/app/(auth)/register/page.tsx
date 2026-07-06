import { registerAction } from "@/server/auth-actions";
import { AuthForm } from "@/components/auth-form";

export default function RegisterPage() {
  return (
    <div className="card p-6 page-enter">
      <p className="eyebrow mb-1.5">00 · Access</p>
      <h1 className="mb-1 text-xl font-bold tracking-tight">
        Create your desk
      </h1>
      <p className="mb-6 text-sm text-text-muted">
        Your trades, journal and playbook — private to your account.
      </p>
      <AuthForm
        mode="register"
        action={registerAction}
        requireInvite={Boolean(process.env.REGISTRATION_CODE)}
      />
    </div>
  );
}
