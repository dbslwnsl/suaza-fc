import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  POSITIONS,
  ROLE_BADGE,
  ROLE_LABEL,
  type Position,
} from "@/lib/members/positions";
import { updateProfile } from "./actions";

export default async function MemberDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { id } = await params;
  const { error, message } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // proxy 가 처리

  const [{ data: profile }, { data: me }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, name, nickname, role, positions, jersey_number, birth_date")
      .eq("id", id)
      .single(),
    supabase.from("profiles").select("role").eq("id", user.id).single(),
  ]);

  if (!profile) notFound();

  const isSelf = user.id === profile.id;
  const isManager = me?.role === "manager";
  const canEdit = isSelf || isManager;
  const canEditRole = isManager;

  const positions = (profile.positions ?? []) as Position[];

  return (
    <main className="p-8 font-sans max-w-2xl mx-auto">
      <header className="flex items-center gap-3 mb-6">
        <Link
          href="/members"
          className="text-sm text-gray-500 hover:underline"
        >
          ← 명단
        </Link>
        <h1 className="text-2xl font-bold">{profile.name}</h1>
        <span
          className={`text-xs px-2 py-0.5 rounded ${ROLE_BADGE[profile.role] ?? ROLE_BADGE.player}`}
        >
          {ROLE_LABEL[profile.role] ?? profile.role}
        </span>
      </header>

      {message && (
        <p className="mb-4 p-3 bg-green-50 text-green-700 rounded text-sm">
          {message}
        </p>
      )}
      {error && (
        <p className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">
          {error}
        </p>
      )}

      {!canEdit ? (
        <ReadOnlyView profile={profile} positions={positions} />
      ) : (
        <form
          action={updateProfile.bind(null, profile.id)}
          className="flex flex-col gap-4"
        >
          <Field label="이름">
            <input
              type="text"
              name="name"
              defaultValue={profile.name}
              required
              className="border rounded px-3 py-2 w-full"
            />
          </Field>

          <Field label="별명">
            <input
              type="text"
              name="nickname"
              defaultValue={profile.nickname ?? ""}
              className="border rounded px-3 py-2 w-full"
            />
          </Field>

          <Field label="포지션 (복수 선택)">
            <div className="flex gap-3 flex-wrap">
              {POSITIONS.map((p) => (
                <label
                  key={p}
                  className="flex items-center gap-1 px-3 py-1.5 border rounded cursor-pointer hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    name="positions"
                    value={p}
                    defaultChecked={positions.includes(p)}
                  />
                  <span>{p}</span>
                </label>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="등번호">
              <input
                type="number"
                name="jersey_number"
                defaultValue={profile.jersey_number ?? ""}
                min={0}
                max={999}
                className="border rounded px-3 py-2 w-full"
              />
            </Field>
            <Field label="생년월일">
              <input
                type="date"
                name="birth_date"
                defaultValue={profile.birth_date ?? ""}
                className="border rounded px-3 py-2 w-full"
              />
            </Field>
          </div>

          {canEditRole && (
            <Field label="역할 (감독만 변경 가능)">
              <select
                name="role"
                defaultValue={profile.role}
                className="border rounded px-3 py-2 w-full"
              >
                <option value="player">선수</option>
                <option value="coach">코치</option>
                <option value="manager">감독</option>
              </select>
            </Field>
          )}

          <button
            type="submit"
            className="mt-2 bg-black text-white rounded py-2 font-medium hover:bg-gray-800"
          >
            저장
          </button>
        </form>
      )}
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function ReadOnlyView({
  profile,
  positions,
}: {
  profile: {
    nickname: string | null;
    jersey_number: number | null;
    birth_date: string | null;
  };
  positions: Position[];
}) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      {profile.nickname && (
        <>
          <dt className="font-medium text-gray-600">별명</dt>
          <dd>{profile.nickname}</dd>
        </>
      )}
      {positions.length > 0 && (
        <>
          <dt className="font-medium text-gray-600">포지션</dt>
          <dd>{positions.join(" / ")}</dd>
        </>
      )}
      {profile.jersey_number != null && (
        <>
          <dt className="font-medium text-gray-600">등번호</dt>
          <dd>#{profile.jersey_number}</dd>
        </>
      )}
      {profile.birth_date && (
        <>
          <dt className="font-medium text-gray-600">생년월일</dt>
          <dd>{profile.birth_date}</dd>
        </>
      )}
    </dl>
  );
}
