"use server";

import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { VIEW_AS_PLAYER_COOKIE } from "@/lib/view-mode";

/**
 * Switches an admin between their own view and the player view.
 *
 * requireAdmin rather than a bare cookie write: the cookie only ever takes
 * things away, so forging it gains nobody anything, but an action that writes
 * state without checking who is calling is a habit worth not forming.
 */
export async function setViewAsPlayer(on: boolean): Promise<void> {
  await requireAdmin();
  const jar = await cookies();

  if (on) {
    jar.set(VIEW_AS_PLAYER_COOKIE, "1", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  } else {
    jar.delete(VIEW_AS_PLAYER_COOKIE);
  }
}
