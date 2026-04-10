import { generateAIResponse } from "@/lib/ai";
import {
  clientReactNative,
  DATABASE_ID,
  MOMENTS_COMMENTS_TABLE_ID,
  MOMENTS_MEDIA_BUCKET_ID,
  MOMENTS_TABLE_ID,
  storage,
} from "@/lib/appwrite";
import {
  MediaItem,
  Moment,
  MomentComment,
  MomentMediaInput,
} from "@/types/moments";
import * as FileSystem from "expo-file-system";
import * as VideoThumbnails from "expo-video-thumbnails";
import { Databases, ID, Permission, Query, Role } from "react-native-appwrite";

const databases = new Databases(clientReactNative);

export async function getMoments(
  page = 1,
  allowedAuthorIds?: string[],
): Promise<Moment[]> {
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
    queries,
  );

  const documents = response.documents as unknown as Moment[];
  return documents.map((doc) => {
    // Build parsedMediaItems from new media_items JSON or legacy fields
    const parsed = parseMomentMedia(doc);
    const result = { ...doc, parsedMediaItems: parsed };
    // Also set legacy media_url for backward compat
    if (doc.media_bucket_id && doc.media_file_id) {
      result.media_url = buildMediaUrl(doc.media_bucket_id, doc.media_file_id);
    }
    return result;
  });
}

export async function createMoment(
  content: string,
  userId: string,
  userName: string,
  userRole: "elderly" | "caregiver",
  mediaList?: MomentMediaInput[] | null,
): Promise<Moment> {
  let mediaFields: Partial<Moment> = {};
  let mediaItemsJson: string | undefined;

  if (mediaList && mediaList.length > 0) {
    if (mediaList.length === 1) {
      // Single media – populate both legacy fields and media_items for compat
      const uploaded = await uploadMomentMedia(mediaList[0]);
      mediaFields = uploaded.legacyFields;
      mediaItemsJson = JSON.stringify([uploaded.item]);
    } else {
      // Multiple media – use media_items JSON only
      const uploadedItems: MediaItem[] = [];
      for (const m of mediaList) {
        const uploaded = await uploadMomentMedia(m);
        uploadedItems.push(uploaded.item);
      }
      mediaItemsJson = JSON.stringify(uploadedItems);
      // Set legacy fields from first item for backward compat
      const first = uploadedItems[0];
      mediaFields = {
        media_type: first.type,
        media_bucket_id: first.bucket_id,
        media_file_id: first.file_id,
        media_mime_type: first.mime_type,
        media_width: first.width,
        media_height: first.height,
        media_duration_ms: first.duration_ms,
        media_thumbnail_file_id: first.thumbnail_file_id,
      };
    }
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
      ...(mediaItemsJson ? { media_items: mediaItemsJson } : {}),
    },
  );

  const created = response as unknown as Moment;
  created.parsedMediaItems = parseMomentMedia(created);
  if (created.media_bucket_id && created.media_file_id) {
    created.media_url = buildMediaUrl(
      created.media_bucket_id,
      created.media_file_id,
    );
  }
  return created;
}

interface UploadResult {
  legacyFields: Partial<Moment>;
  item: MediaItem;
}

async function uploadMomentMedia(
  media: MomentMediaInput,
): Promise<UploadResult> {
  const guessedExtension = getFileExtension(
    media.fileName,
    media.mimeType,
    media.type,
  );
  const cleanFileName =
    media.fileName?.trim() || `${media.type}_${Date.now()}.${guessedExtension}`;
  const mimeType =
    media.mimeType || (media.type === "video" ? "video/mp4" : "image/jpeg");
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
      `Media upload failed: ${reason}. Please ensure bucket "${MOMENTS_MEDIA_BUCKET_ID}" exists and allows uploads.`,
    );
  }

  // Generate thumbnail for video
  let thumbnailFileId: string | undefined;
  if (media.type === "video") {
    try {
      const thumb = await VideoThumbnails.getThumbnailAsync(media.uri, {
        time: 500,
      });
      if (thumb?.uri) {
        const thumbInfo = await FileSystem.getInfoAsync(thumb.uri);
        const thumbSize =
          thumbInfo.exists && typeof thumbInfo.size === "number"
            ? thumbInfo.size
            : 1;
        const thumbFile = await storage.createFile({
          bucketId: MOMENTS_MEDIA_BUCKET_ID,
          fileId: ID.unique(),
          file: {
            name: `thumb_${Date.now()}.jpg`,
            type: "image/jpeg",
            size: thumbSize,
            uri: thumb.uri,
          },
          permissions: [Permission.read(Role.users())],
        });
        thumbnailFileId = thumbFile.$id;
      }
    } catch (e) {
      console.warn("Video thumbnail generation failed:", e);
    }
  }

  const item: MediaItem = {
    file_id: uploadedFile.$id,
    bucket_id: MOMENTS_MEDIA_BUCKET_ID,
    type: media.type,
    mime_type: mimeType,
    width: media.width,
    height: media.height,
    duration_ms: media.durationMs,
    thumbnail_file_id: thumbnailFileId,
    url: buildMediaUrl(MOMENTS_MEDIA_BUCKET_ID, uploadedFile.$id),
    thumbnail_url: thumbnailFileId
      ? buildMediaUrl(MOMENTS_MEDIA_BUCKET_ID, thumbnailFileId)
      : undefined,
  };

  const legacyFields: Partial<Moment> = {
    media_type: media.type,
    media_bucket_id: MOMENTS_MEDIA_BUCKET_ID,
    media_file_id: uploadedFile.$id,
    media_mime_type: mimeType,
    media_width: media.width,
    media_height: media.height,
    media_duration_ms: media.durationMs,
    media_thumbnail_file_id: thumbnailFileId,
  };

  return { legacyFields, item };
}

async function resolveFileSize(media: MomentMediaInput): Promise<number> {
  if (typeof media.fileSize === "number" && media.fileSize > 0) {
    return media.fileSize;
  }

  try {
    const fileInfo = await FileSystem.getInfoAsync(media.uri);
    if (
      fileInfo.exists &&
      typeof fileInfo.size === "number" &&
      fileInfo.size > 0
    ) {
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
    // Use getFileViewURL – serves files inline with correct Content-Type,
    // which is required for video streaming and image display.
    return storage.getFileViewURL(bucketId, fileId).toString();
  } catch (error) {
    console.warn("Failed to build moment media URL:", error);
    return undefined;
  }
}

/** Parse a Moment's media into a unified MediaItem[] array */
function parseMomentMedia(doc: Moment): MediaItem[] {
  // Try new multi-media JSON field first
  if (doc.media_items) {
    try {
      const items: MediaItem[] = JSON.parse(doc.media_items);
      return items.map((item) => ({
        ...item,
        url: item.url || buildMediaUrl(item.bucket_id, item.file_id),
        thumbnail_url:
          item.thumbnail_url ||
          (item.thumbnail_file_id
            ? buildMediaUrl(item.bucket_id, item.thumbnail_file_id)
            : undefined),
      }));
    } catch {
      // Fall through to legacy
    }
  }
  // Legacy single-media fields
  if (doc.media_bucket_id && doc.media_file_id) {
    const url = buildMediaUrl(doc.media_bucket_id, doc.media_file_id);
    const thumbnailUrl = doc.media_thumbnail_file_id
      ? buildMediaUrl(doc.media_bucket_id, doc.media_thumbnail_file_id)
      : undefined;
    return [
      {
        file_id: doc.media_file_id,
        bucket_id: doc.media_bucket_id,
        type: doc.media_type || "image",
        mime_type: doc.media_mime_type || "image/jpeg",
        width: doc.media_width,
        height: doc.media_height,
        duration_ms: doc.media_duration_ms,
        thumbnail_file_id: doc.media_thumbnail_file_id,
        url,
        thumbnail_url: thumbnailUrl,
      },
    ];
  }
  return [];
}

export { parseMomentMedia };

function getFileExtension(
  fileName?: string,
  mimeType?: string,
  mediaType?: "image" | "video",
): string {
  if (fileName && fileName.includes(".")) {
    return fileName.split(".").pop() || "bin";
  }
  if (mimeType?.includes("/")) {
    return mimeType.split("/")[1] || "bin";
  }
  return mediaType === "video" ? "mp4" : "jpg";
}

export async function likeMoment(
  momentId: string,
  userId: string,
  currentLikes: string[],
): Promise<string[]> {
  const isLiked = currentLikes.includes(userId);
  let newLikes = [...currentLikes];

  if (isLiked) {
    newLikes = newLikes.filter((id) => id !== userId);
  } else {
    newLikes.push(userId);
  }

  try {
    await databases.updateDocument(DATABASE_ID, MOMENTS_TABLE_ID, momentId, {
      likes: newLikes,
    });
    return newLikes;
  } catch (error) {
    console.error("Error liking moment:", error);
    return newLikes; // Optimistic update
  }
}

export async function getComments(
  momentId: string,
  allowedAuthorIds?: string[],
): Promise<MomentComment[]> {
  try {
    const queries = [
      Query.equal("moment_id", momentId),
      Query.orderDesc("$createdAt"),
      Query.limit(100),
    ];

    if (allowedAuthorIds && allowedAuthorIds.length > 0) {
      queries.push(Query.equal("author_id", allowedAuthorIds));
    }

    const response = await databases.listDocuments(
      DATABASE_ID,
      MOMENTS_COMMENTS_TABLE_ID,
      queries,
    );
    return response.documents as unknown as MomentComment[];
  } catch (error) {
    console.error("Error fetching comments:", error);
    return [];
  }
}

export async function getVisibleCommentCount(
  momentId: string,
  allowedAuthorIds?: string[],
): Promise<number> {
  try {
    const queries = [Query.equal("moment_id", momentId), Query.limit(1)];
    if (allowedAuthorIds && allowedAuthorIds.length > 0) {
      queries.push(Query.equal("author_id", allowedAuthorIds));
    }
    const response = await databases.listDocuments(
      DATABASE_ID,
      MOMENTS_COMMENTS_TABLE_ID,
      queries,
    );
    return response.total;
  } catch {
    return 0;
  }
}

export async function addComment(
  momentId: string,
  content: string,
  userId: string,
  userName: string,
  userRole: "elderly" | "caregiver",
  options?: {
    replyToCommentId?: string;
    replyToUserId?: string;
    replyToUserName?: string;
    momentAuthorId?: string;
  },
): Promise<MomentComment> {
  const data: Record<string, any> = {
    moment_id: momentId,
    content,
    author_id: userId,
    author_name: userName,
    author_role: userRole,
    likes: [],
  };
  if (options?.replyToCommentId)
    data.reply_to_comment_id = options.replyToCommentId;
  if (options?.replyToUserId) data.reply_to_user_id = options.replyToUserId;
  if (options?.replyToUserName)
    data.reply_to_user_name = options.replyToUserName;
  if (options?.momentAuthorId) data.moment_author_id = options.momentAuthorId;

  const comment = await databases.createDocument(
    DATABASE_ID,
    MOMENTS_COMMENTS_TABLE_ID,
    ID.unique(),
    data,
  );

  // Increment comments_count on the moment
  try {
    const moment = await databases.getDocument(
      DATABASE_ID,
      MOMENTS_TABLE_ID,
      momentId,
    );
    await databases.updateDocument(DATABASE_ID, MOMENTS_TABLE_ID, momentId, {
      comments_count: (moment.comments_count || 0) + 1,
    });
  } catch {
    // Non-critical, count will be stale but functional
  }

  return comment as unknown as MomentComment;
}

export async function addAIResponse(momentId: string, content: string, imageUrl?: string): Promise<MomentComment> {
  const aiContent = await generateAIResponse(content, imageUrl);
  
  try {
     const doc = await databases.createDocument(
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

     // Increment comments_count on the moment
     try {
       const moment = await databases.getDocument(DATABASE_ID, MOMENTS_TABLE_ID, momentId);
       await databases.updateDocument(DATABASE_ID, MOMENTS_TABLE_ID, momentId, {
         comments_count: (moment.comments_count || 0) + 1,
       });
     } catch {
       // Non-critical
     }

     return doc as unknown as MomentComment;
  } catch (error) {
    console.error("Error generating AI response:", error);
    throw error;
  }
}

export async function deleteMoment(
  momentId: string,
  mediaBucketId?: string | null,
  mediaFileId?: string | null,
): Promise<void> {
  // Delete associated media file if exists
  if (mediaBucketId && mediaFileId) {
    try {
      await storage.deleteFile(mediaBucketId, mediaFileId);
    } catch (err) {
      console.warn("Failed to delete media file:", err);
    }
  }

  // Delete the moment document
  await databases.deleteDocument(DATABASE_ID, MOMENTS_TABLE_ID, momentId);
}

export async function deleteComment(
  commentId: string,
  momentId: string,
): Promise<void> {
  await databases.deleteDocument(
    DATABASE_ID,
    MOMENTS_COMMENTS_TABLE_ID,
    commentId,
  );

  // Decrement comments_count on the moment
  try {
    const moment = await databases.getDocument(
      DATABASE_ID,
      MOMENTS_TABLE_ID,
      momentId,
    );
    const currentCount =
      (moment as unknown as { comments_count?: number }).comments_count || 0;
    await databases.updateDocument(DATABASE_ID, MOMENTS_TABLE_ID, momentId, {
      comments_count: Math.max(0, currentCount - 1),
    });
  } catch (err) {
    console.warn("Failed to decrement comments_count:", err);
  }
}

export async function deleteMoment(momentId: string, mediaBucketId?: string | null, mediaFileId?: string | null): Promise<void> {
  // Delete associated media file if exists
  if (mediaBucketId && mediaFileId) {
    try {
      await storage.deleteFile(mediaBucketId, mediaFileId);
    } catch (err) {
      console.warn("Failed to delete media file:", err);
    }
  }

  // Delete the moment document
  await databases.deleteDocument(DATABASE_ID, MOMENTS_TABLE_ID, momentId);
}

export async function deleteComment(commentId: string, momentId: string): Promise<void> {
  await databases.deleteDocument(DATABASE_ID, MOMENTS_COMMENTS_TABLE_ID, commentId);

  // Decrement comments_count on the moment
  try {
    const moment = await databases.getDocument(DATABASE_ID, MOMENTS_TABLE_ID, momentId);
    const currentCount = (moment as unknown as { comments_count?: number }).comments_count || 0;
    await databases.updateDocument(DATABASE_ID, MOMENTS_TABLE_ID, momentId, {
      comments_count: Math.max(0, currentCount - 1),
    });
  } catch (err) {
    console.warn("Failed to decrement comments_count:", err);
  }
}
