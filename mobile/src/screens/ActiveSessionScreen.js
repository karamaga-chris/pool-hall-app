import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import api from '../api/client';
import { colors, spacing, radius, font } from '../utils/theme';

function elapsedLabel(startedAt) {
  if (!startedAt) return '—';
  const mins = Math.max(0, Math.round((Date.now() - new Date(startedAt)) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function ActiveSessionScreen() {
  const navigation = useNavigation();
  const route      = useRoute();
  const { sessionId } = route.params;

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding]   = useState(false);

  const fetchSession = useCallback(async () => {
    try {
      const { data } = await api.get(`/sessions/${sessionId}`);
      setSession(data);
    } catch {
      Alert.alert('Error', 'Could not load this session.');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { fetchSession(); }, [fetchSession]);

  function confirmEnd() {
    Alert.alert(
      'End game?',
      'This marks the session complete and frees the table.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'End game', style: 'destructive', onPress: handleEnd },
      ]
    );
  }

  async function handleEnd() {
  setEnding(true);
  try {
    await api.post(`/sessions/${sessionId}/end`);
    navigation.replace('Bill', {
      sessionId,
      tableLabel: session.table_label,
      amountDue:  session.amount_due ?? session.price_per_game,
      players:    session.players,
      rateType:   session.rate_type,
    });
  } catch (err) {
    Alert.alert('Could not end', err.response?.data?.error || 'Try again.');
  } finally {
    setEnding(false);
  }
}

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.amber} size="large" />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Session not found.</Text>
      </View>
    );
  }

  const players = session.players || [];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.tableLabel}>{session.table_label}</Text>
          <View style={[styles.badge, { backgroundColor: colors.amberDim }]}>
            <Text style={[styles.badgeText, { color: colors.amber }]}>
              {String(session.status || 'active').toUpperCase()}
            </Text>
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>
                RWF {Number(session.amount_due ?? session.price_per_game ?? 0).toLocaleString()}
              </Text>
              <Text style={styles.metricLabel}>Amount due</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{elapsedLabel(session.started_at)}</Text>
              <Text style={styles.metricLabel}>Elapsed</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{session.rate_type || '—'}</Text>
              <Text style={styles.metricLabel}>Rate</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Players ({players.length})</Text>
        {players.map(p => (
          <View key={p.id} style={styles.playerRow}>
            <Text style={styles.playerName}>{p.name}</Text>
            {p.phone ? <Text style={styles.playerPhone}>{p.phone}</Text> : null}
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.endBtn, ending && { opacity: 0.5 }]}
          onPress={confirmEnd}
          disabled={ending}
        >
          {ending
            ? <ActivityIndicator color={colors.white} />
            : <Text style={styles.endBtnText}>End Game</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: colors.bg },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md },
  empty:   { color: colors.textSecondary },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.amber,
    padding: spacing.md, gap: spacing.sm,
  },
  tableLabel: { color: colors.textPrimary, fontSize: font.lg, fontWeight: '700' },
  badge: {
    alignSelf: 'flex-start', paddingHorizontal: spacing.sm,
    paddingVertical: 2, borderRadius: radius.full,
  },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },

  metricsRow: {
    flexDirection: 'row', marginTop: spacing.sm,
    borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: spacing.md,
  },
  metric:        { flex: 1, alignItems: 'center', gap: 2 },
  metricValue:   { color: colors.textPrimary, fontSize: font.md, fontWeight: '600' },
  metricLabel:   { color: colors.textSecondary, fontSize: font.sm },
  metricDivider: { width: 0.5, backgroundColor: colors.border },

  sectionTitle: {
    color: colors.textSecondary, fontSize: font.sm, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.8, marginTop: spacing.sm,
  },
  playerRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, gap: 2,
  },
  playerName:  { color: colors.textPrimary, fontSize: font.md, fontWeight: '600' },
  playerPhone: { color: colors.textSecondary, fontSize: font.sm },

  footer: {
    borderTopWidth: 0.5, borderTopColor: colors.border,
    backgroundColor: colors.surface, padding: spacing.md,
  },
  endBtn: {
    backgroundColor: colors.red, borderRadius: radius.lg,
    padding: spacing.md, alignItems: 'center',
  },
  endBtnText: { color: colors.white, fontSize: font.md, fontWeight: '700' },
});
