import MomentCard from "@/components/MomentCard";
import { useAuth } from "@/lib/auth-context";
import { getCaregiverByUserId } from "@/lib/caregiver";
import { getContactsForCaregiver, getContactsForElderly } from "@/lib/contacts";
import { getElderlyByUserId } from "@/lib/elderly";
import { addAIResponse, createMoment, getMoments, likeMoment } from "@/lib/moments";
import { Moment, MomentComment, MomentMediaInput } from "@/types/moments";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Image, Keyboard, Modal, StyleSheet, TouchableOpacity, TouchableWithoutFeedback, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator, Button, FAB, Text, TextInput, useTheme } from "react-native-paper";

export default function MomentsView() {
  const theme = useTheme();
  const { user, preferences } = useAuth();
  const [moments, setMoments] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newPostContent, setNewPostContent] = useState("");
  const [selectedMedia, setSelectedMedia] = useState<MomentMediaInput | null>(null);
  const [posting, setPosting] = useState(false);
  const [currentUserName, setCurrentUserName] = useState("");

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
      const allowedIds = [
        user.$id, 
        ...contacts.map((c) => c.userId).filter((id) => !!id)
      ];

      // 3. Fetch moments with filter
      const data = await getMoments(1, allowedIds);
      setMoments(data);
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
    if (!newPostContent.trim() && !selectedMedia) return;
    setPosting(true);
    try {
      const newMoment = await createMoment(
        newPostContent.trim(),
        user?.$id || "anon",
        currentUserName || user?.name || "Anonymous",
        (preferences.role as "elderly" | "caregiver") || "caregiver",
        selectedMedia
      );
      setMoments([newMoment, ...moments]);
      setNewPostContent("");
      setSelectedMedia(null);
      setCreateModalVisible(false);
    } catch {
        Alert.alert("Error", "Failed to post moment");
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

  const closeCreateModal = () => {
    setCreateModalVisible(false);
    setNewPostContent("");
    setSelectedMedia(null);
  };

  const pickMedia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow photo library access to upload media.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: false,
      quality: 0.9,
      videoMaxDuration: 60,
      selectionLimit: 1,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const mediaType = asset.type === "video" ? "video" : "image";
    setSelectedMedia({
      uri: asset.uri,
      type: mediaType,
      mimeType: asset.mimeType,
      fileName: asset.fileName ?? undefined,
      fileSize: asset.fileSize,
      width: asset.width,
      height: asset.height,
      durationMs: asset.duration ?? undefined,
    });
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
              onAIRequest={handleAIRequest}
            />
          )}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ padding: 8, paddingBottom: 80 }}
          ListEmptyComponent={
            <View style={styles.center}>
                <Text>No moments yet. Be the first to share!</Text>
            </View>
          }
        />
      )}

      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        color={theme.colors.onPrimary}
        onPress={() => setCreateModalVisible(true)}
        label="Post"
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
                        <Text variant="titleLarge" style={{ marginBottom: 16 }}>Create Post</Text>
                        <TextInput
                            mode="outlined"
                            multiline
                            numberOfLines={4}
                            placeholder="What's on your mind?"
                            value={newPostContent}
                            onChangeText={setNewPostContent}
                            style={{ marginBottom: 16 }}
                        />
                        <View style={styles.mediaRow}>
                          <Button mode="outlined" icon="image-multiple" onPress={pickMedia}>
                            Add photo/video
                          </Button>
                          {selectedMedia && (
                            <Button onPress={() => setSelectedMedia(null)} textColor={theme.colors.error}>
                              Remove
                            </Button>
                          )}
                        </View>

                        {selectedMedia && (
                          <View style={styles.previewWrap}>
                            {selectedMedia.type === "image" ? (
                              <Image source={{ uri: selectedMedia.uri }} style={styles.previewImage} />
                            ) : (
                              <TouchableOpacity
                                style={[styles.videoPlaceholder, { borderColor: theme.colors.outline }]}
                                onPress={() => Alert.alert("Video selected", "Video will be uploaded with this post.")}
                                activeOpacity={0.8}
                              >
                                <MaterialCommunityIcons name="video" size={28} color={theme.colors.primary} />
                                <Text variant="bodyMedium" style={{ marginTop: 6 }}>
                                  {selectedMedia.fileName || "Selected video"}
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        )}

                        <View style={styles.modalActions}>
                            <Button onPress={closeCreateModal} style={{ marginRight: 8 }}>Cancel</Button>
                            <Button mode="contained" onPress={handleCreatePost} loading={posting} disabled={posting || (!newPostContent.trim() && !selectedMedia)}>
                                Post
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
  previewWrap: {
    marginBottom: 14,
  },
  previewImage: {
    width: "100%",
    height: 220,
    borderRadius: 10,
  },
  videoPlaceholder: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
});
