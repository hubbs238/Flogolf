import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getMyRating, getScoredGolfers, photoUrl } from "@/lib/data";
import { GolferAvatar } from "@/components/golfer-avatar";
import { RatingForm } from "@/components/rating-form";
import { MyPhotoUpload } from "@/components/my-photo-upload";
import { displayName } from "@/lib/scoring";

export default async function GolferPage({ params }: PageProps<"/golfer/[id]">) {
  const { id } = await params;
  const session = await requireUser();
  const { golfers, characteristics } = await getScoredGolfers();

  const golfer = golfers.find((g) => g.id === id);
  if (!golfer) notFound();

  const isSelf = session.profile?.golfer_id === golfer.id;
  const existing = isSelf ? null : await getMyRating(session.userId, golfer.id);

  return (
    <div>
      <Link
        href="/"
        className="mb-6 inline-block text-sm text-muted transition hover:text-ink"
      >
        ← Back to rankings
      </Link>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <section>
          <div className="flex items-center gap-5">
            <GolferAvatar
              name={displayName(golfer)}
              url={photoUrl(golfer.image_path)}
              size="lg"
            />
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">
                {displayName(golfer)}
              </h1>
              <p className="mt-1 text-sm text-muted">
                {golfer.ratingCount === 0
                  ? "No ratings yet"
                  : `${golfer.ratingCount} ${golfer.ratingCount === 1 ? "rating" : "ratings"} submitted`}
              </p>
            </div>
            <div className="ml-auto text-right">
              <div className="text-4xl font-semibold tabular-nums">
                {golfer.overall ?? "—"}
              </div>
              <div className="text-xs uppercase tracking-wide text-muted">
                Overall
              </div>
            </div>
          </div>

          <dl className="mt-8 space-y-4">
            {characteristics.map((c) => {
              const score = golfer.scores[c.id];
              return (
                <div key={c.id}>
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <dt className="font-medium">{c.label}</dt>
                    <dd className="text-lg font-semibold tabular-nums">
                      {score ?? "—"}
                    </dd>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-fairway-500"
                      style={{ width: `${score ?? 0}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </dl>
        </section>

        <aside className="rounded-2xl border border-line bg-raised p-6 shadow-sm">
          {isSelf ? (
            <MyPhotoUpload
              golferId={golfer.id}
              golferName={displayName(golfer)}
              currentPhoto={photoUrl(golfer.image_path)}
            />
          ) : (
            <RatingForm
              golferId={golfer.id}
              golferName={displayName(golfer)}
              characteristics={characteristics}
              existing={existing?.scores ?? null}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
