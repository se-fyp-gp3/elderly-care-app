import FallCountdownOverlay from "@/components/FallCountdownOverlay";
import { Stack, useRouter } from "expo-router";
import React from "react";

export default function FallAlertScreen() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <FallCountdownOverlay
        visible
        onDismiss={() => router.replace("/(elderly-tabs)" as any)}
      />
    </>
  );
}