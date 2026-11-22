const productionRef = "wiprkjrczqkiadpdmvik";
const productionUrl = `https://${productionRef}.supabase.co`;
const publishableKey = /^sb_publishable_[A-Za-z0-9_-]+$/;

function isProductionPublicKey(key: string): boolean {
  if (publishableKey.test(key)) return true;
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload.role === "anon" && payload.ref === productionRef;
  } catch {
    return false;
  }
}

type PublicBackend = { projectRef: string; publishableKey: string };

/** The app uses only the public connection selected here at build time. */
export function resolveDeployment(env: Readonly<Record<string, string | undefined>>, staging: PublicBackend) {
  const branch = env.VERCEL_GIT_COMMIT_REF || env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME;
  const target = env.VERCEL_TARGET_ENV || env.VERCEL_ENV;
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") || "";
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  if (target === "production" || env.VERCEL_ENV === "production") {
    if (target !== "production" || (env.VERCEL_ENV && env.VERCEL_ENV !== "production") || branch !== "main") {
      throw new Error("Only main can build for production.");
    }
    if (url !== productionUrl || !isProductionPublicKey(key) || key === staging.publishableKey) {
      throw new Error("Production needs the FLO Golf production Supabase URL and public API key.");
    }
    return { stage: "production", url, key } as const;
  }

  if (env.VERCEL === "1" || target || branch === "staging") {
    if (staging.projectRef === productionRef || !/^[a-z0-9]{20}$/.test(staging.projectRef) ||
        !publishableKey.test(staging.publishableKey)) {
      throw new Error("Set the isolated staging project ref and publishable key in config/staging-public.json.");
    }
    return { stage: "staging", url: `https://${staging.projectRef}.supabase.co`, key: staging.publishableKey } as const;
  }

  if (url === productionUrl) throw new Error("Use an isolated Supabase project for local development.");
  return { stage: "development", url, key } as const;
}
