import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import { ID, Models, OAuthProvider } from "react-native-appwrite";
import { UserPreferences } from "../types/user";
import { account, accountWeb } from "./appwrite";
import {
  addRoleLabel,
  checkProfileExists,
  hasTrialLabel,
} from "./user";
export class LoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoginError";
  }
}

type AuthContextType = {
  user: Models.User<Models.Preferences> | null;
  isLoadingUser: boolean;
  preferences: UserPreferences;
  hasProfile: boolean | null;
  profileLoading: boolean;
  isTrial: boolean;
  userLabels: string[];

  signUp: (
    email: string,
    password: string,
    userPreferences?: UserPreferences,
  ) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signInWithOAuth2: (provider: OAuthProvider) => Promise<string | null>;
  signOut: () => Promise<void>;
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
  const [isLoadingUser, setIsLoadingUser] = useState<boolean>(true);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [profileLoading, setProfileLoading] = useState<boolean>(false);
  const [userLabels, setUserLabels] = useState<string[]>([]);
  const [isTrial, setIsTrial] = useState<boolean>(false);

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
      setHasProfile(null);
      return;
    }

    const role = preferences.role;
    if (!role) {
      setHasProfile(false);
      return;
    }

    setProfileLoading(true);
    try {
      const exists = await checkProfileExists(user.$id, role);
      setHasProfile(exists);
    } catch (error) {
      console.error("Error checking profile:", error);
      setHasProfile(false);
    } finally {
      setProfileLoading(false);
    }
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
      if (session.prefs) {
        setPreferences(session.prefs as UserPreferences);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoadingUser(false);
    }
  };

  const signUp = async (
    email: string,
    password: string,
    userPreferences?: UserPreferences,
  ) => {
    const newAccount = await account.create({
      userId: ID.unique(),
      email,
      password,
    });

    if (userPreferences && Object.keys(userPreferences).length > 0) {
      await account.updatePrefs(userPreferences);
    }

    // Add role label to user after signup
    if (userPreferences?.role) {
      await addRoleLabel(newAccount.$id, userPreferences.role);
    }

    await signIn(email, password);
    return null;
  };

  const signIn = async (email: string, password: string) => {
    let session;
    if (Platform.OS === "web") {
      await accountWeb.createEmailPasswordSession({ email, password });
      session = await accountWeb.get();
    } else {
      await account.createEmailPasswordSession({ email, password });
      session = await account.get();
    }
    setUser(session);

    if (session.prefs) {
      setPreferences(session.prefs as UserPreferences);
    }

    return null;
  };

  const updatePreferences = async (newPreferences: UserPreferences) => {
    await account.updatePrefs(newPreferences);
    const updatedUser = await account.get();
    setUser(updatedUser);
    setPreferences(newPreferences);
    return null;
  };

  const setPreference = async (key: string, value: any) => {
    const newPrefs = { ...preferences, [key]: value };
    await account.updatePrefs(newPrefs);
    setPreferences(newPrefs);
    return null;
  };

  const signInWithOAuth2 = async (provider: OAuthProvider) => {
    let session;
    if (Platform.OS === "web") {
      accountWeb.createOAuth2Session({
        provider,
      });
      session = await accountWeb.get();
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
        session = await account.get();
      } else {
        throw new LoginError("OAuth2 sign-in was cancelled or failed");
      }
    }
    setUser(session);
    return null;
  };

  const signOut = async () => {
    if (Platform.OS === "web") {
      await accountWeb.deleteSession({ sessionId: "current" });
    } else {
      await account.deleteSession({ sessionId: "current" });
    }
    setUser(null);
    setHasProfile(null);
    setPreferences({});
    setUserLabels([]);
    setIsTrial(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoadingUser,
        preferences,
        hasProfile,
        profileLoading,
        isTrial,
        userLabels,
        signUp,
        signIn,
        signInWithOAuth2,
        signOut,
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
