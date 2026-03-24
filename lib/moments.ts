import { generateAIResponse } from "@/lib/ai";
import {
  clientReactNative,
  DATABASE_ID,
  MOMENTS_COMMENTS_TABLE_ID,
  MOMENTS_TABLE_ID,
} from "@/lib/appwrite";
import { Moment, MomentComment } from "@/types/moments";
import { Databases, ID, Query } from "react-native-appwrite";

const databases = new Databases(clientReactNative);

export async function getMoments(page = 1, allowedAuthorIds?: string[]): Promise<Moment[]> {
  try {
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
    return response.documents as unknown as Moment[];
  } catch (error: any) {
    console.warn("Failed to fetch moments, using mock data:", error);
    // Return mock data for demo purposes if collection doesn't exist
    return [
      {
        $id: "mock1",
        $createdAt: new Date().toISOString(),
        content: "Just finished a great walk in the park! Feeling refreshed.",
        author_id: "user1",
        author_name: "John Doe",
        author_role: "caregiver",
        likes: ["user2"],
        comments_count: 1,
        $collectionId: MOMENTS_TABLE_ID,
        $databaseId: DATABASE_ID,
        $permissions: [],
        $updatedAt: new Date().toISOString(),
        $sequence: 0,
      },
      {
        $id: "mock2",
        $createdAt: new Date(Date.now() - 3600000).toISOString(),
        content: "Any tips for managing medication schedules efficiently?",
        author_id: "user2",
        author_name: "Jane Smith",
        author_role: "elderly",
        likes: [],
        comments_count: 0,
        $collectionId: MOMENTS_TABLE_ID,
        $databaseId: DATABASE_ID,
        $permissions: [],
        $updatedAt: new Date(Date.now() - 3600000).toISOString(),
        $sequence: 0,
      },
    ];
  }
}

export async function createMoment(
  content: string,
  userId: string,
  userName: string,
  userRole: "elderly" | "caregiver"
): Promise<Moment> {
  try {
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
        // created_at: new Date().toISOString(), // Custom attribute if needed
      }
    );
    return response as unknown as Moment;
  } catch (error) {
    console.error("Error creating moment:", error);
    // Return a mock moment so UI updates optimistically
    return {
      $id: ID.unique(),
      $createdAt: new Date().toISOString(),
      content,
      author_id: userId,
      author_name: userName,
      author_role: userRole,
      likes: [],
      comments_count: 0,
      $collectionId: MOMENTS_TABLE_ID,
      $databaseId: DATABASE_ID,
      $permissions: [],
      $updatedAt: new Date().toISOString(),
      $sequence: 0,
    } as unknown as Moment;
  }
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
