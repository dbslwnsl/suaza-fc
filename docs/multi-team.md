# 멀티팀 전환 — 작업 요약 & 인수인계

> 수아자FC 전용 앱 → 여러 팀이 쓰는 멀티팀(멀티테넌트) 앱 전환.
> 2026-07 작업. 다른 PC에서 이어서 작업할 때 이 문서 기준으로 진행.

## 1. 설계 결정 (확정)

- **단일 DB + `team_id` 스코프** 방식 (팀별 DB 복제 아님)
- **한 사용자가 여러 팀 소속 가능** — `team_members` 조인 테이블 (PK = team_id + user_id)
- **role(manager/player)·title(회장/감독/코치/…)은 "팀 소속"의 속성** — `team_members`에 저장.
  `profiles.role/title`은 레거시(전환 완료 후 제거 예정, 아직 병행 존재)
- **현재 팀 = 쿠키** (`current-team`) — URL에 팀을 싣지 않음. 팀 전환은 홈 상단 팀이름 탭
- **가입**: 팀 목록에서 선택 또는 초대코드(6자리) → `status='pending'` → 그 팀 회장 승인
- **수아자FC 고정 UUID**: `00000000-0000-4000-8000-000000000001` (백필·폴백에 사용)

## 2. DB 마이그레이션 (0049 ~ 0053)

| 파일 | 내용 | 적용 상태 |
|---|---|---|
| `0049_teams.sql` | teams(초대코드 포함)·team_members 생성, RLS 헬퍼 `is_team_member`/`is_team_manager`, 수아자FC 백필(기존 회원 전원 active) | ✅ 적용됨 |
| `0050_team_id.sql` | 루트 6테이블(matches·posts·photos·stat_definitions·coach_comments·notifications)에 team_id+백필+**임시 DEFAULT(수아자)**+SELECT 팀 스코프. stat_definitions PK → (team_id, key) 복합 | ✅ 적용됨 |
| `0051_team_scope_children.sql` | 자식 테이블(출석·기록·댓글·좋아요·포메이션·용병) SELECT를 부모 조인 팀 스코프로. profiles는 `shares_team_with()`(같은 팀 공유자만 열람) | ✅ 적용됨 |
| `0052_team_onboarding.sql` | `create_team_with_owner` RPC — 팀 생성+생성자 회장 등록+기본 기록항목 시딩(골3·어시2·출석1·포인트)+즉시 승인 | ⬜ **적용 필요** |
| `0053_team_write_policies.sql` | is_staff/is_manager/is_coaching_staff를 team_members 기준으로 재정의 + `is_team_staff`/`is_team_coaching_staff`/`is_manager_of_shared_team` 신설 + 핵심 쓰기 정책을 "그 행의 팀" 기준으로 재작성 | ⬜ **적용 필요** (photos 컬럼 uploader_id 로 수정된 버전으로) |

적용 방법: Supabase SQL 에디터에서 파일 통째로 실행 (모두 재실행 안전하게 작성됨).

## 3. 앱 코드 변경

### 신규 (팀 인프라)
- `src/lib/teams/context.ts` — `getMyTeams()` / `getCurrentTeam()`(쿠키+폴백) / `getMyTeamRole()`(현재 팀 role·title) / `DEFAULT_TEAM_ID`
- `src/lib/teams/actions.ts` — `setCurrentTeam` (팀 전환, 쿠키 저장)
- `src/lib/teams/onboarding-actions.ts` — 가입 신청 / 초대코드 가입 / 팀 생성
- `src/lib/teams/admin-actions.ts` — 가입 신청 승인/거절 (그 팀 매니저 검증)
- `src/components/team-switcher.tsx` — 홈 상단 팀 브랜딩 + 전환 시트
- `src/app/onboarding/team/` — 가입 온보딩 화면 (팀 선택/초대코드/팀 만들기)
- `src/app/admin/join-requests/` — 팀별 가입 신청 승인 화면 (설정 메뉴에서 매니저에게 노출)

### 수정 (주요 패턴)
- **읽기 쿼리 팀 필터**: `const teamId = (await getCurrentTeam())?.id ?? DEFAULT_TEAM_ID;` → `.eq("team_id", teamId)`
  - 적용: 홈·일정&결과·게시판(queries.ts)·회원&기록 3뷰·프로필·시즌킹(kings.ts)·기록항목 설정·새소식·탭 뱃지(layout)
  - 회원 목록은 `profiles` + `team_members!inner(team_id)` 임베드 필터
  - 포메이션 임베드(embed.tsx)는 쿠키가 아니라 **그 경기의 team_id** 기준
- **쓰기 team_id 명시**: createMatch / createPost(공지 max3도 팀 범위) / addStatDefinition / createCoachComment
  - 기록항목 update/delete는 복합 PK 대응으로 **team_id + key** 스코프 필수
- **알림 팀 스코프**: `recordForAll`/`sendPushToAll` → 그 팀 active 멤버만. 브로드캐스트 트리거 5종(새 경기·새 글·공지·경기댓글·감독전달사항)은 **teamId 필수 파라미터**
- **권한 판정**: `getMyTeamRole()` 기준으로 전환 — requireStaff(경기)·requireManager(기록)·게시판 getUserAndRole·포메이션 게이트·경기 등록/목록/상세·embed·기록항목 설정
- **온보딩 연결**: middleware(소속 없으면 /onboarding/team, 신청 있으면 /pending-approval), signup-approval(승인 시 멤버십 active), 설정에 로그아웃 버튼

## 4. 새 코드 작성 시 규칙

1. 팀 소유 데이터(경기·글·기록 등) **조회는 반드시 `.eq("team_id", ...)`**, **insert는 team_id 명시**
2. 권한 체크는 `profiles.role`이 아니라 **`getMyTeamRole()`** (또는 DB에선 `is_team_staff(team_id)`)
3. 전체 발송 알림은 반드시 **teamId를 트리거에 전달**
4. 새 테이블 만들 땐 team_id + RLS 팀 스코프 포함

## 5. 테스트 체크리스트 (0052·0053 적용 후)

- [ ] 수아자 회귀: 홈/경기/게시판/알림/기록 입력 정상
- [ ] 새 계정 가입 → 팀 선택 화면 자동 진입
- [ ] "새 팀 만들기" → 즉시 홈 + 팀명 표시 + 기록항목 4개 시딩 확인
- [ ] 다른 계정으로 그 팀 가입 신청 → 회장에게 알림 → 설정>가입 신청 관리에서 승인
- [ ] 새 팀에서 경기/글 작성 → 수아자 화면·알림에 안 섞임
- [ ] 두 팀 소속 계정으로 홈 팀이름 탭 → 팀 전환 동작

## 6. 남은 작업 (우선순위순)

1. **회원관리 액션 팀 기준 전환** — `members/[id]/actions.ts`의 updateProfile / setMemberStatus / softDeleteMember / setMemberTitle 이 아직 전역 profiles.role 체크. 직책 부여도 team_members.title 을 갱신해야 함 (현재는 profiles.title 갱신 → 새 팀에선 의미 없음)
2. **coach_comments 정책 행 단위 팀 정밀화** — 현재 is_coaching_staff()(아무 팀 코치면 통과) 기준
3. **DB 임시 DEFAULT team_id 제거** — 앱이 모두 명시하므로 정리 (`alter table ... alter column team_id drop default;`)
4. **정적 브랜딩 동적화** — layout.tsx metadata/OG, manifest.ts 의 "SUAZA FC" / 로그인·가입 화면 문구
5. **profiles.role/title 최종 제거** — 모든 참조가 team_members 로 이관된 후
6. 구 `/admin/signups`(approved_at 기반, 옛 기록 이관 기능 포함)와 신규 `/admin/join-requests` 정리 통합
7. 팀 설정 화면(팀명·엠블럼 변경, 초대코드 재발급 — teams_update 정책은 이미 준비됨)

## 7. 주의사항

- `NEXT_PUBLIC_DEV_TOOLS=1` 이면 알림 발송/기록이 전부 생략됨 (로컬 전용)
- 알림의 team_id 라벨: 과거 알림은 전부 수아자로 백필됨
- middleware 는 마이그레이션 미적용 환경에서 기존 흐름으로 폴백하게 작성됨
- 새 팀 회장은 profiles.role='player' — **전역 role 로 판단하는 잔여 코드가 있으면 그 기능은 새 팀에서 안 보임** (발견 시 getMyTeamRole 로 교체)
