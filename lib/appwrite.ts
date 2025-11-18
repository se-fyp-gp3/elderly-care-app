// lib/appwrite.ts
import {
  Account as AccountWeb,
  Client as ClientWeb,
  Databases as DatabasesWeb,
} from "appwrite";
import { Platform } from "react-native";
import { Account, Client, Databases } from "react-native-appwrite";

export const clientWeb = new ClientWeb()
  .setEndpoint(process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT!)
  .setProject(process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID!)
  .setDevKey(process.env.EXPO_PUBLIC_APPWRITE_DEV_KEY!);

export const client = new Client()
  .setEndpoint(process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT!)
  .setProject(process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID!)
  .setPlatform(process.env.EXPO_PUBLIC_APPWRITE_PLATFORM!)
  .setDevKey(process.env.EXPO_PUBLIC_APPWRITE_DEV_KEY!);

export const account = new Account(client);
export const accountWeb = new AccountWeb(clientWeb);
export const databases =
  Platform.OS === "web" ? new DatabasesWeb(clientWeb) : new Databases(client);

export const DATABASE_ID = process.env.EXPO_PUBLIC_DB_ID!;
export const ELDERLY_COLLECTION_ID = process.env.EXPO_PUBLIC_ELDERLY_COLLECTION_ID!;

export interface RealtimeResponse {
  events: string[];
  payload: any;
}

// Elderly document type
export interface ElderlyDocument {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  name: string;
  phone?: string;
  age: number;
  status?: string;
  originalId?: number;
}
