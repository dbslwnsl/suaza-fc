import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  formatMatchDate,
  getMatches,
  STATUS_LABEL,
  type Match,
} from "@/lib/matches";
import { getMyTeams, type MyTeam } from "@/lib/teams";
import { supabase } from "@/lib/supabase";

export default function MatchesScreen() {
  const [team, setTeam] = useState<MyTeam | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const teams = await getMyTeams();
      const current = teams[0] ?? null;
      setTeam(current);
      setMatches(current ? await getMatches(current.id) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-suaza-bg items-center justify-center">
        <ActivityIndicator color="#121726" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-suaza-bg">
      <View className="flex-row items-center justify-between px-5 py-4 bg-white border-b border-suaza-divider">
        <View>
          <Text className="text-[20px] font-bold text-suaza-ink">경기</Text>
          {team && (
            <Text className="text-[13px] text-suaza-ink-muted mt-0.5">
              {team.name}
            </Text>
          )}
        </View>
        <Pressable
          onPress={() => supabase.auth.signOut()}
          hitSlop={8}
          className="px-3 py-1.5 rounded-lg border border-suaza-border"
        >
          <Text className="text-[13px] text-suaza-ink-muted">로그아웃</Text>
        </Pressable>
      </View>

      {error && (
        <View className="mx-5 mt-4 p-3 rounded-xl bg-suaza-accent/10">
          <Text className="text-[13px] text-suaza-accent">{error}</Text>
        </View>
      )}

      <FlatList
        data={matches}
        keyExtractor={(m) => m.id}
        contentContainerClassName="p-5 gap-3"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          !error ? (
            <View className="items-center py-20">
              <Text className="text-[15px] text-suaza-ink-faint">
                {team ? "등록된 경기가 없습니다." : "소속된 팀이 없습니다."}
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => <MatchCard match={item} />}
      />
    </SafeAreaView>
  );
}

function MatchCard({ match }: { match: Match }) {
  const finished = match.our_score !== null && match.opponent_score !== null;

  return (
    <View className="bg-white rounded-2xl border border-suaza-border p-4">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-[13px] text-suaza-ink-muted">
          {formatMatchDate(match.match_date)}
        </Text>
        <View className="px-2 py-0.5 rounded-md bg-suaza-bg border border-suaza-divider">
          <Text className="text-[11px] text-suaza-ink-muted">
            {STATUS_LABEL[match.status] ?? match.status}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center justify-between">
        <Text className="text-[17px] font-bold text-suaza-ink flex-1" numberOfLines={1}>
          vs {match.opponent}
        </Text>
        {finished && (
          <Text className="text-[17px] font-bold text-suaza-ink ml-3">
            {match.our_score} : {match.opponent_score}
          </Text>
        )}
      </View>

      {match.location && (
        <Text className="text-[13px] text-suaza-ink-faint mt-1.5" numberOfLines={1}>
          {match.location}
        </Text>
      )}
    </View>
  );
}
