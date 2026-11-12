import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import { colors, spacing, radius, font } from '../utils/theme';

export default function StartSessionScreen() {
  const navigation = useNavigation();
  const route      = useRoute();
  const { tableId } = route.params;

  const [players, setPlayers]   = useState([]);
  const [selected, setSelected] = useState([]);   // array of player ids
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(true);
  const [starting, setStarting] = useState(false);

  const fetchPlayers = useCallback(async (term = '') => {
    setLoading(true);
    try {
      const { data } = await api.get('/players', {
        params: term ? { search: term } : undefined,
      });
      setPlayers(data);
    } catch {
      Alert.alert('Error', 'Could not load players. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPlayers(); }, [fetchPlayers]);

  // "+ Add" button in the header → AddPlayer screen
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => navigation.navigate('AddPlayer')} hitSlop={8}>
          <Text style={styles.headerAdd}>+ Add</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  // Refresh the list after returning from Add Player
  useFocusEffect(
    useCallback(() => { fetchPlayers(search.trim()); }, [fetchPlayers, search])
  );

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => fetchPlayers(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search, fetchPlayers]);

  function toggle(id) {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  }

  async function handleStart() {
    if (selected.length !== 2)
      return Alert.alert('Select players', 'Pick exactly 2 enrolled players.');
    setStarting(true);
    try {
      const { data } = await api.post('/sessions/start', {
        pool_table_id: tableId,
        player_ids: selected,
      });
      Alert.alert('Game started', data.message || 'Session started.');
      navigation.goBack();
    } catch (err) {
      Alert.alert('Could not start', err.response?.data?.error || 'Try again.');
    } finally {
      setStarting(false);
    }
  }

  function renderItem({ item }) {
    const isSelected = selected.includes(item.id);
    const isDisabled = !isSelected && selected.length >= 2;
    return (
      <TouchableOpacity
        style={[styles.row, isSelected && styles.rowSelected, isDisabled && styles.rowDisabled]}
        onPress={() => toggle(item.id)}
        activeOpacity={0.8}
        disabled={isDisabled}
      >
        <View style={styles.rowBody}>
          <Text style={styles.name}>{item.full_name}</Text>
          {item.phone ? <Text style={styles.sub}>{item.phone}</Text> : null}
        </View>
        <View style={[styles.check, isSelected && styles.checkOn]}>
          {isSelected && <Text style={styles.checkMark}>✓</Text>}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.screen}>
      <TextInput
        style={styles.search}
        placeholder="Search players by name or phone"
        placeholderTextColor={colors.textDisabled}
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.amber} size="large" />
        </View>
      ) : (
        <FlatList
          data={players}
          keyExtractor={p => p.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No players found.</Text>}
        />
      )}

      <View style={styles.footer}>
        <Text style={styles.countText}>
          {selected.length}/2 selected
        </Text>
        <TouchableOpacity
          style={[styles.btn, (selected.length !== 2 || starting) && { opacity: 0.5 }]}
          onPress={handleStart}
          disabled={selected.length !== 2 || starting}
        >
          {starting
            ? <ActivityIndicator color={colors.black} />
            : <Text style={styles.btnText}>Start Game</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerAdd: { color: colors.amber, fontSize: font.base, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list:   { padding: spacing.md, gap: spacing.sm },
  empty:  { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },

  search: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.md,
    borderWidth: 0.5, borderColor: colors.border,
    margin: spacing.md, marginBottom: 0,
    padding: spacing.md,
    color: colors.textPrimary, fontSize: font.base,
  },

  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, gap: spacing.md,
  },
  rowSelected: { borderColor: colors.amber },
  rowDisabled: { opacity: 0.4 },
  rowBody: { flex: 1, gap: 2 },
  name: { color: colors.textPrimary, fontSize: font.md, fontWeight: '600' },
  sub:  { color: colors.textSecondary, fontSize: font.sm },
  check: {
    width: 26, height: 26, borderRadius: radius.full,
    borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.amber, borderColor: colors.amber },
  checkMark: { color: colors.black, fontSize: font.sm, fontWeight: '800' },

  footer: {
    borderTopWidth: 0.5, borderTopColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md, gap: spacing.sm,
  },
  countText: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'center' },
  btn: {
    backgroundColor: colors.amber, borderRadius: radius.lg,
    padding: spacing.md, alignItems: 'center',
  },
  btnText: { color: colors.black, fontSize: font.md, fontWeight: '700' },
});
