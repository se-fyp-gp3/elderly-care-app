export type UserPreferences = {
  role?: 'elderly' | 'caregiver';
  fontSize?: 'small' | 'medium' | 'large';
  voiceTone?: 'gentle' | 'friendly' | 'professional';
  notifications?: boolean;
  [key: string]: any;
};