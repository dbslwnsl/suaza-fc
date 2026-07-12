"use server";

// 팀 설정 — 팀명·엠블럼·초대코드 관리. 그 팀 매니저(회장·감독) 전용.
// DB 권한은 teams_update 정책(is_team_manager)이 최종 강제한다.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTeam } from "./context";

type Result = { ok: boolean; error?: string };

/** 호출자가 현재 팀의 매니저인지 + 현재 팀 id 반환 */
async function requireManagedTeam(): Promise<
  { ok: true; teamId: string } | { ok: false; error: string }
> {
  const team = await getCurrentTeam();
  if (!team) return { ok: false, error: "소속된 팀이 없습니다" };
  if (team.role !== "manager")
    return { ok: false, error: "팀 회장·감독만 변경할 수 있습니다" };
  return { ok: true, teamId: team.id };
}

export async function updateTeamName(name: string): Promise<Result> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "팀 이름을 입력해 주세요" };
  if (trimmed.length > 20)
    return { ok: false, error: "팀 이름은 20자 이내로 입력해 주세요" };

  const gate = await requireManagedTeam();
  if (!gate.ok) return gate;

  const supabase = await createClient();
  const { error } = await supabase
    .from("teams")
    .update({ name: trimmed })
    .eq("id", gate.teamId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}

/** 초대코드 재발급 — 기존 코드는 즉시 무효화됨. 새 코드 반환. */
export async function regenerateInviteCode(): Promise<
  Result & { code?: string }
> {
  const gate = await requireManagedTeam();
  if (!gate.ok) return gate;

  const supabase = await createClient();
  // 유니크 충돌 대비 몇 번 재시도
  for (let i = 0; i < 3; i++) {
    const code = Array.from({ length: 6 }, () =>
      "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".charAt(
        Math.floor(Math.random() * 32),
      ),
    ).join("");
    const { error } = await supabase
      .from("teams")
      .update({ invite_code: code })
      .eq("id", gate.teamId);
    if (!error) {
      revalidatePath("/settings/team");
      return { ok: true, code };
    }
    if (error.code !== "23505") return { ok: false, error: error.message };
  }
  return { ok: false, error: "코드 생성에 실패했습니다. 다시 시도해 주세요." };
}

const MAX_EMBLEM_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** 팀 엠블럼 업로드 — avatars 버킷의 본인 폴더에 저장 후 teams.emblem_url 갱신. */
export async function uploadTeamEmblem(formData: FormData): Promise<Result> {
  const gate = await requireManagedTeam();
  if (!gate.ok) return gate;

  const file = formData.get("emblem") as File | null;
  if (!file || file.size === 0)
    return { ok: false, error: "파일을 선택해 주세요" };
  if (file.size > MAX_EMBLEM_BYTES)
    return { ok: false, error: "5MB 이하 이미지만 업로드 가능합니다" };
  if (!ALLOWED_MIME.has(file.type))
    return { ok: false, error: "JPG/PNG/WEBP 만 가능합니다" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다" };

  // 스토리지 정책상 본인(uid) 폴더에만 업로드 가능 — 경로만 팀 엠블럼용으로 구분.
  const ext = EXT_BY_MIME[file.type] ?? "jpg";
  const path = `${user.id}/team-emblem-${gate.teamId}-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return { ok: false, error: uploadError.message };

  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(path);

  const { error } = await supabase
    .from("teams")
    .update({ emblem_url: publicUrl })
    .eq("id", gate.teamId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}
