import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, ScrollView, Modal,
} from 'react-native';
import api from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { colors, spacing, radius, font } from '../utils/theme';
import { useNavigation } from '@react-navigation/native';

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const navigation = useNavigation();
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [edits, setEdits] = useState({});

  // Change own PIN
  const [pinModal, setPinModal]     = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin]         = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinSaving, setPinSaving]   = useState(false);

  function closePinModal() {
    setPinModal(false);
    setCurrentPin(''); setNewPin(''); setConfirmPin('');
  }

  async function submitChangePin() {
    if (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin)) {
      return Alert.alert('Invalid PIN', 'PINs must be exactly 4 digits.');
    }
    if (newPin !== confirmPin) {
      return Alert.alert('PINs do not match', 'New PIN and confirmation must be the same.');
    }
    setPinSaving(true);
    try {
      await api.post('/auth/change-pin', { current_pin: currentPin, new_pin: newPin });
      closePinModal();
      Alert.alert('✅ PIN changed', 'Use your new PIN next time you log in.');
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not change PIN.');
    } finally {
      setPinSaving(false);
    }
  }

  useEffect(() => { fetchRates(); }, []);

  async function fetchRates() {
    try {
      const { data } = await api.get('/rates');
      setRates(data);
      // Pre-fill edit state
      const initial = {};
      data.forEach(r => {
        initial[r.id] = {
          price_per_game: String(r.price_per_game),
          peak_start: r.peak_start.slice(0, 5),
          peak_end: r.peak_end.slice(0, 5),
        };
      });
      setEdits(initial);
    } catch {
      Alert.alert('Error', 'Could not load rate settings.');
    } finally {
      setLoading(false);
    }
  }

  function updateEdit(rateId, field, value) {
    setEdits(prev => ({
      ...prev,
      [rateId]: { ...prev[rateId], [field]: value },
    }));
  }

  async function saveRate(rateId) {
    setSaving(rateId);
    try {
      const edit = edits[rateId];
      await api.patch(`/rates/${rateId}`, {
        price_per_game: parseFloat(edit.price_per_game),
        peak_start: edit.peak_start,
        peak_end: edit.peak_end,
      });
      Alert.alert('✅ Saved', 'Rate updated successfully.');
      fetchRates();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not save rate.');
    } finally {
      setSaving(null);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>

      {/* Profile */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.name?.[0]?.toUpperCase()}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{user?.name}</Text>
          <Text style={styles.profileRole}>{user?.role?.toUpperCase()}</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.manageStaffBtn} onPress={() => setPinModal(true)}>
        <Text style={styles.manageStaffText}>🔑 Change My PIN</Text>
      </TouchableOpacity>

      {user?.role === 'owner' && (
        <TouchableOpacity
          style={styles.manageStaffBtn}
          onPress={() => navigation.navigate('UserManagement')}
        >
          <Text style={styles.manageStaffText}>👥 Manage Staff Accounts</Text>
        </TouchableOpacity>
      )}

      {/* Rate settings — owner only */}
      {user?.role === 'owner' && (
        <>
          <Text style={styles.sectionLabel}>Pricing & Hours</Text>
          <Text style={styles.sectionHint}>
            Set the price per game and hours for each rate type.
          </Text>

          {loading ? (
            <ActivityIndicator color={colors.amber} />
          ) : (
            rates.map(rate => (
              <View key={rate.id} style={styles.rateCard}>
                <Text style={styles.rateTitle}>
                  {rate.rate_type === 'peak' ? '⚡ Peak' : '🌙 Off-peak'}
                </Text>

                <Text style={styles.fieldLabel}>Price per game (RWF)</Text>
                <TextInput
                  style={styles.input}
                  value={edits[rate.id]?.price_per_game}
                  onChangeText={v => updateEdit(rate.id, 'price_per_game', v)}
                  keyboardType="numeric"
                  placeholderTextColor={colors.textDisabled}
                />

                <Text style={styles.fieldLabel}>Start time (HH:MM)</Text>
                <TextInput
                  style={styles.input}
                  value={edits[rate.id]?.peak_start}
                  onChangeText={v => updateEdit(rate.id, 'peak_start', v)}
                  placeholder="e.g. 17:00"
                  placeholderTextColor={colors.textDisabled}
                />

                <Text style={styles.fieldLabel}>End time (HH:MM)</Text>
                <TextInput
                  style={styles.input}
                  value={edits[rate.id]?.peak_end}
                  onChangeText={v => updateEdit(rate.id, 'peak_end', v)}
                  placeholder="e.g. 23:00"
                  placeholderTextColor={colors.textDisabled}
                />

                <TouchableOpacity
                  style={[styles.saveBtn, saving === rate.id && { opacity: 0.7 }]}
                  onPress={() => saveRate(rate.id)}
                  disabled={saving === rate.id}
                >
                  {saving === rate.id
                    ? <ActivityIndicator color={colors.black} />
                    : <Text style={styles.saveBtnText}>Save changes</Text>
                  }
                </TouchableOpacity>
              </View>
            ))
          )}
        </>
      )}

      {user?.role === 'staff' && (
        <View style={styles.staffNote}>
          <Text style={styles.staffNoteText}>
            ⚙️ Pricing settings are only available to the owner.
          </Text>
        </View>
      )}

      <Modal visible={pinModal} animationType="fade" transparent onRequestClose={closePinModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.rateTitle}>Change my PIN</Text>

            <Text style={styles.fieldLabel}>Current PIN</Text>
            <TextInput
              style={styles.input} value={currentPin} onChangeText={setCurrentPin}
              keyboardType="numeric" maxLength={4} secureTextEntry
              placeholderTextColor={colors.textDisabled}
            />
            <Text style={styles.fieldLabel}>New 4-digit PIN</Text>
            <TextInput
              style={styles.input} value={newPin} onChangeText={setNewPin}
              keyboardType="numeric" maxLength={4} secureTextEntry
              placeholderTextColor={colors.textDisabled}
            />
            <Text style={styles.fieldLabel}>Confirm new PIN</Text>
            <TextInput
              style={styles.input} value={confirmPin} onChangeText={setConfirmPin}
              keyboardType="numeric" maxLength={4} secureTextEntry
              placeholderTextColor={colors.textDisabled}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closePinModal}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, pinSaving && { opacity: 0.7 }]}
                onPress={submitChangePin}
                disabled={pinSaving}
              >
                {pinSaving
                  ? <ActivityIndicator color={colors.black} />
                  : <Text style={styles.saveBtnText}>Update PIN</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  inner: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },

  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg, borderWidth: 0.5, borderColor: colors.border,
    padding: spacing.md,
  },
  avatar: {
    width: 48, height: 48, borderRadius: radius.full,
    backgroundColor: colors.amberDim,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: colors.amber, fontSize: font.lg, fontWeight: '700' },
  profileInfo: { flex: 1 },
  profileName: { color: colors.textPrimary, fontSize: font.base, fontWeight: '600' },
  profileRole: { color: colors.textSecondary, fontSize: font.sm },
  logoutBtn: {
    backgroundColor: colors.redDim, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  logoutText: { color: colors.red, fontWeight: '600', fontSize: font.sm },

  sectionLabel: {
    color: colors.textSecondary, fontSize: font.sm,
    fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8,
  },
  sectionHint: { color: colors.textDisabled, fontSize: font.sm, marginTop: -spacing.sm },

  rateCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg, borderWidth: 0.5, borderColor: colors.border,
    padding: spacing.md, gap: spacing.sm,
  },
  rateTitle: { color: colors.textPrimary, fontSize: font.md, fontWeight: '600' },
  fieldLabel: { color: colors.textSecondary, fontSize: font.sm },
  input: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.md, borderWidth: 0.5, borderColor: colors.border,
    padding: spacing.md, color: colors.textPrimary, fontSize: font.base,
  },
  saveBtn: {
    backgroundColor: colors.amber, borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center', marginTop: spacing.sm,
  },
  saveBtnText: { color: colors.black, fontWeight: '700', fontSize: font.base },

  staffNote: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.md, padding: spacing.md,
  },
  staffNoteText: { color: colors.textSecondary, fontSize: font.base, textAlign: 'center' },
  manageStaffBtn: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg, borderWidth: 0.5, borderColor: colors.border,
    padding: spacing.md, alignItems: 'center',
  },
  manageStaffText: { color: colors.textPrimary, fontSize: font.base, fontWeight: '600' },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, gap: spacing.sm,
    borderWidth: 0.5, borderColor: colors.border,
  },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  cancelBtn: {
    flex: 1, padding: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh, alignItems: 'center',
  },
  cancelBtnText: { color: colors.textSecondary, fontWeight: '600' },
  modalSaveBtn: {
    flex: 1, padding: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.amber, alignItems: 'center',
  },
});