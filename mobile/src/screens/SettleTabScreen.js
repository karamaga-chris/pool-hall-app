import React, { useCallback, useState } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, ScrollView, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { colors, spacing, radius, font } from '../utils/theme';

const METHODS = [
  { key: 'cash', label: '💵 Cash' },
  { key: 'momo', label: '📱 MoMo' },
  { key: 'card', label: '💳 Card' },
  { key: 'waived', label: '🎁 Waived' },
];

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short',
  });
}

// Step 1 — default list of players with unsettled games, or search for anyone
function PlayerPicker({ onSelect }) {
  const [search, setSearch]       = useState('');
  const [unpaidPlayers, setUnpaidPlayers] = useState([]);
  const [results, setResults]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefresh]  = useState(false);

  const isSearching = search.trim().length >= 2;

  const fetchUnpaidPlayers = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/payments/unpaid-players');
      setUnpaidPlayers(data);
    } catch {
      Alert.alert('Error', 'Could not load players with unsettled games.');
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, []);

  // Reload each time the tab gains focus (also fires on first mount), so a
  // game settled elsewhere drops off the list.
  useFocusEffect(
    useCallback(() => { fetchUnpaidPlayers(true); }, [fetchUnpaidPlayers])
  );

  async function runSearch(term) {
    setSearch(term);
    if (term.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const { data } = await api.get('/players', { params: { search: term.trim() } });
      setResults(data);
    } catch {
      Alert.alert('Error', 'Could not search players.');
    } finally {
      setSearching(false);
    }
  }

  const data        = isSearching ? results : unpaidPlayers;
  const showSpinner = isSearching ? searching : (loading && !refreshing);

  return (
    <View style={styles.screen}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search any player by name or phone"
          placeholderTextColor={colors.textDisabled}
          value={search}
          onChangeText={runSearch}
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      {!isSearching && (
        <Text style={styles.sectionLabel}>Players with unsettled games</Text>
      )}

      {showSpinner ? (
        <ActivityIndicator color={colors.amber} style={{ marginTop: spacing.lg }} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={p => p.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.playerRow} onPress={() => onSelect(item)} activeOpacity={0.8}>
              <View style={styles.playerBody}>
                <Text style={styles.playerName}>{item.full_name}</Text>
                <Text style={styles.playerMeta}>
                  {!isSearching && item.unpaid_count
                    ? `${item.unpaid_count} unpaid game${item.unpaid_count > 1 ? 's' : ''}`
                    : (item.phone || 'No phone')}
                </Text>
              </View>
              {!isSearching && item.unpaid_total ? (
                <Text style={styles.unpaidBadge}>
                  RWF {Number(item.unpaid_total).toLocaleString()}
                </Text>
              ) : null}
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.list}
          refreshControl={
            !isSearching ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefresh(true); fetchUnpaidPlayers(true); }}
                tintColor={colors.amber}
              />
            ) : undefined
          }
          ListEmptyComponent={
            <Text style={styles.hint}>
              {isSearching
                ? 'No players match your search.'
                : 'No unsettled games right now. 🎉'}
            </Text>
          }
        />
      )}
    </View>
  );
}

// Step 2 — show a player's unpaid games and settle them together
function UnpaidTab({ player, onBack, onSettled }) {
  const [sessions, setSessions] = useState(null);
  const [method, setMethod]     = useState('cash');
  const [paying, setPaying]     = useState(false);

  const load = React.useCallback(async () => {
    setSessions(null);
    try {
      const { data } = await api.get(`/payments/unpaid/${player.id}`);
      setSessions(data);
    } catch {
      Alert.alert('Error', 'Could not load unpaid games.');
      setSessions([]);
    }
  }, [player.id]);

  React.useEffect(() => { load(); }, [load]);

  const total = (sessions || []).reduce((sum, s) => sum + Number(s.amount_due ?? 0), 0);

  async function handlePayAll() {
    if (!sessions?.length) return;
    setPaying(true);
    try {
      const { data } = await api.post('/payments/bulk', {
        player_id:   player.id,
        session_ids: sessions.map(s => s.id),
        method,
      });
      Alert.alert(
        '✅ Tab settled',
        `${data.sessions_paid} game(s) paid — RWF ${Number(data.total_collected).toLocaleString()} via ${method.toUpperCase()}`,
        [{ text: 'Done', onPress: onSettled }]
      );
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not settle tab.');
    } finally {
      setPaying(false);
    }
  }

  if (sessions === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.amber} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.playerHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName}>{player.full_name}</Text>
          <Text style={styles.headerMeta}>{player.phone || 'No phone'}</Text>
        </View>
        <TouchableOpacity onPress={onBack} style={styles.changeBtn}>
          <Text style={styles.changeText}>Change</Text>
        </TouchableOpacity>
      </View>

      {sessions.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.hint}>No unpaid games. This player is all settled. 🎉</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <Text style={styles.sectionLabel}>Unpaid games ({sessions.length})</Text>
          <View style={styles.card}>
            {sessions.map((s, i) => (
              <View
                key={s.id}
                style={[styles.gameRow, i < sessions.length - 1 && styles.gameRowBorder]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.gameTable}>{s.table_label}</Text>
                  <Text style={styles.gameMeta}>
                    {formatDate(s.started_at)} · {s.rate_type}
                  </Text>
                </View>
                <Text style={styles.gameAmount}>
                  RWF {Number(s.amount_due ?? 0).toLocaleString()}
                </Text>
              </View>
            ))}
            <View style={[styles.gameRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>RWF {total.toLocaleString()}</Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>Payment method</Text>
          <View style={styles.methodGrid}>
            {METHODS.map(m => (
              <TouchableOpacity
                key={m.key}
                style={[styles.methodBtn, method === m.key && styles.methodBtnActive]}
                onPress={() => setMethod(m.key)}
              >
                <Text style={[styles.methodText, method === m.key && styles.methodTextActive]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.payBtn, paying && { opacity: 0.7 }]}
            onPress={handlePayAll}
            disabled={paying}
          >
            {paying
              ? <ActivityIndicator color={colors.black} />
              : <Text style={styles.payBtnText}>
                  Pay all {sessions.length} · RWF {total.toLocaleString()}
                </Text>}
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

export default function SettleTabScreen() {
  const [player, setPlayer] = useState(null);

  if (!player) {
    return <PlayerPicker onSelect={setPlayer} />;
  }
  return (
    <UnpaidTab
      player={player}
      onBack={() => setPlayer(null)}
      onSettled={() => setPlayer(null)}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  list:   { padding: spacing.md, gap: spacing.sm },
  hint:   { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.lg, fontSize: font.base },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  searchInput: {
    flex: 1, color: colors.textPrimary, fontSize: font.base,
    paddingVertical: spacing.xs,
  },

  playerRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 0.5, borderColor: colors.border,
    padding: spacing.md,
  },
  playerBody: { flex: 1, gap: 3 },
  playerName: { color: colors.textPrimary, fontSize: font.md, fontWeight: '600' },
  playerMeta: { color: colors.textSecondary, fontSize: font.sm },
  unpaidBadge: { color: colors.amber, fontSize: font.sm, fontWeight: '600', marginRight: spacing.xs },

  playerHeader: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md, gap: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  headerName: { color: colors.textPrimary, fontSize: font.lg, fontWeight: '700' },
  headerMeta: { color: colors.textSecondary, fontSize: font.sm },
  changeBtn:  { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  changeText: { color: colors.amber, fontSize: font.base, fontWeight: '600' },

  sectionLabel: {
    color: colors.textSecondary, fontSize: font.sm, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.8, marginTop: spacing.sm,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 0.5, borderColor: colors.border,
    overflow: 'hidden',
  },
  gameRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.md, gap: spacing.md,
  },
  gameRowBorder: { borderBottomWidth: 0.5, borderBottomColor: colors.border },
  gameTable:  { color: colors.textPrimary, fontSize: font.base, fontWeight: '500' },
  gameMeta:   { color: colors.textSecondary, fontSize: font.sm },
  gameAmount: { color: colors.textPrimary, fontSize: font.base, fontWeight: '600' },

  totalRow:    { backgroundColor: colors.surfaceHigh },
  totalLabel:  { flex: 1, color: colors.textPrimary, fontSize: font.md, fontWeight: '700' },
  totalValue:  { color: colors.amber, fontSize: font.md, fontWeight: '700' },

  methodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  methodBtn: {
    flex: 1, minWidth: '45%',
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, alignItems: 'center',
  },
  methodBtnActive:  { borderColor: colors.amber, backgroundColor: colors.amberDim },
  methodText:       { color: colors.textSecondary, fontSize: font.base },
  methodTextActive: { color: colors.amber, fontWeight: '600' },

  payBtn: {
    backgroundColor: colors.amber, borderRadius: radius.lg,
    padding: spacing.md, alignItems: 'center', marginTop: spacing.sm,
  },
  payBtnText: { color: colors.black, fontSize: font.md, fontWeight: '700' },
});
