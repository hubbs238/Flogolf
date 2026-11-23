import assert from "node:assert/strict";
import { resolveDeployment } from "../config/deployment";

const productionRef = "wiprkjrczqkiadpdmvik";
const productionUrl = `https://${productionRef}.supabase.co`;
const staging = { projectRef: "a".repeat(20), publishableKey: "sb_publishable_test_staging" };
const expected = { stage: "staging", url: `https://${staging.projectRef}.supabase.co`, key: staging.publishableKey };
const inherited = { NEXT_PUBLIC_SUPABASE_URL: productionUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_test_production" };

for (const env of [
  { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "staging" },
  { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature" },
  { VERCEL_TARGET_ENV: "qa" }, { VERCEL: "1" }, { GITHUB_REF_NAME: "staging" },
]) {
  assert.deepEqual(resolveDeployment({ ...inherited, ...env }, staging), expected);
  assert.throws(() => resolveDeployment(env, { ...staging, projectRef: productionRef }));
  assert.throws(() => resolveDeployment(env, { ...staging, publishableKey: "sb_secret_test" }));
}

const production = { ...inherited, VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" };
assert.equal(resolveDeployment(production, staging).url, productionUrl);
const legacyKey = (role: string) => `header.${Buffer.from(JSON.stringify({ ref: productionRef, role })).toString("base64url")}.signature`;
assert.equal(resolveDeployment({ ...production, NEXT_PUBLIC_SUPABASE_ANON_KEY: legacyKey("anon") }, staging).stage, "production");
for (const override of [
  { VERCEL_GIT_COMMIT_REF: "staging" }, { VERCEL_GIT_COMMIT_REF: undefined },
  { VERCEL_TARGET_ENV: "preview" }, { VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "production" },
  { NEXT_PUBLIC_SUPABASE_URL: expected.url }, { NEXT_PUBLIC_SUPABASE_ANON_KEY: staging.publishableKey },
  { NEXT_PUBLIC_SUPABASE_ANON_KEY: legacyKey("service_role") },
]) assert.throws(() => resolveDeployment({ ...production, ...override }, staging));
assert.throws(() => resolveDeployment(inherited, staging));
assert.equal(resolveDeployment({ NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" }, staging).stage, "development");
console.log("Staging, production, and local deployment isolation checks passed.");
