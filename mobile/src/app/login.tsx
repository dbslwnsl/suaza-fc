import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { supabase } from "@/lib/supabase";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  async function onSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      // Supabase 는 영문 메시지를 준다. 사용자에게 보이는 문구는 우리가 정한다.
      setError(
        error.message === "Invalid login credentials"
          ? "이메일 또는 비밀번호가 올바르지 않습니다."
          : error.message,
      );
      setSubmitting(false);
      return;
    }

    // 성공 시 화면 전환은 _layout.tsx 의 AuthGate 가 세션 변화를 보고 처리한다.
    setSubmitting(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerClassName="flex-grow px-7 py-8"
          keyboardShouldPersistTaps="handled"
        >
          <View className="w-full max-w-[400px] mx-auto flex-1">
            <View className="items-center gap-2 mt-16 mb-12">
              <Text className="text-4xl">⚽</Text>
              <Text className="font-bold text-2xl text-suaza-ink tracking-tight">
                OurMatch
              </Text>
            </View>

            <View className="gap-5">
              <View>
                <Text className="text-[12px] text-[#8E8E93] mb-1.5 ml-1">
                  이메일
                </Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="your@email.com"
                  placeholderTextColor="#B0B0B5"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  inputMode="email"
                  className="h-[52px] px-4 rounded-xl bg-white border border-[#E5E5EA] text-[15px] text-suaza-ink"
                />
              </View>

              <View>
                <Text className="text-[12px] text-[#8E8E93] mb-1.5 ml-1">
                  비밀번호
                </Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#B0B0B5"
                  autoCapitalize="none"
                  autoComplete="current-password"
                  secureTextEntry
                  onSubmitEditing={onSubmit}
                  returnKeyType="go"
                  className="h-[52px] px-4 rounded-xl bg-white border border-[#E5E5EA] text-[15px] text-suaza-ink"
                />
              </View>

              {error && (
                <Text className="text-[13px] text-suaza-accent">{error}</Text>
              )}

              <Pressable
                onPress={onSubmit}
                disabled={!canSubmit}
                className={`h-[52px] rounded-xl items-center justify-center ${
                  canSubmit ? "bg-suaza-button" : "bg-suaza-button/40"
                }`}
              >
                {submitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text className="text-white text-[16px] font-bold">로그인</Text>
                )}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
