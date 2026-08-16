import { getProfiles } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { InvitesAdmin } from "@/components/invites-admin";
import type { AllowedEmail } from "@/lib/types";

export default async function InvitesAdminPage() {
  const supabase = await createClient();

  const [profiles, allowedResult] = await Promise.all([
    getProfiles(),
    supabase
      .from("allowed_emails")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <InvitesAdmin
      allowed={(allowedResult.data ?? []) as AllowedEmail[]}
      profiles={profiles}
    />
  );
}
