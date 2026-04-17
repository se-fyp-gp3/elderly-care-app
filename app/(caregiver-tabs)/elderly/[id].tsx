import ElderlyDetailView, {
    ElderlyDetailData,
} from "@/components/ElderlyDetailView";
import { DATABASE_ID, ELDERLY_TABLE_ID, tablesDB } from "@/lib/appwrite";
import { getLatestMetrics } from "@/lib/health-data";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import { Text, useTheme } from "react-native-paper";

export default function ElderlyDetailPage() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const navigation = useNavigation();
  const theme = useTheme();
  const { t } = useTranslation();

  // Ensure id is a string
  const docId = Array.isArray(id) ? id[0] : id;

  const [data, setData] = useState<ElderlyDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!docId) return;

      const fetchData = async () => {
        try {
          setLoading(true);
          // Fetch elderly document and latest vitals in parallel
          const [doc, vitals] = await Promise.all([
            tablesDB.getRow({
              databaseId: DATABASE_ID,
              tableId: ELDERLY_TABLE_ID,
              rowId: docId,
            }),
            getLatestMetrics(docId),
          ]);

          // Calculate age from birth date
          const birthDate = doc.birth ? new Date(doc.birth) : null;
          const age = birthDate
            ? Math.floor(
                (Date.now() - birthDate.getTime()) /
                  (1000 * 60 * 60 * 24 * 365.25),
              )
            : undefined;

          // Map latest vitals from health data
          const bpData = vitals["Blood Pressure"];
          const hrData = vitals["Heart Rate"];
          const tempData = vitals["Temperature"];

          const bp = bpData
            ? bpData.numeric_value && bpData.second_value
              ? `${bpData.numeric_value}/${bpData.second_value} mmHg`
              : bpData.value || undefined
            : undefined;
          const hr = hrData
            ? `${hrData.numeric_value ?? hrData.value} ${hrData.unit || "bpm"}`
            : undefined;
          const temp = tempData
            ? `${tempData.numeric_value ?? tempData.value} ${tempData.unit || "°C"}`
            : undefined;

          // Map Appwrite document to our component data structure
          const mappedData: ElderlyDetailData = {
            id: doc.$id,
            name: doc.name || "Unknown",
            avatarFileId: doc.avatar_file_id || undefined,
            age,
            birth: doc.birth || undefined,
            gender: doc.gender || undefined,
            bloodType: doc.blood_type || undefined,
            phone: doc.phone || undefined,
            emergencyContact: doc.emergency_contact || undefined,
            status: doc.status || "Normal",
            lastVitals: { bp, hr, temp },
          };

          setData(mappedData);
        } catch (err: any) {
          console.error("Error fetching elderly details:", err);
          setError("Failed to load data");
          setData({
            id: docId,
            name: `Elderly #${docId}`,
            status: "Error loading",
          });
        } finally {
          setLoading(false);
        }
      };

      fetchData();
    }, [docId]),
  );

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: "", // Clear title so it doesn't duplicate the name on the page
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
          <Text style={{ marginLeft: 5, fontSize: 16 }}>{t("common.back")}</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, router, theme]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 10 }}>{t("common.loadingDetails")}</Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>{t("common.noDataFound")}</Text>
      </View>
    );
  }

  return (
    <ElderlyDetailView
      data={data}
      onHealthData={(elderlyId) =>
        router.push(
          `/health-data?elderlyId=${elderlyId}&elderlyName=${encodeURIComponent(data.name)}` as any,
        )
      }
    />
  );
}
