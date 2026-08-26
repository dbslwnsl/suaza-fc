// ============================================================
// 로컬(Codespaces 포함) 개발 환경 점검 스크립트
//   실행: npm run env:check
// .env.local 의 필수 값이 채워졌는지, Supabase 에 실제로 붙는지 확인한다.
// ============================================================

import { readFileSync, existsSync } from "node:fs";

const ENV_PATH = ".env.local";

const REQUIRED = [
  ["NEXT_PUBLIC_SUPABASE_URL", "Supabase 대시보드 > Project Settings > API > Project URL"],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "같은 화면의 anon public 키"],
  ["SUPABASE_SERVICE_ROLE_KEY", "같은 화면의 service_role 키 (서버 전용)"],
];

const OPTIONAL = [
  ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "웹 푸시 테스트할 때만 필요"],
  ["VAPID_PRIVATE_KEY", "웹 푸시 테스트할 때만 필요"],
  ["NEXT_PUBLIC_DEV_TOOLS", "1 이면 직책 전환기 활성 + 실제 푸시 발송 차단"],
];

if (!existsSync(ENV_PATH)) {
  console.error(`✗ ${ENV_PATH} 이 없습니다. \`cp .env.example .env.local\` 후 값을 채우세요.`);
  process.exit(1);
}

// --env-file 로 이미 로드되지만, 값이 비었는지 판별하려면 파일도 직접 읽는다.
const raw = readFileSync(ENV_PATH, "utf8");
const fileKeys = new Map();
for (const line of raw.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) fileKeys.set(m[1], m[2].trim());
}

let failed = false;
console.log(`\n[필수]`);
for (const [key, hint] of REQUIRED) {
  const value = process.env[key] || fileKeys.get(key) || "";
  if (!value) {
    failed = true;
    console.log(`  ✗ ${key} — 비어 있음 (${hint})`);
  } else {
    console.log(`  ✓ ${key} = ${mask(key, value)}`);
  }
}

console.log(`\n[선택]`);
for (const [key, hint] of OPTIONAL) {
  const value = process.env[key] || fileKeys.get(key) || "";
  console.log(value ? `  ✓ ${key} = ${mask(key, value)}` : `  · ${key} — 없음 (${hint})`);
}

if (failed) {
  console.error(`\n필수 값이 비어 있어 앱이 뜨지 않습니다. ${ENV_PATH} 을 채운 뒤 다시 실행하세요.\n`);
  process.exit(1);
}

// 실제 연결 확인 — anon 키로 REST 엔드포인트를 두드려 본다.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || fileKeys.get("NEXT_PUBLIC_SUPABASE_URL");
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || fileKeys.get("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || fileKeys.get("SUPABASE_SERVICE_ROLE_KEY");

console.log(`\n[연결 확인] ${url}`);
await ping("anon", anon);
await ping("service_role", service);

// service_role 로 teams 테이블을 조회해 마이그레이션 적용 여부까지 본다.
try {
  const res = await fetch(`${url}/rest/v1/teams?select=id,name&limit=5`, {
    headers: { apikey: service, Authorization: `Bearer ${service}` },
  });
  if (res.ok) {
    const rows = await res.json();
    console.log(`  ✓ teams 테이블 조회 성공 — 팀 ${rows.length}개${rows.length ? `: ${rows.map((r) => r.name).join(", ")}` : " (비어 있음)"}`);
  } else {
    console.log(`  ✗ teams 테이블 조회 실패 (${res.status}) — 마이그레이션 미적용일 수 있음`);
  }
} catch (e) {
  console.log(`  ✗ teams 조회 중 오류: ${e.message}`);
}

console.log(`\n환경 준비 완료. \`npm run dev\` 로 시작하세요.\n`);

async function ping(label, key) {
  // /rest/v1/ 루트는 service_role 전용이라 anon 키로는 항상 401 이 난다.
  // 두 키 모두에서 유효한 /auth/v1/settings 로 키 자체의 유효성만 확인한다.
  try {
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    console.log(res.ok ? `  ✓ ${label} 키 인증 성공` : `  ✗ ${label} 키 인증 실패 (HTTP ${res.status}) — ${(await res.text()).slice(0, 120)}`);
    if (!res.ok) process.exitCode = 1;
  } catch (e) {
    console.log(`  ✗ ${label} 연결 실패: ${e.message}`);
    process.exitCode = 1;
  }
}

function mask(key, value) {
  if (key.startsWith("NEXT_PUBLIC_SUPABASE_URL")) return value;
  if (key === "NEXT_PUBLIC_DEV_TOOLS") return value;
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)} (${value.length}자)` : "***";
}
