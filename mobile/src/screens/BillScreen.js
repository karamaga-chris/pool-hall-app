import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import api from '../api/client';
import { colors, spacing, radius, font } from '../utils/theme';

const METHODS = [
  { key: 'cash', label: '💵 Cash' },
  { key: 'momo', label: '📱 MoMo' },
  { key: 'card', label: '💳 Card' },
  { key: 'waived', label: '🎁 Waived' },
];

export default function BillScreen() {
  const route      = useRoute();
  const navigation = useNavigation();
  const { sessionId, tableLabel, amountDue, players, rateType } = route.params;

  const payablePlayers = (players || []).filter(p => p.id);

  const [method, setMethod]   = useState('cash');
  const [payerId, setPayerId] = useState(payablePlayers[0]?.id ?? null);
  const [loading, setLoading] = useState(false);

  async function handleCollect() {
    setLoading(true);
    try {
      // Record payment, tagging which player settled the bill
      await api.post('/payments', {
        session_id:        sessionId,
        amount:            amountDue,
        method,
        paid_by_player_id: payerId,
      });

      const payerName = payablePlayers.find(p => p.id === payerId)?.name;
      Alert.alert(
        '✅ Payment collected',
        `RWF ${Number(amountDue).toLocaleString()} received via ${method.toUpperCase()}` +
          (payerName ? `\nPaid by ${payerName}` : ''),
        [{ text: 'Done', onPress: () => navigation.navigate('Tables') }]
      );
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not record payment.');
    } finally {
      setLoading(false);
    }
  }

  function handleLogLater() {
    const payerName = payablePlayers.find(p => p.id === payerId)?.name;
    Alert.alert(
      'Log for later?',
      `No payment will be recorded now.${payerName ? ` This game will sit on ${payerName}'s tab` : ' This game will remain unpaid'} until it's settled from the Settle tab.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log it', onPress: confirmLogLater },
      ]
    );
  }

  async function confirmLogLater() {
    setLoading(true);
    try {
      if (payerId) {
        await api.patch(`/sessions/${sessionId}/expected-payer`, { player_id: payerId });
      }
      navigation.navigate('Tables');
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not log this game for later.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>

      {/* Receipt header */}
      <View style={styles.receipt}>
        <Text style={styles.receiptTitle}>🎱 Game Receipt</Text>
        <Text style={styles.receiptTable}>{tableLabel}</Text>

        {/* Players */}
        <View style={styles.divider} />
        <Text style={styles.receiptLabel}>Players</Text>
        {players?.map((p, i) => (
          <Text key={i} style={styles.receiptValue}>{p.name}</Text>
        ))}

        {/* Rate */}
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.receiptLabel}>Rate type</Text>
          <Text style={styles.receiptValue}>
            {rateType === 'peak' ? '⚡ Peak' : 'Off-peak'}
          </Text>
        </View>

        {/* Amount */}
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.amountLabel}>Amount due</Text>
          <Text style={styles.amountValue}>
            RWF {Number(amountDue).toLocaleString()}
          </Text>
        </View>
      </View>

      {/* Payer selection */}
      {payablePlayers.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Who's paying?</Text>
          <View style={styles.methodGrid}>
            {payablePlayers.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[
                  styles.methodBtn,
                  payerId === p.id && styles.methodBtnActive,
                ]}
                onPress={() => setPayerId(p.id)}
              >
                <Text style={[
                  styles.methodText,
                  payerId === p.id && styles.methodTextActive,
                ]}>
                  {p.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Payment method */}
      <Text style={styles.sectionLabel}>Payment method</Text>
      <View style={styles.methodGrid}>
        {METHODS.map(m => (
          <TouchableOpacity
            key={m.key}
            style={[
              styles.methodBtn,
              method === m.key && styles.methodBtnActive,
            ]}
            onPress={() => setMethod(m.key)}
          >
            <Text style={[
              styles.methodText,
              method === m.key && styles.methodTextActive,
            ]}>
              {m.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Actions */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.laterBtn, loading && { opacity: 0.5 }]}
          onPress={handleLogLater}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color={colors.textSecondary} />
            : <Text style={styles.laterBtnText}>Log for later</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.collectBtn, loading && { opacity: 0.7 }]}
          onPress={handleCollect}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color={colors.black} />
            : <Text style={styles.collectBtnText}>
                Collect RWF {Number(amountDue).toLocaleString()}
              </Text>
          }
        </TouchableOpacity>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  inner:  { padding: spacing.md, gap: spacing.lg },

  receipt: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 0.5, borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  receiptTitle: {
    color: colors.textPrimary, fontSize: font.lg,
    fontWeight: '700', textAlign: 'center',
  },
  receiptTable: {
    color: colors.textSecondary, fontSize: font.base,
    textAlign: 'center',
  },
  divider: {
    height: 0.5, backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  receiptLabel: { color: colors.textSecondary, fontSize: font.sm },
  receiptValue: { color: colors.textPrimary, fontSize: font.base, fontWeight: '500' },
  amountLabel:  { color: colors.textPrimary, fontSize: font.md, fontWeight: '600' },
  amountValue:  { color: colors.amber, fontSize: font.xl, fontWeight: '700' },

  sectionLabel: {
    color: colors.textSecondary, fontSize: font.sm,
    fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8,
  },
  methodGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
  },
  methodBtn: {
    flex: 1, minWidth: '45%',
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, alignItems: 'center',
  },
  methodBtnActive: {
    borderColor: colors.amber, backgroundColor: colors.amberDim,
  },
  methodText:       { color: colors.textSecondary, fontSize: font.base },
  methodTextActive: { color: colors.amber, fontWeight: '600' },

  actionsRow: {
    flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm,
  },
  laterBtn: {
    flex: 1,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  laterBtnText: { color: colors.textSecondary, fontSize: font.base, fontWeight: '600' },

  collectBtn: {
    flex: 1.4,
    backgroundColor: colors.amber,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  collectBtnText: { color: colors.black, fontSize: font.md, fontWeight: '700' },
});