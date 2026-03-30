import { formatRelativeTime } from "@/lib/contacts";
import { Moment, MomentComment } from "@/types/moments";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useVideoPlayer, VideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useState } from "react";
import { Image, Modal, Pressable, StyleSheet, TouchableOpacity, View } from "react-native";
import { ActivityIndicator, Avatar, Divider, Text, useTheme } from "react-native-paper";

interface MomentCardProps {
  moment: Moment;
  currentUserId: string;
  onLike: (id: string) => void;
  onComment: (id: string) => void;
  onAIRequest: (id: string, content: string) => Promise<MomentComment>;
}

function VideoPlayerModal({ uri, visible, onClose }: { uri: string; visible: boolean; onClose: () => void }) {
  const player = useVideoPlayer(uri, (p: VideoPlayer) => {
    p.loop = false;
  });

  useEffect(() => {
    if (visible) {
      player.play();
    } else {
      player.pause();
    }
  }, [visible, player]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.videoModalOverlay}>
        <VideoView
          player={player}
          style={styles.videoPlayer}
          fullscreenOptions={{ enable: true }}
          allowsPictureInPicture
        />
        <Pressable style={styles.videoCloseBtn} onPress={onClose}>
          <MaterialCommunityIcons name="close-circle" size={36} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}

export default function MomentCard({ moment, currentUserId, onLike, onComment, onAIRequest }: MomentCardProps) {
  const theme = useTheme();
  const [liked, setLiked] = useState(moment.likes?.includes(currentUserId) || false);
  const [likesCount, setLikesCount] = useState(moment.likes?.length || 0);
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiComment, setAIComment] = useState<MomentComment | null>(null);
  const [videoVisible, setVideoVisible] = useState(false);

  const handleLike = () => {
    const newLiked = !liked;
    setLiked(newLiked);
    setLikesCount(prev => newLiked ? prev + 1 : prev - 1);
    onLike(moment.$id);
  };

  const handleAI = async () => {
    if (loadingAI || aiComment) return;
    setLoadingAI(true);
    try {
      const comment = await onAIRequest(moment.$id, moment.content);
      setAIComment(comment);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingAI(false);
    }
  };

  const handleOpenVideo = () => {
    if (moment.media_url) {
      setVideoVisible(true);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
      {moment.media_url && moment.media_type === "video" && (
        <VideoPlayerModal
          uri={moment.media_url}
          visible={videoVisible}
          onClose={() => setVideoVisible(false)}
        />
      )}
      <View style={styles.header}>
        <Avatar.Text 
            size={40} 
            label={moment.author_name.substring(0, 1).toUpperCase()} 
            style={{ backgroundColor: theme.colors.primaryContainer }}
            color={theme.colors.onPrimaryContainer}
        />
        <View style={styles.headerText}>
          <Text variant="titleMedium" style={{ fontWeight: "bold" }}>{moment.author_name}</Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {moment.author_role} • {formatRelativeTime(moment.$createdAt)}
          </Text>
        </View>
      </View>

      <Text variant="bodyLarge" style={styles.content}>
        {moment.content}
      </Text>

      {moment.media_url && moment.media_type === "image" && (
        <Image source={{ uri: moment.media_url }} style={styles.mediaImage} resizeMode="cover" />
      )}

      {moment.media_type === "video" && (
        <TouchableOpacity style={[styles.videoBox, { borderColor: theme.colors.outline }]} onPress={handleOpenVideo}>
          <MaterialCommunityIcons name="video" size={24} color={theme.colors.primary} />
          <Text variant="bodyMedium" style={{ marginTop: 6 }}>
            Tap to watch video
          </Text>
        </TouchableOpacity>
      )}

      {/* AI Response Section */}
      {loadingAI && (
        <View style={styles.aiLoading}>
            <ActivityIndicator size="small" color={theme.colors.tertiary} />
            <Text variant="bodySmall" style={{ marginLeft: 8, color: theme.colors.tertiary }}>
                AI is thinking...
            </Text>
        </View>
      )}

      {aiComment && (
        <View style={[styles.aiResponse, { backgroundColor: theme.colors.tertiaryContainer }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <MaterialCommunityIcons name="robot" size={16} color={theme.colors.onTertiaryContainer} />
                <Text variant="labelSmall" style={{ marginLeft: 4, color: theme.colors.onTertiaryContainer, fontWeight: 'bold' }}>
                    AI Insight
                </Text>
            </View>
            <Text variant="bodyMedium" style={{ color: theme.colors.onTertiaryContainer }}>
                {aiComment.content}
            </Text>
        </View>
      )}

      <Divider style={{ marginVertical: 12 }} />

      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
          <MaterialCommunityIcons 
            name={liked ? "heart" : "heart-outline"} 
            size={20} 
            color={liked ? theme.colors.error : theme.colors.onSurfaceVariant} 
          />
          <Text variant="bodyMedium" style={{ marginLeft: 6, color: theme.colors.onSurfaceVariant }}>
            {likesCount > 0 ? likesCount : "Like"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={() => onComment(moment.$id)}>
          <MaterialCommunityIcons name="comment-outline" size={20} color={theme.colors.onSurfaceVariant} />
          <Text variant="bodyMedium" style={{ marginLeft: 6, color: theme.colors.onSurfaceVariant }}>
            {moment.comments_count > 0 ? moment.comments_count : "Comment"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
            style={[styles.actionBtn, { marginLeft: 'auto' }]} 
            onPress={handleAI}
            disabled={loadingAI || !!aiComment}
        >
          <MaterialCommunityIcons name="creation" size={20} color={theme.colors.tertiary} />
          <Text variant="bodyMedium" style={{ marginLeft: 6, color: theme.colors.tertiary, fontWeight: '600' }}>
            AI Discuss
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    marginBottom: 8,
    elevation: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  headerText: {
    marginLeft: 12,
  },
  content: {
    marginBottom: 12,
    lineHeight: 22,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 4,
  },
  aiLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    marginTop: 8,
  },
  aiResponse: {
    padding: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  mediaImage: {
    width: "100%",
    height: 240,
    borderRadius: 12,
    marginBottom: 12,
  },
  videoBox: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  videoModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  videoPlayer: {
    width: "100%",
    height: 280,
  },
  videoCloseBtn: {
    position: "absolute",
    top: 48,
    right: 16,
  },
});
