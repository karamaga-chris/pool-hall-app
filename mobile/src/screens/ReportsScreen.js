import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, Dimensions, Platform,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import api from '../api/client';
import { colors, spacing, radius, font } from '../utils/theme';
import * as FileSystem from 'expo-file-system';

const PERIODS = ['Day', 'Week', 'Month', 'Custom'];
const screenWidth = Dimensions.get('window').width - spacing.md * 2 - spacing.md * 2;

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

function formatRange(period, anchorDate, customFrom, customTo) {
  if (period === 'Custom') return `${customFrom} → ${customTo}`;
  if (period === 'Day') {
    const isToday = toISODate(anchorDate) === toISODate(new Date());
    return isToday ? 'Today' : anchorDate.toDateString();
  }
  if (period === 'Week') {
    const start = new Date(anchorDate);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return `${start.toDateString().slice(4)} – ${end.toDateString().slice(4)}`;
  }
  if (period === 'Month') {
    return anchorDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
}

function getRangeForPeriod(period, anchorDate) {
  const d = new Date(anchorDate);
  if (period === 'Day') return { from: toISODate(d), to: toISODate(d) };
  if (period === 'Week') {
    const start = new Date(d); start.setDate(start.getDate() - start.getDay());
    const end = new Date(start); end.setDate(end.getDate() + 6);
    return { from: toISODate(start), to: toISODate(end) };
  }
  if (period === 'Month') {
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { from: toISODate(start), to: toISODate(end) };
  }
}

function StatCard({ label, value, accent, danger }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[
        styles.statValue,
        accent && { color: colors.amber },
        danger && { color: colors.red },
      ]}>{value}</Text>
    </View>
  );
}

export default function ReportsScreen() {
  const [period, setPeriod] = useState('Day');
  const [anchorDate, setAnchor] = useState(new Date());
  const [customFrom, setCustomFrom] = useState(toISODate(new Date(Date.now() - 6 * 86400000)));
  const [customTo, setCustomTo] = useState(toISODate(new Date()));
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const range = period === 'Custom'
        ? { from: customFrom, to: customTo }
        : getRangeForPeriod(period, anchorDate);

      const { data } = await api.get(`/reports/period?from=${range.from}&to=${range.to}`);
      setReport(data);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not load report.');
    } finally {
      setLoading(false);
    }
  }, [period, anchorDate, customFrom, customTo]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  function navigate(dir) {
    const d = new Date(anchorDate);
    if (period === 'Day') d.setDate(d.getDate() + dir);
    if (period === 'Week') d.setDate(d.getDate() + dir * 7);
    if (period === 'Month') d.setMonth(d.getMonth() + dir);
    const today = new Date();
    if (d > today) return; // can't navigate into the future
    setAnchor(d);
  }

  const isAtPresent = (() => {
    if (period === 'Day') return toISODate(anchorDate) === toISODate(new Date());
    if (period === 'Week') return getRangeForPeriod('Week', anchorDate).to >= toISODate(new Date());
    if (period === 'Month') return getRangeForPeriod('Month', anchorDate).to >= toISODate(new Date());
    return true;
  })();

  async function handleExportPDF() {
    if (!report) return;
    setExporting(true);
    try {
      const range = period === 'Custom' ? `${customFrom} to ${customTo}` : formatRange(period, anchorDate);
      const rows = report.by_table.map(t => `
        <tr>
          <td>${t.label}</td>
          <td style="text-align:right">${t.sessions}</td>
          <td style="text-align:right">RWF ${Number(t.revenue).toLocaleString()}</td>
        </tr>
      `).join('');

      const html = `
        <html>
          <body style="font-family: Helvetica; padding: 24px;">
            <h1 style="font-size:20px;">Pool Hall Report</h1>
            <p style="color:#666;">${range}</p>
            <table style="width:100%; margin-top:16px; border-collapse:collapse;">
              <tr><td style="padding:6px 0;">Total revenue</td><td style="text-align:right; font-weight:bold;">RWF ${Number(report.totals.total_revenue).toLocaleString()}</td></tr>
              <tr><td style="padding:6px 0;">Total collected</td><td style="text-align:right;">RWF ${Number(report.totals.total_collected).toLocaleString()}</td></tr>
              <tr><td style="padding:6px 0;">Outstanding</td><td style="text-align:right; color:#c0392b;">RWF ${Number(report.totals.outstanding).toLocaleString()}</td></tr>
              <tr><td style="padding:6px 0;">Games played</td><td style="text-align:right;">${report.totals.total_sessions}</td></tr>
            </table>
            <h3 style="margin-top:24px; font-size:15px;">By table</h3>
            <table style="width:100%; border-collapse:collapse; font-size:13px;">
              <tr style="border-bottom:1px solid #ddd;"><th style="text-align:left; padding:6px 0;">Table</th><th style="text-align:right;">Games</th><th style="text-align:right;">Revenue</th></tr>
              ${rows}
            </table>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });

      // Copy to document directory — sharing sometimes can't read the print cache directly
      const fileName = `pool-hall-report-${Date.now()}.pdf`;
      const destUri = `${FileSystem.documentDirectory}${fileName}`;
      await FileSystem.copyAsync({ from: uri, to: destUri });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(destUri, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Saved', `Report saved to ${destUri}`);
      }
    } catch (err) {
      console.log('PDF EXPORT ERROR:', err);
      Alert.alert('Export failed', String(err.message || err));
    } finally {
      setExporting(false);
    }
  }

  const chartData = report?.daily?.length > 1 ? {
    labels: report.daily.map(d => new Date(d.date).getDate().toString()),
    datasets: [{ data: report.daily.map(d => Number(d.revenue)) }],
  } : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>

      {/* Period switcher */}
      <View style={styles.switcher}>
        {PERIODS.map(p => (
          <TouchableOpacity
            key={p}
            style={[styles.switchBtn, period === p && styles.switchBtnActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[styles.switchText, period === p && styles.switchTextActive]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Date navigation or custom range inputs */}
      {period !== 'Custom' ? (
        <View style={styles.dateNav}>
          <TouchableOpacity onPress={() => navigate(-1)} hitSlop={10}>
            <Text style={styles.navArrow}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.dateText}>{formatRange(period, anchorDate)}</Text>
          <TouchableOpacity onPress={() => navigate(1)} disabled={isAtPresent} hitSlop={10}>
            <Text style={[styles.navArrow, isAtPresent && { color: colors.textDisabled }]}>›</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.customRow}>
          <View style={styles.customField}>
            <Text style={styles.fieldLabel}>From</Text>
            <Text style={styles.dateInputText} onPress={() => { }}>{customFrom}</Text>
          </View>
          <View style={styles.customField}>
            <Text style={styles.fieldLabel}>To</Text>
            <Text style={styles.dateInputText} onPress={() => { }}>{customTo}</Text>
          </View>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={colors.amber} size="large" style={{ marginTop: spacing.xl }} />
      ) : report ? (
        <>
          {/* Summary cards */}
          <View style={styles.cardGrid}>
            <StatCard label="Revenue" value={`RWF ${Number(report.totals.total_revenue).toLocaleString()}`} accent />
            <StatCard label="Games" value={report.totals.total_sessions} />
            <StatCard label="Collected" value={`RWF ${Number(report.totals.total_collected).toLocaleString()}`} />
            <StatCard label="Outstanding" value={`RWF ${Number(report.totals.outstanding).toLocaleString()}`} danger={report.totals.outstanding > 0} />
          </View>

          {/* Trend chart */}
          {chartData && (
            <>
              <Text style={styles.sectionLabel}>Revenue trend</Text>
              <View style={styles.chartCard}>
                <LineChart
                  data={chartData}
                  width={screenWidth}
                  height={160}
                  withDots={false}
                  withInnerLines={false}
                  withOuterLines={false}
                  chartConfig={{
                    backgroundGradientFrom: colors.surface,
                    backgroundGradientTo: colors.surface,
                    decimalPlaces: 0,
                    color: () => colors.amber,
                    labelColor: () => colors.textSecondary,
                    propsForBackgroundLines: { stroke: 'transparent' },
                  }}
                  bezier
                  style={{ borderRadius: radius.md }}
                />
              </View>
            </>
          )}

          {/* By table */}
          <Text style={styles.sectionLabel}>By table</Text>
          <View style={styles.tableCard}>
            {report.by_table.map((t, i) => (
              <View key={i} style={[styles.tableRow, i < report.by_table.length - 1 && styles.tableRowBorder]}>
                <Text style={styles.tableName}>{t.label}</Text>
                <View style={styles.tableStats}>
                  <Text style={styles.tableStatText}>{t.sessions} games</Text>
                  <Text style={styles.tableRevenue}>RWF {Number(t.revenue).toLocaleString()}</Text>
                </View>
              </View>
            ))}
          </View>

          {report.totals.total_sessions === 0 && (
            <Text style={styles.empty}>No games recorded for this period.</Text>
          )}

          {/* Export */}
          <TouchableOpacity
            style={[styles.exportBtn, exporting && { opacity: 0.6 }]}
            onPress={handleExportPDF}
            disabled={exporting || report.totals.total_sessions === 0}
          >
            {exporting
              ? <ActivityIndicator color={colors.textSecondary} />
              : <Text style={styles.exportBtnText}>Export PDF</Text>}
          </TouchableOpacity>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  inner: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },

  switcher: {
    flexDirection: 'row', backgroundColor: colors.surface,
    borderRadius: radius.md, padding: 3, gap: 2,
  },
  switchBtn: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: radius.sm },
  switchBtnActive: { backgroundColor: colors.amber },
  switchText: { color: colors.textSecondary, fontSize: font.sm },
  switchTextActive: { color: colors.black, fontWeight: '600' },

  dateNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 0.5, borderColor: colors.border, padding: spacing.sm,
  },
  navArrow: { color: colors.amber, fontSize: 22, fontWeight: '600', paddingHorizontal: spacing.sm },
  dateText: { color: colors.textPrimary, fontSize: font.base, fontWeight: '500' },

  customRow: { flexDirection: 'row', gap: spacing.sm },
  customField: { flex: 1 },
  fieldLabel: { color: colors.textSecondary, fontSize: font.sm, marginBottom: 4 },
  dateInputText: {
    backgroundColor: colors.surfaceHigh, borderRadius: radius.md,
    borderWidth: 0.5, borderColor: colors.border,
    padding: spacing.sm, color: colors.textPrimary, fontSize: font.base,
  },

  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statCard: {
    flex: 1, minWidth: '45%', backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 0.5, borderColor: colors.border,
    padding: spacing.md, gap: 4,
  },
  statLabel: { color: colors.textSecondary, fontSize: font.sm },
  statValue: { color: colors.textPrimary, fontSize: font.lg, fontWeight: '700' },

  sectionLabel: {
    color: colors.textSecondary, fontSize: font.sm, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  chartCard: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 0.5, borderColor: colors.border, padding: spacing.sm, alignItems: 'center',
  },

  tableCard: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 0.5, borderColor: colors.border, overflow: 'hidden',
  },
  tableRow: { padding: spacing.md },
  tableRowBorder: { borderBottomWidth: 0.5, borderBottomColor: colors.border },
  tableName: { color: colors.textPrimary, fontSize: font.base, fontWeight: '500' },
  tableStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  tableStatText: { color: colors.textSecondary, fontSize: font.sm },
  tableRevenue: { color: colors.amber, fontSize: font.sm, fontWeight: '600' },

  empty: { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.lg, fontSize: font.base },

  exportBtn: {
    backgroundColor: colors.surfaceHigh, borderRadius: radius.lg,
    borderWidth: 0.5, borderColor: colors.border,
    padding: spacing.md, alignItems: 'center',
  },
  exportBtnText: { color: colors.textPrimary, fontWeight: '600', fontSize: font.base },
});