/**
 * Moving scores from the team they were typed against to the team that
 * actually shot them.
 *
 * The mistake this fixes is a card entered on the wrong row: Team 1's holes
 * typed into Team 2 and the other way about. The players, captains and names
 * are right; only the scores sit on the wrong team. So the scores move and
 * nothing else does.
 *
 * A move is a permutation: every team giving up its card receives exactly one
 * other in return, which covers a straight swap, a three-way rotation, and a
 * card moved onto a team that had none (that team's empty card moves back).
 * Pure, so the rules can be tested without a database.
 */

export type ScoreRow = { team_id: string; hole: number; strokes: number };
export type CardMove = { from: string; to: string };

/** Null when the moves are a valid permutation of this round's teams. */
export function checkMoves(teamIds: string[], moves: CardMove[]): string | null {
  if (moves.length === 0) return "Nothing to move.";
  const known = new Set(teamIds);
  if (!moves.every((m) => known.has(m.from) && known.has(m.to))) {
    return "One of those teams is not in this round. Reload the page and try again.";
  }
  const from = moves.map((m) => m.from);
  const to = moves.map((m) => m.to);
  if (new Set(from).size !== from.length || new Set(to).size !== to.length) {
    return "A card can only go to one team, and a team can only take one card.";
  }
  // Every team that gives a card away must get one back, or a card would be
  // duplicated onto one team while another lost its scores entirely.
  const sources = new Set(from);
  if (!to.every((t) => sources.has(t))) {
    return "Every team that gives up its card has to receive one back.";
  }
  if (moves.every((m) => m.from === m.to)) return "Nothing to move.";
  return null;
}

/**
 * The scores as they should be after the move.
 *
 * `upsert` is every row the moved teams should hold, ready to write in one
 * statement. `prune` says which holes each of those teams keeps, so a hole it
 * held before and its new card does not have can be cleared afterwards.
 */
export function movedScores(
  rows: ScoreRow[],
  moves: CardMove[],
): { upsert: ScoreRow[]; prune: { team_id: string; keep: number[] }[] } {
  const upsert: ScoreRow[] = [];
  const prune: { team_id: string; keep: number[] }[] = [];
  for (const m of moves) {
    if (m.from === m.to) continue;
    const card = rows.filter((r) => r.team_id === m.from);
    for (const r of card) upsert.push({ team_id: m.to, hole: r.hole, strokes: r.strokes });
    prune.push({ team_id: m.to, keep: card.map((r) => r.hole).sort((a, b) => a - b) });
  }
  return { upsert, prune };
}

/**
 * A tie ruling's key after the scores move.
 *
 * A ruling is made about the scores that tied, and the engine keys it by the
 * tied teams' ids, sorted and joined with "+". When the scores move to other
 * teams, the ruling has to move with them or it lands on whoever happens to
 * hold that team id now.
 */
export function movedDecisionKey(key: string, moves: CardMove[]): string {
  const to = new Map(moves.map((m) => [m.from, m.to]));
  return key
    .split("+")
    .map((id) => to.get(id) ?? id)
    .sort()
    .join("+");
}
