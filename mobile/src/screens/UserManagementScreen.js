import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, Modal, ScrollView,
} from 'react-native';
import api from '../api/client';
import { colors, spacing, radius, font } from '../utils/theme';

function StaffRow({ staff, onResetPin, onToggleActive }) {
  return (
    <View style={styles.staffRow}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{staff.full_name[0].toUpperCase()}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.staffName}>{staff.full_name}</Text>
        <Text style={styles.staffPhone}>{staff.phone}</Text>
      </View>
      <View style={[styles.statusDot, { backgroundColor: staff.is_active ? colors.green : colors.red }]} />
      <TouchableOpacity style={styles.iconBtn} onPress={() => onResetPin(staff)}>
        <Text style={styles.iconBtnText}>Reset PIN</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.iconBtn, staff.is_active ? styles.deactivateBtn : styles.activateBtn]}
        onPress={() => onToggleActive(staff)}
      >
        <Text style={[styles.iconBtnText, { color: staff.is_active ? colors.red : colors.green }]}>
          {staff.is_active ? 'Deactivate' : 'Activate'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function UserManagementScreen() {
  const [users, setUsers]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modalVisible, setModal]  = useState(false);
  const [saving, setSaving]       = useState(false);

  // Add staff form state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone]       = useState('');
  const [pin, setPin]           = useState('');

  const fetchUsers = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/users');
      setUsers(data);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not load staff.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  function resetForm() {
    setFullName(''); setPhone(''); setPin('');
  }

  async function handleAddStaff() {
    if (!fullName.trim() || !phone.trim() || !/^\d{4}$/.test(pin)) {
      Alert.alert('Check the form', 'Full name, phone, and a 4-digit PIN are all required.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/auth/users', { full_name: fullName.trim(), phone: phone.trim(), pin });
      Alert.alert('✅ Staff added', `${fullName} can now log in with PIN ${pin}.`);
      resetForm();
      setModal(false);
      fetchUsers();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not create staff account.');
    } finally {
      setSaving(false);
    }
  }

  function onResetPin(staff) {
    Alert.prompt
      ? Alert.prompt(
          `Reset PIN for ${staff.full_name}`,
          'Enter a new 4-digit PIN',
          async (newPin) => {
            if (!/^\d{4}$/.test(newPin)) {
              return Alert.alert('Invalid PIN', 'PIN must be exactly 4 digits.');
            }
            try {
              await api.patch(`/auth/users/${staff.id}`, { pin: newPin });
              Alert.alert('✅ PIN updated', `${staff.full_name}'s new PIN is ${newPin}.`);
            } catch (err) {
              Alert.alert('Error', err.response?.data?.error || 'Could not reset PIN.');
            }
          },
          'plain-text'
        )
      : handleResetPinAndroid(staff);
  }

  // Alert.prompt doesn't exist on Android — fallback to a small modal-free approach
  const [resetTarget, setResetTarget] = useState(null);
  const [newPin, setNewPin] = useState('');

  function handleResetPinAndroid(staff) {
    setResetTarget(staff);
    setNewPin('');
  }

  async function submitPinReset() {
    if (!/^\d{4}$/.test(newPin)) {
      return Alert.alert('Invalid PIN', 'PIN must be exactly 4 digits.');
    }
    try {
      await api.patch(`/auth/users/${resetTarget.id}`, { pin: newPin });
      Alert.alert('✅ PIN updated', `${resetTarget.full_name}'s new PIN is ${newPin}.`);
      setResetTarget(null);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not reset PIN.');
    }
  }

  async function onToggleActive(staff) {
    const action = staff.is_active ? 'deactivate' : 'activate';
    Alert.alert(
      `${action === 'deactivate' ? 'Deactivate' : 'Activate'} ${staff.full_name}?`,
      action === 'deactivate'
        ? 'They will no longer be able to log in.'
        : 'They will be able to log in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action === 'deactivate' ? 'Deactivate' : 'Activate',
          style: action === 'deactivate' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await api.patch(`/auth/users/${staff.id}`, { is_active: !staff.is_active });
              fetchUsers();
            } catch (err) {
              Alert.alert('Error', err.response?.data?.error || 'Could not update status.');
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.amber} size="large" />
      </View>
    );
  }

  const owner = users.find(u => u.role === 'owner');
  const staff = users.filter(u => u.role === 'staff');

  return (
    <View style={styles.screen}>
      <FlatList
        data={staff}
        keyExtractor={u => u.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            {owner && (
              <View style={styles.ownerCard}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{owner.full_name[0].toUpperCase()}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.staffName}>{owner.full_name}</Text>
                  <Text style={styles.staffPhone}>{owner.phone}</Text>
                </View>
                <TouchableOpacity style={styles.iconBtn} onPress={() => onResetPin(owner)}>
                  <Text style={styles.iconBtnText}>Reset PIN</Text>
                </TouchableOpacity>
                <View style={styles.ownerBadge}>
                  <Text style={styles.ownerBadgeText}>OWNER</Text>
                </View>
              </View>
            )}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>Staff accounts ({staff.length})</Text>
              <TouchableOpacity style={styles.addBtn} onPress={() => setModal(true)}>
                <Text style={styles.addBtnText}>+ Add Staff</Text>
              </TouchableOpacity>
            </View>
          </>
        }
        renderItem={({ item }) => (
          <StaffRow staff={item} onResetPin={onResetPin} onToggleActive={onToggleActive} />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No staff accounts yet. Tap "+ Add Staff" to create one.</Text>
        }
      />

      {/* Add staff modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add staff member</Text>

            <Text style={styles.fieldLabel}>Full name</Text>
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              placeholder="e.g. Jean Baptiste"
              placeholderTextColor={colors.textDisabled}
            />

            <Text style={styles.fieldLabel}>Phone number</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="+250 7XX XXX XXX"
              placeholderTextColor={colors.textDisabled}
              keyboardType="phone-pad"
            />

            <Text style={styles.fieldLabel}>4-digit PIN</Text>
            <TextInput
              style={styles.input}
              value={pin}
              onChangeText={setPin}
              placeholder="e.g. 5678"
              placeholderTextColor={colors.textDisabled}
              keyboardType="numeric"
              maxLength={4}
              secureTextEntry
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setModal(false); resetForm(); }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.7 }]}
                onPress={handleAddStaff}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color={colors.black} />
                  : <Text style={styles.saveBtnText}>Create account</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* PIN reset modal (Android-safe) */}
      <Modal visible={!!resetTarget} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reset PIN for {resetTarget?.full_name}</Text>
            <Text style={styles.fieldLabel}>New 4-digit PIN</Text>
            <TextInput
              style={styles.input}
              value={newPin}
              onChangeText={setNewPin}
              keyboardType="numeric"
              maxLength={4}
              secureTextEntry
              placeholder="e.g. 1234"
              placeholderTextColor={colors.textDisabled}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setResetTarget(null)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={submitPinReset}>
                <Text style={styles.saveBtnText}>Update PIN</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list:   { padding: spacing.md, gap: spacing.sm },
  flex:   { flex: 1 },
  empty:  { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },

  ownerCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.amberDim,
    borderRadius: radius.md, borderWidth: 0.5, borderColor: colors.amber,
    padding: spacing.md, marginBottom: spacing.md,
  },
  ownerBadge: {
    backgroundColor: colors.amber, borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  ownerBadgeText: { fontSize: 10, fontWeight: '700', color: colors.black },

  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    color: colors.textSecondary, fontSize: font.sm, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  addBtn: {
    backgroundColor: colors.amber, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  addBtnText: { color: colors.black, fontWeight: '700', fontSize: font.sm },

  staffRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 0.5, borderColor: colors.border,
    padding: spacing.sm, marginBottom: spacing.xs, flexWrap: 'wrap',
  },
  avatar: {
    width: 38, height: 38, borderRadius: radius.full,
    backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center',
  },
  avatarText:  { color: colors.textPrimary, fontWeight: '700', fontSize: font.base },
  staffName:   { color: colors.textPrimary, fontSize: font.base, fontWeight: '500' },
  staffPhone:  { color: colors.textSecondary, fontSize: font.sm },
  statusDot:   { width: 8, height: 8, borderRadius: radius.full },

  iconBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderRadius: radius.sm, backgroundColor: colors.surfaceHigh,
  },
  iconBtnText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  deactivateBtn: { backgroundColor: colors.redDim },
  activateBtn:   { backgroundColor: colors.greenDim },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, gap: spacing.sm,
    borderWidth: 0.5, borderColor: colors.border,
  },
  modalTitle: { color: colors.textPrimary, fontSize: font.md, fontWeight: '700', marginBottom: spacing.xs },
  fieldLabel: { color: colors.textSecondary, fontSize: font.sm },
  input: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.md, borderWidth: 0.5, borderColor: colors.border,
    padding: spacing.md, color: colors.textPrimary, fontSize: font.base,
  },
  modalActions: {
    flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm,
  },
  cancelBtn: {
    flex: 1, padding: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh, alignItems: 'center',
  },
  cancelBtnText: { color: colors.textSecondary, fontWeight: '600' },
  saveBtn: {
    flex: 1, padding: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.amber, alignItems: 'center',
  },
  saveBtnText: { color: colors.black, fontWeight: '700' },
});