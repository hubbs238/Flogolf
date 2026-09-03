export type Characteristic = {
  id: string;
  key: string;
  label: string;
  /** Helper line shown under the slider on the rating form. Admin editable. */
  description: string | null;
  weight: number;
  sort_order: number;
  active: boolean;
};

export type Golfer = {
  id: string;
  name: string;
  nickname: string | null;
  image_path: string | null;
  in_pool: boolean;
  created_at: string;
};

export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  is_approved: boolean;
  golfer_id: string | null;
  created_at: string;
};

export type AllowedEmail = {
  email: string;
  label: string | null;
  invited_by: string | null;
  created_at: string;
};

export type CategoryAverage = {
  golfer_id: string;
  characteristic_id: string;
  characteristic_key: string;
  avg_score: number | null;
  score_count: number;
};

/** A golfer with scores resolved and the overall computed. */
export type ScoredGolfer = Golfer & {
  overall: number | null;
  ratingCount: number;
  /** characteristic id -> average score, null when nobody has rated it */
  scores: Record<string, number | null>;
};

export type DraftStrategy = "overall" | "balanced";
export type DraftMode = "mock" | "live";
export type DraftStatus = "setup" | "in_progress" | "complete";

export type Draft = {
  id: string;
  name: string;
  draft_date: string;
  mode: DraftMode;
  strategy: DraftStrategy;
  team_count: number;
  roster_size: number;
  status: DraftStatus;
  current_pick: number;
  created_by: string | null;
  created_at: string;
};

export type DraftTeam = {
  id: string;
  draft_id: string;
  name: string;
  slot: number;
  captain_golfer_id: string | null;
  captain_user_id: string | null;
};

export type DraftPick = {
  id: string;
  draft_id: string;
  team_id: string;
  golfer_id: string;
  round: number;
  pick_number: number;
  made_by: string | null;
  created_at: string;
};

// ---------------------------------------------------------------- matches

export type MatchStatus = "setup" | "filling" | "in_progress" | "complete";

export type Match = {
  id: string;
  name: string;
  course: string;
  match_date: string;
  team_count: number;
  roster_size: number;
  dollars_per_unit: number;
  /** Null means the side game follows the main rate. */
  fb18_dollars_per_unit: number | null;
  /** Per segment overrides. Null falls back to fb18_dollars_per_unit. */
  fb18_front_dollars_per_unit: number | null;
  fb18_back_dollars_per_unit: number | null;
  fb18_total_dollars_per_unit: number | null;
  tie_default: "hole" | "set";
  status: MatchStatus;
  created_by: string | null;
  created_at: string;
};

export type MatchTeam = {
  id: string;
  match_id: string;
  slot: number;
  name: string;
  captain_golfer_id: string | null;
  captain_user_id: string | null;
  in_fb18: boolean;
};

export type MatchPlayer = {
  match_id: string;
  team_id: string;
  golfer_id: string;
  slot: number;
};

export type MatchPayout = { match_id: string; position: number; units: number };

export type Fb18Payout = {
  match_id: string;
  segment: "front" | "back" | "total";
  position: number;
  units: number;
};

export type HoleScore = {
  match_id: string;
  team_id: string;
  hole: number;
  strokes: number;
  updated_by: string | null;
  updated_at: string;
};

export type TieDecision = {
  id: string;
  match_id: string;
  segment: number;
  block_key: string;
  choice: "hole" | "set";
};
