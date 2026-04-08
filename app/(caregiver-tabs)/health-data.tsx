import {
    createHealthRecord,
    fetchHealthDataForElderly,
    getLatestMetrics,
    HEALTH_METRIC_TYPES,
} from "@/lib/health-data";
import { HealthData } from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
    Alert,
    Dimensions,
    FlatList,
    RefreshControl,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";
import { LineChart } from "react-native-chart-kit";
import {
    Button,
    Card,
    Dialog,
    FAB,
    Portal,
    Surface,
    Text,
    TextInput,
    useTheme
} from "react-native-paper";

export default function HealthDataPage() {
  const { elderlyId, elderlyName } = useLocalSearchParams<{
    elderlyId: string;
    elderlyName: string;
  }>();
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { t } = useTranslation();

  const [records, setRecords] = useState<HealthData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterRange, setFilterRange] = useState<"24h" | "7d" | "30d" | "all">(
    "all",
  );
  const [searchType, setSearchType] = useState("");
  const [latestMetrics, setLatestMetrics] = useState<
    Record<string, HealthData>
  >({});

  // Add Record Dialog
  const [addDialogVisible, setAddDialogVisible] = useState(false);
  const [newRecord, setNewRecord] = useState({
    type: "Blood Pressure",
    value: "",
    numericValue: "",
    secondValue: "",
    unit: "mmHg",
    note: "",
  });
  const [saving, setSaving] = useState(false);

  // Header Customization
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: "",
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => router.navigate("/caregiver")}
          style={{ marginLeft: 10, flexDirection: "row", alignItems: "center" }}
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={28}
            color={theme.colors.onSurface}
          />
          <Text style={{ marginLeft: 5, fontSize: 16 }}>{t('common.back')}</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, router, theme]);

  // ── Fetch data from Appwrite ──────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!elderlyId) return;
    try {
      const [allRecords, metrics] = await Promise.all([
        fetchHealthDataForElderly(elderlyId, 100),
        getLatestMetrics(elderlyId),
      ]);
      setRecords(allRecords);
      setLatestMetrics(metrics);
    } catch (error) {
      console.error("Error fetching health data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [elderlyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  // ── Filter records ────────────────────────────────────────────────────
  const filteredRecords = useMemo(() => {
    const now = new Date();
    const cutoff = (() => {
      if (filterRange === "24h")
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      if (filterRange === "7d")
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      if (filterRange === "30d")
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return new Date(0);
    })();

    return records.filter((r) => {
      const recordTime = r.time ? new Date(r.time) : null;
      if (recordTime && recordTime < cutoff) return false;
      if (searchType && r.type?.toLowerCase() !== searchType.toLowerCase())
        return false;
      return true;
    });
  }, [records, filterRange, searchType]);

  // ── Chart Data (Blood Pressure) ───────────────────────────────────────
  const chartData = useMemo(() => {
    const bpRecords = records
      .filter((r) => r.type === "Blood Pressure" && r.numeric_value)
      .sort(
        (a, b) =>
          new Date(a.time || 0).getTime() - new Date(b.time || 0).getTime(),
      )
      .slice(-6);

    if (bpRecords.length < 2) return null;

    return {
      labels: bpRecords.map((r) => {
        if (!r.time) return "";
        const recordDate = new Date(r.time);
        return `${recordDate.getMonth() + 1}/${recordDate.getDate()}`;
      }),
      datasets: [
        {
          data: bpRecords.map((r) => r.numeric_value || 0),
          color: (opacity = 1) => `rgba(33, 150, 243, ${opacity})`,
          strokeWidth: 2,
        },
        {
          data: bpRecords.map((r) => r.second_value || 0),
          color: (opacity = 1) => `rgba(76, 175, 80, ${opacity})`,
          strokeWidth: 2,
        },
      ],
      legend: [t('healthData.systolicShort'), t('healthData.diastolicShort')],
    };
  }, [records, t]);

  // ── Add record handler ────────────────────────────────────────────────
  const handleAddRecord = async () => {
    if (!elderlyId || !newRecord.value.trim()) {
      Alert.alert(t('common.error'), t('healthData.fillInValue'));
      return;
    }
    setSaving(true);
    try {
      await createHealthRecord({
        elderlyId,
        type: newRecord.type,
        value: newRecord.value.trim(),
        unit: newRecord.unit || undefined,
        numericValue: newRecord.numericValue
          ? parseFloat(newRecord.numericValue)
          : undefined,
        secondValue: newRecord.secondValue
          ? parseFloat(newRecord.secondValue)
          : undefined,
        note: newRecord.note.trim() || undefined,
      });
      setAddDialogVisible(false);
      setNewRecord({
        type: "Blood Pressure",
        value: "",
        numericValue: "",
        secondValue: "",
        unit: "mmHg",
        note: "",
      });
      fetchData(); // Refresh list
    } catch (error) {
      console.error("Error adding health record:", error);
      Alert.alert(t('common.error'), t('healthData.failedToAddRecord'));
    } finally {
      setSaving(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────
  const getTypeColor = (type: string) => {
    switch ((type || "").toLowerCase()) {
      case "blood pressure":
        return "#2196F3";
      case "heart rate":
        return "#F44336";
      case "temperature":
        return "#FF9800";
      case "weight":
        return "#4CAF50";
      case "blood sugar":
        return "#9C27B0";
      case "oxygen saturation":
        return "#00BCD4";
      case "note":
        return "#607D8B";
      default:
        return "#607D8B";
    }
  };

  const getTypeIcon = (type: string): string => {
    switch ((type || "").toLowerCase()) {
      case "blood pressure":
        return "heart-pulse";
      case "heart rate":
        return "heart-flash";
      case "temperature":
        return "thermometer";
      case "weight":
        return "scale-bathroom";
      case "blood sugar":
        return "water";
      case "oxygen saturation":
        return "lungs";
      case "note":
        return "note-text-outline";
      default:
        return "chart-timeline-variant";
    }
  };

  /** Translate Appwrite health record type names to the current language */
  const translateType = (type: string): string => {
    const typeMap: Record<string, string> = {
      "Blood Pressure": t('healthData.bloodPressure'),
      "Heart Rate": t('healthData.heartRate'),
      "Temperature": t('healthData.temperature'),
      "Weight": t('healthData.weight'),
      "Blood Sugar": t('healthData.bloodSugar'),
      "Oxygen Saturation": t('healthData.oxygenSaturation'),
      "Steps": t('healthData.stepsLabel'),
    };
    return typeMap[type] || type;
  };

  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return { time: "--:--", date: "" };
    const parsedDate = new Date(timeStr);
    return {
      time: parsedDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      date: parsedDate.toLocaleDateString([], { month: "short", day: "numeric" }),
    };
  };

  const selectedTypeConfig = HEALTH_METRIC_TYPES.find(
    (metricType) => metricType.label === newRecord.type,
  );

  // Update display value when numeric values change
  const updateDisplayValue = (
    type: string,
    primary: string,
    secondary: string,
  ) => {
    const typeConfig = HEALTH_METRIC_TYPES.find((metricType) => metricType.label === type);
    if (typeConfig?.hasSecond && primary && secondary) {
      return `${primary}/${secondary} ${typeConfig.unit}`;
    } else if (primary) {
      return `${primary} ${typeConfig?.unit || ""}`;
    }
    return "";
  };

  // ── Render Components ─────────────────────────────────────────────────
  const renderSummaryCard = (
    title: string,
    value: string,
    sub: string,
    icon: string,
    color: string,
  ) => (
    <Surface style={styles.statCard} elevation={1}>
      <View style={[styles.statIconBadge, { backgroundColor: color + "20" }]}>
        <MaterialCommunityIcons name={icon as any} size={24} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="labelMedium" style={{ color: theme.colors.secondary }}>
          {title}
        </Text>
        <Text variant="titleMedium" style={{ fontWeight: "bold" }}>
          {value}
        </Text>
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          {sub}
        </Text>
      </View>
    </Surface>
  );

  // Timeline record item
  const renderRecordItem = ({ item }: { item: HealthData }) => {
    const { time, date } = formatTime(item.time);
    return (
      <View style={styles.timelineItem}>
        <View style={styles.timelineLeft}>
          <Text style={styles.timeText}>{time}</Text>
          <Text style={styles.dateText}>{date}</Text>
        </View>
        <View style={styles.timelineCenter}>
          <View style={styles.timelineLine} />
          <View
            style={[
              styles.timelineDot,
              { backgroundColor: getTypeColor(item.type || "") },
            ]}
          />
        </View>
        <Surface
          style={[styles.recordCard, { backgroundColor: theme.colors.surface }]}
          elevation={0}
        >
          <View
            style={[
              styles.recordHeader,
              {
                borderLeftColor: getTypeColor(item.type || ""),
                borderLeftWidth: 4,
              },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.recordType,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                {item.type ? translateType(item.type) : t('healthData.healthRecord')}
              </Text>
              <Text
                style={[
                  styles.recordValue,
                  { color: theme.colors.onSurface },
                ]}
              >
                {item.value || "—"}
              </Text>
              {item.note ? (
                <Text
                  style={[
                    styles.recordNote,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  {item.note}
                </Text>
              ) : null}
            </View>
            <MaterialCommunityIcons
              name={getTypeIcon(item.type || "") as any}
              size={20}
              color={getTypeColor(item.type || "")}
              style={{ opacity: 0.5 }}
            />
          </View>
        </Surface>
      </View>
    );
  };

  // Get latest values for summary cards
  const latestBP = latestMetrics["Blood Pressure"]?.value || "—";
  const latestHR = latestMetrics["Heart Rate"]?.value || "—";
  const latestTemp = latestMetrics["Temperature"]?.value || "—";
  const latestWeight = latestMetrics["Weight"]?.value || "—";

  const bpSub = latestMetrics["Blood Pressure"]?.time
    ? formatTime(latestMetrics["Blood Pressure"].time).date
    : t('common.noData');
  const hrSub = latestMetrics["Heart Rate"]?.time
    ? formatTime(latestMetrics["Heart Rate"].time).date
    : t('common.noData');
  const tempSub = latestMetrics["Temperature"]?.time
    ? formatTime(latestMetrics["Temperature"].time).date
    : t('common.noData');
  const weightSub = latestMetrics["Weight"]?.time
    ? formatTime(latestMetrics["Weight"].time).date
    : t('common.noData');

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 80 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header Title Area */}
        <View style={styles.pageHeader}>
          <Text variant="headlineMedium" style={{ fontWeight: "bold" }}>
            {t('tabs.healthData')}
          </Text>
          {elderlyName ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 8,
              }}
            >
              <MaterialCommunityIcons
                name="account-circle"
                size={24}
                color={theme.colors.primary}
                style={{ marginRight: 6 }}
              />
              <Text variant="titleMedium">
                {decodeURIComponent(elderlyName as string)}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Summary Statistics */}
        <View style={styles.statsRow}>
          {renderSummaryCard(
            t('healthData.bloodPressure'),
            latestBP,
            bpSub,
            "heart-pulse",
            "#2196F3",
          )}
          {renderSummaryCard(
            t('healthData.heartRate'),
            latestHR,
            hrSub,
            "heart-flash",
            "#F44336",
          )}
        </View>
        <View style={styles.statsRow}>
          {renderSummaryCard(
            t('healthData.temperature'),
            latestTemp,
            tempSub,
            "thermometer",
            "#FF9800",
          )}
          {renderSummaryCard(
            t('healthData.weight'),
            latestWeight,
            weightSub,
            "scale-bathroom",
            "#4CAF50",
          )}
        </View>

        {/* Chart Section */}
        {chartData && (
          <Card style={styles.chartCard}>
            <Card.Title
              title={t('healthData.bpTrends')}
              left={(props) => (
                <MaterialCommunityIcons {...props} name="chart-line" />
              )}
            />
            <Card.Content style={{ alignItems: "center" }}>
              <LineChart
                data={chartData}
                width={Dimensions.get("window").width - 64}
                height={220}
                yAxisLabel=""
                yAxisSuffix=""
                chartConfig={{
                  backgroundColor: theme.colors.surface,
                  backgroundGradientFrom: theme.colors.surface,
                  backgroundGradientTo: theme.colors.surface,
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                  labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                  style: { borderRadius: 16 },
                  propsForDots: { r: "4", strokeWidth: "2", stroke: "#ffa726" },
                }}
                bezier
                style={{ marginVertical: 8, borderRadius: 16 }}
              />
            </Card.Content>
          </Card>
        )}

        {/* Type Filters */}
        <View style={[styles.filterSection, { paddingHorizontal: 16 }]}>
          {[
            [
              { label: "All",            short: t('common.all'),   icon: "view-grid-outline", color: "" },
              { label: "Blood Pressure", short: t('healthData.bp'),    icon: "heart-pulse",       color: "#2196F3" },
              { label: "Heart Rate",     short: t('healthData.hr'),    icon: "heart-flash",       color: "#F44336" },
              { label: "Temperature",    short: t('healthData.temp'),  icon: "thermometer",       color: "#FF9800" },
            ],
            [
              { label: "Weight",            short: t('healthData.weight'), icon: "scale-bathroom", color: "#4CAF50" },
              { label: "Blood Sugar",       short: t('healthData.sugar'),  icon: "water",           color: "#9C27B0" },
              { label: "Oxygen Saturation", short: t('healthData.spo2'),  icon: "lungs",           color: "#00BCD4" },
            ],
          ].map((row, rowIdx) => (
            <View key={rowIdx} style={{ flexDirection: "row", gap: 8, marginBottom: rowIdx === 0 ? 8 : 0 }}>
              {row.map(({ label, short, icon, color }) => {
                const selected = searchType === label || (label === "All" && searchType === "");
                const activeColor = label === "All" ? theme.colors.primary : color;
                return (
                  <TouchableOpacity
                    key={label}
                    onPress={() => setSearchType(label === "All" ? "" : selected ? "" : label)}
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      paddingVertical: 9,
                      paddingHorizontal: 6,
                      borderRadius: 20,
                      backgroundColor: selected ? activeColor : theme.colors.surfaceVariant,
                      borderWidth: 1.5,
                      borderColor: selected ? activeColor : "transparent",
                    }}
                  >
                    <MaterialCommunityIcons
                      name={icon as any}
                      size={14}
                      color={selected ? "#fff" : activeColor || theme.colors.onSurfaceVariant}
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      style={{
                        fontSize: 12,
                        color: selected ? "#fff" : theme.colors.onSurfaceVariant,
                        fontWeight: selected ? "700" : "500",
                      }}
                      numberOfLines={1}
                    >
                      {short}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {/* Time Range Filters */}
        <View style={[styles.filterSection, { paddingHorizontal: 16, marginBottom: 12 }]}>
          <View
            style={[
              styles.segmentGroup,
              { backgroundColor: theme.colors.surfaceVariant },
            ]}
          >
            {(["all", "24h", "7d", "30d"] as const).map((range, idx, arr) => {
              const selected = filterRange === range;
              return (
                <TouchableOpacity
                  key={range}
                  onPress={() => setFilterRange(range)}
                  style={[
                    styles.segmentItem,
                    selected && {
                      backgroundColor: theme.colors.surface,
                      shadowColor: "#000",
                      shadowOpacity: 0.08,
                      shadowRadius: 4,
                      elevation: 2,
                    },
                    idx === 0 && { borderTopLeftRadius: 10, borderBottomLeftRadius: 10 },
                    idx === arr.length - 1 && { borderTopRightRadius: 10, borderBottomRightRadius: 10 },
                  ]}
                >
                  <Text
                    variant="labelMedium"
                    style={{
                      color: selected ? theme.colors.primary : theme.colors.onSurfaceVariant,
                      fontWeight: selected ? "700" : "400",
                    }}
                  >
                    {range.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Records List */}
        <View style={styles.listSection}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text variant="titleMedium" style={styles.sectionTitle}>
              {t('healthData.activityLog')} ({filteredRecords.length})
            </Text>
          </View>
          {loading ? (
            <View style={styles.emptyState}>
              <Text variant="bodyLarge">{t('common.loading')}</Text>
            </View>
          ) : filteredRecords.length === 0 ? (
            <Surface
              style={[
                styles.emptyCard,
                { backgroundColor: theme.colors.surface },
              ]}
              elevation={1}
            >
              <MaterialCommunityIcons
                name="chart-line"
                size={48}
                color={theme.colors.onSurfaceVariant}
              />
              <Text variant="bodyLarge" style={{ marginTop: 12 }}>
                {t('healthData.noHealthRecords')}
              </Text>
              <Text
                variant="bodySmall"
                style={{
                  color: theme.colors.onSurfaceVariant,
                  marginTop: 4,
                }}
              >
                {t('healthData.tapToAdd')}
              </Text>
            </Surface>
          ) : (
            <FlatList
              data={filteredRecords}
              renderItem={renderRecordItem}
              keyExtractor={(item) => item.$id}
              scrollEnabled={false}
            />
          )}
        </View>
      </ScrollView>

      {/* ── Add Record Dialog ──────────────────────────────────────────── */}
      <Portal>
        <Dialog
          visible={addDialogVisible}
          onDismiss={() => setAddDialogVisible(false)}
          style={{ backgroundColor: theme.colors.surface }}
        >
          <Dialog.Title>{t('healthData.addHealthRecord')}</Dialog.Title>
          <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
            <ScrollView style={{ paddingHorizontal: 24 }}>
              {/* Type Selection – icon card grid */}
              <Text
                variant="labelLarge"
                style={{ marginBottom: 10, marginTop: 8 }}
              >
                {t('healthData.typeLabel')}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                {HEALTH_METRIC_TYPES.map((recordType) => {
                  const color = getTypeColor(recordType.label);
                  const icon = getTypeIcon(recordType.label);
                  const selected = newRecord.type === recordType.label;
                  return (
                    <TouchableOpacity
                      key={recordType.label}
                      onPress={() =>
                        setNewRecord((prev) => ({
                          ...prev,
                          type: recordType.label,
                          unit: recordType.unit,
                          secondValue: "",
                          value: "",
                          numericValue: "",
                        }))
                      }
                      style={{
                        width: "30%",
                        borderRadius: 12,
                        paddingVertical: 12,
                        paddingHorizontal: 6,
                        alignItems: "center",
                        backgroundColor: selected
                          ? color + "22"
                          : theme.colors.surfaceVariant,
                        borderWidth: selected ? 2 : 1,
                        borderColor: selected
                          ? color
                          : theme.colors.outlineVariant,
                      }}
                    >
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: selected ? color + "33" : color + "18",
                          justifyContent: "center",
                          alignItems: "center",
                          marginBottom: 6,
                        }}
                      >
                        <MaterialCommunityIcons
                          name={icon as any}
                          size={20}
                          color={color}
                        />
                      </View>
                      <Text
                        variant="labelSmall"
                        style={{
                          textAlign: "center",
                          color: selected ? color : theme.colors.onSurfaceVariant,
                          fontWeight: selected ? "700" : "400",
                          lineHeight: 14,
                        }}
                        numberOfLines={2}
                      >
                        {recordType.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Primary Value */}
              <TextInput
                mode="outlined"
                label={
                  selectedTypeConfig?.hasSecond
                    ? t('healthData.systolic')
                    : `${t('healthData.value')} (${newRecord.unit})`
                }
                value={newRecord.numericValue}
                onChangeText={(text) => {
                  const primaryValue = text;
                  setNewRecord((prev) => ({
                    ...prev,
                    numericValue: primaryValue,
                    value: updateDisplayValue(
                      prev.type,
                      primaryValue,
                      prev.secondValue,
                    ),
                  }));
                }}
                keyboardType="numeric"
                style={{ marginBottom: 12 }}
              />

              {/* Secondary Value (for BP) */}
              {selectedTypeConfig?.hasSecond && (
                <TextInput
                  mode="outlined"
                  label={t('healthData.diastolic')}
                  value={newRecord.secondValue}
                  onChangeText={(text) => {
                    const secondaryValue = text;
                    setNewRecord((prev) => ({
                      ...prev,
                      secondValue: secondaryValue,
                      value: updateDisplayValue(
                        prev.type,
                        prev.numericValue,
                        secondaryValue,
                      ),
                    }));
                  }}
                  keyboardType="numeric"
                  style={{ marginBottom: 12 }}
                />
              )}

              {/* Display Value (auto-generated or manual) */}
              <TextInput
                mode="outlined"
                label={t('healthData.displayValue')}
                value={newRecord.value}
                onChangeText={(text) =>
                  setNewRecord((prev) => ({ ...prev, value: text }))
                }
                style={{ marginBottom: 12 }}
              />

              {/* Note */}
              <TextInput
                mode="outlined"
                label={t('healthData.noteOptional')}
                value={newRecord.note}
                onChangeText={(text) =>
                  setNewRecord((prev) => ({ ...prev, note: text }))
                }
                multiline
                numberOfLines={2}
                style={{ marginBottom: 16 }}
              />
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setAddDialogVisible(false)}>{t('common.cancel')}</Button>
            <Button
              mode="contained"
              onPress={handleAddRecord}
              loading={saving}
              disabled={saving || !newRecord.value.trim()}
            >
              {t('common.save')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Floating Action Button */}
      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => setAddDialogVisible(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pageHeader: { padding: 20, paddingBottom: 10 },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  statIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  chartCard: { marginHorizontal: 16, borderRadius: 16, marginBottom: 16 },
  filterSection: { marginBottom: 8 },
  filterChip: { marginRight: 8 },
  typeGridItem: {
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderWidth: 1.5,
  },
  typeGridIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentGroup: {
    flexDirection: "row",
    borderRadius: 10,
    padding: 3,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },
  listSection: { paddingHorizontal: 16 },
  sectionTitle: { marginBottom: 12, fontWeight: "bold" },
  emptyState: { alignItems: "center", padding: 32 },
  emptyCard: {
    alignItems: "center",
    padding: 32,
    borderRadius: 16,
    marginBottom: 16,
  },

  // Timeline Styles
  timelineItem: { flexDirection: "row", marginBottom: 0 },
  timelineLeft: {
    width: 70,
    alignItems: "flex-end",
    paddingRight: 10,
    paddingTop: 14,
  },
  timeText: { fontWeight: "bold", fontSize: 11 },
  dateText: { fontSize: 10, color: "#888" },
  timelineCenter: { width: 20, alignItems: "center" },
  timelineLine: { width: 2, flex: 1, backgroundColor: "#E0E0E0" },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    position: "absolute",
    top: 18,
    zIndex: 1,
  },
  recordCard: {
    flex: 1,
    marginBottom: 16,
    borderRadius: 12,
    overflow: "hidden",
    marginLeft: 6,
  },
  recordHeader: { padding: 12, flexDirection: "row", alignItems: "center" },
  recordType: { fontSize: 12, marginBottom: 2 },
  recordValue: { fontSize: 15, fontWeight: "600" },
  recordNote: { fontSize: 12, marginTop: 4, fontStyle: "italic" },
  fab: {
    position: "absolute",
    margin: 16,
    right: 0,
    bottom: 0,
  },
});
