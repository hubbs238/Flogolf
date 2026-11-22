"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GolferAvatar } from "./golfer-avatar";
import { createClient } from "@/lib/supabase/client";
import { displayName } from "@/lib/scoring";
import {
  bulkCreateGolfers,
  createGolfer,
  deleteGolfer,
  golferRounds,
  updateGolfer,
} from "@/app/(app)/admin/actions";
import type { GolferRound } from "@/app/(app)/admin/actions";
import type { Golfer } from "@/lib/types";

type AdminGolfer = Golfer & { photo: string | null };

/**
 * Accepts anything you are likely to paste: one name per line, comma
 * separated, or tab separated (which is what copying out of Excel or
 * Google Sheets actually gives you). Second column becomes the nickname.
 */
function parseRoster(text: string): { name: string; nickname: string }[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const cells = line
        .split(/[\t,]/)
        .map((cell) => cell.trim().replace(/^"|"$/g, ""));
      const name = cells[0] ?? "";
      const nickname = cells[1] ?? "";
      // A row carrying only a nickname still names a real person, so promote
      // it rather than dropping the row on the floor.
      return name ? { name, nickname } : { name: nickname, nickname: "" };
    })
    .filter((row) => {
      const first = row.name.toLowerCase();
      return (
        row.name.length > 0 &&
        first !== "name" &&
        first !== "full name" &&
        first !== "golfer"
      );
    });
}

export function GolfersAdmin({ golfers }: { golfers: AdminGolfer[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await createGolfer(name, nickname);
      if (result.ok) {
        setName("");
        setNickname("");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Golfers</h2>
        <p className="mt-1 text-sm text-muted">
          Everyone here shows on the rankings board and can be rated. When a
          golfer has a nickname, that is what everyone sees. The real name stays
          on this screen so you can tell who is who.
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-raised p-5 shadow-sm">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h3 className="font-medium">Add a golfer</h3>
          <button
            onClick={() => setBulkOpen((v) => !v)}
            className="text-sm text-muted transition hover:text-ink"
          >
            {bulkOpen ? "Add one at a time" : "Add a whole list"}
          </button>
        </div>

        {bulkOpen ? (
          <BulkImport onDone={() => router.refresh()} />
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Full name"
                className="min-w-40 flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 outline-none focus:border-fairway-400"
              />
              <input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="Nickname (optional)"
                className="min-w-40 flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 outline-none focus:border-fairway-400"
              />
              <button
                onClick={add}
                disabled={pending || !name.trim()}
                className="rounded-xl bg-fairway-600 px-5 py-2.5 font-medium text-white transition hover:bg-fairway-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>
            {error && <p className="mt-3 text-sm text-flag-500">{error}</p>}
          </>
        )}
      </div>

      <ul className="mt-6 space-y-2">
        {golfers.map((golfer) => (
          <GolferRow key={golfer.id} golfer={golfer} everyone={golfers} />
        ))}
      </ul>

      {golfers.length === 0 && (
        <p className="mt-6 rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
          No golfers yet. Add the first one above.
        </p>
      )}
    </div>
  );
}

function BulkImport({ onDone }: { onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const parsed = parseRoster(text);

  function submit() {
    setError(null);
    setSummary(null);
    startTransition(async () => {
      const result = await bulkCreateGolfers(parsed);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const parts = [`Added ${result.added}.`];
      if (result.skipped.length > 0) {
        parts.push(
          `Skipped ${result.skipped.length} already in the pool: ${result.skipped.slice(0, 5).join(", ")}${
            result.skipped.length > 5 ? "..." : ""
          }`,
        );
      }
      setSummary(parts.join(" "));
      setText("");
      onDone();
    });
  }

  return (
    <div>
      <p className="mb-2 text-sm text-muted">
        Paste one name per line, or drop in a CSV. A second column becomes the
        nickname. Copying straight out of Excel or Google Sheets works.
      </p>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={7}
        placeholder={"Andrew Hubbard, Hubbs\nCong\nMike Fitzgerald, Fitzy"}
        className="w-full resize-y rounded-xl border border-line bg-surface px-4 py-3 font-mono text-sm outline-none focus:border-fairway-400"
      />

      <input
        ref={fileInput}
        type="file"
        accept=".csv,.tsv,.txt,text/csv,text/plain"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          file.text().then((contents) => setText(contents));
          event.target.value = "";
        }}
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          onClick={submit}
          disabled={pending || parsed.length === 0}
          className="rounded-xl bg-fairway-600 px-5 py-2.5 font-medium text-white transition hover:bg-fairway-700 disabled:opacity-50"
        >
          {pending
            ? "Adding..."
            : parsed.length === 0
              ? "Add golfers"
              : `Add ${parsed.length} ${parsed.length === 1 ? "golfer" : "golfers"}`}
        </button>
        <button
          onClick={() => fileInput.current?.click()}
          className="rounded-xl border border-line px-4 py-2.5 text-sm font-medium transition hover:border-fairway-300"
        >
          Choose a file
        </button>
      </div>

      {parsed.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          First up: {parsed.slice(0, 3).map((r) => displayName(r)).join(", ")}
          {parsed.length > 3 ? `, and ${parsed.length - 3} more` : ""}
        </p>
      )}
      {error && <p className="mt-3 text-sm text-flag-500">{error}</p>}
      {summary && (
        <p className="mt-3 text-sm text-fairway-600 dark:text-fairway-300">
          {summary}
        </p>
      )}
    </div>
  );
}

function GolferRow({ golfer, everyone }: { golfer: AdminGolfer; everyone: AdminGolfer[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Rounds this golfer played in, looked up when Delete is pressed. Null
  // until then, so the plain confirm only shows once the answer is none.
  const [rounds, setRounds] = useState<GolferRound[] | null>(null);
  const [replacements, setReplacements] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  function saveField(field: "name" | "nickname", value: string) {
    const current = field === "name" ? golfer.name : (golfer.nickname ?? "");
    if (value.trim() === current.trim()) return;

    setError(null);
    startTransition(async () => {
      const result = await updateGolfer(golfer.id, {
        [field]: field === "nickname" ? value.trim() || null : value.trim(),
      });
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  async function uploadPhoto(file: File) {
    setError(null);
    setUploading(true);

    const supabase = createClient();
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${golfer.id}/${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("golfer-photos")
      .upload(path, file, { upsert: true, cacheControl: "3600" });

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    const result = await updateGolfer(golfer.id, { image_path: path });
    setUploading(false);

    if (result.ok) router.refresh();
    else setError(result.error);
  }

  function togglePool() {
    startTransition(async () => {
      const result = await updateGolfer(golfer.id, { in_pool: !golfer.in_pool });
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  function startDelete() {
    setError(null);
    setConfirming(true);
    setRounds(null);
    setReplacements({});
    startTransition(async () => {
      setRounds(await golferRounds(golfer.id));
    });
  }

  function cancelDelete() {
    setConfirming(false);
    setRounds(null);
    setReplacements({});
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteGolfer(golfer.id, replacements);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  // Anyone else can step in, in the pool or not: a one-off sub who has since
  // left the pool may well be exactly who played.
  const others = everyone
    .filter((g) => g.id !== golfer.id)
    .sort((a, b) => displayName(a).localeCompare(displayName(b)));
  const playedIn = rounds ?? [];
  const allChosen = playedIn.every((r) => replacements[r.matchId]);

  return (
    <li
      className={`rounded-xl border border-line bg-raised p-3 ${
        golfer.in_pool ? "" : "opacity-60"
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <GolferAvatar
          name={displayName(golfer)}
          url={golfer.photo}
          size="sm"
        />

        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          <input
            defaultValue={golfer.name}
            onBlur={(event) => saveField("name", event.target.value)}
            aria-label="Full name"
            className="min-w-32 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm font-medium outline-none transition hover:border-line focus:border-fairway-400 focus:bg-surface"
          />
          <input
            defaultValue={golfer.nickname ?? ""}
            onBlur={(event) => saveField("nickname", event.target.value)}
            placeholder="Nickname"
            aria-label="Nickname"
            className="min-w-32 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm text-muted outline-none transition placeholder:text-muted/60 hover:border-line focus:border-fairway-400 focus:bg-surface focus:text-ink"
          />
        </div>

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) uploadPhoto(file);
            event.target.value = "";
          }}
        />

        <button
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition hover:border-fairway-300 disabled:opacity-50"
        >
          {uploading
            ? "Uploading..."
            : golfer.image_path
              ? "Change photo"
              : "Add photo"}
        </button>

        <button
          onClick={togglePool}
          disabled={pending}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition hover:border-fairway-300 disabled:opacity-50"
        >
          {golfer.in_pool ? "In pool" : "Out of pool"}
        </button>

        {confirming ? (
          rounds === null ? (
            <span className="px-2 text-xs text-muted">Checking their rounds…</span>
          ) : rounds.length === 0 ? (
            <span className="flex items-center gap-2 text-xs">
              <button
                onClick={remove}
                disabled={pending}
                className="rounded-lg bg-flag-500 px-3 py-1.5 font-medium text-white"
              >
                Delete for good
              </button>
              <button onClick={cancelDelete} className="text-muted">
                Cancel
              </button>
            </span>
          ) : null
        ) : (
          <button
            onClick={startDelete}
            className="px-2 text-xs text-muted transition hover:text-flag-500"
          >
            Delete
          </button>
        )}
      </div>

      {confirming && playedIn.length > 0 && (
        <div className="mt-3 rounded-xl border border-flag-500/40 bg-flag-500/5 p-3 text-sm">
          <p className="font-medium text-flag-500">
            {displayName(golfer)} played in {playedIn.length} round
            {playedIn.length === 1 ? "" : "s"}.
          </p>
          <p className="mt-1 text-xs text-muted">
            Deleting them would take them off{" "}
            {playedIn.length === 1 ? "that round" : "those rounds"}, which shrinks
            the bay and changes everyone&apos;s money and points. Pick who takes
            their place in each. The replacement keeps their spot, team and
            captaincy, and the scores stay exactly as entered.
          </p>

          {playedIn.length > 1 && (
            <label className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted">Same person for every round:</span>
              <select
                value=""
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) return;
                  // Only where they are free to play; a round they already
                  // played in keeps whatever was chosen there.
                  setReplacements((prev) => {
                    const next = { ...prev };
                    for (const r of playedIn) {
                      if (!r.taken.includes(id)) next[r.matchId] = id;
                    }
                    return next;
                  });
                }}
                className="rounded-lg border border-line bg-surface px-2 py-1 outline-none focus:border-fairway-400"
              >
                <option value="">Choose…</option>
                {others.map((g) => (
                  <option key={g.id} value={g.id}>{displayName(g)}</option>
                ))}
              </select>
            </label>
          )}

          <ul className="mt-3 space-y-2">
            {playedIn.map((r) => (
              <li key={r.matchId} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 basis-48">
                  <span className="font-medium text-ink">{r.name}</span>
                  <span className="text-muted">
                    {" · "}{r.teamName}{r.isCaptain && " (captain)"}
                    {r.status === "complete" && " · final"}
                  </span>
                </span>
                <select
                  value={replacements[r.matchId] ?? ""}
                  onChange={(e) =>
                    setReplacements((prev) => ({ ...prev, [r.matchId]: e.target.value }))
                  }
                  className="rounded-lg border border-line bg-surface px-2 py-1 outline-none focus:border-fairway-400"
                >
                  <option value="">Swap in…</option>
                  {others
                    .filter((g) => !r.taken.includes(g.id))
                    .map((g) => (
                      <option key={g.id} value={g.id}>{displayName(g)}</option>
                    ))}
                </select>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
            <button
              onClick={remove}
              disabled={pending || !allChosen}
              className="rounded-lg bg-flag-500 px-3 py-1.5 font-medium text-white disabled:opacity-50"
            >
              {pending ? "Swapping…" : "Swap them in and delete"}
            </button>
            <button onClick={cancelDelete} className="text-muted">
              Cancel
            </button>
            {!allChosen && (
              <span className="text-muted">Choose a replacement for every round first.</span>
            )}
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-flag-500">{error}</p>}
      {golfer.nickname && (
        <p className="mt-1.5 px-2 text-xs text-muted">
          Shown to everyone as{" "}
          <span className="font-medium text-ink">{golfer.nickname}</span>
        </p>
      )}
    </li>
  );
}
