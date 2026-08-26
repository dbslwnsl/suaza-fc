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

## 푸시

플랫폼 중립 구조다. 서버는 **Expo Push Service** 한 곳에만 보내고, Expo 가 토큰을 보고
APNs(iOS) / FCM(Android) 으로 분배한다. **iOS 를 나중에 추가해도 서버 코드는 바뀌지 않는다.**

저장은 웹과 같은 `push_subscriptions` 테이블이며 `platform` 으로 구분한다
(마이그레이션 `0055_push_platform.sql`).

| platform | 채워지는 컬럼 | 전송 |
| --- | --- | --- |
| `web` | `endpoint` + `p256dh` + `auth` | web-push (VAPID) |
| `ios` / `android` | `expo_push_token` | Expo Push Service |

DB 의 CHECK 제약이 반쪽짜리 행을 막는다. 잘못된 조합은 발송 시점이 아니라 등록 시점에 실패한다.

### 동작시키려면

아래 **빌드** 절차를 따르면 된다. 푸시는 개발 빌드에서만 동작한다 —
Expo Go 는 SDK 53 부터 원격 푸시를 지원하지 않고, 에뮬레이터는 토큰을 받지 못한다.

iOS 를 추가할 때는 EAS 에 Apple Push Key(.p8)를 등록하는 것으로 끝난다.
이 저장소의 코드 변경은 없다.

## 빌드 (EAS)

빌드는 Expo 클라우드에서 돈다. 맥 없이 iOS 빌드도 가능하다.

```bash
npm i -g eas-cli
eas login          # Expo 계정 (무료). 브라우저 인증
eas init           # Expo 프로젝트 생성 → app.json 에 extra.eas.projectId 기록
npm run build:dev  # 안드로이드 개발 빌드 (APK)
```

빌드가 끝나면 QR 코드와 APK 링크가 나온다. 안드로이드 폰에서 설치한 뒤,
`npx expo start --dev-client --tunnel` 로 개발 서버에 붙는다.

| 프로필 | 산출물 | 용도 |
| --- | --- | --- |
| `development` | APK + dev client | 개발 중 실기기 테스트. **푸시 확인은 이걸로** |
| `preview` | APK | 내부 배포용 (설치 파일 직접 전달) |
| `production` | AAB | Play Store 업로드 |

> `eas init` 은 Expo 서버에 프로젝트를 만들고 `app.json` 을 수정한다.
> 커밋 전에 `extra.eas.projectId` 가 들어갔는지 확인할 것.

### 네이티브 폴더를 커밋하지 않는 이유 (CNG)

`android/` `ios/` 는 `.gitignore` 에 있고 `npx expo prebuild` 로 생성한다.
이걸 커밋하고 손으로 고치기 시작하면 iOS 추가 비용이 급격히 올라간다.
네이티브 설정이 필요하면 `app.json` 의 config plugin 으로 표현할 것.

## 아직 안 된 것

- 팀 전환 (현재는 소속 첫 번째 팀 고정)
- 경기 상세 / 출석 / 명단 / 포메이션
- EAS 빌드 설정 (`eas.json`), TestFlight
