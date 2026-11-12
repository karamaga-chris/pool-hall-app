import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import { colors, spacing, radius, font } from '../utils/theme';

function TableCard({ table, onPress }) {
  const isActive = table.status === 'active';
  const isMaint  = table.status === 'maintenance';

  const borderColor = isActive ? colors.amber : isMaint ? colors.red : colors.border;
  const badgeBg     = isActive ? colors.amberDim : isMaint ? colors.redDim : colors.greenDim;
  const badgeColor  = isActive ? colors.amber : isMaint ? colors.red : colors.green;

  return (
    <TouchableOpacity
      style={[styles.card, { borderColor }]}
      onPress={() => onPress(table)}
      activeOpacity={0.8}
    >
      <View style={[styles.tableIcon, { borderColor }]}>
        <View style={[styles.tableFelt, { backgroundColor: isActive ? '#1A4A1A' : '#111F12' }]}>
          <View style={styles.pocket} />
          <View style={[styles.pocket, { right: 0, left: undefined }]} />
          <View style={[styles.pocket, { bottom: 0, top: undefined }]} />
          <View style={[styles.pocket, { bottom: 0, top: undefined, right: 0, left: undefined }]} />
        </View>
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.tableLabel}>{table.label}</Text>
        <View style={[styles.badge, { backgroundColor: badgeBg }]}>
          <Text style={[styles.badgeText, { color: badgeColor }]}>
            {table.status.toUpperCase()}
          </Text>
        </View>

        {isActive && (
          <>
            <Text style={styles.metaText}>
              {table.players?.map(p => p.name).join(' vs ')}
            </Text>
            <Text style={styles.priceText}>
              RWF {Number(table.price_per_game ?? 0).toLocaleString()} · {table.rate_type}
            </Text>
          </>
        )}
        {!isActive && !isMaint && (
          <Text style={styles.metaText}>Tap to start a game</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function TablesScreen() {
  const [tables, setTables]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefresh] = useState(false);
  const navigation = useNavigation();

  const fetchTables = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/tables');
      setTables(data);
    } catch {
      Alert.alert('Error', 'Could not load tables. Check your connection.');
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, []);

  useEffect(() => {
    fetchTables();
    const interval = setInterval(() => fetchTables(true), 30000);
    return () => clearInterval(interval);
  }, [fetchTables]);

  // Refresh when returning from Start/Active session screens
  useFocusEffect(
    useCallback(() => { fetchTables(true); }, [fetchTables])
  );

  function handlePress(table) {
    if (table.status === 'active') {
      navigation.navigate('ActiveSession', {
        sessionId: table.session_id,
        tableLabel: table.label,
      });
    } else {
      navigation.navigate('StartSession', {
        tableId: table.id,
        tableLabel: table.label,
      });
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.amber} size="large" />
      </View>
    );
  }

  const active = tables.filter(t => t.status === 'active').length;

  return (
    <View style={styles.screen}>
      <View style={styles.strip}>
        <View style={styles.stripItem}>
          <Text style={styles.stripValue}>{tables.length}</Text>
          <Text style={styles.stripLabel}>Tables</Text>
        </View>
        <View style={styles.stripDivider} />
        <View style={styles.stripItem}>
          <Text style={[styles.stripValue, active > 0 && { color: colors.amber }]}>
            {active}
          </Text>
          <Text style={styles.stripLabel}>Active</Text>
        </View>
        <View style={styles.stripDivider} />
        <View style={styles.stripItem}>
          <Text style={styles.stripValue}>{tables.length - active}</Text>
          <Text style={styles.stripLabel}>Idle</Text>
        </View>
      </View>

      <FlatList
        data={tables}
        keyExtractor={t => t.id}
        renderItem={({ item }) => <TableCard table={item} onPress={handlePress} />}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefresh(true); fetchTables(true); }}
            tintColor={colors.amber}
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>No tables found.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: colors.bg },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list:    { padding: spacing.md, gap: spacing.sm },
  empty:   { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },

  strip: {
    flexDirection: 'row', backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  stripItem:    { flex: 1, alignItems: 'center' },
  stripValue:   { color: colors.textPrimary, fontSize: font.lg, fontWeight: '600' },
  stripLabel:   { color: colors.textSecondary, fontSize: font.sm },
  stripDivider: { width: 0.5, backgroundColor: colors.border },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 1,
    padding: spacing.md, gap: spacing.md,
  },
  tableIcon: {
    width: 56, height: 36, borderRadius: radius.sm,
    borderWidth: 2, overflow: 'hidden',
  },
  tableFelt: { flex: 1 },
  pocket: {
    position: 'absolute', width: 7, height: 7,
    borderRadius: radius.full, backgroundColor: colors.bg,
    top: 0, left: 0,
  },
  cardBody:  { flex: 1, gap: 3 },
  tableLabel: { color: colors.textPrimary, fontSize: font.md, fontWeight: '600' },
  badge: {
    alignSelf: 'flex-start', paddingHorizontal: spacing.sm,
    paddingVertical: 2, borderRadius: radius.full,
  },
  badgeText:  { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  metaText:   { color: colors.textSecondary, fontSize: font.sm },
  priceText:  { color: colors.amber, fontSize: font.sm, fontWeight: '500' },
});