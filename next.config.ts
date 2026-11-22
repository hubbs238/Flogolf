import type { NextConfig } from "next";
import { resolveDeployment } from "./config/deployment";
import staging from "./config/staging-public.json";

const deployment = resolveDeployment(process.env, staging);
const nextConfig: NextConfig = {
  // Everything in this map is public and fixed in both server and browser bundles.
  env: {
    FLO_APP_ENV: deployment.stage,
    FLO_PUBLIC_SUPABASE_URL: deployment.url,
    FLO_PUBLIC_SUPABASE_KEY: deployment.key,
  },
  images: {
    remotePatterns: deployment.url ? [{
      protocol: "https",
      hostname: new URL(deployment.url).hostname,
      pathname: "/storage/v1/object/public/**",
    }] : [],
  },
};

export default nextConfig;
