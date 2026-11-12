import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import api from '../api/client';
import { colors, spacing, radius, font } from '../utils/theme';

export default function AddPlayerScreen() {
  const navigation = useNavigation();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone]       = useState('');
  const [notes, setNotes]       = useState('');
  const [saving, setSaving]     = useState(false);

  async function handleSave() {
    const name = fullName.trim();
    if (!name)
      return Alert.alert('Name required', 'Enter the player’s full name.');
    setSaving(true);
    try {
      await api.post('/players', {
        full_name: name,
        phone: phone.trim() || null,
        notes: notes.trim() || null,
      });
      Alert.alert('Player added', `${name} is now enrolled.`);
      navigation.goBack();
    } catch (err) {
      Alert.alert('Could not add', err.response?.data?.error || 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Full name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Jean Bosco"
          placeholderTextColor={colors.textDisabled}
          value={fullName}
          onChangeText={setFullName}
          autoCorrect={false}
          autoFocus
        />

        <Text style={styles.label}>Phone (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="+250 7XX XXX XXX"
          placeholderTextColor={colors.textDisabled}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoCorrect={false}
        />

        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Anything worth remembering"
          placeholderTextColor={colors.textDisabled}
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        <TouchableOpacity
          style={[styles.btn, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color={colors.black} />
            : <Text style={styles.btnText}>Add Player</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.sm },
  label: {
    color: colors.textSecondary, fontSize: font.sm, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.8, marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.md,
    borderWidth: 0.5, borderColor: colors.border,
    padding: spacing.md,
    color: colors.textPrimary, fontSize: font.base,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  btn: {
    backgroundColor: colors.amber, borderRadius: radius.lg,
    padding: spacing.md, alignItems: 'center', marginTop: spacing.lg,
  },
  btnText: { color: colors.black, fontSize: font.md, fontWeight: '700' },
});
