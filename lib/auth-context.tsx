// lib/auth-context.tsx
import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import { ID, Models, OAuthProvider } from "react-native-appwrite";
import { UserPreferences } from "../types/user.types";
import { account, accountWeb } from "./appwrite";

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

  signUp: (
    email: string,
    password: string,
    userPreferences?: UserPreferences
  ) => Promise<string | null>;
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
<<<<<<< HEAD
      let session;
      if (Platform.OS === "web") {
        session = await accountWeb.get();
      } else {
        session = await account.get();
      }
      
      setUser(session);
>>>>>>> c71b75e (feat: update dependencies and add authentication context)
    } catch (error) {
      setUser(null);
    } finally {
      setIsLoadingUser(false);
  };

<<<<<<< HEAD
  const signUp = async (
    email: string,
    password: string,
    userPreferences?: UserPreferences
  ) => {
    await account.create({
      userId: ID.unique(),
      email,
      password,
    });
    if (userPreferences && Object.keys(userPreferences).length > 0) {
      await account.updatePrefs(userPreferences);
=======
  const signUp = async (email: string, password: string) => {
    try {
      await account.create({ userId: ID.unique(), email, password });
      await signIn(email, password);
      return null;
    } catch (error) {
      if (error instanceof Error) {
        return error.message;
      } else {
        return "An error occurred during sign up";
      }
>>>>>>> c71b75e (feat: update dependencies and add authentication context)
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
<<<<<<< HEAD
      session = await account.get();
=======
      const session = await account.get();
      setUser(session);
      return null;
    } catch (error) {
      if (error instanceof Error) {
        return error.message;
  const signInWithOAuth2 = async (provider: OAuthProvider) => {
    let session;
    if (Platform.OS === "web") {
      accountWeb.createOAuth2Session({
        provider,
      });
      session = await accountWeb.get();
    } else {
      const deepLink = new URL(makeRedirectUri({ preferLocalhost: true }));
      const scheme = `${deepLink.protocol}//`;

      const loginUrl = await account.createOAuth2Token({
        provider,
        success: `${deepLink}`,
        failure: `${deepLink}`,
      });

      const result = await WebBrowser.openAuthSessionAsync(
        `${loginUrl}`,
        scheme
      );

      if (result.type === "success" && result.url) {
        const url = new URL(result.url);
        const secret = url.searchParams.get("secret");
        const userId = url.searchParams.get("userId");

        if (!userId || !secret) {
          throw new LoginError(
            "OAuth2 sign-in failed: missing userId or secret"
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
