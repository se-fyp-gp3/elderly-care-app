import { buildAvatarUrl } from "@/lib/user";
import React from "react";
import { Image, StyleSheet } from "react-native";
import { Avatar, useTheme } from "react-native-paper";

interface UserAvatarProps {
  avatarFileId?: string;
  name: string;
  size: number;
  role?: "elderly" | "caregiver";
}

export default function UserAvatar({ avatarFileId, name, size, role }: UserAvatarProps) {
  const theme = useTheme();

  if (avatarFileId) {
    const url = buildAvatarUrl(avatarFileId);
    return (
      <Image
        source={{ uri: url.toString() }}
        style={[
          styles.image,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      />
    );
  }

  const label = (name || "??").substring(0, 2).toUpperCase();
  const bgColor =
    role === "elderly"
      ? theme.colors.primaryContainer
      : role === "caregiver"
        ? theme.colors.tertiaryContainer
        : theme.colors.secondaryContainer;
  const labelColor =
    role === "elderly"
      ? theme.colors.onPrimaryContainer
      : role === "caregiver"
        ? theme.colors.onTertiaryContainer
        : theme.colors.onSecondaryContainer;

  return (
    <Avatar.Text
      size={size}
      label={label}
      style={{ backgroundColor: bgColor }}
      labelStyle={{ color: labelColor, fontWeight: "600" }}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    resizeMode: "cover",
  },
});
