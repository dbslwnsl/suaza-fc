"use client";

import { softDeleteMember } from "./actions";

export default function DeleteMemberButton({
  profileId,
  name,
}: {
  profileId: string;
  name: string;
}) {
  return (
    <form
      action={softDeleteMember.bind(null, profileId)}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `${name} 회원을 정말 삭제하시겠습니까?\n\n· 과거 경기 기록은 그대로 보존됩니다\n· 회원 목록 / 출석 / 포메이션에서 즉시 제외됩니다\n· 동일 이메일로 다시 가입할 수 있습니다`,
          )
        ) {
          e.preventDefault();
        }
      }}
      className="flex justify-center mt-2"
    >
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 text-sm border border-red-300 text-red-600 rounded-lg px-4 py-2 font-medium hover:bg-red-50 transition"
      >
        <span>🗑</span>
        회원 삭제
      </button>
    </form>
  );
}
