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

export enum UIVersion {
  Default = "default",
  Accessible = "accessible",
  Simplified = "simplified",
}

export type UserPreferences = {
  role?: Role;
  fontSize?: FontSize;
  voiceTone?: VoiceTone;
  notifications?: boolean;
  avatarFileId?: string;
  fallDetectionEnabled?: boolean;
  voiceReplyLang?: string;
  aiVoiceEnabled?: boolean;
  aiVoiceId?: string;
  aiVoiceDefaultId?: string;
  aiVoiceCantoneseId?: string;
  aiVoiceCaregiverId?: string;
  aiVoiceCaregiverName?: string;
  uiVersion?: UIVersion;
  pinnedConversations?: string[];
  [key: string]: any;
};
