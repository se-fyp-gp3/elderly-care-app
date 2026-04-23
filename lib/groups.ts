import { Group, GroupMember } from "@/types/messaging";
import { ID, Query } from "react-native-appwrite";
import {
    DATABASE_ID,
    GROUPS_TABLE_ID,
    GROUP_MEMBERS_TABLE_ID,
    USER_ICON_BUCKET_ID,
    storage,
    tablesDB,
} from "./appwrite";
import { triggerProfilePush } from "./chat-push";
import { sendGroupMessage } from "./group-messaging";

/**
 * Create a new group chat and add all members.
 * Creator is automatically added as admin; others as members.
 */
export async function createGroup(input: {
  name: string;
  creatorId: string;
  creatorName: string;
  creatorRole: "elderly" | "caregiver";
  members: { id: string; name: string; role: "elderly" | "caregiver" }[];
}): Promise<Group> {
  const now = new Date().toISOString();

  const group = await tablesDB.createRow<Group>({
    databaseId: DATABASE_ID,
    tableId: GROUPS_TABLE_ID,
    rowId: ID.unique(),
    data: {
      name: input.name,
      created_by: input.creatorId,
      created_at: now,
    },
  });

  // Add creator as admin
  await tablesDB.createRow<GroupMember>({
    databaseId: DATABASE_ID,
    tableId: GROUP_MEMBERS_TABLE_ID,
    rowId: ID.unique(),
    data: {
      group_id: group.$id,
      user_profile_id: input.creatorId,
      user_name: input.creatorName,
      user_role: input.creatorRole,
      member_role: "admin",
      joined_at: now,
      status: "active",
    },
  });

  // Add other members as "invited" (they must accept to join)
  await Promise.all(
    input.members.map((m) =>
      tablesDB.createRow<GroupMember>({
        databaseId: DATABASE_ID,
        tableId: GROUP_MEMBERS_TABLE_ID,
        rowId: ID.unique(),
        data: {
          group_id: group.$id,
          user_profile_id: m.id,
          user_name: m.name,
          user_role: m.role,
          member_role: "member",
          joined_at: now,
          status: "invited",
        },
      }),
    ),
  );

  if (input.members.length > 0) {
    triggerProfilePush({
      mode: "profiles",
      recipientProfileIds: input.members.map((member) => member.id),
      title: "Group invitation",
      body: `${input.creatorName} invited you to join ${input.name}`,
      data: {
        type: "group_invitation",
        groupId: group.$id,
        groupName: input.name,
        actorName: input.creatorName,
      },
    });
  }

  // Send system message announcing group creation
  await sendGroupMessage({
    groupId: group.$id,
    senderId: input.creatorId,
    senderName: input.creatorName,
    senderRole: input.creatorRole,
    body: `${input.creatorName} created the group`,
    messageType: "system",
  });

  return group as unknown as Group;
}

/**
 * Get all pending group invitations for a user.
 * Returns the GroupMember rows with status "invited" plus the associated Group data.
 */
export async function getPendingGroupInvitations(
  profileId: string,
): Promise<{ membership: GroupMember; group: Group }[]> {
  try {
    const memberships = await tablesDB.listRows<GroupMember>({
      databaseId: DATABASE_ID,
      tableId: GROUP_MEMBERS_TABLE_ID,
      queries: [
        Query.equal("user_profile_id", profileId),
        Query.equal("status", "invited"),
        Query.limit(100),
      ],
    });

    if (memberships.rows.length === 0) return [];

    const groupIds = [...new Set(memberships.rows.map((m) => m.group_id))];
    const groups = await tablesDB.listRows<Group>({
      databaseId: DATABASE_ID,
      tableId: GROUPS_TABLE_ID,
      queries: [Query.equal("$id", groupIds), Query.limit(100)],
    });

    const groupMap = new Map(groups.rows.map((g) => [g.$id, g as unknown as Group]));

    return memberships.rows
      .filter((m) => groupMap.has(m.group_id))
      .map((m) => ({
        membership: m as unknown as GroupMember,
        group: groupMap.get(m.group_id)!,
      }));
  } catch (error) {
    console.error("Error fetching pending group invitations:", error);
    return [];
  }
}

/**
 * Accept a group invitation – sets the membership status to "active"
 * and sends a system message announcing the user joined.
 */
export async function acceptGroupInvitation(
  membershipId: string,
  groupId: string,
  userName: string,
  userRole: "elderly" | "caregiver",
  userId: string,
): Promise<void> {
  await tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId: GROUP_MEMBERS_TABLE_ID,
    rowId: membershipId,
    data: { status: "active" },
  });

  await sendGroupMessage({
    groupId,
    senderId: userId,
    senderName: userName,
    senderRole: userRole,
    body: `${userName} joined the group`,
    messageType: "system",
  });
}

/**
 * Reject a group invitation – sets the membership status to "left".
 */
export async function rejectGroupInvitation(
  membershipId: string,
): Promise<void> {
  await tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId: GROUP_MEMBERS_TABLE_ID,
    rowId: membershipId,
    data: { status: "left" },
  });
}

/**
 * Get all groups that a user is an active member of.
 */
export async function getGroupsForUser(profileId: string): Promise<Group[]> {
  try {
    const memberships = await tablesDB.listRows<GroupMember>({
      databaseId: DATABASE_ID,
      tableId: GROUP_MEMBERS_TABLE_ID,
      queries: [
        Query.equal("user_profile_id", profileId),
        Query.equal("status", "active"),
        Query.limit(100),
      ],
    });

    if (memberships.rows.length === 0) return [];

    const groupIds = [...new Set(memberships.rows.map((m) => m.group_id))];
    const groups = await tablesDB.listRows<Group>({
      databaseId: DATABASE_ID,
      tableId: GROUPS_TABLE_ID,
      queries: [Query.equal("$id", groupIds), Query.limit(100)],
    });

    return groups.rows as unknown as Group[];
  } catch (error) {
    console.error("Error fetching groups for user:", error);
    return [];
  }
}

/**
 * Get all active members of a group.
 */
export async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
  try {
    const response = await tablesDB.listRows<GroupMember>({
      databaseId: DATABASE_ID,
      tableId: GROUP_MEMBERS_TABLE_ID,
      queries: [
        Query.equal("group_id", groupId),
        Query.equal("status", "active"),
        Query.limit(100),
      ],
    });
    return response.rows as unknown as GroupMember[];
  } catch (error) {
    console.error("Error fetching group members:", error);
    return [];
  }
}

/**
 * Add a new member to a group.
 */
export async function addGroupMember(
  groupId: string,
  profileId: string,
  name: string,
  role: "elderly" | "caregiver",
): Promise<void> {
  await tablesDB.createRow<GroupMember>({
    databaseId: DATABASE_ID,
    tableId: GROUP_MEMBERS_TABLE_ID,
    rowId: ID.unique(),
    data: {
      group_id: groupId,
      user_profile_id: profileId,
      user_name: name,
      user_role: role,
      member_role: "member",
      joined_at: new Date().toISOString(),
      status: "active",
    },
  });
}

/**
 * Remove a member from a group (sets status to "left").
 */
export async function removeGroupMember(
  groupId: string,
  profileId: string,
): Promise<void> {
  const response = await tablesDB.listRows<GroupMember>({
    databaseId: DATABASE_ID,
    tableId: GROUP_MEMBERS_TABLE_ID,
    queries: [
      Query.equal("group_id", groupId),
      Query.equal("user_profile_id", profileId),
      Query.equal("status", "active"),
      Query.limit(1),
    ],
  });

  if (response.rows.length > 0) {
    await tablesDB.updateRow({
      databaseId: DATABASE_ID,
      tableId: GROUP_MEMBERS_TABLE_ID,
      rowId: response.rows[0].$id,
      data: { status: "left" },
    });
  }
}

/**
 * Leave a group (self-remove).
 */
export async function leaveGroup(
  groupId: string,
  profileId: string,
): Promise<void> {
  await removeGroupMember(groupId, profileId);
}

/**
 * Disband a group. Only admin can do this.
 * Sets all members to "left" status. Does not delete the group doc.
 */
export async function disbandGroup(
  groupId: string,
  requesterId: string,
): Promise<boolean> {
  // Verify requester is admin
  const members = await getGroupMembers(groupId);
  const requester = members.find((m) => m.user_profile_id === requesterId);
  if (!requester || requester.member_role !== "admin") return false;

  // Set all members to "left"
  await Promise.all(
    members.map((m) =>
      tablesDB.updateRow({
        databaseId: DATABASE_ID,
        tableId: GROUP_MEMBERS_TABLE_ID,
        rowId: m.$id,
        data: { status: "left" },
      }),
    ),
  );

  return true;
}

/**
 * Update a group's name.
 */
export async function updateGroupName(
  groupId: string,
  name: string,
): Promise<void> {
  await tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId: GROUPS_TABLE_ID,
    rowId: groupId,
    data: { name },
  });
}

/**
 * Update a group's avatar.
 */
export async function updateGroupAvatar(
  groupId: string,
  fileId: string,
): Promise<void> {
  await tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId: GROUPS_TABLE_ID,
    rowId: groupId,
    data: { avatar_file_id: fileId },
  });
}

/**
 * Toggle mute for a user in a group.
 */
export async function toggleGroupMute(
  groupId: string,
  profileId: string,
): Promise<boolean> {
  const group = await tablesDB.getRow<Group>({
    databaseId: DATABASE_ID,
    tableId: GROUPS_TABLE_ID,
    rowId: groupId,
  });

  const mutedBy = (group as unknown as Group).muted_by ?? [];
  const isMuted = mutedBy.includes(profileId);
  const newMutedBy = isMuted
    ? mutedBy.filter((id) => id !== profileId)
    : [...mutedBy, profileId];

  await tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId: GROUPS_TABLE_ID,
    rowId: groupId,
    data: { muted_by: newMutedBy },
  });

  return !isMuted; // returns new muted state
}

/**
 * Check if a group is muted for a user.
 */
export function isGroupMuted(group: Group, profileId: string): boolean {
  return (group.muted_by ?? []).includes(profileId);
}

/**
 * Build a URL for a group avatar.
 */
export function buildGroupAvatarUrl(fileId: string): URL {
  return storage.getFileViewURL(USER_ICON_BUCKET_ID, fileId);
}
