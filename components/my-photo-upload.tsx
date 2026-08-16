"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GolferAvatar } from "./golfer-avatar";
import { createClient } from "@/lib/supabase/client";
import { setMyPhoto } from "@/app/(app)/golfer/[id]/actions";

const MAX_BYTES = 5 * 1024 * 1024;

export function MyPhotoUpload({
  golferId,
  golferName,
  currentPhoto,
}: {
  golferId: string;
  golferName: string;
  currentPhoto: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setError(null);

    if (!file.type.startsWith("image/")) {
      setError("That needs to be an image file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That image is over 5MB. Try a smaller one.");
      return;
    }

    setUploading(true);

    // The folder name is the golfer id, which is what the storage policy
    // checks. Anything written outside your own folder gets rejected.
    const supabase = createClient();
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${golferId}/${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("golfer-photos")
      .upload(path, file, { upsert: true, cacheControl: "3600" });

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    const result = await setMyPhoto(path);
    setUploading(false);

    if (result.ok) router.refresh();
    else setError(result.error);
  }

  function removePhoto() {
    setError(null);
    startTransition(async () => {
      const result = await setMyPhoto(null);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  const busy = uploading || pending;

  return (
    <div className="text-center">
      <div className="mb-4 flex justify-center">
        <GolferAvatar name={golferName} url={currentPhoto} size="lg" />
      </div>

      <p className="font-medium">This is you</p>
      <p className="mt-1 text-sm text-muted">
        Rating yourself is blocked, for reasons everyone understands. You can
        pick your own photo though.
      </p>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) upload(file);
          event.target.value = "";
        }}
      />

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className="rounded-xl bg-fairway-600 px-5 py-2.5 font-medium text-white transition hover:bg-fairway-700 disabled:opacity-60"
        >
          {uploading
            ? "Uploading..."
            : currentPhoto
              ? "Change photo"
              : "Add your photo"}
        </button>

        {currentPhoto && (
          <button
            onClick={removePhoto}
            disabled={busy}
            className="rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-muted transition hover:border-flag-500 hover:text-flag-500 disabled:opacity-60"
          >
            Remove
          </button>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-flag-500/10 px-3 py-2 text-sm text-flag-500">
          {error}
        </p>
      )}
    </div>
  );
}
