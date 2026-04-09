import { formatRelativeTime } from "@/lib/contacts";
import { addComment, deleteComment, getComments } from "@/lib/moments";
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
import { ActivityIndicator, Avatar, Divider, Text, useTheme } from "react-native-paper";

const SCREEN_HEIGHT = Dimensions.get("window").height;
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.7;

interface CommentSheetProps {
  visible: boolean;
  momentId: string;
  onClose: () => void;
  currentUserId: string;
  currentUserName: string;
  currentUserRole: "elderly" | "caregiver";
  allowedAuthorIds?: string[];
  onCommentAdded?: () => void;
}

function CommentItem({
  comment,
  currentUserId,
  momentId,
  onDelete,
}: {
  comment: MomentComment;
  currentUserId: string;
  momentId: string;
  onDelete: (commentId: string) => void;
}) {
  const theme = useTheme();
  const isOwn = comment.author_id === currentUserId;

  const handleDelete = () => {
    Alert.alert("Delete Comment", "Are you sure you want to delete this comment?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => onDelete(comment.$id),
      },
    ]);
  };

  return (
    <View style={styles.commentItem}>
      <Avatar.Text
        size={32}
        label={comment.author_name.substring(0, 1).toUpperCase()}
        style={{
          backgroundColor:
            comment.author_role === "ai"
              ? theme.colors.tertiaryContainer
              : theme.colors.primaryContainer,
        }}
        color={
          comment.author_role === "ai"
            ? theme.colors.onTertiaryContainer
            : theme.colors.onPrimaryContainer
        }
      />
      <View style={styles.commentBody}>
        <View style={styles.commentBubble}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text variant="labelMedium" style={{ fontWeight: "bold", flex: 1 }}>
              {comment.author_name}
              {comment.author_role === "ai" && (
                <Text style={{ color: theme.colors.tertiary, fontWeight: "normal" }}> • AI</Text>
              )}
            </Text>
            {isOwn && (
              <Pressable onPress={handleDelete} hitSlop={10}>
                <MaterialCommunityIcons name="delete-outline" size={18} color={theme.colors.error} />
              </Pressable>
            )}
          </View>
          <Text variant="bodyMedium" style={{ marginTop: 2, lineHeight: 20 }}>
            {comment.content}
          </Text>
        </View>
        <Text
          variant="labelSmall"
          style={{ color: theme.colors.onSurfaceVariant, marginTop: 4, marginLeft: 4 }}
        >
          {formatRelativeTime(comment.$createdAt)}
        </Text>
      </View>
    </View>
  );
}

export default function CommentSheet({
  visible,
  momentId,
  onClose,
  currentUserId,
  currentUserName,
  currentUserRole,
  allowedAuthorIds,
  onCommentAdded,
}: CommentSheetProps) {
  const theme = useTheme();
  const [comments, setComments] = useState<MomentComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
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
    Animated.timing(slideAnim, {
      toValue: SHEET_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => onClose());
  };

  const handlePost = async () => {
    const trimmed = text.trim();
    if (!trimmed || posting) return;
    setPosting(true);
    try {
      const newComment = await addComment(
        momentId,
        trimmed,
        currentUserId,
        currentUserName,
        currentUserRole
      );
      setComments((prev) => [newComment, ...prev]);
      setText("");
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
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
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
            <View style={[styles.handle, { backgroundColor: theme.colors.outlineVariant }]} />
          </View>

          {/* Header */}
          <View style={styles.headerRow}>
            <Text variant="titleMedium" style={{ fontWeight: "bold" }}>
              {t('moments.comments')}
            </Text>
            <Pressable onPress={handleClose} hitSlop={12}>
              <MaterialCommunityIcons name="close" size={22} color={theme.colors.onSurface} />
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
                  momentId={momentId}
                  onDelete={handleDeleteComment}
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
                    style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}
                  >
                    {t('moments.noCommentsYet')}
                  </Text>
                </View>
              }
            />
          )}

          {/* Input bar */}
          <Divider />
          <View style={[styles.inputBar, { backgroundColor: theme.colors.surface }]}>
            <Avatar.Text
              size={28}
              label={currentUserName.substring(0, 1).toUpperCase()}
              style={{ backgroundColor: theme.colors.primaryContainer }}
              color={theme.colors.onPrimaryContainer}
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
              placeholder={t('moments.addComment')}
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
                <MaterialCommunityIcons name="send" size={24} color={theme.colors.primary} />
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
