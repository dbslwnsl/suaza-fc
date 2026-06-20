// ============================================================
// 개발용 테스트 계정 시드 — 회원타입(직책)별 로그인 가능 계정 생성
//
// ⚠️ 반드시 "개발용 Supabase 프로젝트"에 대해서만 실행하세요.
//    (.env.local 의 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가
//     개발 DB를 가리키는지 확인)
//
// 실행:
//   node --env-file=.env.local scripts/seed-dev-accounts.mjs --yes
//
// 재실행해도 안전(멱등): 이미 있으면 비밀번호/프로필만 갱신.
// 정리:
//   node --env-file=.env.local scripts/seed-dev-accounts.mjs --delete --yes
// ============================================================

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "환경변수 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const confirmed = args.includes("--yes");
const doDelete = args.includes("--delete");

console.log("대상 Supabase URL:", url);
if (!confirmed) {
  console.error(
    "\n⚠️  위 DB에 테스트 계정을 " +
      (doDelete ? "삭제" : "생성/갱신") +
      "합니다. '개발용' 프로젝트가 맞는지 확인 후 --yes 를 붙여 다시 실행하세요.\n" +
      "   예) node --env-file=.env.local scripts/seed-dev-accounts.mjs --yes\n",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 공통 비밀번호 (개발 전용)
const PASSWORD = "devtest1234";

// 회원타입(직책)별 테스트 계정
const ACCOUNTS = [
  { email: "dev-president@suaza.local",  name: "개발회장",   title: "president",      role: "manager", jersey: 1, positions: ["MF"], foot: "right" },
  { email: "dev-headcoach@suaza.local",  name: "개발감독",   title: "head_coach",     role: "manager", jersey: 2, positions: ["DF"], foot: "right" },
  { email: "dev-coach@suaza.local",      name: "개발코치",   title: "coach",          role: "coach",   jersey: 3, positions: ["MF"], foot: "right" },
  { email: "dev-vp@suaza.local",         name: "개발부회장", title: "vice_president", role: "player",  jersey: 4, positions: ["FW"], foot: "left"  },
  { email: "dev-treasurer@suaza.local",  name: "개발총무",   title: "treasurer",      role: "player",  jersey: 5, positions: ["MF"], foot: "right" },
  { email: "dev-auditor@suaza.local",    name: "개발감사",   title: "auditor",        role: "player",  jersey: 6, positions: ["DF"], foot: "right" },
  { email: "dev-player@suaza.local",     name: "개발회원",   title: "player",         role: "player",  jersey: 7, positions: ["FW"], foot: "right" },
];

// 기존 유저 email -> id 맵 (멱등 처리용)
async function loadExisting() {
  const map = new Map();
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) {
      console.error("listUsers 실패:", error.message);
      process.exit(1);
    }
    for (const u of data.users) if (u.email) map.set(u.email, u.id);
    if (data.users.length < 1000) break;
    page += 1;
  }
  return map;
}

const existing = await loadExisting();

if (doDelete) {
  for (const a of ACCOUNTS) {
    const id = existing.get(a.email);
    if (!id) {
      console.log(`- 없음 ${a.email}`);
      continue;
    }
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error(`삭제 실패 ${a.email}:`, error.message);
    else console.log(`🗑  삭제 ${a.email}`);
  }
  console.log("\n삭제 완료.");
  process.exit(0);
}

const now = new Date().toISOString();
for (const a of ACCOUNTS) {
  let id = existing.get(a.email);
  if (!id) {
    const { data, error } = await admin.auth.admin.createUser({
      email: a.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { name: a.name },
    });
    if (error) {
      console.error(`생성 실패 ${a.email}:`, error.message);
      continue;
    }
    id = data.user.id;
    console.log(`✅ 생성 ${a.email}`);
  } else {
    await admin.auth.admin.updateUserById(id, { password: PASSWORD });
    console.log(`↻ 기존 ${a.email} (비밀번호·프로필 갱신)`);
  }

  // handle_new_user 트리거가 만든 profiles 행에 직책/권한/완료/승인 정보 채우기
  const { error: upErr } = await admin
    .from("profiles")
    .update({
      name: a.name,
      role: a.role,
      title: a.title,
      jersey_number: a.jersey,
      positions: a.positions,
      preferred_foot: a.foot,
      birth_date: "1995-01-01",
      profile_completed: true,
      approved_at: now,
      terms_agreed_at: now,
      privacy_agreed_at: now,
      deleted_at: null,
    })
    .eq("id", id);
  if (upErr) console.error(`프로필 갱신 실패 ${a.email}:`, upErr.message);
}

console.log(`\n완료! 공통 비밀번호: ${PASSWORD}`);
console.log("로그인 계정:");
for (const a of ACCOUNTS) {
  console.log(`  ${a.title.padEnd(14)} ${a.email}`);
}
