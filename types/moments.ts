import { Models } from "react-native-appwrite";

export interface Moment extends Models.Document {
  content: string;
  author_id: string;
  author_name: string;
  author_role: "elderly" | "caregiver" | "ai";
  author_avatar?: string;
  likes: string[]; // List of user IDs who liked
  comments_count: number;
  ai_generated?: boolean;
  media_type?: "image" | "video";
  media_file_id?: string;
  media_bucket_id?: string;
  media_mime_type?: string;
  media_url?: string;
  media_width?: number;
  media_height?: number;
  media_duration_ms?: number;
}

export interface MomentComment extends Models.Document {
  moment_id: string;
  content: string;
  author_id: string;
  author_name: string;
  author_role: "elderly" | "caregiver" | "ai";
}

export interface MomentMediaInput {
  uri: string;
  type: "image" | "video";
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  durationMs?: number;
}
