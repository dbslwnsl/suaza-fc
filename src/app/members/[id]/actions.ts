"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  notifyCoachComment,
  notifyCoachCommentReply,
  notifyCoachCommentLike,
} from "@/lib/push/triggers";
import {
  MEMBER_TITLES,
  POSITIONS,
  PREFERRED_FEET,
  type MemberTitle,
  type Position,
  type PreferredFoot,
} from "@/lib/members/positions";

type UpdateInput = {
  name: string;
  nickname: string | null;
  positions: Position[];
  jersey_number: number | null;
  birth_date: string | null;
  preferred_foot: PreferredFoot | null;
  is_injured: boolean;
  on_leave: boolean;
  title?: MemberTitle;
  profile_completed: boolean;
};

export async function updateProfile(profileId: string, formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isSelf = user.id === profileId;
  const isManager = me?.role === "manager";
  if (!isSelf && !isManager) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent("수정 권한이 없습니다")}`,
    );
  }

  // 제출 순서 = [주포지션, 부포지션]. 순서 보존 + 중복 제거 + 최대 2개.
  const valid = new Set<string>(POSITIONS);
  const positions = formData
    .getAll("positions")
    .map(String)
    .filter((p) => valid.has(p))
    .filter((p, i, arr) => arr.indexOf(p) === i)
    .slice(0, 2) as Position[];

  const jerseyRaw = String(formData.get("jersey_number") ?? "").trim();
  const birthRaw = String(formData.get("birth_date") ?? "").trim();
  const nickname = String(formData.get("nickname") ?? "").trim().slice(0, 10);
  const footRaw = String(formData.get("preferred_foot") ?? "");
  const preferred_foot = (PREFERRED_FEET as readonly string[]).includes(footRaw)
    ? (footRaw as PreferredFoot)
    : null;

  const update: UpdateInput = {
    name: String(formData.get("name") ?? "").trim(),
    nickname: nickname || null,
    positions,
    jersey_number: jerseyRaw ? Number(jerseyRaw) : null,
    birth_date: birthRaw || null,
    profile_completed: true,
    preferred_foot,
    is_injured: String(formData.get("is_injured") ?? "") === "1",
    on_leave: String(formData.get("on_leave") ?? "") === "1",
  };

  if (!update.name) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent("이름은 필수입니다")}`,
    );
  }
  if (update.jersey_number == null) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent("등번호는 필수입니다")}`,
    );
  }
  if (!update.birth_date) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent("생년월일은 필수입니다")}`,
    );
  }
  if (update.positions.length === 0) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent("포지션을 하나 이상 선택해 주세요")}`,
    );
  }
  if (!update.preferred_foot) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent("주발을 선택해 주세요")}`,
    );
  }

  // 첫 프로필 작성인지 판별: 업데이트 전 profile_completed 값 확인
  const { data: before } = await supabase
    .from("profiles")
    .select("profile_completed")
    .eq("id", profileId)
    .single();
  const wasIncomplete = !before?.profile_completed;

  // manager 만 title(직책) 변경 가능.
  // 매니저 권한(role) 부여는 UI에 노출하지 않으며, 앱 운영자가 Supabase SQL 로 직접 처리.
  //   예) update public.profiles set role='manager' where id='<uuid>';
  if (isManager) {
    const titleRaw = String(formData.get("title") ?? "");
    if ((MEMBER_TITLES as readonly string[]).includes(titleRaw)) {
      update.title = titleRaw as MemberTitle;
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", profileId);

  if (error) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath(`/members/${profileId}`);
  revalidatePath("/members");
  revalidatePath("/");

  // 첫 프로필 작성 완료 시 본인이면 홈으로
  if (wasIncomplete && user.id === profileId) {
    redirect(
      `/?message=${encodeURIComponent("환영합니다! 프로필이 저장되었습니다")}`,
    );
  }

  redirect(
    `/members/${profileId}?message=${encodeURIComponent("저장되었습니다")}`,
  );
}

/**
 * 본인 프로필의 자동 저장용 — 별명/포지션/주발만 부분 갱신.
 * 리다이렉트 없이 {ok} 를 반환해 인라인 즉시 저장에 사용한다.
 * 등번호·생년월일·이름·직책은 건드리지 않는다(편집 화면에서 읽기전용).
 */
export async function updateProfileFields(
  profileId: string,
  fields: {
    nickname: string | null;
    positions: Position[];
    preferred_foot: PreferredFoot | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다" };

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isSelf = user.id === profileId;
  const isManager = me?.role === "manager";
  if (!isSelf && !isManager) return { ok: false, error: "수정 권한이 없습니다" };

  // 주포지션, 부포지션 순서 보존 + 중복 제거 + 최대 2개.
  const valid = new Set<string>(POSITIONS);
  const positions = (fields.positions ?? [])
    .map(String)
    .filter((p) => valid.has(p))
    .filter((p, i, arr) => arr.indexOf(p) === i)
    .slice(0, 2) as Position[];

  const nickname = (fields.nickname ?? "").trim().slice(0, 10) || null;
  const foot = fields.preferred_foot;
  const preferred_foot = (PREFERRED_FEET as readonly string[]).includes(
    foot ?? "",
  )
    ? (foot as PreferredFoot)
    : null;

  // 필수값(주포지션·주발)은 비어있을 때 덮어쓰지 않는다.
  const update: Record<string, unknown> = { nickname };
  if (positions.length > 0) update.positions = positions;
  if (preferred_foot) update.preferred_foot = preferred_foot;

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", profileId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/members/${profileId}`);
  revalidatePath("/members");
  revalidatePath("/");
  return { ok: true };
}

/**
 * 회원의 부상/장기불참 상태만 변경. 본인 외 타인 변경은 매니저·회장만 허용.
 * 회장(title=president, role=player)은 profiles RLS 로 타인 수정이 막혀 있어
 * 권한을 서버에서 확인한 뒤 service_role 로 두 필드만 갱신한다.
 */
export async function setMemberStatus(
  profileId: string,
  isInjured: boolean,
  onLeave: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다" };

  const { data: me } = await supabase
    .from("profiles")
    .select("role, title")
    .eq("id", user.id)
    .single();
  const canManage =
    me?.role === "manager" ||
    me?.title === "president" ||
    me?.title === "head_coach";
  if (!canManage && user.id !== profileId) {
    return { ok: false, error: "권한이 없습니다" };
  }

  const admin = createAdminClient();

  // 변경 전 상태 — "부상/장기불참 해제" 전환을 판별하기 위함.
  const { data: prev } = await admin
    .from("profiles")
    .select("is_injured, on_leave")
    .eq("id", profileId)
    .single();
  const wasBlocked = !!prev?.is_injured || !!prev?.on_leave;

  const { error } = await admin
    .from("profiles")
    .update({ is_injured: isInjured, on_leave: onLeave })
    .eq("id", profileId);
  if (error) return { ok: false, error: error.message };

  // 부상/장기불참 → 정상으로 "해제"되면, 예정/진행 경기의 출석 투표를 삭제(=미투표)한다.
  // (부상 중 자동 불참으로 보이던 표시가, 해제 후엔 어떤 투표 상태로도 남지 않도록.)
  const nowBlocked = isInjured || onLeave;
  if (wasBlocked && !nowBlocked) {
    const { data: upcoming } = await admin
      .from("matches")
      .select("id")
      .in("status", ["scheduled", "in_progress"]);
    const ids = (upcoming ?? []).map((m) => m.id);
    if (ids.length > 0) {
      await admin
        .from("match_attendances")
        .delete()
        .eq("player_id", profileId)
        .in("match_id", ids);
    }
  }

  revalidatePath(`/members/${profileId}`);
  revalidatePath("/members");
  revalidatePath("/matches");
  revalidatePath("/");
  return { ok: true };
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function uploadAvatar(profileId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isSelf = user.id === profileId;
  const isManager = me?.role === "manager";
  if (!isSelf && !isManager) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent("수정 권한이 없습니다")}`,
    );
  }

  const file = formData.get("avatar") as File | null;
  if (!file || file.size === 0) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent("파일을 선택해 주세요")}`,
    );
  }
  if (file.size > MAX_AVATAR_BYTES) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent("5MB 이하 이미지만 업로드 가능합니다")}`,
    );
  }
  if (!ALLOWED_MIME.has(file.type)) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent("JPG/PNG/WEBP/GIF 만 가능합니다")}`,
    );
  }

  const ext = EXT_BY_MIME[file.type] ?? "jpg";
  const path = `${profileId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent(uploadError.message)}`,
    );
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(path);

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("id", profileId);

  if (updateError) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent(updateError.message)}`,
    );
  }

  revalidatePath(`/members/${profileId}`);
  revalidatePath("/members");
  revalidatePath("/");
  redirect(
    `/members/${profileId}?message=${encodeURIComponent("프로필 이미지가 업데이트되었습니다")}`,
  );
}

/**
 * 회원 Soft Delete.
 * - profiles.deleted_at 세팅 → 목록에선 숨겨지지만 row 자체는 남아 경기 기록(FK) 보존
 * - auth.users 는 삭제하지 않고(기록 cascade 방지), 이메일만 텀스톤으로 변경해
 *   원래 이메일을 풀어준다 → 같은 이메일로 재가입 가능. (재가입은 새 계정/프로필)
 * - 회장(title=president)·감독(title=head_coach)·매니저(role=manager) 호출 가능, 본인은 삭제 불가
 */
export async function softDeleteMember(profileId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("role, title")
    .eq("id", user.id)
    .single();

  // 매니저(회장 포함)만 삭제 가능. 감독(head_coach)은 매니저 권한이 있어도 삭제는 제외.
  const canDelete = me?.role === "manager" && me?.title !== "head_coach";
  if (!canDelete) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent("회장/매니저만 회원을 삭제할 수 있습니다")}`,
    );
  }
  if (user.id === profileId) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent("본인은 삭제할 수 없습니다")}`,
    );
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", profileId);

  if (updateError) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent(updateError.message)}`,
    );
  }

  // auth 계정의 이메일을 텀스톤으로 바꿔 원래 이메일을 해제(재가입 가능하게) 한다.
  // 계정 자체는 남겨 기록을 보존하고, 로그인은 deleted_at 으로 이미 차단됨.
  // email_confirm:true 로 즉시 반영(확인 메일 없이)해야 원래 이메일이 풀린다.
  try {
    const admin = createAdminClient();
    const tombstone = `deleted-${profileId}@deleted.invalid`;
    const { error: authError } = await admin.auth.admin.updateUserById(
      profileId,
      { email: tombstone, email_confirm: true },
    );
    if (authError) {
      console.error(
        "[member delete] auth 이메일 해제 실패 — 같은 이메일 재가입이 막힐 수 있습니다.",
        authError.message,
      );
    }
  } catch (e) {
    console.error(
      "[member delete] admin 이메일 해제 처리 실패 (SUPABASE_SERVICE_ROLE_KEY 확인)",
      e instanceof Error ? e.message : e,
    );
  }

  revalidatePath("/members");
  revalidatePath("/");
  redirect(`/members?message=${encodeURIComponent("회원이 삭제되었습니다")}`);
}

/**
 * 직책(title) 부여 — 회장(president)만 가능.
 * - 직책에 맞춰 시스템 권한(role)도 함께 정리: 회장/감독 → manager, 그 외 → player.
 *   (회장/감독은 BEFORE 트리거가 manager 로 자동 승격하므로 안전하게 일치한다.)
 * - "회장" 부여는 1인 체제 유지를 위해 본인(기존 회장)을 회원(player)으로 강등한다.
 */
export async function setMemberTitle(profileId: string, title: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(MEMBER_TITLES as readonly string[]).includes(title)) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent("잘못된 직책입니다")}`,
    );
  }
  const newTitle = title as MemberTitle;

  const { data: me } = await supabase
    .from("profiles")
    .select("title")
    .eq("id", user.id)
    .single();

  // 회장만 직책 부여 가능
  if (me?.title !== "president") {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent("회장만 직책을 부여할 수 있습니다")}`,
    );
  }
  // 본인 직책은 이 화면에서 변경하지 않는다 (회장 이양 시 자동 강등으로만 처리)
  if (profileId === user.id) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent("본인 직책은 변경할 수 없습니다")}`,
    );
  }

  // 직책 → 권한 매핑: 회장/감독만 매니저
  const nextRole =
    newTitle === "president" || newTitle === "head_coach"
      ? "manager"
      : "player";

  // 1) 대상 회원에게 새 직책/권한 부여
  const { error: targetError } = await supabase
    .from("profiles")
    .update({ title: newTitle, role: nextRole })
    .eq("id", profileId);
  if (targetError) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent(targetError.message)}`,
    );
  }

  // 2) 회장 이양인 경우 — 본인(기존 회장)을 회원으로 강등 (직책·권한 모두)
  //    대상 업데이트를 먼저 끝낸 뒤 강등해야, 강등 후 권한 부족으로 막히지 않는다.
  if (newTitle === "president") {
    const { error: selfError } = await supabase
      .from("profiles")
      .update({ title: "player", role: "player" })
      .eq("id", user.id);
    if (selfError) {
      redirect(
        `/members/${profileId}?error=${encodeURIComponent(selfError.message)}`,
      );
    }
  }

  revalidatePath(`/members/${profileId}`);
  revalidatePath("/members");
  revalidatePath("/");
  redirect(
    `/members/${profileId}?message=${encodeURIComponent("직책이 변경되었습니다")}`,
  );
}

// ─────────────────────────────────────────────────────────────
// 감독&코치 코멘트 (coach_comments)
// 작성/수정/삭제는 감독·코치만 — 실제 권한은 RLS 가 강제한다.
// 낙관적 UI 용으로 redirect 없이 revalidate 만 수행.
// ─────────────────────────────────────────────────────────────

export type CreatedCoachComment = {
  id: string;
  created_at: string;
  updated_at: string;
  parent_id: string | null;
};

export async function createCoachComment(
  memberId: string,
  content: string,
  matchId: string | null = null,
  parentId: string | null = null,
): Promise<CreatedCoachComment | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const trimmed = content.trim();
  if (!trimmed) return null;

  // 1단계만 허용: 답글의 답글이면 저장 위치(parent_id)는 최상위로 평탄화.
  // 단, 알림 대상은 "내가 실제로 답글 단 그 댓글(직속 부모)"의 작성자다.
  let effectiveParent: string | null = parentId;
  let parentAuthorId: string | undefined;
  if (parentId) {
    const { data: parent } = await supabase
      .from("coach_comments")
      .select("parent_id, author_id")
      .eq("id", parentId)
      .single();
    if (parent?.parent_id) effectiveParent = parent.parent_id as string;
    parentAuthorId = parent?.author_id as string | undefined;
  }

  const { data } = await supabase
    .from("coach_comments")
    .insert({
      member_id: memberId,
      author_id: user.id,
      content: trimmed,
      // 답글에는 경기 연결 없음 — 최상위 코멘트만 match_id 사용
      match_id: effectiveParent ? null : matchId,
      parent_id: effectiveParent,
    })
    .select("id, created_at, updated_at, parent_id")
    .single();

  revalidatePath(`/members/${memberId}`);

  if (data && !effectiveParent && memberId !== user.id) {
    // 최상위 코멘트(경기 또는 프로필) → 해당 선수 본인에게 알림.
    const url = matchId ? `/matches/${matchId}` : `/members/${memberId}`;
    after(async () => {
      try {
        await notifyCoachComment(
          {
            title: "감독·코치 코멘트",
            body: "회원님에게 감독·코치 코멘트가 등록되었어요",
            url,
          },
          memberId,
        );
      } catch (e) {
        console.error("[push] 감독·코치 코멘트 알림 실패", e);
      }
    });
  } else if (data && parentId) {
    // 답글 → "내가 직접 답글 단 그 댓글"(직속 부모)의 작성자에게 알림(본인 제외).
    // 예: 카드 주인이 단 답글에 코치가 다시 답글 → 카드 주인에게 알림.
    if (parentAuthorId && parentAuthorId !== user.id) {
      after(async () => {
        try {
          await notifyCoachCommentReply(
            {
              title: "새 답글",
              body: "회원님의 댓글에 답글이 달렸어요",
              url: `/members/${memberId}`,
            },
            parentAuthorId,
          );
        } catch (e) {
          console.error("[push] 감독·코치 코멘트 답글 알림 실패", e);
        }
      });
    }
  }

  return (data as CreatedCoachComment | null) ?? null;
}

// 코멘트/답글 좋아요 토글 — 본인 행 추가/삭제. 낙관적 UI 라 revalidate 없음.
export async function toggleCoachCommentLike(commentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: existing } = await supabase
    .from("coach_comment_likes")
    .select("comment_id")
    .eq("comment_id", commentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("coach_comment_likes")
      .delete()
      .eq("comment_id", commentId)
      .eq("user_id", user.id);
  } else {
    await supabase
      .from("coach_comment_likes")
      .insert({ comment_id: commentId, user_id: user.id });

    // 좋아요가 새로 눌렸을 때만 — 코멘트 작성자에게 알림(본인 제외)
    const { data: comment } = await supabase
      .from("coach_comments")
      .select("author_id, member_id")
      .eq("id", commentId)
      .single();
    const targetId = comment?.author_id as string | undefined;
    const cMemberId = comment?.member_id as string | undefined;
    if (targetId && targetId !== user.id) {
      after(async () => {
        try {
          await notifyCoachCommentLike(
            {
              title: "새 좋아요",
              body: "회원님의 감독·코치 코멘트에 좋아요가 달렸어요",
              url: cMemberId ? `/members/${cMemberId}` : "/",
            },
            targetId,
          );
        } catch (e) {
          console.error("[push] 감독·코치 코멘트 좋아요 알림 실패", e);
        }
      });
    }
  }
}

export async function updateCoachComment(
  commentId: string,
  memberId: string,
  content: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const trimmed = content.trim();
  if (!trimmed) return;

  await supabase
    .from("coach_comments")
    .update({ content: trimmed, updated_at: new Date().toISOString() })
    .eq("id", commentId);
  revalidatePath(`/members/${memberId}`);
}

export async function deleteCoachComment(commentId: string, memberId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("coach_comments").delete().eq("id", commentId);
  revalidatePath(`/members/${memberId}`);
}

export async function deleteAvatar(profileId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isSelf = user.id === profileId;
  const isManager = me?.role === "manager";
  if (!isSelf && !isManager) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent("수정 권한이 없습니다")}`,
    );
  }

  // 저장된 객체도 함께 삭제 (해당 사용자 폴더 전체)
  const { data: list } = await supabase.storage.from("avatars").list(profileId);
  if (list && list.length > 0) {
    await supabase.storage
      .from("avatars")
      .remove(list.map((f) => `${profileId}/${f.name}`));
  }

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", profileId);

  if (error) {
    redirect(
      `/members/${profileId}?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath(`/members/${profileId}`);
  revalidatePath("/members");
  revalidatePath("/");
  redirect(
    `/members/${profileId}?message=${encodeURIComponent("기본 이미지로 변경되었습니다")}`,
  );
}
