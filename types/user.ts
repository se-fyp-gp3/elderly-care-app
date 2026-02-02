export enum Role {
  Elderly = 'elderly',
  Caregiver = 'caregiver',
}

export type UserPreferences = {
  role?: Role;
  fontSize?: 'small' | 'medium' | 'large';
  voiceTone?: 'gentle' | 'friendly' | 'professional';
  notifications?: boolean;
  [key: string]: any;
};