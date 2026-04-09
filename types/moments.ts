import { Models } from "react-native-appwrite";

/** A single media item stored as JSON inside Moment.media_items */
export interface MediaItem {
  file_id: string;
  bucket_id: string;
  type: "image" | "video";
  mime_type: string;
  width?: number;
  height?: number;
  duration_ms?: number;
  thumbnail_file_id?: string;
  url?: string;           // computed at runtime
  thumbnail_url?: string; // computed at runtime
}

export interface Moment extends Models.Document {
  content: string;
  author_id: string;
  author_name: string;
  author_role: "elderly" | "caregiver" | "ai";
  author_avatar?: string;
  likes: string[]; // List of user IDs who liked
  comments_count: number;
  ai_generated?: boolean;
  // Legacy single-media fields (kept for backward compat)
  media_type?: "image" | "video";
  media_file_id?: string;
  media_bucket_id?: string;
  media_mime_type?: string;
  media_url?: string;
  media_width?: number;
  media_height?: number;
  media_duration_ms?: number;
  media_thumbnail_file_id?: string;
  // New multi-media field (JSON-serialised MediaItem[])
  media_items?: string;
  // Runtime-only: parsed media items
  parsedMediaItems?: MediaItem[];
}

export interface MomentComment extends Models.Document {
  moment_id: string;
  content: string;
  author_id: string;
  author_name: string;
  author_role: "elderly" | "caregiver" | "ai";
  // Reply fields
  reply_to_comment_id?: string;
  reply_to_user_id?: string;
  reply_to_user_name?: string;
  // Comment likes
  likes?: string[];
  // Denormalised moment author for notification logic
  moment_author_id?: string;
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
