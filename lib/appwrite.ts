import { Account, Client, TablesDB } from "appwrite";
import {
  Account as AccountReactNative,
  Client as ClientReactNative,
} from "react-native-appwrite";

export const client = new Client()
  .setEndpoint(process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT!)
  .setProject(process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID!)
  .setDevKey(process.env.EXPO_PRIVATE_APPWRITE_DEV_KEY!);

export const clientReactNative = new ClientReactNative()
  .setEndpoint(process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT!)
  .setProject(process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID!)
  .setPlatform(process.env.EXPO_PUBLIC_APPWRITE_PLATFORM!)
  .setDevKey(process.env.EXPO_PRIVATE_APPWRITE_DEV_KEY!);

export const account = new AccountReactNative(clientReactNative);
export const accountWeb = new Account(client);
export const tablesDB = new TablesDB(client);

export const DATABASE_ID = process.env.EXPO_PUBLIC_DB_ID!;
export const ELDERLY_TABLE_ID = process.env.EXPO_PUBLIC_ELDERLY_TABLE_ID!;
export const CAREGIVER_TABLE_ID = process.env.EXPO_PUBLIC_CAREGIVER_TABLE_ID!;
export const CAREGIVER_ELDERLY_TABLE_ID = process.env.EXPO_PUBLIC_CAREGIVER_ELDERLY_TABLE_ID!;
export const ELDERLY_MEDICATION_TABLE_ID = process.env.EXPO_PUBLIC_ELDERLY_MEDICATION_TABLE_ID!;
export const HEALTH_DATA_TABLE_ID = process.env.EXPO_PUBLIC_HEALTH_DATA_TABLE_ID!;
export const MEDICATION_TABLE_ID = process.env.EXPO_PUBLIC_MEDICATION_TABLE_ID!;
export const SCHEDULE_TABLE_ID = process.env.EXPO_PUBLIC_SCHEDULE_TABLE_ID!;
export const SCHEDULE_CATEGORY_TABLE_ID = process.env.EXPO_PUBLIC_SCHEDULE_CATEGORY_TABLE_ID!;
export const SCHEDULE_MEDICATION_TABLE_ID = process.env.EXPO_PUBLIC_SCHEDULE_MEDICATION_TABLE_ID!;

export interface RealtimeResponse {
  events: string[];
  payload: any;
}
