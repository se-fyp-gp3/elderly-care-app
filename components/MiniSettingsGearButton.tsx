import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useState } from "react";
import { TouchableOpacity } from "react-native";
import { useTheme } from "react-native-paper";
import MiniSettingsModal from "./MiniSettingsModal";

export default function MiniSettingsGearButton() {
  const [visible, setVisible] = useState(false);
  const theme = useTheme();

  return (
    <>
      <TouchableOpacity
        onPress={() => setVisible(true)}
        style={{ marginRight: 12, padding: 4 }}
      >
        <MaterialCommunityIcons
          name="cog"
          size={26}
          color={theme.colors.onSurface}
        />
      </TouchableOpacity>
      <MiniSettingsModal
        visible={visible}
        onDismiss={() => setVisible(false)}
      />
    </>
  );
}
