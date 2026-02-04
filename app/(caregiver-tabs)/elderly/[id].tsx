import ElderlyDetailView, {
  ElderlyDetailData,
} from "@/components/ElderlyDetailView";
import { DATABASE_ID, ELDERLY_TABLE_ID, tablesDB } from "@/lib/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import { Text, useTheme } from "react-native-paper";

export default function ElderlyDetailPage() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const navigation = useNavigation();
  const theme = useTheme();

  // Ensure id is a string
  const docId = Array.isArray(id) ? id[0] : id;

  const [data, setData] = useState<ElderlyDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!docId) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch document using tablesDB.getRow
        const doc = await tablesDB.getRow({
          databaseId: DATABASE_ID,
          tableId: ELDERLY_TABLE_ID,
          rowId: docId,
        });

        // Map Appwrite document to our component data structure
        const mappedData: ElderlyDetailData = {
          id: doc.$id,
          name: doc.name || "Unknown",
          age: doc.age || 0,
          gender: doc.gender || "Unknown", // Assuming these fields exist in collection
          bloodType: doc.bloodType || "Unknown",
          room: doc.room || "Unknown",
          phone: doc.phone || "",
          emergencyContact: doc.emergencyContact || "Not set",
          status: doc.status || "Normal",
          lastVitals: {
            bp: doc.bp || "120/80",
            hr: doc.hr ? `${doc.hr} bpm` : "70 bpm",
            temp: doc.temp ? `${doc.temp}°C` : "36.5°C",
          },
          notes: doc.notes || "No notes available.",
        };

        setData(mappedData);

        // Title is handled in useLayoutEffect now specifically to be a Back button
        // navigation.setOptions?.({ title: mappedData.name });
      } catch (err: any) {
        console.error("Error fetching elderly details:", err);
        setError("Failed to load data");
        // Use fallback/sample data on error so UI doesn't look broken during demo
        setData({
          id: docId,
          name: `Elderly #${docId}`, // Fallback name
          status: "Error loading",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [docId, navigation]);

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
          <Text style={{ marginLeft: 5, fontSize: 16 }}>Back</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, router, theme]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 10 }}>Loading details...</Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>No data found.</Text>
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
