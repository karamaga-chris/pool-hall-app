import React, { useCallback, useState } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
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

function PlayerRow({ player, onPress }) {
  return (
    <TouchableOpacity style={styles.row} onPress={() => onPress(player)} activeOpacity={0.8}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials(player.full_name)}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.name}>{player.full_name}</Text>
        <Text style={styles.meta}>
          {player.phone || 'No phone'} · {player.games_played} games
        </Text>
      </View>
      <Text style={styles.spend}>
        RWF {Number(player.total_spend ?? 0).toLocaleString()}
      </Text>
    </TouchableOpacity>
  );
}

export default function PlayersScreen() {
  const [players, setPlayers]    = useState([]);
  const [search, setSearch]      = useState('');
  const [loading, setLoading]    = useState(true);
  const [refreshing, setRefresh] = useState(false);
  const navigation = useNavigation();

  const fetchPlayers = useCallback(async (term = '', silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/players', {
        params: term ? { search: term } : undefined,
      });
      setPlayers(data);
    } catch {
      Alert.alert('Error', 'Could not load players. Check your connection.');
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, []);

  // Reload (and reflect newly added players) whenever the tab gains focus.
  useFocusEffect(
    useCallback(() => { fetchPlayers(search, true); }, [fetchPlayers, search])
  );

  function handleSearch(term) {
    setSearch(term);
    fetchPlayers(term, true);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.amber} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or phone"
          placeholderTextColor={colors.textDisabled}
          value={search}
          onChangeText={handleSearch}
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      <FlatList
        data={players}
        keyExtractor={p => p.id}
        renderItem={({ item }) => (
          <PlayerRow
            player={item}
            onPress={p => navigation.navigate('PlayerDetail', {
              playerId: p.id,
              playerName: p.full_name,
            })}
          />
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefresh(true); fetchPlayers(search, true); }}
            tintColor={colors.amber}
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {search
              ? 'No players match your search.'
              : 'No players active in the last 24 hours.\nSearch to find any player.'}
          </Text>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AddPlayer')}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color={colors.black} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list:   { padding: spacing.md, gap: spacing.sm },
  empty:  { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },

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

  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 0.5, borderColor: colors.border,
    padding: spacing.md, gap: spacing.md,
  },
  avatar: {
    width: 44, height: 44, borderRadius: radius.full,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  avatarText: { color: colors.amber, fontSize: font.base, fontWeight: '700' },
  rowBody: { flex: 1, gap: 3 },
  name:    { color: colors.textPrimary, fontSize: font.md, fontWeight: '600' },
  meta:    { color: colors.textSecondary, fontSize: font.sm },
  spend:   { color: colors.amber, fontSize: font.sm, fontWeight: '600' },

  fab: {
    position: 'absolute', right: spacing.lg, bottom: spacing.lg,
    width: 56, height: 56, borderRadius: radius.full,
    backgroundColor: colors.amber,
    alignItems: 'center', justifyContent: 'center',
    elevation: 4, shadowColor: colors.black,
    shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
});
