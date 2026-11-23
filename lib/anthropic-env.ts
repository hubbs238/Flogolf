import "server-only";

export const anthropicKeyName = process.env.FLO_APP_ENV === "staging"
  ? "STAGING_ANTHROPIC_API_KEY"
  : "ANTHROPIC_API_KEY";

export function anthropicKey() {
  return process.env[anthropicKeyName];
}
