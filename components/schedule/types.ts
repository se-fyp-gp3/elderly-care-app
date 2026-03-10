import { ScheduleEvent } from "@/lib/schedule";

export type DisplayItem =
  | { kind: "single"; event: ScheduleEvent }
  | {
      kind: "medGroup";
      key: string;
      time: string;
      elderlyName: string;
      elderlyId: string;
      rawDate: string;
      events: ScheduleEvent[];
    };
