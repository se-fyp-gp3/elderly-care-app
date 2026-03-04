import { Account, Client } from "appwrite";
import {
    Account as AccountReactNative,
    Client as ClientReactNative,
    Functions,
    TablesDB,
} from "react-native-appwrite";

const APPWRITE_ENDPOINT = process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT!;
const APPWRITE_PROJECT_ID = process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID!;
const APPWRITE_PLATFORM = process.env.EXPO_PUBLIC_APPWRITE_PLATFORM!;
const APPWRITE_DEV_KEY = process.env.EXPO_PRIVATE_APPWRITE_DEV_KEY!;

export const client = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID)
  .setDevKey(APPWRITE_DEV_KEY);

export const clientReactNative = new ClientReactNative()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID)
  .setPlatform(APPWRITE_PLATFORM)
  .setDevKey(APPWRITE_DEV_KEY);

export const account = new AccountReactNative(clientReactNative);
export const accountWeb = new Account(client);
export const tablesDB = new TablesDB(clientReactNative);
export const functions = new Functions(clientReactNative);

export const DATABASE_ID = process.env.EXPO_PUBLIC_DB_ID!;
export const ELDERLY_TABLE_ID = process.env.EXPO_PUBLIC_ELDERLY_TABLE_ID!;
export const CAREGIVER_TABLE_ID = process.env.EXPO_PUBLIC_CAREGIVER_TABLE_ID!;
export const CAREGIVER_ELDERLY_TABLE_ID =
  process.env.EXPO_PUBLIC_CAREGIVER_ELDERLY_TABLE_ID!;
export const ELDERLY_MEDICATION_TABLE_ID =
  process.env.EXPO_PUBLIC_ELDERLY_MEDICATION_TABLE_ID!;
export const HEALTH_DATA_TABLE_ID =
  process.env.EXPO_PUBLIC_HEALTH_DATA_TABLE_ID!;
export const MEDICATION_TABLE_ID = process.env.EXPO_PUBLIC_MEDICATION_TABLE_ID!;
export const ELDERLY_MEDICATION_REMINDER_TABLE_ID =
  process.env.EXPO_PUBLIC_ELDERLY_MEDICATION_REMINDER_TABLE_ID!;
export const SCHEDULE_TABLE_ID = process.env.EXPO_PUBLIC_SCHEDULE_TABLE_ID!;
export const SCHEDULE_CATEGORY_TABLE_ID =
  process.env.EXPO_PUBLIC_SCHEDULE_CATEGORY_TABLE_ID!;
export const SCHEDULE_MEDICATION_TABLE_ID =
  process.env.EXPO_PUBLIC_SCHEDULE_MEDICATION_TABLE_ID!;
export const MEDICATION_LOGS_TABLE_ID =
  process.env.EXPO_PUBLIC_MEDICATION_LOGS_TABLE_ID!;
export const CHAT_SESSION_TABLE_ID =
  process.env.EXPO_PUBLIC_CHAT_SESSION_TABLE_ID!;
export const DIRECT_MESSAGES_TABLE_ID =
  process.env.EXPO_PUBLIC_DIRECT_MESSAGES_TABLE_ID!;
export const REGISTRATION_REQUESTS_TABLE_ID =
  process.env.EXPO_PUBLIC_REGISTRATION_REQUESTS_TABLE_ID!;
export const ELDERLY_DAILY_STEPS_TABLE_ID =
  process.env.EXPO_PUBLIC_ELDERLY_DAILY_STEPS_TABLE_ID!;

export const ROLE_MANAGEMENT_FUNCTION_ID =
  process.env.EXPO_PUBLIC_ROLE_MANAGEMENT_FUNCTION_ID!;

export interface RealtimeResponse {
  events: string[];
  payload: any;
}
