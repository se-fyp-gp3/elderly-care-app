import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import { ID, Models, OAuthProvider } from "react-native-appwrite";
import { UserPreferences } from "../types/user";
import { account, accountWeb } from "./appwrite";
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

  signUp: (
    email: string,
    password: string,
    role: "elderly" | "caregiver",
  ) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signInWithOAuth2: (
    provider: OAuthProvider,
    role?: "elderly" | "caregiver",
  ) => Promise<string | null>;
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
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasProfile, setHasProfile] = useState<boolean>(false);
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
    }
    setUser(user);

    if (user.prefs) {
      setPreferences(user.prefs as UserPreferences);
    }
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

        if (role && !user.prefs.role) {
          setPreference("role", role);
        }
        setPreferences(user.prefs as UserPreferences);
      } else {
        throw new LoginError("OAuth2 sign-in was cancelled or failed");
      }
    }
    setUser(user);
    return null;
  };

  const signOut = async () => {
    if (Platform.OS === "web") {
      await accountWeb.deleteSession({ sessionId: "current" });
    } else {
      await account.deleteSession({ sessionId: "current" });
    }
    setUser(null);
    setHasProfile(false);
    setPreferences({});
    setUserLabels([]);
    setIsTrial(false);
    setIsLoading(false);
  };

  const updatePreferences = async (newPreferences: UserPreferences) => {
    try {
      await account.updatePrefs({ prefs: newPreferences });
      const updatedUser = await account.get();
      setUser(updatedUser);
      setPreferences(newPreferences);
    } catch (error) {
      console.error("Error updating preferences:", error);
    }
    return null;
  };

  const setPreference = async (key: string, value: any) => {
    const newPrefs = { ...preferences, [key]: value };
    try {
      await account.updatePrefs({ prefs: newPrefs });
      setPreferences(newPrefs);
    } catch (error) {
      console.error("Error updating preference:", error);
    }
    return null;
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
