import { makeRedirectUri } from "expo-auth-session";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import {
    ExecutionMethod,
    ID,
    Models,
    OAuthProvider,
} from "react-native-appwrite";
import { UserPreferences } from "../types/user";
import { account, accountWeb, functions } from "./appwrite";
import { deactivateExpoPushToken } from "./expo-push-tokens";
import { loadPersistedLanguage } from "./i18n";
import { syncUserInterfaceLanguagePreference } from "./interface-language-preference";
import { getExpoPushTokenAsync } from "./notifications";
import { checkProfileExists, hasTrialLabel } from "./user";
export class LoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoginError";
  }
}

type AuthContextType = {
  user: Models.User<Models.Preferences> | null;
  isLoading: boolean;
  preferences: UserPreferences;
  hasProfile: boolean;
  isTrial: boolean;
  userLabels: string[];
  needsReAuth: boolean;

  signUp: (
    email: string,
    password: string,
    role: "elderly" | "caregiver",
  ) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signInWithToken: (userId: string, secret: string) => Promise<string | null>;
  signInWithOAuth2: (
    provider: OAuthProvider,
    role?: "elderly" | "caregiver",
  ) => Promise<string | null>;
  signOut: () => Promise<void>;
  reAuthenticateElderly: () => Promise<string | null>;
  updatePreferences: (
    newPreferences: UserPreferences,
  ) => Promise<string | null>;
  setPreference: (key: string, value: any) => Promise<string | null>;
  refreshProfile: () => Promise<void>;
  refreshLabels: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<Models.User<Models.Preferences> | null>(
    null,
  );
  const [preferences, setPreferences] = useState<UserPreferences>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasProfile, setHasProfile] = useState<boolean>(false);
  const [userLabels, setUserLabels] = useState<string[]>([]);
  const [isTrial, setIsTrial] = useState<boolean>(false);
  const [needsReAuth, setNeedsReAuth] = useState<boolean>(false);

  const refreshLabels = async () => {
    if (!user) {
      setUserLabels([]);
      setIsTrial(false);
      return;
    }

    try {
      const labels = user.labels || [];
      setUserLabels(labels);
      setIsTrial(hasTrialLabel(labels));
    } catch (error) {
      console.error("Error refreshing labels:", error);
      setUserLabels([]);
      setIsTrial(false);
    }
  };

  const refreshProfile = async () => {
    if (!user) {
      setHasProfile(false);
      return;
    }

    const role = preferences.role;
    if (!role) {
      setHasProfile(false);
      return;
    }

    setIsLoading(true);
    try {
      const exists = await checkProfileExists(user.$id, role);
      setHasProfile(exists);
    } catch (error) {
      console.error("Error checking profile:", error);
      setHasProfile(false);
    } finally {
      setIsLoading(false);
    }
  };

  const syncInterfaceLanguageForSession = async (
    sessionPrefs?: Models.Preferences,
  ) => {
    const language = await loadPersistedLanguage();
    await syncUserInterfaceLanguagePreference(
      language,
      (sessionPrefs as UserPreferences | undefined) ?? null,
    );
  };

  useEffect(() => {
    getUser();
  }, []);

  useEffect(() => {
    if (user) {
      refreshLabels();
      if (preferences.role) {
        refreshProfile();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, preferences.role]);

  const getUser = async () => {
    try {
      let session;
      if (Platform.OS === "web") {
        session = await accountWeb.get();
      } else {
        session = await account.get();
      }

      setUser(session);
      setNeedsReAuth(false);
      if (session.prefs) {
        setPreferences(session.prefs as UserPreferences);
      }
      void syncInterfaceLanguageForSession(session.prefs);
    } catch {
      // Session expired or not found — check if elderly user needs re-auth
      if (Platform.OS !== "web") {
        const storedUserId = await SecureStore.getItemAsync("elderly_user_id");
        if (storedUserId) {
          setNeedsReAuth(true);
        }
      }
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const signUp = async (
    email: string,
    password: string,
    role: "elderly" | "caregiver",
  ) => {
    await account.create({
      userId: ID.unique(),
      email,
      password,
    });
    setPreference("role", role);
    // New user — clear any stale elderly_user_id
    if (Platform.OS !== "web") {
      await SecureStore.deleteItemAsync("elderly_user_id");
    }
    await signIn(email, password);
    return null;
  };

  const signIn = async (email: string, password: string) => {
    let user;
    if (Platform.OS === "web") {
      await accountWeb.createEmailPasswordSession({ email, password });
      user = await accountWeb.get();
    } else {
      await account.createEmailPasswordSession({ email, password });
      user = await account.get();
      await SecureStore.deleteItemAsync("elderly_user_id");
    }
    setUser(user);
    setNeedsReAuth(false);

    if (user.prefs) {
      setPreferences(user.prefs as UserPreferences);
    }
    void syncInterfaceLanguageForSession(user.prefs);
    return null;
  };

  const signInWithToken = async (userId: string, secret: string) => {
    await account.createSession({ userId, secret });
    const user = await account.get();
    setUser(user);
    setNeedsReAuth(false);
    if (user.prefs) {
      setPreferences(user.prefs as UserPreferences);
    }
    void syncInterfaceLanguageForSession(user.prefs);
    return null;
  };

  const reAuthenticateElderly = async () => {
    const storedUserId = await SecureStore.getItemAsync("elderly_user_id");
    if (!storedUserId) {
      throw new LoginError("No stored elderly user ID found.");
    }

    const authResult = await LocalAuthentication.authenticateAsync({
      promptMessage: "Authenticate to continue",
      fallbackLabel: "Use passcode",
    });

    if (!authResult.success) {
      throw new LoginError("Biometric authentication failed.");
    }

    // Request a new custom token from the cloud function
    const execution = await functions.createExecution({
      functionId: "699dbc63003c1b31c4bb",
      body: JSON.stringify({ length: 64, expire: 900 }),
      xpath: `/users/${storedUserId}/token`,
      method: ExecutionMethod.POST,
      headers: { "Content-Type": "application/json" },
    });

    if (execution.responseStatusCode >= 400) {
      const errBody = JSON.parse(execution.responseBody || "{}");
      throw new LoginError(
        errBody.error ||
          `Token creation failed (status ${execution.responseStatusCode})`,
      );
    }

    const tokenResult = JSON.parse(execution.responseBody);
    await signInWithToken(tokenResult.userId, tokenResult.secret);
    return null;
  };

  const signInWithOAuth2 = async (
    provider: OAuthProvider,
    role?: "elderly" | "caregiver",
  ) => {
    let user;
    if (Platform.OS === "web") {
      accountWeb.createOAuth2Session({
        provider,
      });
      user = await accountWeb.get();
    } else {
      const deepLink = new URL(makeRedirectUri());
      const scheme = `${deepLink.protocol}//`;

      const loginUrl = await account.createOAuth2Token({
        provider,
        success: `${deepLink}`,
        failure: `${deepLink}`,
      });

      const result = await WebBrowser.openAuthSessionAsync(
        `${loginUrl}`,
        scheme,
      );

      if (result.type === "success" && result.url) {
        const url = new URL(result.url);
        const secret = url.searchParams.get("secret");
        const userId = url.searchParams.get("userId");

        if (!userId || !secret) {
          throw new LoginError(
            "OAuth2 sign-in failed: missing userId or secret",
          );
        }

        await account.createSession({ userId, secret });
        user = await account.get();
        // New OAuth login — clear stale elderly_user_id
        await SecureStore.deleteItemAsync("elderly_user_id");

        if (role && !user.prefs.role) {
          setPreference("role", role);
        }
        setPreferences(user.prefs as UserPreferences);
        void syncInterfaceLanguageForSession(user.prefs);
      } else {
        throw new LoginError("OAuth2 sign-in was cancelled or failed");
      }
    }
    setUser(user);
    return null;
  };

  const signOut = async () => {
    if (Platform.OS !== "web") {
      try {
        const expoPushToken = await getExpoPushTokenAsync();
        await deactivateExpoPushToken(expoPushToken);
      } catch (error) {
        console.warn("Failed to deactivate Expo push token on sign out", error);
      }
    }

    try {
      if (Platform.OS === "web") {
        await accountWeb.deleteSession({ sessionId: "current" });
      } else {
        await account.deleteSession({ sessionId: "current" });
      }
    } catch {
      // Session may already be expired — ignore
    }
    setUser(null);
    setHasProfile(false);
    setPreferences({});
    setUserLabels([]);
    setIsTrial(false);
    setNeedsReAuth(false);
    setIsLoading(false);
  };

  const updatePreferences = async (newPreferences: UserPreferences) => {
    try {
      await account.updatePrefs({ prefs: newPreferences });
      const updatedUser = await account.get();
      setUser(updatedUser);
      setPreferences((updatedUser.prefs as UserPreferences) ?? newPreferences);
      return null;
    } catch (error) {
      console.error("Error updating preferences:", error);
      return error instanceof Error
        ? error.message
        : "Failed to update preferences.";
    }
  };

  const setPreference = async (key: string, value: any) => {
    return updatePreferences({ ...preferences, [key]: value });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        preferences,
        hasProfile,
        isTrial,
        userLabels,
        needsReAuth,
        signUp,
        signIn,
        signInWithToken,
        signInWithOAuth2,
        signOut,
        reAuthenticateElderly,
        updatePreferences,
        setPreference,
        refreshProfile,
        refreshLabels,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be inside of the AuthProvider");
  }

  return context;
}
