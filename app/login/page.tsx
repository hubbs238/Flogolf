import { GoogleSignIn } from "./google-sign-in";
import { MagicLinkForm } from "@/components/magic-link-form";
import { Logo } from "@/components/logo";

const MESSAGES: Record<string, string> = {
  link: "That link expired or was already used. Send yourself a fresh one.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  const errorKey = typeof params.error === "string" ? params.error : null;
  const failed = params.error !== undefined;

  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <Logo size={56} className="rounded-2xl" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Flo Golf Draft
          </h1>
          <p className="mt-2 text-sm text-muted">
            Rate the pool, run the draft, settle it on the course.
          </p>
        </div>

        <GoogleSignIn next={next} />

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <span className="text-xs uppercase tracking-wide text-muted">or</span>
          <span className="h-px flex-1 bg-line" />
        </div>

        <MagicLinkForm />

        {failed && (
          <p className="mt-4 text-center text-sm text-flag-500">
            {(errorKey && MESSAGES[errorKey]) ??
              "That sign in did not go through. Give it another try."}
          </p>
        )}

        <p className="mt-8 text-center text-xs text-muted">
          Your email identifies your ratings so everyone submits once per golfer.
        </p>
      </div>
    </main>
  );
}
