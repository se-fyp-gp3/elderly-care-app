import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import {
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";
import { Text, useTheme } from "react-native-paper";

interface DateItem {
  day: string;
  date: number;
  fullDate: Date;
  isToday: boolean;
}

interface ScheduleCalendarStripProps {
  referenceDate: Date;
  selectedDate: Date;
  dates: DateItem[];
  onSelectDate: (date: Date) => void;
  onOpenMonthPicker: () => void;
}

export default function ScheduleCalendarStrip({
  referenceDate,
  selectedDate,
  dates,
  onSelectDate,
  onOpenMonthPicker,
}: ScheduleCalendarStripProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.calendarStrip,
        { backgroundColor: theme.colors.background },
      ]}
    >
      <TouchableOpacity onPress={onOpenMonthPicker}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            marginBottom: 16,
            marginTop: 10,
          }}
        >
          <Text
            variant="headlineSmall"
            style={{ fontWeight: "bold", marginRight: 8 }}
          >
            {referenceDate.toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </Text>
          <MaterialCommunityIcons
            name="chevron-down"
            size={24}
            color={theme.colors.onSurface}
          />
        </View>
      </TouchableOpacity>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 10 }}
      >
        {dates.map((dateItem, index) => {
          const isSelected =
            dateItem.fullDate.toDateString() === selectedDate.toDateString();
          return (
            <TouchableOpacity
              key={index}
              onPress={() => onSelectDate(dateItem.fullDate)}
              style={[
                styles.dateBox,
                {
                  backgroundColor: isSelected
                    ? theme.colors.primary
                    : theme.colors.surfaceVariant,
                },
              ]}
            >
              <Text
                style={[
                  styles.dayText,
                  {
                    color: isSelected
                      ? theme.colors.onPrimary
                      : theme.colors.onSurfaceVariant,
                  },
                ]}
              >
                {dateItem.day}
              </Text>
              <Text
                style={[
                  styles.dateText,
                  {
                    color: isSelected
                      ? theme.colors.onPrimary
                      : theme.colors.onSurface,
                  },
                ]}
              >
                {dateItem.date}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  calendarStrip: {
    paddingBottom: 16,
  },
  dateBox: {
    width: 60,
    height: 80,
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 6,
    borderRadius: 16,
  },
  dayText: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  dateText: {
    fontSize: 20,
    fontWeight: "bold",
  },
});
