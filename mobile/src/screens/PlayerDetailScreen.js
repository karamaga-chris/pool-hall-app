import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView,
  StyleSheet, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useRoute, useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import { colors, spacing, radius, font } from '../utils/theme';

function initials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0].toUpperCase())
    .join('');
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default function PlayerDetailScreen() {
  const { params }  = useRoute();
  const { playerId } = params;

  const [player, setPlayer]      = useState(null);
  const [loading, setLoading]    = useState(true);
  const [refreshing, setRefresh] = useState(false);

  const fetchPlayer = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get(`/players/${playerId}`);
      setPlayer(data);
    } catch (err) {
      Alert.alert(
        'Error',
        err.response?.status === 404
          ? 'This player no longer exists.'
          : 'Could not load player.'
      );
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, [playerId]);

  useFocusEffect(
    useCallback(() => { fetchPlayer(true); }, [fetchPlayer])
  );

  if (loading || !player) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.amber} size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefresh(true); fetchPlayer(true); }}
          tintColor={colors.amber}
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(player.full_name)}</Text>
        </View>
        <Text style={styles.name}>{player.full_name}</Text>
        <Text style={styles.phone}>{player.phone || 'No phone on file'}</Text>
      </View>

      <View style={styles.stats}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{player.games_played}</Text>
          <Text style={styles.statLabel}>Games</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.amber }]}>
            RWF {Number(player.total_spend ?? 0).toLocaleString()}
          </Text>
          <Text style={styles.statLabel}>Total Spend</Text>
        </View>
      </View>

      {player.notes ? (
        <View style={styles.notesCard}>
          <Text style={styles.sectionLabel}>Notes</Text>
          <Text style={styles.notesText}>{player.notes}</Text>
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>Recent games</Text>
      {player.history?.length ? (
        player.history.map(game => (
          <View key={game.id} style={styles.gameRow}>
            <View style={styles.gameBody}>
              <Text style={styles.gameTable}>{game.table_label}</Text>
              <Text style={styles.gameMeta}>
                {formatDate(game.started_at)} · {game.rate_type}
              </Text>
            </View>
          </View>
        ))
      ) : (
        <Text style={styles.empty}>No completed games yet.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: colors.bg },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md },
  empty:   { color: colors.textSecondary, marginTop: spacing.xs },

  header: { alignItems: 'center', gap: spacing.xs },
  avatar: {
    width: 80, height: 80, borderRadius: radius.full,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  avatarText: { color: colors.amber, fontSize: font.xl, fontWeight: '700' },
  name:  { color: colors.textPrimary, fontSize: font.lg, fontWeight: '700', marginTop: spacing.sm },
  phone: { color: colors.textSecondary, fontSize: font.base },

  stats: {
    flexDirection: 'row', backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 0.5, borderColor: colors.border,
    paddingVertical: spacing.md,
  },
  statItem:    { flex: 1, alignItems: 'center', gap: 2 },
  statValue:   { color: colors.textPrimary, fontSize: font.md, fontWeight: '700' },
  statLabel:   { color: colors.textSecondary, fontSize: font.sm },
  statDivider: { width: 0.5, backgroundColor: colors.border },

  sectionLabel: {
    color: colors.textSecondary, fontSize: font.sm, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.8, marginTop: spacing.sm,
  },
  notesCard: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 0.5, borderColor: colors.border,
    padding: spacing.md, gap: spacing.xs,
  },
  notesText: { color: colors.textPrimary, fontSize: font.base, lineHeight: 22 },

  gameRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 0.5, borderColor: colors.border,
    padding: spacing.md,
  },
  gameBody:  { flex: 1, gap: 3 },
  gameTable: { color: colors.textPrimary, fontSize: font.base, fontWeight: '600' },
  gameMeta:  { color: colors.textSecondary, fontSize: font.sm },
});
