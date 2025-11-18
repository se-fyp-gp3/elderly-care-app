// lib/auth-context.tsx
import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import { ID, Models, OAuthProvider } from "react-native-appwrite";
import { account, accountWeb } from "./appwrite";
import { UserPreferences } from "../types/user.types";

type AuthContextType = {
  user: Models.User<Models.Preferences> | null;
  isLoadingUser: boolean;

  preferences: UserPreferences;

  signUp: (email: string, password: string) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signInWithOAuth2: (provider: OAuthProvider) => Promise<string | null>;
  signOut: () => Promise<void>;
  updatePreferences: (
    newPreferences: UserPreferences
  ) => Promise<string | null>;
  setPreference: (key: string, value: any) => Promise<string | null>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<Models.User<Models.Preferences> | null>(
    null
  );
  const [preferences, setPreferences] = useState<UserPreferences>({});
  const [isLoadingUser, setIsLoadingUser] = useState<boolean>(true);

  useEffect(() => {
    getUser();
  }, []);

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
    } catch (error) {
      setUser(null);
    } finally {
      setIsLoadingUser(false);
    }
  };

  const signUp = async (
    email: string,
    password: string,
    userPreferences?: UserPreferences
  ) => {
    try {
      await account.create({
        userId: ID.unique(),
        email,
        password,
      });

      if (userPreferences && Object.keys(userPreferences).length > 0) {
        await account.updatePrefs(userPreferences);
      }

      await signIn(email, password);
      return null;
    } catch (error) {
      if (error instanceof Error) {
        return error.message;
      } else {
        return "An error occurred during sign up";
      }
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
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
    } catch (error) {
      if (error instanceof Error) {
        return error.message;
      } else {
        return "An error occurred during sign in";
      }
    }
  };

  const updatePreferences = async (newPreferences: UserPreferences) => {
    try {
      await account.updatePrefs(newPreferences);
      const updatedUser = await account.get();
      setUser(updatedUser);
      setPreferences(newPreferences);
      return null;
    } catch (error) {
      if (error instanceof Error) {
        return error.message;
      } else {
        return "An error occurred while updating preferences";
      }
    }
  };

  const setPreference = async (key: string, value: any) => {
    try {
      const newPrefs = { ...preferences, [key]: value };
      await account.updatePrefs(newPrefs);
      setPreferences(newPrefs);
      return null;
    } catch (error) {
      if (error instanceof Error) {
        return error.message;
      } else {
        return "An error occurred while setting preference";
      }
    }
  };

  const signInWithOAuth2 = async (provider: OAuthProvider) => {
    try {
      const deepLink = new URL(makeRedirectUri({ preferLocalhost: true }));
      const scheme = `${deepLink.protocol}//`;
      const loginUrl = account.createOAuth2Session({
        provider,
        success: `${deepLink}`,
        failure: `${deepLink}`,
      });

      const result = await WebBrowser.openAuthSessionAsync(`${loginUrl}`, scheme);
      console.log(result);
      if (result.type !== "success") {
        throw new Error("OAuth session was not successful");
      }

      const url = new URL(result.url);
      const secret = url.searchParams.get("secret");
      const userId = url.searchParams.get("userId");
      if (!secret || !userId) {
        throw new Error(
          `Missing userId or secret from redirect URL. Available params: ${Array.from(
            url.searchParams.keys()
          ).join(", ")}`
        );
      }

      await account.createSession({ userId, secret });
      const session = await account.get();
      setUser(session);
      return null;
    } catch (error) {
      console.error("OAuth2 sign-in error: ", error);
      if (error instanceof Error) {
        return error.message;
      } else {
        return "An error occurred during sign in with OAuth2";
      }
    }
  };

  const signOut = async () => {
    try {
      if (Platform.OS === "web") {
        await accountWeb.deleteSession({ sessionId: "current" });
      } else {
        await account.deleteSession({ sessionId: "current" });
      }
      setUser(null);
    } catch (error) {
      console.log(error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoadingUser,
        preferences,
        signUp,
        signIn,
        signInWithOAuth2,
        signOut,
        updatePreferences,
        setPreference,
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
