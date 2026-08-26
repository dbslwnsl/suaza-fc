import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// ============================================================
// Supabase 세션 토큰 저장소
//
// AsyncStorage 는 평문이라 기기가 털리면 세션이 그대로 노출된다.
// expo-secure-store 는 iOS Keychain / Android EncryptedSharedPreferences 를
// 쓰지만 값 하나당 2048 바이트 제한이 있고, Supabase 세션(JWT + refresh token)은
// 이를 넘길 수 있다. 그래서 조각내어 저장한다.
//
//   <key>      -> 조각 개수 (예: "3")
//   <key>.0..n -> 각 조각
//
// 웹(expo start --web)에서는 SecureStore 가 없으므로 localStorage 로 대체한다.
// 개발 중 브라우저로 빠르게 확인하기 위한 경로이며, 배포 대상이 아니다.
// ============================================================

const CHUNK_SIZE = 1800;

const isWeb = Platform.OS === "web";

async function getItem(key: string): Promise<string | null> {
  if (isWeb) return globalThis.localStorage?.getItem(key) ?? null;

  const head = await SecureStore.getItemAsync(key);
  if (head === null) return null;

  const count = Number(head);
  // 예전 형식(조각내지 않은 값)이 남아 있으면 그대로 돌려준다.
  if (!Number.isInteger(count) || count < 1) return head;

  const chunks: string[] = [];
  for (let i = 0; i < count; i++) {
    const part = await SecureStore.getItemAsync(`${key}.${i}`);
    // 조각이 하나라도 비면 세션이 깨진 것 — 통째로 버리고 재로그인시킨다.
    if (part === null) {
      await removeItem(key);
      return null;
    }
    chunks.push(part);
  }
  return chunks.join("");
}

async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    globalThis.localStorage?.setItem(key, value);
    return;
  }

  // 새로 쓰기 전에 이전 조각을 지운다. 값이 짧아졌을 때 꼬리가 남는 것을 막는다.
  await removeItem(key);

  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) {
    chunks.push(value.slice(i, i + CHUNK_SIZE));
  }

  for (let i = 0; i < chunks.length; i++) {
    await SecureStore.setItemAsync(`${key}.${i}`, chunks[i]);
  }
  await SecureStore.setItemAsync(key, String(chunks.length));
}

async function removeItem(key: string): Promise<void> {
  if (isWeb) {
    globalThis.localStorage?.removeItem(key);
    return;
  }

  const head = await SecureStore.getItemAsync(key);
  if (head !== null) {
    const count = Number(head);
    if (Number.isInteger(count) && count >= 1) {
      for (let i = 0; i < count; i++) {
        await SecureStore.deleteItemAsync(`${key}.${i}`);
      }
    }
  }
  await SecureStore.deleteItemAsync(key);
}

/** Supabase auth 의 storage 어댑터 인터페이스에 맞춘 객체. */
export const secureStorage = { getItem, setItem, removeItem };
