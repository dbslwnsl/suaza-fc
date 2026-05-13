@AGENTS.md

# SUAZA FC

## 프로젝트 소개
축구 동호회 **SUAZA FC** 회원용 웹사이트. 회원들이 일정/결과를 확인하고, 사진과 글을 공유하며, 선수별 기록과 포메이션을 관리하는 클럽 내부 플랫폼.

## 기술 스택
- **프레임워크**: Next.js 16 (App Router) + TypeScript
- **스타일링**: Tailwind CSS
- **백엔드/DB/인증**: Supabase (`@supabase/ssr`, `@supabase/supabase-js`)
- **배포**: Vercel

## 주요 기능
- 회원 명단 및 프로필
- 경기 일정 / 결과
- 사진 갤러리
- 게시판
- 선수별 경기 기록
- 포메이션 설정
- 로그인 (감독용 / 선수용 권한 분리)

## 코딩 규칙
- **응답 언어**: 항상 한국어로 응답
- **비밀키**: 모든 비밀키와 환경 변수는 `.env.local`에 저장 (커밋 금지)
- **Supabase 클라이언트**: 반드시 `src/lib/supabase/` 의 헬퍼를 사용
  - 브라우저(Client Component): `src/lib/supabase/client.ts`의 `createClient`
  - 서버(Server Component / Route Handler): `src/lib/supabase/server.ts`의 `createClient`
  - 새 위치에서 `createBrowserClient` / `createServerClient`를 직접 호출하지 말 것

## 폴더 구조
```
suaza-fc/
├── .claude/                 # Claude Code 설정
├── public/                  # 정적 자산 (SVG 아이콘 등)
│   ├── file.svg
│   ├── globe.svg
│   ├── next.svg
│   ├── vercel.svg
│   └── window.svg
├── src/
│   ├── app/                 # Next.js App Router 엔트리
│   │   ├── favicon.ico
│   │   ├── globals.css      # Tailwind 전역 스타일
│   │   ├── layout.tsx       # 루트 레이아웃 (Geist 폰트)
│   │   └── page.tsx         # 홈 화면
│   └── lib/
│       └── supabase/        # Supabase 클라이언트 헬퍼
│           ├── client.ts    # 브라우저용
│           └── server.ts    # 서버 컴포넌트/RSC용 (쿠키 연동)
├── .env.local               # 환경 변수 (gitignored)
├── .gitignore
├── AGENTS.md                # Next.js 에이전트 가이드
├── CLAUDE.md                # 이 문서
├── README.md
├── eslint.config.mjs
├── next.config.ts
├── next-env.d.ts
├── package.json
├── package-lock.json
├── postcss.config.mjs
└── tsconfig.json
```
