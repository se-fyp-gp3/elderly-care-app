import MomentCard from "@/components/MomentCard";
import { useAuth } from "@/lib/auth-context";
import { addAIResponse, createMoment, getMoments, likeMoment } from "@/lib/moments";
import { Moment, MomentComment } from "@/types/moments";
import React, { useEffect, useState } from "react";
import { Alert, FlatList, Keyboard, Modal, StyleSheet, TouchableWithoutFeedback, View } from "react-native";
import { ActivityIndicator, Button, FAB, Text, TextInput, useTheme } from "react-native-paper";

export default function MomentsView() {
  const theme = useTheme();
  const { user, preferences } = useAuth();
  const [moments, setMoments] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newPostContent, setNewPostContent] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    loadMoments();
  }, []);

  const loadMoments = async () => {
    try {
      const data = await getMoments();
      setMoments(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadMoments();
  };

  const handleCreatePost = async () => {
    if (!newPostContent.trim()) return;
    setPosting(true);
    try {
      const newMoment = await createMoment(
        newPostContent,
        user?.$id || "anon",
        user?.name || "Anonymous",
        (preferences.role as "elderly" | "caregiver") || "caregiver"
      );
      setMoments([newMoment, ...moments]);
      setNewPostContent("");
      setCreateModalVisible(false);
    } catch (error) {
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
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setCreateModalVisible(false)}>
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
                        <View style={styles.modalActions}>
                            <Button onPress={() => setCreateModalVisible(false)} style={{ marginRight: 8 }}>Cancel</Button>
                            <Button mode="contained" onPress={handleCreatePost} loading={posting} disabled={posting || !newPostContent.trim()}>
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
});
