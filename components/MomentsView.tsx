import CommentSheet from "@/components/CommentSheet";
import MomentCard from "@/components/MomentCard";
import { useAuth } from "@/lib/auth-context";
import { getCaregiverByUserId } from "@/lib/caregiver";
import { getContactsForCaregiver, getContactsForElderly } from "@/lib/contacts";
import { getElderlyByUserId } from "@/lib/elderly";
import { useUnreadBadge } from "@/lib/hooks/useUnreadBadge";
import { addAIResponse, createMoment, getLatestComments, getMoments, getVisibleCommentCount, likeMoment } from "@/lib/moments";
import { Moment, MomentComment, MomentMediaInput } from "@/types/moments";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, FlatList, Image, Keyboard, Modal, ScrollView, StyleSheet, TouchableOpacity, TouchableWithoutFeedback, View } from "react-native";
import { ActivityIndicator, Button, FAB, Text, TextInput, useTheme } from "react-native-paper";

const MAX_MEDIA = 4;

export default function MomentsView() {
  const theme = useTheme();
  const { user, preferences } = useAuth();
  const { t } = useTranslation();
  const { resetMomentUnread } = useUnreadBadge();
  const [moments, setMoments] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newPostContent, setNewPostContent] = useState("");
  const [selectedMediaList, setSelectedMediaList] = useState<MomentMediaInput[]>([]);
  const [posting, setPosting] = useState(false);
  const [currentUserName, setCurrentUserName] = useState("");
  const [commentMomentId, setCommentMomentId] = useState<string | null>(null);
  const [allowedIds, setAllowedIds] = useState<string[]>([]);
  const [latestCommentsMap, setLatestCommentsMap] = useState<Record<string, MomentComment[]>>({});

  // Clear moment unread badge when user views the Moments tab
  useEffect(() => {
    resetMomentUnread();
  }, [resetMomentUnread]);

  const loadMoments = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      
      // 1. Get contacts based on role
      let contacts: any[] = [];
      if (preferences.role === "caregiver") {
        const profile = await getCaregiverByUserId(user.$id);
        if (profile) {
            contacts = await getContactsForCaregiver(profile.$id);
            setCurrentUserName(profile.name || user.name || "Anonymous");
        }
      } else if (preferences.role === "elderly") {
        const profile = await getElderlyByUserId(user.$id);
        if (profile) {
            contacts = await getContactsForElderly(profile.$id);
            setCurrentUserName(profile.name || user.name || "Anonymous");
        }
      }

      // 2. Extract User IDs allowed to be seen (My friends + Me)
      const ids = [
        user.$id, 
        ...contacts.map((c) => c.userId).filter((id) => !!id)
      ];
      setAllowedIds(ids);

      // 3. Fetch moments with filter
      const data = await getMoments(1, ids);

      // 4. Fetch visible comment counts + latest 3 comments for inline preview
      const [countsArr, commentsArr] = await Promise.all([
        Promise.all(data.map((m) => getVisibleCommentCount(m.$id, ids))),
        Promise.all(data.map((m) => getLatestComments(m.$id, 3, ids))),
      ]);
      const commentsMap: Record<string, MomentComment[]> = {};
      const withCounts = data.map((m, i) => {
        commentsMap[m.$id] = commentsArr[i];
        return { ...m, comments_count: countsArr[i] };
      });
      setLatestCommentsMap(commentsMap);
      setMoments(withCounts);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [preferences.role, user]);

  useEffect(() => {
    loadMoments();
  }, [loadMoments]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadMoments();
  };

  const handleCreatePost = async () => {
    if (!newPostContent.trim() && selectedMediaList.length === 0) return;
    setPosting(true);
    try {
      const newMoment = await createMoment(
        newPostContent.trim(),
        user?.$id || "anon",
        currentUserName || user?.name || "Anonymous",
        (preferences.role as "elderly" | "caregiver") || "caregiver",
        selectedMediaList.length > 0 ? selectedMediaList : undefined
      );
      setMoments([newMoment, ...moments]);
      setNewPostContent("");
      setSelectedMediaList([]);
      setCreateModalVisible(false);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to post moment";
        Alert.alert(t('moments.postFailed'), message);
    } finally {
      setPosting(false);
    }
  };

  const handleLike = async (momentId: string) => {
    // Optimistic update handled in MomentCard or here?
    // MomentCard handles visual state. We just fire and forget API call for simplicity
    const moment = moments.find(m => m.$id === momentId);
    if (moment && user) {
        await likeMoment(momentId, user.$id, moment.likes || []);
    }
  };

  const handleAIRequest = async (momentId: string, content: string): Promise<MomentComment> => {
     // This will return the AI comment to be displayed in the card
     return await addAIResponse(momentId, content);
  };

  const handleComment = (momentId: string) => {
    setCommentMomentId(momentId);
  };

  const handleCommentAdded = () => {
    // Increment local count optimistically
    setMoments((prev) =>
      prev.map((m) =>
        m.$id === commentMomentId
          ? { ...m, comments_count: (m.comments_count || 0) + 1 }
          : m
      )
    );
  };

  const closeCreateModal = () => {
    setCreateModalVisible(false);
    setNewPostContent("");
    setSelectedMediaList([]);
  };

  const pickMedia = async () => {
    if (selectedMediaList.length >= MAX_MEDIA) {
      Alert.alert(t('moments.maxMediaReached'), t('moments.mediaCount', { count: MAX_MEDIA }));
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t('common.permissionNeeded'), t('moments.photoLibraryPermission'));
      return;
    }

    const mediaTypes = getSupportedPickerMediaTypes();
    const remaining = MAX_MEDIA - selectedMediaList.length;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes,
      allowsEditing: false,
      allowsMultipleSelection: true,
      quality: 0.9,
      videoMaxDuration: 60,
      selectionLimit: remaining,
    });

    if (result.canceled || !result.assets?.length) return;

    const newItems: MomentMediaInput[] = result.assets.slice(0, remaining).map((asset) => ({
      uri: asset.uri,
      type: asset.type === "video" ? ("video" as const) : ("image" as const),
      mimeType: asset.mimeType,
      fileName: asset.fileName ?? undefined,
      fileSize: asset.fileSize,
      width: asset.width,
      height: asset.height,
      durationMs: asset.duration ?? undefined,
    }));

    setSelectedMediaList((prev) => [...prev, ...newItems].slice(0, MAX_MEDIA));
  };

  const removeMedia = (index: number) => {
    setSelectedMediaList((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={moments}
          keyExtractor={(item) => item.$id}
          renderItem={({ item }) => (
            <MomentCard
              moment={item}
              currentUserId={user?.$id || ""}
              onLike={handleLike}
              onComment={handleComment}
              onAIRequest={handleAIRequest}
              latestComments={latestCommentsMap[item.$id]}
            />
          )}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ padding: 8, paddingBottom: 80 }}
          ListEmptyComponent={
            <View style={styles.center}>
                <Text>{t('moments.noMomentsYet')}</Text>
            </View>
          }
        />
      )}

      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        color={theme.colors.onPrimary}
        onPress={() => setCreateModalVisible(true)}
        label={t('moments.post')}
      />

      <CommentSheet
        visible={!!commentMomentId}
        momentId={commentMomentId || ""}
        momentAuthorId={moments.find((m) => m.$id === commentMomentId)?.author_id}
        onClose={() => setCommentMomentId(null)}
        currentUserId={user?.$id || ""}
        currentUserName={currentUserName || user?.name || "Anonymous"}
        currentUserRole={(preferences.role as "elderly" | "caregiver") || "caregiver"}
        allowedAuthorIds={allowedIds}
        onCommentAdded={handleCommentAdded}
      />

      <Modal
        visible={createModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeCreateModal}
      >
        <TouchableWithoutFeedback onPress={closeCreateModal}>
            <View style={styles.modalOverlay}>
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
                        <Text variant="titleLarge" style={{ marginBottom: 16 }}>{t('moments.createPost')}</Text>
                        <TextInput
                            mode="outlined"
                            multiline
                            numberOfLines={4}
                            placeholder={t('moments.whatsOnYourMind')}
                            value={newPostContent}
                            onChangeText={setNewPostContent}
                            style={{ marginBottom: 16 }}
                        />
                        <View style={styles.mediaRow}>
                          <Button mode="outlined" icon="image-multiple" onPress={pickMedia} disabled={selectedMediaList.length >= MAX_MEDIA}>
                            {selectedMediaList.length > 0
                              ? t('moments.mediaCount', { count: `${selectedMediaList.length}/${MAX_MEDIA}` })
                              : t('moments.addPhotoVideo')}
                          </Button>
                          {selectedMediaList.length > 0 && (
                            <Button onPress={() => setSelectedMediaList([])} textColor={theme.colors.error}>
                              {t('moments.removeMedia')}
                            </Button>
                          )}
                        </View>

                        {selectedMediaList.length > 0 && (
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.previewScroll}>
                            {selectedMediaList.map((media, index) => (
                              <View key={index} style={styles.previewThumbWrap}>
                                {media.type === "image" ? (
                                  <Image source={{ uri: media.uri }} style={styles.previewThumb} />
                                ) : (
                                  <View style={[styles.previewThumb, styles.videoThumbPlaceholder, { borderColor: theme.colors.outline }]}>
                                    <MaterialCommunityIcons name="video" size={24} color={theme.colors.primary} />
                                  </View>
                                )}
                                <TouchableOpacity style={styles.removeBtn} onPress={() => removeMedia(index)}>
                                  <MaterialCommunityIcons name="close-circle" size={20} color={theme.colors.error} />
                                </TouchableOpacity>
                              </View>
                            ))}
                          </ScrollView>
                        )}

                        <View style={styles.modalActions}>
                            <Button onPress={closeCreateModal} style={{ marginRight: 8 }}>{t('common.cancel')}</Button>
                            <Button mode="contained" onPress={handleCreatePost} loading={posting} disabled={posting || (!newPostContent.trim() && selectedMediaList.length === 0)}>
                                {t('moments.post')}
                            </Button>
                        </View>
                    </View>
                </TouchableWithoutFeedback>
            </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

function getSupportedPickerMediaTypes(): ImagePicker.MediaType | ImagePicker.MediaType[] {
  const modernMediaType = (ImagePicker as unknown as {
    MediaType?: { images?: ImagePicker.MediaType; videos?: ImagePicker.MediaType };
  }).MediaType;
  if (modernMediaType?.images && modernMediaType?.videos) {
    return [modernMediaType.images, modernMediaType.videos];
  }
  return ["images", "videos"] as unknown as ImagePicker.MediaType[];
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  fab: {
    position: "absolute",
    margin: 16,
    right: 0,
    bottom: 0,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    padding: 20,
    borderRadius: 12,
    elevation: 5,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  mediaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  previewScroll: {
    marginBottom: 14,
  },
  previewThumbWrap: {
    width: 90,
    height: 90,
    marginRight: 8,
    position: "relative",
  },
  previewThumb: {
    width: 90,
    height: 90,
    borderRadius: 8,
  },
  videoThumbPlaceholder: {
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f0f0f0",
  },
  removeBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#fff",
    borderRadius: 10,
  },
});
