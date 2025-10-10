import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import React, { createContext, useContext, useEffect, useState } from "react";
import { ID, Models, OAuthProvider } from "react-native-appwrite";
import { account } from "./appwrite";
type AuthContextType = {
  user: Models.User<Models.Preferences> | null;
  isLoadingUser: boolean;
  signUp: (email: string, password: string) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signInWithOAuth2: (provider: OAuthProvider) => Promise<string | null>;
  signOut: () => Promise<void>;
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
  const [isLoadingUser, setIsLoadingUser] = useState<boolean>(true);

  useEffect(() => {
    getUser();
  }, []);

  const getUser = async () => {
    try {
      const session = await account.get();
      console.log(session);
      
      setUser(session);
    } catch (error) {
      setUser(null);
    } finally {
      setIsLoadingUser(false);
    }
  };

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
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      await account.createEmailPasswordSession({ email, password });
      const session = await account.get();
      setUser(session);
      return null;
    } catch (error) {
      if (error instanceof Error) {
        return error.message;
      } else {
        return "An error occurred during sign in";
      }
    }
  };

  const signInWithOAuth2 = async (provider: OAuthProvider) => {
    try {
      const redirectUri = makeRedirectUri({ 
        preferLocalhost: true,
        scheme: 'exp' 
      });
      console.log("Deep link: ", redirectUri);
      console.log("Provider:", provider);

      const loginUrl = account.createOAuth2Session({
        provider: provider,
        success: redirectUri,
        failure: redirectUri,
      });

      console.log("Login URL:", loginUrl);

      const result = await WebBrowser.openAuthSessionAsync(
        `${loginUrl}`,
        redirectUri.split('://')[0] + '://'
      );

      console.log("WebBrowser result type:", result.type);
      console.log("WebBrowser result:", result);

      if (result.type !== "success") {
        throw new Error("OAuth session was not successful");
      }

      WebBrowser.dismissBrowser();

      const url = new URL(result.url);
      console.log("Redirect URL:", result.url);
      
      let secret = url.searchParams.get("secret");
      let userId = url.searchParams.get("userId");
      
      if (!secret || !userId) {
        const hashParams = new URLSearchParams(url.hash.substring(1));
        secret = hashParams.get("secret") || secret;
        userId = hashParams.get("userId") || userId;
        console.log("Hash params:", Object.fromEntries(hashParams.entries()));
      }
      
      console.log("URL params:", Object.fromEntries(url.searchParams.entries()));

      if (!secret || !userId) {
        console.log("Available params:", Array.from(url.searchParams.keys()));
        throw new Error(`Missing userId or secret from redirect URL. Available params: ${Array.from(url.searchParams.keys()).join(', ')}`);
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
      await account.deleteSession({ sessionId: "current" });
      setUser(null);
    } catch (error) {
      console.log(error);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, isLoadingUser, signUp, signIn, signInWithOAuth2, signOut }}
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
