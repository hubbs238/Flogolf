/**
 * Reads a required public env var, failing with a message that says what to
 * do about it.
 *
 * Without this, a missing variable surfaces as a bare "Internal Server Error"
 * on every route, because proxy.ts builds a Supabase client on each request
 * and throws before anything renders. The generic 500 looks like a broken
 * build rather than a missing setting, which sends you looking in the wrong
 * place entirely.
 */
function required(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `Missing ${name}. Locally, copy .env.local.example to .env.local and fill it in. ` +
        `On Vercel, add it under Settings then Environment Variables, then redeploy. ` +
        `Adding a variable does not update an already running deployment.`,
    );
  }

  return value;
}

export function supabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL");
}

export function supabaseAnonKey(): string {
  return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}
