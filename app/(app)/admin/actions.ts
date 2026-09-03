"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function revalidateBoard() {
  revalidatePath("/");
  revalidatePath("/admin");
}

// ---------------------------------------------------------------- weights

export async function updateWeights(
  weights: Record<string, number>,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  for (const [, weight] of Object.entries(weights)) {
    if (!Number.isFinite(weight) || weight < 0) {
      return { ok: false, error: "Weights cannot be negative." };
    }
  }

  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
  if (total <= 0) {
    return { ok: false, error: "At least one category needs a weight above zero." };
  }

  const results = await Promise.all(
    Object.entries(weights).map(([id, weight]) =>
      supabase.from("characteristics").update({ weight }).eq("id", id),
    ),
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, error: failed.error.message };

  revalidateBoard();
  return { ok: true };
}

/**
 * Rename a category or reword its helper text.
 *
 * The `key` is deliberately left alone. It is the stable identifier the rest
 * of the system leans on, so renaming Accuracy to Consistency changes what
 * everyone reads without disturbing a single stored rating.
 */
export async function updateCharacteristic(
  id: string,
  fields: { label?: string; description?: string | null },
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const update: Record<string, unknown> = {};

  if (fields.label !== undefined) {
    const trimmed = fields.label.trim();
    if (!trimmed) return { ok: false, error: "A category needs a name." };
    update.label = trimmed;
  }
  if (fields.description !== undefined) {
    update.description = fields.description?.trim() || null;
  }

  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await supabase
    .from("characteristics")
    .update(update)
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidateBoard();
  return { ok: true };
}

export async function addCharacteristic(
  label: string,
  weight: number,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const trimmed = label.trim();
  if (!trimmed) return { ok: false, error: "Give the category a name." };

  const { data: existing } = await supabase
    .from("characteristics")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);

  const { error } = await supabase.from("characteristics").insert({
    key: slugify(trimmed),
    label: trimmed,
    weight: Number.isFinite(weight) && weight >= 0 ? weight : 10,
    sort_order: (existing?.[0]?.sort_order ?? 0) + 1,
  });

  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? "That category already exists." : error.message,
    };
  }

  revalidateBoard();
  return { ok: true };
}

export async function setCharacteristicActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("characteristics")
    .update({ active })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidateBoard();
  return { ok: true };
}

// ---------------------------------------------------------------- golfers

export async function createGolfer(
  name: string,
  nickname: string,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "A golfer needs a name." };

  const { error } = await supabase.from("golfers").insert({
    name: trimmed,
    nickname: nickname.trim() || null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  revalidatePath("/admin/golfers");
  return { ok: true };
}

export type BulkResult =
  | { ok: true; added: number; skipped: string[] }
  | { ok: false; error: string };

/**
 * Bulk add from a pasted list or a spreadsheet export.
 * Names already in the pool are skipped rather than duplicated, so running
 * the same list twice is harmless.
 */
export async function bulkCreateGolfers(
  rows: { name: string; nickname: string }[],
): Promise<BulkResult> {
  await requireAdmin();
  const supabase = await createClient();

  const cleaned = rows
    .map((row) => ({
      name: row.name.trim(),
      nickname: row.nickname.trim(),
    }))
    .filter((row) => row.name.length > 0);

  if (cleaned.length === 0) {
    return { ok: false, error: "No names found in that list." };
  }
  if (cleaned.length > 300) {
    return { ok: false, error: "That is over 300 names. Split it into batches." };
  }

  const { data: existing } = await supabase
    .from("golfers")
    .select("name, nickname");

  // Keyed on name plus nickname, not name alone. Two different people really
  // can share a first name, and collapsing them would quietly lose one.
  const key = (name: string, nickname: string) =>
    `${name.toLowerCase()}|${nickname.toLowerCase()}`;

  const taken = new Set(
    (existing ?? []).map((g: { name: string; nickname: string | null }) =>
      key(g.name, g.nickname ?? ""),
    ),
  );

  const skipped: string[] = [];
  const toInsert: { name: string; nickname: string | null }[] = [];
  const seen = new Set<string>();

  for (const row of cleaned) {
    const rowKey = key(row.name, row.nickname);
    if (taken.has(rowKey) || seen.has(rowKey)) {
      skipped.push(row.name);
      continue;
    }
    seen.add(rowKey);
    toInsert.push({ name: row.name, nickname: row.nickname || null });
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from("golfers").insert(toInsert);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/admin/golfers");
  return { ok: true, added: toInsert.length, skipped };
}

export async function updateGolfer(
  id: string,
  fields: { name?: string; nickname?: string | null; in_pool?: boolean; image_path?: string | null },
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  if (fields.name !== undefined && !fields.name.trim()) {
    return { ok: false, error: "A golfer needs a name." };
  }

  const { error } = await supabase.from("golfers").update(fields).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  revalidatePath("/admin/golfers");
  revalidatePath(`/golfer/${id}`);
  return { ok: true };
}

export async function deleteGolfer(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("golfers").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  revalidatePath("/admin/golfers");
  return { ok: true };
}

// ---------------------------------------------------------------- people

export async function setAdminFlag(
  profileId: string,
  isAdmin: boolean,
): Promise<ActionResult> {
  const session = await requireAdmin();
  const supabase = await createClient();

  // Losing every admin would lock the app's settings away for good.
  if (!isAdmin && profileId === session.userId) {
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_admin", true);

    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        error: "You are the only admin. Promote someone else first.",
      };
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({ is_admin: isAdmin })
    .eq("id", profileId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/users");
  return { ok: true };
}

// ---------------------------------------------------------------- invites

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type InviteResult =
  | { ok: true; added: number; skipped: string[] }
  | { ok: false; error: string };

/**
 * Adds addresses to the allowlist. Anyone who already signed in and got
 * parked on the pending screen is approved on the spot, so you do not have
 * to chase them down in two places.
 */
export async function addAllowedEmails(raw: string): Promise<InviteResult> {
  const session = await requireAdmin();
  const supabase = await createClient();

  const candidates = raw
    .split(/[\s,;]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (candidates.length === 0) {
    return { ok: false, error: "Enter at least one email address." };
  }

  const invalid = candidates.filter((email) => !EMAIL_PATTERN.test(email));
  if (invalid.length > 0) {
    return {
      ok: false,
      error: `That does not look like an email address: ${invalid.slice(0, 3).join(", ")}`,
    };
  }

  const unique = [...new Set(candidates)];

  const { data: existing } = await supabase
    .from("allowed_emails")
    .select("email");
  const already = new Set(
    (existing ?? []).map((row: { email: string }) => row.email),
  );

  const fresh = unique.filter((email) => !already.has(email));
  const skipped = unique.filter((email) => already.has(email));

  if (fresh.length > 0) {
    const { error } = await supabase.from("allowed_emails").insert(
      fresh.map((email) => ({
        email,
        invited_by: session.userId,
      })),
    );
    if (error) return { ok: false, error: error.message };

    // Catch anyone who signed in before you got around to inviting them.
    await supabase
      .from("profiles")
      .update({ is_approved: true })
      .in("email", fresh);
  }

  revalidatePath("/admin/invites");
  return { ok: true, added: fresh.length, skipped };
}

export async function removeAllowedEmail(email: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("allowed_emails")
    .delete()
    .eq("email", email.toLowerCase());

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/invites");
  return { ok: true };
}

export async function setApproved(
  profileId: string,
  approved: boolean,
): Promise<ActionResult> {
  const session = await requireAdmin();
  const supabase = await createClient();

  if (!approved && profileId === session.userId) {
    return { ok: false, error: "You cannot revoke your own access." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ is_approved: approved })
    .eq("id", profileId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/invites");
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function linkProfileToGolfer(
  profileId: string,
  golferId: string | null,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({ golfer_id: golferId })
    .eq("id", profileId);

  if (error) {
    return {
      ok: false,
      error:
        error.code === "23505"
          ? "That golfer is already linked to another login."
          : error.message,
    };
  }

  revalidatePath("/admin/users");
  revalidatePath("/");
  return { ok: true };
}

// ---------------------------------------------------------------- diagnostics

export type EnvReport = {
  anthropicKeyPresent: boolean;
  anthropicKeyLength: number;
  anthropicKeyPrefix: string;
  /** Names only, never values. Catches typos and stray whitespace. */
  anthropicLikeNames: string[];
  supabaseUrlPresent: boolean;
  nodeEnv: string;
  vercelEnv: string;
};

/**
 * Reports what the running server can actually see.
 *
 * Names and lengths only, never a value. This exists because a missing
 * environment variable is indistinguishable from a misnamed one from the
 * outside, and we have now lost time to both.
 */
export async function readEnvReport(): Promise<EnvReport> {
  await requireAdmin();

  const key = process.env.ANTHROPIC_API_KEY ?? "";

  return {
    anthropicKeyPresent: key.length > 0,
    anthropicKeyLength: key.length,
    anthropicKeyPrefix: key.slice(0, 7),
    anthropicLikeNames: Object.keys(process.env)
      .filter((n) => /anthropic|claude/i.test(n))
      .sort(),
    supabaseUrlPresent: (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").length > 0,
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    vercelEnv: process.env.VERCEL_ENV ?? "not on Vercel",
  };
}

export type KeyTest = { ok: true; model: string } | { ok: false; error: string };

/** Makes the smallest possible real call, to prove the key works end to end. */
export async function testAnthropicKey(): Promise<KeyTest> {
  await requireAdmin();

  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "ANTHROPIC_API_KEY is not visible to the server." };
  }

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 16,
      messages: [{ role: "user", content: "Reply with the single word: ok" }],
    });
    return { ok: true, model: response.model };
  } catch (error) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    if (error instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: "The key is present but was rejected. Check it was copied whole." };
    }
    if (error instanceof Anthropic.PermissionDeniedError) {
      return { ok: false, error: "Key accepted but lacks permission. Check the workspace it belongs to." };
    }
    if (error instanceof Anthropic.RateLimitError) {
      return { ok: false, error: "Rate limited, which means the key works. Try again shortly." };
    }
    if (error instanceof Anthropic.APIError) {
      return { ok: false, error: `API error ${error.status}: ${error.message}` };
    }
    return { ok: false, error: error instanceof Error ? error.message : "Unknown failure." };
  }
}

export type SchemaCheck = {
  migration: string;
  what: string;
  present: boolean;
  detail: string;
};

/**
 * Reports which migrations have actually reached the database.
 *
 * Deploying code and running a migration are separate steps, and a database
 * that is behind the code fails in ways that read as unrelated bugs: a
 * missing column surfaces as "cannot find", a stale constraint as a rejected
 * score. Probing for a marker from each migration turns that into a list.
 *
 * Each check selects one column or calls one function and reads the error
 * code, which is the only schema introspection PostgREST exposes.
 */
export async function readSchemaReport(): Promise<SchemaCheck[]> {
  await requireAdmin();
  const supabase = await createClient();

  const column = async (
    migration: string,
    table: string,
    col: string,
  ): Promise<SchemaCheck> => {
    const { error } = await supabase.from(table).select(col).limit(1);
    const missing =
      !!error && /does not exist|schema cache|PGRST204|PGRST205|42703/i.test(
        `${error.code} ${error.message}`,
      );
    return {
      migration,
      what: `${table}.${col}`,
      present: !missing,
      detail: missing ? (error?.message ?? "missing") : "present",
    };
  };

  const fn = async (
    migration: string,
    name: string,
    args: Record<string, unknown>,
  ): Promise<SchemaCheck> => {
    const { error } = await supabase.rpc(name, args);
    const missing = error?.code === "PGRST202";
    return {
      migration,
      what: `${name}()`,
      present: !missing,
      detail: missing ? "function does not exist" : "present",
    };
  };

  return Promise.all([
    fn("0004", "is_approved", {}),
    column("0005", "characteristics", "description"),
    fn("0006", "set_my_photo", { p_image_path: null }),
    column("0007", "matches", "team_count"),
    column("0010", "matches", "fb18_dollars_per_unit"),
    column("0012", "matches", "fb18_front_dollars_per_unit"),
    column("0012", "matches", "fb18_total_dollars_per_unit"),
  ]);
}
