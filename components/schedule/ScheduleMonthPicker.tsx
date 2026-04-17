import React from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Button, Dialog, Portal, Text, useTheme } from "react-native-paper";

const MONTH_KEYS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"] as const;

interface ScheduleMonthPickerProps {
  visible: boolean;
  onDismiss: () => void;
  pickerYear: number;
  onChangeYear: (year: number) => void;
  referenceDate: Date;
  onSelectMonth: (monthIndex: number) => void;
}

export default function ScheduleMonthPicker({
  visible,
  onDismiss,
  pickerYear,
  onChangeYear,
  referenceDate,
  onSelectMonth,
}: ScheduleMonthPickerProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const MONTHS = MONTH_KEYS.map(k => t(`schedule.${k}`));

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={onDismiss}
        style={{ backgroundColor: theme.colors.surface }}
      >
        <Dialog.Content>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <Button
              icon="chevron-left"
              onPress={() => onChangeYear(pickerYear - 1)}
              compact
            >
              {t('schedule.prev')}
            </Button>
            <Text variant="titleLarge" style={{ fontWeight: "bold" }}>
              {pickerYear}
            </Text>
            <Button
              icon="chevron-right"
              contentStyle={{ flexDirection: "row-reverse" }}
              onPress={() => onChangeYear(pickerYear + 1)}
              compact
            >
              {t('schedule.next')}
            </Button>
          </View>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "space-between",
            }}
          >
            {MONTHS.map((month, index) => (
              <TouchableOpacity
                key={month}
                style={[
                  styles.monthButton,
                  {
                    backgroundColor:
                      index === referenceDate.getMonth() &&
                      pickerYear === referenceDate.getFullYear()
                        ? theme.colors.primaryContainer
                        : "transparent",
                  },
                ]}
                onPress={() => onSelectMonth(index)}
              >
                <Text
                  style={{
                    color:
                      index === referenceDate.getMonth() &&
                      pickerYear === referenceDate.getFullYear()
                        ? theme.colors.onPrimaryContainer
                        : theme.colors.onSurface,
                  }}
                >
                  {month}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss}>{t('common.cancel')}</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  monthButton: {
    width: "30%",
    paddingVertical: 10,
    alignItems: "center",
    marginVertical: 5,
    borderRadius: 8,
  },
});
