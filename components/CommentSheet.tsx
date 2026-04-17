import UserAvatar from "@/components/UserAvatar";
import { formatRelativeTime } from "@/lib/contacts";
import {
    addComment,
    deleteComment,
    getComments,
    likeComment,
} from "@/lib/moments";
import { MomentComment } from "@/types/moments";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Alert,
    Animated,
    Dimensions,
    FlatList,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    TextInput as RNTextInput,
    StyleSheet,
    View,
} from "react-native";
import {
    ActivityIndicator,
    Divider,
    Text,
    useTheme
} from "react-native-paper";

const SCREEN_HEIGHT = Dimensions.get("window").height;
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.7;

interface CommentSheetProps {
  visible: boolean;
  momentId: string;
  momentAuthorId?: string;
  onClose: () => void;
  currentUserId: string;
  currentUserName: string;
  currentUserRole: "elderly" | "caregiver";
  allowedAuthorIds?: string[];
  onCommentAdded?: () => void;
  avatarMap?: Record<string, string>;
  currentUserAvatarFileId?: string;
}

function CommentItem({
  comment,
  currentUserId,
  allComments,
  onReply,
  onLike,
  onDelete,
  avatarFileId,
}: {
  comment: MomentComment;
  currentUserId: string;
  allComments: MomentComment[];
  onReply: (comment: MomentComment) => void;
  onLike: (comment: MomentComment) => void;
  onDelete: (commentId: string) => void;
  avatarFileId?: string;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const likes = comment.likes || [];
  const isLiked = likes.includes(currentUserId);
  const longText = (comment.content?.length || 0) > 200;
  const isOwn = comment.author_id === currentUserId;
  const parentComment = comment.reply_to_comment_id
    ? allComments.find((c) => c.$id === comment.reply_to_comment_id)
    : null;

  const handleDelete = () => {
    Alert.alert(
      "Delete Comment",
      "Are you sure you want to delete this comment?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => onDelete(comment.$id),
        },
      ],
    );
  };

  return (
    <View style={styles.commentItem}>
      <UserAvatar
        avatarFileId={avatarFileId}
        name={comment.author_name}
        size={32}
        role={comment.author_role as "elderly" | "caregiver" | undefined}
      />
      <View style={styles.commentBody}>
        <View style={styles.commentBubble}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text variant="labelMedium" style={{ fontWeight: "bold", flex: 1 }}>
              {comment.author_id === "ai-assistant"
                ? t("moments.aiAssistant")
                : comment.author_name}
            </Text>
            {isOwn && (
              <Pressable onPress={handleDelete} hitSlop={10}>
                <MaterialCommunityIcons
                  name="delete-outline"
                  size={18}
                  color={theme.colors.error}
                />
              </Pressable>
            )}
          </View>

          {/* Reply indicator with quoted parent */}
          {!!comment.reply_to_user_name && (
            <View
              style={[
                styles.replyQuote,
                {
                  borderLeftColor: theme.colors.outlineVariant,
                  backgroundColor: theme.colors.surfaceVariant,
                },
              ]}
            >
              <Text
                variant="labelSmall"
                style={{ color: theme.colors.primary, fontWeight: "bold" }}
              >
                ??@{comment.reply_to_user_name}
              </Text>
              {parentComment ? (
                <Text
                  variant="labelSmall"
                  numberOfLines={2}
                  style={{ color: theme.colors.onSurfaceVariant, marginTop: 1 }}
                >
                  {parentComment.content}
                </Text>
              ) : null}
            </View>
          )}

          <Text
            variant="bodyMedium"
            numberOfLines={expanded || !longText ? undefined : 4}
            style={{ marginTop: 2, lineHeight: 20 }}
          >
            {comment.content}
          </Text>
          {longText && (
            <Pressable onPress={() => setExpanded(!expanded)}>
              <Text
                variant="labelSmall"
                style={{ color: theme.colors.primary, marginTop: 2 }}
              >
                {expanded ? t("moments.collapse") : t("moments.showMore")}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Footer row: time + reply + like */}
        <View style={styles.commentFooter}>
          <Text
            variant="labelSmall"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {formatRelativeTime(comment.$createdAt)}
          </Text>
          {comment.author_role !== "ai" && (
            <Pressable
              onPress={() => onReply(comment)}
              hitSlop={8}
              style={styles.footerBtn}
            >
              <Text
                variant="labelSmall"
                style={{ color: theme.colors.primary }}
              >
                {t("moments.reply")}
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => onLike(comment)}
            hitSlop={8}
            style={styles.footerBtn}
          >
            <MaterialCommunityIcons
              name={isLiked ? "heart" : "heart-outline"}
              size={14}
              color={
                isLiked ? theme.colors.error : theme.colors.onSurfaceVariant
              }
            />
            {likes.length > 0 && (
              <Text
                variant="labelSmall"
                style={{ marginLeft: 2, color: theme.colors.onSurfaceVariant }}
              >
                {likes.length}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function CommentSheet({
  visible,
  momentId,
  momentAuthorId,
  onClose,
  currentUserId,
  currentUserName,
  currentUserRole,
  allowedAuthorIds,
  onCommentAdded,
  avatarMap,
  currentUserAvatarFileId,
}: CommentSheetProps) {
  const theme = useTheme();
  const [comments, setComments] = useState<MomentComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [replyTarget, setReplyTarget] = useState<MomentComment | null>(null);
  const inputRef = useRef<RNTextInput>(null);
  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const { t } = useTranslation();

  const loadComments = useCallback(async () => {
    if (!momentId) return;
    setLoading(true);
    try {
      const data = await getComments(momentId, allowedAuthorIds);
      setComments(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [momentId, allowedAuthorIds]);

  useEffect(() => {
    if (visible) {
      loadComments();
      setReplyTarget(null);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      slideAnim.setValue(SHEET_HEIGHT);
    }
  }, [visible, loadComments, slideAnim]);

  const handleClose = () => {
    Keyboard.dismiss();
    setReplyTarget(null);
    Animated.timing(slideAnim, {
      toValue: SHEET_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => onClose());
  };

  const handleReply = (comment: MomentComment) => {
    setReplyTarget(comment);
    inputRef.current?.focus();
  };

  const handleLikeComment = async (comment: MomentComment) => {
    // Optimistic update
    const currentLikes = comment.likes || [];
    const isLiked = currentLikes.includes(currentUserId);
    const optimisticLikes = isLiked
      ? currentLikes.filter((id) => id !== currentUserId)
      : [...currentLikes, currentUserId];
    setComments((prev) =>
      prev.map((c) =>
        c.$id === comment.$id ? { ...c, likes: optimisticLikes } : c,
      ),
    );
    try {
      const serverLikes = await likeComment(
        comment.$id,
        currentUserId,
        currentLikes,
      );
      setComments((prev) =>
        prev.map((c) =>
          c.$id === comment.$id ? { ...c, likes: serverLikes } : c,
        ),
      );
    } catch (e) {
      // Revert on error
      setComments((prev) =>
        prev.map((c) =>
          c.$id === comment.$id ? { ...c, likes: currentLikes } : c,
        ),
      );
      console.error(e);
    }
  };

  const handlePost = async () => {
    const trimmed = text.trim();
    if (!trimmed || posting) return;
    setPosting(true);
    try {
      const replyOptions = replyTarget
        ? {
            replyToCommentId: replyTarget.$id,
            replyToUserId: replyTarget.author_id,
            replyToUserName: replyTarget.author_name,
            momentAuthorId,
          }
        : { momentAuthorId };

      const newComment = await addComment(
        momentId,
        trimmed,
        currentUserId,
        currentUserName,
        currentUserRole,
        replyOptions,
      );
      setComments((prev) => [newComment, ...prev]);
      setText("");
      setReplyTarget(null);
      onCommentAdded?.();
    } catch (e) {
      console.error(e);
    } finally {
      setPosting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await deleteComment(commentId, momentId);
      setComments((prev) => prev.filter((c) => c.$id !== commentId));
      onCommentAdded?.();
    } catch (e) {
      console.error("Error deleting comment:", e);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Backdrop */}
        <Pressable style={styles.backdrop} onPress={handleClose} />

        {/* Sheet */}
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Drag handle */}
          <View style={styles.handleRow}>
            <View
              style={[
                styles.handle,
                { backgroundColor: theme.colors.outlineVariant },
              ]}
            />
          </View>

          {/* Header */}
          <View style={styles.headerRow}>
            <Text variant="titleMedium" style={{ fontWeight: "bold" }}>
              {t("moments.comments")}
            </Text>
            <Pressable onPress={handleClose} hitSlop={12}>
              <MaterialCommunityIcons
                name="close"
                size={22}
                color={theme.colors.onSurface}
              />
            </Pressable>
          </View>

          <Divider />

          {/* Comments list */}
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" />
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(item) => item.$id}
              renderItem={({ item }) => (
                <CommentItem
                  comment={item}
                  currentUserId={currentUserId}
                  allComments={comments}
                  onReply={handleReply}
                  onLike={handleLikeComment}
                  onDelete={handleDeleteComment}
                  avatarFileId={avatarMap?.[item.author_id]}
                />
              )}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <MaterialCommunityIcons
                    name="comment-outline"
                    size={40}
                    color={theme.colors.outlineVariant}
                  />
                  <Text
                    variant="bodyMedium"
                    style={{
                      color: theme.colors.onSurfaceVariant,
                      marginTop: 8,
                    }}
                  >
                    {t("moments.noCommentsYet")}
                  </Text>
                </View>
              }
            />
          )}

          {/* Reply indicator bar */}
          {replyTarget && (
            <View
              style={[
                styles.replyBar,
                { backgroundColor: theme.colors.surfaceVariant },
              ]}
            >
              <Text
                variant="labelSmall"
                numberOfLines={1}
                style={{ flex: 1, color: theme.colors.onSurfaceVariant }}
              >
                {t("moments.replyToComment", { name: replyTarget.author_name })}
              </Text>
              <Pressable onPress={() => setReplyTarget(null)} hitSlop={8}>
                <MaterialCommunityIcons
                  name="close"
                  size={16}
                  color={theme.colors.onSurfaceVariant}
                />
              </Pressable>
            </View>
          )}

          {/* Input bar */}
          <Divider />
          <View
            style={[styles.inputBar, { backgroundColor: theme.colors.surface }]}
          >
            <UserAvatar
              avatarFileId={currentUserAvatarFileId}
              name={currentUserName}
              size={28}
            />
            <RNTextInput
              ref={inputRef}
              style={[
                styles.textInput,
                {
                  backgroundColor: theme.colors.surfaceVariant,
                  color: theme.colors.onSurface,
                },
              ]}
              placeholder={
                replyTarget
                  ? t("moments.replyPlaceholder", {
                      name: replyTarget.author_name,
                    })
                  : t("moments.addComment")
              }
              placeholderTextColor={theme.colors.onSurfaceVariant}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={500}
              editable={!posting}
            />
            <Pressable
              onPress={handlePost}
              disabled={!text.trim() || posting}
              hitSlop={8}
              style={{ opacity: text.trim() && !posting ? 1 : 0.35 }}
            >
              {posting ? (
                <ActivityIndicator size={20} color={theme.colors.primary} />
              ) : (
                <MaterialCommunityIcons
                  name="send"
                  size={24}
                  color={theme.colors.primary}
                />
              )}
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    height: SHEET_HEIGHT,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: "hidden",
  },
  handleRow: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  emptyWrap: {
    alignItems: "center",
    paddingVertical: 40,
  },
  commentItem: {
    flexDirection: "row",
    marginBottom: 16,
    alignItems: "flex-start",
  },
  commentBody: {
    flex: 1,
    marginLeft: 10,
  },
  commentBubble: {
    flexShrink: 1,
  },
  replyQuote: {
    borderLeftWidth: 3,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 4,
    marginBottom: 2,
  },
  commentFooter: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    marginLeft: 4,
    gap: 12,
  },
  footerBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
  replyBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
  },
  textInput: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxHeight: 80,
    fontSize: 14,
  },
});