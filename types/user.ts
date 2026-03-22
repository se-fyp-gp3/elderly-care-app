export enum Role {
  Elderly = "elderly",
  Caregiver = "caregiver",
}

export enum FontSize {
  Small = "small",
  Medium = "medium",
  Large = "large",
}

export enum VoiceTone {
  Gentle = "gentle",
  Friendly = "friendly",
  Professional = "professional",
}

export type UserPreferences = {
  role?: Role;
  fontSize?: FontSize;
  voiceTone?: VoiceTone;
  notifications?: boolean;
  aiVoiceEnabled?: boolean;
  aiVoiceId?: string;
  aiVoiceCaregiverId?: string;
  aiVoiceCaregiverName?: string;
  [key: string]: any;
};
