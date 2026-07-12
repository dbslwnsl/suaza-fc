"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  regenerateInviteCode,
  updateTeamName,
  uploadTeamEmblem,
} from "@/lib/teams/team-settings-actions";

export default function TeamSettingsForm({
  initialName,
  emblemUrl,
  inviteCode,
}: {
  initialName: string;
  emblemUrl: string | null;
  inviteCode: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState(inviteCode);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = (fn: () => Promise<void>) => {
    setError(null);
    setMessage(null);
    startTransition(fn);
  };

  const saveName = () =>
    run(async () => {
      const res = await updateTeamName(name);
      if (!res.ok) return setError(res.error ?? "저장 실패");
      setMessage("팀 이름이 변경되었습니다");
      router.refresh();
    });

  const uploadEmblem = () =>
    run(async () => {
      const file = fileRef.current?.files?.[0];
      if (!file) return;
      const fd = new FormData();
      fd.append("emblem", file);
      const res = await uploadTeamEmblem(fd);
      if (fileRef.current) fileRef.current.value = "";
      if (!res.ok) return setError(res.error ?? "업로드 실패");
      setMessage("엠블럼이 변경되었습니다");
      router.refresh();
    });

  const regenerate = () =>
    run(async () => {
      if (
        !confirm(
          "초대코드를 재발급할까요? 기존 코드는 즉시 사용할 수 없게 됩니다.",
        )
      )
        return;
      const res = await regenerateInviteCode();
      if (!res.ok || !res.code) return setError(res.error ?? "재발급 실패");
      setCode(res.code);
      setMessage("초대코드가 재발급되었습니다");
    });

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard 미지원 — 무시 (사용자가 직접 복사)
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</p>
      )}
      {message && (
        <p className="p-3 bg-green-50 text-green-700 rounded-lg text-sm">
          {message}
        </p>
      )}

      {/* ── 팀 이름 ── */}
      <section className="flex flex-col gap-2">
        <h2 className="font-bold text-suaza-ink">팀 이름</h2>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-suaza-border text-sm focus:outline-none focus:border-suaza-button"
          />
          <button
            type="button"
            disabled={isPending || !name.trim() || name.trim() === initialName}
            onClick={saveName}
            className="shrink-0 px-4 py-2 rounded-lg bg-suaza-button text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            저장
          </button>
        </div>
      </section>

      <div aria-hidden className="h-px bg-suaza-border" />

      {/* ── 엠블럼 ── */}
      <section className="flex flex-col gap-2">
        <h2 className="font-bold text-suaza-ink">엠블럼</h2>
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center shrink-0">
            {emblemUrl ? (
              <Image
                src={emblemUrl}
                alt="팀 엠블럼"
                fill
                sizes="64px"
                className="object-cover"
              />
            ) : (
              <span className="text-2xl font-bold text-suaza-ink">
                {initialName.charAt(0)}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={uploadEmblem}
              className="sr-only"
              id="emblem-file"
            />
            <button
              type="button"
              disabled={isPending}
              onClick={() => fileRef.current?.click()}
              className="self-start px-4 py-2 rounded-lg border border-suaza-border text-sm font-medium text-suaza-ink hover:bg-gray-50 transition disabled:opacity-40"
            >
              이미지 업로드
            </button>
            <span className="text-[11px] text-suaza-ink-faint">
              정사각형 권장 · JPG/PNG/WEBP · 5MB 이하
            </span>
          </div>
        </div>
      </section>

      <div aria-hidden className="h-px bg-suaza-border" />

      {/* ── 초대코드 ── */}
      <section className="flex flex-col gap-2">
        <h2 className="font-bold text-suaza-ink">초대코드</h2>
        <p className="text-xs text-suaza-ink-muted -mt-1">
          이 코드를 알려주면 가입 화면의 &quot;초대코드로 가입&quot;에서 우리
          팀에 신청할 수 있어요. (승인은 여전히 필요)
        </p>
        <div className="flex items-center gap-2">
          <span className="px-4 py-2 rounded-lg bg-suaza-bg font-mono text-lg font-bold tracking-[0.3em] text-suaza-ink">
            {code}
          </span>
          <button
            type="button"
            onClick={copyCode}
            className="shrink-0 px-3 py-2 rounded-lg border border-suaza-border text-sm text-suaza-ink hover:bg-gray-50 transition"
          >
            {copied ? "복사됨!" : "복사"}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={regenerate}
            className="shrink-0 px-3 py-2 rounded-lg border border-suaza-border text-sm text-suaza-ink-muted hover:bg-gray-50 transition disabled:opacity-40"
          >
            재발급
          </button>
        </div>
      </section>
    </div>
  );
}
