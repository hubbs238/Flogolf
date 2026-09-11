import { cookies } from "next/headers";

/**
 * Money is admin only, and an admin can switch to the player view to check
 * what everyone else sees.
 *
 * The choice lives in a cookie rather than in the browser because money is
 * dropped on the server, before it is ever serialised into a page. The server
 * is the side that has to know, so localStorage would be no use here.
 *
 * A session cookie, deliberately: an admin who closes the tab comes back to
 * their own view rather than wondering where every dollar went.
 */
export const VIEW_AS_PLAYER_COOKIE = "flo-view-as-player";

export type ViewMode = {
  isAdmin: boolean;
  /** True while an admin is deliberately looking at the player view. */
  asPlayer: boolean;
  /** The single flag every page branches on. */
  showMoney: boolean;
};

/**
 * The decision on its own, with no request attached, so it can be tested.
 *
 * A player is never offered the choice, so the cookie is ignored for them
 * entirely: forging it could only take money away from someone who was never
 * going to be shown any.
 */
export function modeFrom(isAdmin: boolean, cookieValue: string | undefined): ViewMode {
  if (!isAdmin) return { isAdmin: false, asPlayer: false, showMoney: false };
  const asPlayer = cookieValue === "1";
  return { isAdmin: true, asPlayer, showMoney: !asPlayer };
}

/** Pass the admin flag from the session. */
export async function getViewMode(isAdmin: boolean): Promise<ViewMode> {
  if (!isAdmin) return modeFrom(false, undefined);
  const jar = await cookies();
  return modeFrom(true, jar.get(VIEW_AS_PLAYER_COOKIE)?.value);
}
