import { HealthData } from "@/types/appwrite";
import { ID, Query } from "react-native-appwrite";
import { DATABASE_ID, HEALTH_DATA_TABLE_ID, tablesDB } from "./appwrite";

/**
 * Configuration for each supported health metric type,
 * including its unit and whether it requires a secondary value (e.g. diastolic BP).
 */
export const HEALTH_METRIC_TYPES: {
  label: string;
  unit: string;
  hasSecond: boolean;
}[] = [
  { label: "Blood Pressure",      unit: "mmHg", hasSecond: true  },
  { label: "Heart Rate",          unit: "bpm",  hasSecond: false },
  { label: "Temperature",         unit: "°C",   hasSecond: false },
  { label: "Weight",              unit: "kg",   hasSecond: false },
  { label: "Blood Sugar",         unit: "mg/dL",hasSecond: false },
  { label: "Oxygen Saturation",   unit: "%",    hasSecond: false },
];

/**
 * Fetch health data records for a specific elderly person.
 */
export async function fetchHealthDataForElderly(
  elderlyId: string,
  limit = 50,
  type?: string,
): Promise<HealthData[]> {
  const queries = [
    Query.equal("elderly_id", elderlyId),
    Query.orderDesc("time"),
    Query.limit(limit),
  ];

  if (type) {
    queries.push(Query.equal("type", type));
  }

  const response = await tablesDB.listRows<HealthData>({
    databaseId: DATABASE_ID,
    tableId: HEALTH_DATA_TABLE_ID,
    queries,
  });

  return response.rows as unknown as HealthData[];
}

/**
 * Fetch health data within a time range for a specific elderly.
 */
export async function fetchHealthDataInRange(
  elderlyId: string,
  startDate: string,
  endDate: string,
  type?: string,
): Promise<HealthData[]> {
  const queries = [
    Query.equal("elderly_id", elderlyId),
    Query.greaterThanEqual("time", startDate),
    Query.lessThanEqual("time", endDate),
    Query.orderDesc("time"),
    Query.limit(200),
  ];

  if (type) {
    queries.push(Query.equal("type", type));
  }

  const response = await tablesDB.listRows<HealthData>({
    databaseId: DATABASE_ID,
    tableId: HEALTH_DATA_TABLE_ID,
    queries,
  });

  return response.rows as unknown as HealthData[];
}

/**
 * Create a new health data record.
 */
export async function createHealthRecord(input: {
  elderlyId: string;
  type: string;
  value: string;
  unit?: string;
  numericValue?: number;
  secondValue?: number;
  note?: string;
}): Promise<HealthData> {
  const now = new Date().toISOString();

  const data: Record<string, any> = {
    elderly: [input.elderlyId],
    elderly_id: input.elderlyId,
    type: input.type,
    value: input.value,
    time: now,
  };

  if (input.unit) data.unit = input.unit;
  if (input.numericValue !== undefined) data.numeric_value = input.numericValue;
  if (input.secondValue !== undefined) data.second_value = input.secondValue;
  if (input.note) data.note = input.note;

  const doc = await tablesDB.createRow<HealthData>({
    databaseId: DATABASE_ID,
    tableId: HEALTH_DATA_TABLE_ID,
    rowId: ID.unique(),
    data: data as any,
  });

  return doc as unknown as HealthData;
}

/**
 * Get the latest record for each health metric type for an elderly.
 */
export async function getLatestMetrics(
  elderlyId: string,
): Promise<Record<string, HealthData>> {
  const types = [
    "Blood Pressure",
    "Heart Rate",
    "Temperature",
    "Weight",
    "Blood Sugar",
    "Oxygen Saturation",
  ];

  const results: Record<string, HealthData> = {};

  await Promise.all(
    types.map(async (type) => {
      try {
        const response = await tablesDB.listRows<HealthData>({
          databaseId: DATABASE_ID,
          tableId: HEALTH_DATA_TABLE_ID,
          queries: [
            Query.equal("elderly_id", elderlyId),
            Query.equal("type", type),
            Query.orderDesc("time"),
            Query.limit(1),
          ],
        });
        if (response.rows.length > 0) {
          results[type] = response.rows[0] as unknown as HealthData;
        }
      } catch {
        // Skip if query fails
      }
    }),
  );

  return results;
}
