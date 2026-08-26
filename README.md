# SUAZA FC

축구 동호회 **SUAZA FC** 회원용 웹사이트입니다. 일정과 결과 확인, 사진과 글 공유, 선수별 기록과 포메이션 관리를 지원합니다.

- **프레임워크**: Next.js (App Router) + TypeScript
- **스타일링**: Tailwind CSS
- **백엔드/DB/인증**: Supabase
- **배포**: Vercel

## 주요 기능

- 회원 명단 및 프로필
- 경기 일정 / 결과
- 사진 갤러리
- 게시판
- 선수별 경기 기록
- 포메이션 설정
- 로그인 (감독용 / 선수용 권한 분리)

## 개발 환경 세팅 (Codespaces / 로컬 공통)

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 채우기

Supabase 접속 정보가 없으면 앱이 뜨지 않습니다. 둘 중 하나를 고르세요.

**A. Vercel에서 내려받기 (권장)**

```bash
vercel login      # 브라우저 인증
vercel link       # 이 저장소를 Vercel 프로젝트에 연결
npm run env:pull  # .env.local 로 실제 값 내려받기
```

내려받은 뒤 `.env.local` 맨 아래에 로컬 전용 플래그를 추가합니다.

```
NEXT_PUBLIC_DEV_TOOLS=1
```

**B. 직접 입력**

`.env.example` 를 `.env.local` 로 복사하고, Supabase 대시보드 > Project Settings > API 에서
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` 를 채웁니다.

### 3. 환경 점검

```bash
npm run env:check
```

필수 값 존재 여부, 키 인증, `teams` 테이블 조회까지 확인합니다.

### 4. 개발 서버 실행

```bash
npm run dev
```

Codespaces에서는 3000 포트가 자동 포워딩됩니다. `next.config.ts` 가 `localhost:3000` 과
`<codespace>-3000.app.github.dev` 를 모두 Server Action 허용 origin 으로 등록하므로
어느 주소로 접속해도 동작합니다.

## 테스트 데이터

> ⚠️ 아래 스크립트는 `.env.local` 이 가리키는 DB를 직접 수정합니다.
> **개발용 Supabase 프로젝트인지 반드시 확인**하고 실행하세요.

### 직책별 테스트 계정

```bash
npm run seed:accounts        # 생성/갱신 (멱등)
npm run seed:accounts:clean  # 삭제
```

회장 / 감독 / 코치 / 부회장 / 총무 / 감사 / 회원 계정이 만들어집니다.
로그인 정보는 `dev-<직책>@suaza.local` / 비밀번호 `devtest1234` (자세한 목록은
[scripts/seed-dev-accounts.mjs](scripts/seed-dev-accounts.mjs) 참고).

### 더미 회원 / 경기

`supabase/seed/` 의 SQL 을 Supabase 대시보드 SQL Editor 에 붙여넣어 실행합니다.

| 파일 | 용도 |
| --- | --- |
| `dummy_members.sql` | 더미 회원 생성 |
| `dummy_matches.sql` | 더미 경기 생성 |
| `dummy_members_cleanup.sql` | 더미 회원 삭제 |
| `dummy_matches_cleanup.sql` | 더미 경기 삭제 |

### 개발 도구

`.env.local` 에 `NEXT_PUBLIC_DEV_TOOLS=1` 이 있으면 화면에서 직책을 즉시 전환하며 권한별
UI를 확인할 수 있고, 실제 푸시 발송은 차단됩니다. **프로덕션에는 절대 넣지 마세요.**

## 문제 해결

### `Cannot find native binding` (Tailwind oxide)

`npm run dev` 이 500 과 함께 `Cannot find module '@tailwindcss/oxide-linux-x64-gnu'` 를 뱉는 경우.
npm 의 optional dependencies 버그로 플랫폼별 네이티브 패키지가 설치되지 않은 상태입니다.
`npm install` 이 `package-lock.json` 에서 `libc` 필드를 지웠다면 같은 증상입니다.

```bash
git checkout package-lock.json   # 커밋된 lockfile 로 복원
rm -rf node_modules .next
npm ci                           # install 이 아니라 ci — lockfile 을 건드리지 않음
```

`ls node_modules/@tailwindcss/` 에 `oxide-linux-x64-gnu` 가 보이면 정상입니다.

### `.env.local` 을 고쳤는데 반영되지 않음

Next 는 서버 환경 변수를 핫리로드하지 않습니다. dev 서버를 Ctrl+C 후 다시 실행하세요.

## 그 밖의 명령

```bash
npm run lint          # ESLint
npx tsc --noEmit      # 타입 체크
npm run build         # 프로덕션 빌드
```

## 참고 문서

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
