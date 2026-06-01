"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { uploadAvatar } from "./actions";
import AvatarBadges from "@/components/avatar-badges";
import type { MemberBadge } from "@/lib/members/badges";

const MAX_DIMENSION = 512;
const JPEG_QUALITY = 0.85;

export default function AvatarUpload({
  profileId,
  src,
  name,
  canEdit,
  titleBadges = [],
  awardBadges = [],
}: {
  profileId: string;
  src: string | null;
  name: string;
  canEdit: boolean;
  titleBadges?: MemberBadge[];
  awardBadges?: MemberBadge[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!canEdit) {
    return (
      <div className="relative inline-block">
        <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center">
          <AvatarContent src={src} name={name} />
        </div>
        <AvatarBadges titleBadges={titleBadges} awardBadges={awardBadges} />
      </div>
    );
  }

  const handleFile = async () => {
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setMenuOpen(false);

    let blob: Blob;
    try {
      blob = await resizeImage(file, MAX_DIMENSION, JPEG_QUALITY);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "이미지 처리 실패";
      setErrorMsg(msg);
      return;
    }

    const resizedFile = new File([blob], "avatar.jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
    const fd = new FormData();
    fd.append("avatar", resizedFile);

    startTransition(async () => {
      try {
        await uploadAvatar(profileId, fd);
      } catch (e) {
        // Next.js redirect 는 NEXT_REDIRECT 에러를 던지므로 정상 흐름
        if (
          e instanceof Error &&
          /NEXT_REDIRECT/.test(String((e as Error).message))
        ) {
          return;
        }
        setErrorMsg("업로드 실패");
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  };

  return (
    <div className="relative inline-block">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFile}
      />
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        disabled={isPending}
        aria-label="프로필 이미지 변경"
        className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden bg-gray-100 group disabled:opacity-50 transition flex items-center justify-center"
      >
        <AvatarContent src={src} name={name} />
        <span
          className={`absolute inset-0 bg-black/40 flex items-center justify-center text-white text-xs font-medium transition ${
            isPending || menuOpen
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100"
          }`}
        >
          {isPending ? "업로드 중..." : "변경"}
        </span>
      </button>

      {/* 카메라 어포던스 배지 — 우하단으로, 아바타와 최대한 안 겹치게 살짝 바깥쪽으로 배치 */}
      <span
        aria-hidden
        className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-suaza-button text-white flex items-center justify-center shadow-md ring-2 ring-white pointer-events-none"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      </span>

      <AvatarBadges titleBadges={titleBadges} awardBadges={awardBadges} />

      {menuOpen && !isPending && (
        <div className="absolute z-20 left-1/2 -translate-x-1/2 top-full mt-2 bg-white border border-suaza-border rounded-lg shadow-lg overflow-hidden w-32">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="block w-full px-3 py-2 text-sm text-left hover:bg-gray-50 text-suaza-ink"
          >
            <span className="block">이미지 업로드</span>
            <span className="block text-[10px] text-suaza-ink-faint mt-0.5">
              512×512 권장
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="block w-full px-3 py-2 text-sm text-left hover:bg-gray-50 text-suaza-ink-muted border-t border-suaza-border"
          >
            취소
          </button>
        </div>
      )}

      {errorMsg && (
        <p className="absolute left-1/2 -translate-x-1/2 top-full mt-2 text-xs text-red-600 whitespace-nowrap">
          {errorMsg}
        </p>
      )}
    </div>
  );
}

function AvatarContent({
  src,
  name,
}: {
  src: string | null;
  name: string;
}) {
  if (src) {
    return (
      <Image
        src={src}
        alt={name}
        fill
        sizes="(min-width: 640px) 112px, 96px"
        className="object-cover"
      />
    );
  }
  return (
    <span className="text-2xl sm:text-3xl font-bold text-suaza-ink">
      {name.charAt(0) || "?"}
    </span>
  );
}

function resizeImage(
  file: File,
  maxDimension: number,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = scaleDown(
        img.naturalWidth,
        img.naturalHeight,
        maxDimension,
      );
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("이미지를 처리할 수 없습니다"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("인코딩 실패"))),
        "image/jpeg",
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지를 읽을 수 없습니다"));
    };
    img.src = url;
  });
}

function scaleDown(w: number, h: number, max: number) {
  if (w <= max && h <= max) return { width: w, height: h };
  const ratio = w > h ? max / w : max / h;
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}
