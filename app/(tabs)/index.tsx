import { StyleSheet, View } from "react-native";
import { Text, useTheme } from 'react-native-paper';

export default function Index() {

  const theme = useTheme();
  
  return (
    <View style={[styles.container, {backgroundColor: theme.colors.background}]}>
      <Text style={styles.text}>Edit app/index.tsx to edit this screen.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  text: { fontSize: 18 },
});
