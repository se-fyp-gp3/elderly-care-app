import { generateAIResponse } from "@/lib/ai";
import {
    clientReactNative,
    DATABASE_ID,
    MOMENTS_COMMENTS_TABLE_ID,
    MOMENTS_MEDIA_BUCKET_ID,
    MOMENTS_TABLE_ID,
    storage,
} from "@/lib/appwrite";
import { Moment, MomentComment, MomentMediaInput } from "@/types/moments";
import * as FileSystem from "expo-file-system";
import { Databases, ID, Permission, Query, Role } from "react-native-appwrite";

const databases = new Databases(clientReactNative);

export async function getMoments(page = 1, allowedAuthorIds?: string[]): Promise<Moment[]> {
  const queries = [
    Query.orderDesc("$createdAt"),
    Query.limit(20),
    Query.offset((page - 1) * 20),
  ];

  if (allowedAuthorIds && allowedAuthorIds.length > 0) {
    queries.push(Query.equal("author_id", allowedAuthorIds));
  }

  const response = await databases.listDocuments(
    DATABASE_ID,
    MOMENTS_TABLE_ID,
    queries
  );

  const documents = response.documents as unknown as Moment[];
  return documents.map((doc) => {
    if (doc.media_bucket_id && doc.media_file_id) {
      return {
        ...doc,
        media_url: buildMediaUrl(doc.media_bucket_id, doc.media_file_id),
      };
    }
    return doc;
  });
}

export async function createMoment(
  content: string,
  userId: string,
  userName: string,
  userRole: "elderly" | "caregiver",
  media?: MomentMediaInput | null
): Promise<Moment> {
  let mediaFields: Partial<Moment> = {};
  if (media) {
    mediaFields = await uploadMomentMedia(media);
  }

  const response = await databases.createDocument(
    DATABASE_ID,
    MOMENTS_TABLE_ID,
    ID.unique(),
    {
      content,
      author_id: userId,
      author_name: userName,
      author_role: userRole,
      likes: [],
      comments_count: 0,
      ai_generated: false,
      ...mediaFields,
    }
  );

  const created = response as unknown as Moment;
  if (created.media_bucket_id && created.media_file_id) {
    created.media_url = buildMediaUrl(created.media_bucket_id, created.media_file_id);
  }
  return created;
}

async function uploadMomentMedia(media: MomentMediaInput): Promise<Partial<Moment>> {
  const guessedExtension = getFileExtension(media.fileName, media.mimeType, media.type);
  const cleanFileName = media.fileName?.trim() || `${media.type}_${Date.now()}.${guessedExtension}`;
  const mimeType = media.mimeType || (media.type === "video" ? "video/mp4" : "image/jpeg");
  const fileSize = await resolveFileSize(media);

  let uploadedFile;
  try {
    uploadedFile = await storage.createFile({
      bucketId: MOMENTS_MEDIA_BUCKET_ID,
      fileId: ID.unique(),
      file: {
        name: cleanFileName,
        type: mimeType,
        size: fileSize,
        uri: media.uri,
      },
      permissions: [Permission.read(Role.users())],
    });
  } catch (error: any) {
    const reason = extractErrorMessage(error);
    throw new Error(
      `Media upload failed: ${reason}. Please ensure bucket "${MOMENTS_MEDIA_BUCKET_ID}" exists and allows uploads.`
    );
  }

  const baseFields: Partial<Moment> = {
    media_type: media.type,
    media_bucket_id: MOMENTS_MEDIA_BUCKET_ID,
    media_file_id: uploadedFile.$id,
    media_mime_type: mimeType,
    media_width: media.width,
    media_height: media.height,
    media_duration_ms: media.durationMs,
  };

  return baseFields;
}

async function resolveFileSize(media: MomentMediaInput): Promise<number> {
  if (typeof media.fileSize === "number" && media.fileSize > 0) {
    return media.fileSize;
  }

  try {
    const fileInfo = await FileSystem.getInfoAsync(media.uri);
    if (fileInfo.exists && typeof fileInfo.size === "number" && fileInfo.size > 0) {
      return fileInfo.size;
    }
  } catch {
    // Ignore and fall back below.
  }

  return 1;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message ?? "Unknown error");
  }
  return "Unknown error";
}

function buildMediaUrl(bucketId: string, fileId: string): string | undefined {
  try {
    return storage.getFileViewURL(bucketId, fileId).toString();
  } catch (error) {
    console.warn("Failed to build moment media URL:", error);
    return undefined;
  }
}

function getFileExtension(
  fileName?: string,
  mimeType?: string,
  mediaType?: "image" | "video"
): string {
  if (fileName && fileName.includes(".")) {
    return fileName.split(".").pop() || "bin";
  }
  if (mimeType?.includes("/")) {
    return mimeType.split("/")[1] || "bin";
  }
  return mediaType === "video" ? "mp4" : "jpg";
}

export async function likeMoment(momentId: string, userId: string, currentLikes: string[]): Promise<string[]> {
  const isLiked = currentLikes.includes(userId);
  let newLikes = [...currentLikes];
  
  if (isLiked) {
    newLikes = newLikes.filter(id => id !== userId);
  } else {
    newLikes.push(userId);
  }

  try {
    await databases.updateDocument(
      DATABASE_ID,
      MOMENTS_TABLE_ID,
      momentId,
      {
        likes: newLikes,
      }
    );
    return newLikes;
  } catch (error) {
    console.error("Error liking moment:", error);
    return newLikes; // Optimistic update
  }
}

export async function getComments(momentId: string): Promise<MomentComment[]> {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      MOMENTS_COMMENTS_TABLE_ID,
      [
        Query.equal("moment_id", momentId),
        Query.orderDesc("$createdAt"),
        Query.limit(100),
      ]
    );
    return response.documents as unknown as MomentComment[];
  } catch (error) {
    console.error("Error fetching comments:", error);
    return [];
  }
}

export async function addComment(
  momentId: string,
  content: string,
  userId: string,
  userName: string,
  userRole: "elderly" | "caregiver"
): Promise<MomentComment> {
  const comment = await databases.createDocument(
    DATABASE_ID,
    MOMENTS_COMMENTS_TABLE_ID,
    ID.unique(),
    {
      moment_id: momentId,
      content,
      author_id: userId,
      author_name: userName,
      author_role: userRole,
    }
  );

  // Increment comments_count on the moment
  try {
    const moment = await databases.getDocument(DATABASE_ID, MOMENTS_TABLE_ID, momentId);
    await databases.updateDocument(DATABASE_ID, MOMENTS_TABLE_ID, momentId, {
      comments_count: (moment.comments_count || 0) + 1,
    });
  } catch {
    // Non-critical, count will be stale but functional
  }

  return comment as unknown as MomentComment;
}

export async function addAIResponse(momentId: string, content: string): Promise<MomentComment> {
  const aiContent = await generateAIResponse(content);
  
  try {
     // Create comment in comments collection if exists
     /*
     await databases.createDocument(
        DATABASE_ID,
        MOMENTS_COMMENTS_TABLE_ID,
        ID.unique(),
        {
            moment_id: momentId,
            content: aiContent,
            author_id: "ai-assistant",
            author_name: "AI Assistant",
            author_role: "ai"
        }
     );
     */
     // For simplicity in this demo, we'll just return the comment object
     return {
        $id: ID.unique(),
        $createdAt: new Date().toISOString(),
        content: aiContent,
        author_id: "ai-assistant",
        author_name: "AI Assistant",
        author_role: "ai",
        moment_id: momentId,
        $collectionId: MOMENTS_COMMENTS_TABLE_ID,
        $databaseId: DATABASE_ID,
        $permissions: [],
        $updatedAt: new Date().toISOString(),
        $sequence: 0,
     };
  } catch (error) {
      console.error("Error generating AI response:", error);
      throw error;
  }
}
