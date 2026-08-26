# OurMatch 모바일 (Expo / React Native)

iOS · Android 네이티브 앱. 웹([../src](../src), Next.js)과 **같은 Supabase 프로젝트**를 바라본다.

## 왜 웹뷰가 아니라 네이티브인가

- **App Store 심사** — Capacitor 등 웹뷰 래핑은 Guideline 4.2(Minimum Functionality) 반려 대상이다.
  게다가 이 프로젝트는 Server Actions 90개 + 미들웨어 때문에 `next build --output export` 가
  불가능해서, 웹 자산을 앱 번들에 넣는 정상 경로 자체를 못 쓴다.
- **제스처 품질** — 포메이션 에디터·팀 빌더·휠 피커가 핵심 기능인데 웹뷰에서 60fps 를 내기 어렵다.
  Reanimated + Gesture Handler 는 UI 스레드에서 처리한다.

## 시작하기

```bash
cd mobile
npm install
cp .env.example .env.local   # 값은 웹의 ../.env.local 과 동일 (URL + anon 키)
npx expo start
```

- 실기기: Expo Go 앱으로 QR 스캔 (Codespaces 에서는 `--tunnel` 필요)
- 브라우저 확인용: `npx expo start --web` — react-native-web 으로 빠르게 훑어볼 때만 쓴다.
  배포 대상이 아니다.

> Codespaces 는 2코어/7GB 라 안드로이드 에뮬레이터는 실용적이지 않다. 실기기를 쓸 것.

## 환경 변수

`EXPO_PUBLIC_` 접두사가 붙은 값만 앱 번들에 들어간다. 웹의 `NEXT_PUBLIC_SUPABASE_*` 와 같은 값이다.

**`SUPABASE_SERVICE_ROLE_KEY` 는 절대 넣지 말 것.** 앱 바이너리는 누구나 뜯어볼 수 있다.
service_role 이 필요한 로직은 서버에 남긴다.

## 구조

```
src/
├── app/                  expo-router (파일 기반 라우팅)
│   ├── _layout.tsx       루트 — SafeArea, 인증 게이트
│   ├── login.tsx         로그인
│   └── (app)/            로그인해야 들어오는 영역
│       ├── _layout.tsx
│       └── index.tsx     경기 목록
├── lib/
│   ├── supabase.ts       Supabase 클라이언트
│   ├── secure-storage.ts 세션 토큰 저장 (Keychain / EncryptedSharedPreferences)
│   ├── auth.tsx          세션 컨텍스트
│   ├── teams.ts          팀 조회
│   └── matches.ts        경기 조회
└── global.css            NativeWind 진입점
```

## 스타일

NativeWind 4 로 Tailwind 클래스를 그대로 쓴다. 웹의 SUAZA 디자인 토큰
(`suaza-ink`, `suaza-border` 등 — 웹에서 1,290회 사용)을 [tailwind.config.js](tailwind.config.js)
에 그대로 옮겨두어, 웹 UI 를 포팅할 때 `className` 을 대부분 복사할 수 있다.

> 웹은 Tailwind 4, 앱은 NativeWind 가 요구하는 Tailwind 3 이다. 설정 문법은 다르지만
> 클래스명은 같게 유지한다.

## 데이터 접근

지금은 Supabase 를 앱에서 **직접** 호출한다. RLS 가 팀 스코프를 강제하므로 조회는 이걸로 충분하다.
쓰기 중 `service_role` 이 필요한 것들(웹의 Server Actions 90개)은 API 레이어로 빼야 하며,
그건 별도 작업이다.

## 아직 안 된 것

- 푸시 — 웹은 `web-push`(VAPID)를 쓰는데 네이티브는 APNs/FCM 이라 서버까지 다시 짜야 한다
- 팀 전환 (현재는 소속 첫 번째 팀 고정)
- 경기 상세 / 출석 / 명단 / 포메이션
- EAS 빌드 설정 (`eas.json`), TestFlight
