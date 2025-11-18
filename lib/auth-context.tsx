// lib/auth-context.tsx
import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import { ID, Models, OAuthProvider } from "react-native-appwrite";
import { account, accountWeb } from "./appwrite";
import { UserPreferences } from "../types/user.types";
<<<<<<< HEAD

export class LoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoginError";
  }
}
=======
>>>>>>> 78af8f2 (feat: add user preferences type definition and appwrite configuration)

type AuthContextType = {
  user: Models.User<Models.Preferences> | null;
  isLoadingUser: boolean;
<<<<<<< HEAD
=======

>>>>>>> 78af8f2 (feat: add user preferences type definition and appwrite configuration)
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

<<<<<<< HEAD
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Models.User<Models.Preferences> | null>(null);
=======
export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<Models.User<Models.Preferences> | null>(
    null
  );
>>>>>>> 78af8f2 (feat: add user preferences type definition and appwrite configuration)
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
<<<<<<< HEAD
=======

>>>>>>> 78af8f2 (feat: add user preferences type definition and appwrite configuration)
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
<<<<<<< HEAD
    await account.create({ userId: ID.unique(), email, password });
    if (userPreferences && Object.keys(userPreferences).length > 0) {
      await account.updatePrefs(userPreferences);
=======
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
>>>>>>> 78af8f2 (feat: add user preferences type definition and appwrite configuration)
    }

    await signIn(email, password);
    return null;
  };

  const signIn = async (email: string, password: string) => {
<<<<<<< HEAD
    let session;
    if (Platform.OS === "web") {
      await accountWeb.createEmailPasswordSession({ email, password });
      session = await accountWeb.get();
    } else {
      await account.createEmailPasswordSession({ email, password });
      session = await account.get();
=======
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
>>>>>>> 78af8f2 (feat: add user preferences type definition and appwrite configuration)
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
<<<<<<< HEAD
    let session;
    if (Platform.OS === "web") {
      accountWeb.createOAuth2Session({ provider });
      session = await accountWeb.get();
    } else {
      const deepLink = new URL(makeRedirectUri({ preferLocalhost: true }));
      const scheme = `${deepLink.protocol}//`;

      const loginUrl = await account.createOAuth2Token({
=======
    try {
      const deepLink = new URL(makeRedirectUri({ preferLocalhost: true }));
      const scheme = `${deepLink.protocol}//`;
      const loginUrl = account.createOAuth2Session({
>>>>>>> 78af8f2 (feat: add user preferences type definition and appwrite configuration)
        provider,
        success: `${deepLink}`,
        failure: `${deepLink}`,
      });

      const result = await WebBrowser.openAuthSessionAsync(`${loginUrl}`, scheme);
<<<<<<< HEAD

      if (result.type === "success" && result.url) {
        const url = new URL(result.url);
        const secret = url.searchParams.get("secret");
        const userId = url.searchParams.get("userId");

        if (!userId || !secret) {
          throw new LoginError("OAuth2 sign-in failed: missing userId or secret");
        }

        await account.createSession({ userId, secret });
        session = await account.get();
=======
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
>>>>>>> 78af8f2 (feat: add user preferences type definition and appwrite configuration)
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
