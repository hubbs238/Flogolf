/**
 * Public Supabase config, with an error that says what to do about it.
 *
 * These MUST be written as literal `process.env.NEXT_PUBLIC_X` member
 * expressions. Next.js exposes public vars to the browser by textually
 * replacing that exact source text with the value at build time. A dynamic
 * lookup such as `process.env[name]` gives the compiler nothing to match, so
 * it survives into the bundle as a real lookup against an object that does
 * not exist in the browser, and reads undefined forever regardless of how
 * the hosting environment is configured.
 *
 * The failure is nasty because it is one sided: server rendering keeps
 * working, since there `process.env` is a genuine object read at runtime.
 * Only the browser breaks, which looks like a deployment or hosting problem
 * rather than a code one.
 *
 * Do not refactor these into a loop or a lookup table.
 */
const URL_VALUE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY_VALUE = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
