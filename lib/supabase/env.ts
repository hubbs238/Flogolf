// next.config.ts selects these public values for both the server and browser bundles.
const URL_VALUE = process.env.FLO_PUBLIC_SUPABASE_URL;
const ANON_KEY_VALUE = process.env.FLO_PUBLIC_SUPABASE_KEY;

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Locally, copy .env.local.example to .env.local and fill it in. ` +
        `On Vercel, add it under Settings then Environment Variables with Sensitive ` +
        `unchecked, then redeploy. Adding a variable does not update an already ` +
        `running deployment.`,
    );
  }
  return value;
}

export function supabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL", URL_VALUE);
}

export function supabaseAnonKey(): string {
  return required("NEXT_PUBLIC_SUPABASE_ANON_KEY", ANON_KEY_VALUE);
}
