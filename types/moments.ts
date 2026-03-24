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
}

export interface MomentComment extends Models.Document {
  moment_id: string;
  content: string;
  author_id: string;
  author_name: string;
  author_role: "elderly" | "caregiver" | "ai";
}
