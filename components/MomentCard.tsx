import { formatRelativeTime } from "@/lib/contacts";
import { MediaItem, Moment, MomentComment } from "@/types/moments";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useVideoPlayer, VideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Image, Modal, Pressable, StyleSheet, TouchableOpacity, View } from "react-native";
import { ActivityIndicator, Avatar, Divider, Text, useTheme } from "react-native-paper";

interface MomentCardProps {
  moment: Moment;
  currentUserId: string;
  onLike: (id: string) => void;
  onComment: (id: string) => void;
  onAIRequest: (id: string, content: string) => Promise<MomentComment>;
  latestComments?: MomentComment[];
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

/** Render a single media item (image or video) in the grid */
function MediaGridItem({
  item,
  onPlayVideo,
  gridStyle,
}: {
  item: MediaItem;
  onPlayVideo: (uri: string) => void;
  gridStyle: any;
}) {
  const theme = useTheme();

  if (item.type === "image" && item.url) {
    return <Image source={{ uri: item.url }} style={[styles.gridImage, gridStyle]} resizeMode="cover" />;
  }

  if (item.type === "video") {
    const thumbUri = item.thumbnail_url;
    return (
      <TouchableOpacity
        style={[styles.gridVideoContainer, gridStyle, { borderColor: theme.colors.outline }]}
        onPress={() => item.url && onPlayVideo(item.url)}
        activeOpacity={0.8}
      >
        {thumbUri ? (
          <>
            <Image source={{ uri: thumbUri }} style={[styles.gridImage, gridStyle]} resizeMode="cover" />
            <View style={styles.playOverlay}>
              <MaterialCommunityIcons name="play-circle" size={48} color="rgba(255,255,255,0.9)" />
            </View>
          </>
        ) : (
          <View style={styles.videoPlaceholderInner}>
            <MaterialCommunityIcons name="video" size={32} color={theme.colors.primary} />
            <MaterialCommunityIcons name="play-circle-outline" size={20} color={theme.colors.primary} style={{ position: "absolute", bottom: 8, right: 8 }} />
          </View>
        )}
      </TouchableOpacity>
    );
  }

  return null;
}

/** Render media items in a grid layout */
function MediaGrid({ items, onPlayVideo }: { items: MediaItem[]; onPlayVideo: (uri: string) => void }) {
  if (items.length === 0) return null;

  if (items.length === 1) {
    return (
      <View style={styles.mediaGridWrap}>
        <MediaGridItem item={items[0]} onPlayVideo={onPlayVideo} gridStyle={styles.singleMedia} />
      </View>
    );
  }

  if (items.length === 2) {
    return (
      <View style={[styles.mediaGridWrap, styles.gridRow]}>
        {items.map((item, i) => (
          <MediaGridItem key={i} item={item} onPlayVideo={onPlayVideo} gridStyle={styles.halfMedia} />
        ))}
      </View>
    );
  }

  // 3 or 4 items: 2x2 grid
  return (
    <View style={styles.mediaGridWrap}>
      <View style={styles.gridRow}>
        {items.slice(0, 2).map((item, i) => (
          <MediaGridItem key={i} item={item} onPlayVideo={onPlayVideo} gridStyle={styles.halfMedia} />
        ))}
      </View>
      {items.length > 2 && (
        <View style={styles.gridRow}>
          {items.slice(2, 4).map((item, i) => (
            <MediaGridItem key={i + 2} item={item} onPlayVideo={onPlayVideo} gridStyle={items.length === 3 && i === 0 ? styles.singleMedia : styles.halfMedia} />
          ))}
        </View>
      )}
    </View>
  );
}

/** Inline comment preview (max 3, truncated) */
function InlineCommentPreview({
  comments,
  onPressComments,
}: {
  comments: MomentComment[];
  onPressComments: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();

  if (!comments || comments.length === 0) return null;

  return (
    <TouchableOpacity onPress={onPressComments} activeOpacity={0.7} style={styles.inlineComments}>
      {comments.map((c) => (
        <View key={c.$id} style={styles.inlineCommentRow}>
          <Text variant="labelMedium" style={{ fontWeight: "bold", color: theme.colors.primary }}>
            {c.author_name}
            {c.reply_to_user_name && (
              <Text style={{ fontWeight: "normal", color: theme.colors.onSurfaceVariant }}>
                {" "}▸ {c.reply_to_user_name}
              </Text>
            )}
          </Text>
          <Text variant="bodySmall" numberOfLines={2} style={{ color: theme.colors.onSurface, marginTop: 1 }}>
            {c.content}
          </Text>
        </View>
      ))}
      <Text variant="labelSmall" style={{ color: theme.colors.primary, marginTop: 4 }}>
        {t('moments.viewAllComments')}
      </Text>
    </TouchableOpacity>
  );
}

export default function MomentCard({ moment, currentUserId, onLike, onComment, onAIRequest, latestComments }: MomentCardProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [liked, setLiked] = useState(moment.likes?.includes(currentUserId) || false);
  const [likesCount, setLikesCount] = useState(moment.likes?.length || 0);
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiComment, setAIComment] = useState<MomentComment | null>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);

  const mediaItems = moment.parsedMediaItems || [];

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

  const handlePlayVideo = (uri: string) => {
    setVideoUri(uri);
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
      {videoUri && (
        <VideoPlayerModal
          uri={videoUri}
          visible={!!videoUri}
          onClose={() => setVideoUri(null)}
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

      {!!moment.content && (
        <Text variant="bodyLarge" style={styles.content}>
          {moment.content}
        </Text>
      )}

      {/* Multi-media grid */}
      <MediaGrid items={mediaItems} onPlayVideo={handlePlayVideo} />

      {/* AI Response Section */}
      {loadingAI && (
        <View style={styles.aiLoading}>
            <ActivityIndicator size="small" color={theme.colors.tertiary} />
            <Text variant="bodySmall" style={{ marginLeft: 8, color: theme.colors.tertiary }}>
                {t('moments.aiThinking')}
            </Text>
        </View>
      )}

      {aiComment && (
        <View style={[styles.aiResponse, { backgroundColor: theme.colors.tertiaryContainer }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <MaterialCommunityIcons name="robot" size={16} color={theme.colors.onTertiaryContainer} />
                <Text variant="labelSmall" style={{ marginLeft: 4, color: theme.colors.onTertiaryContainer, fontWeight: 'bold' }}>
                    {t('moments.aiInsight')}
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
            {likesCount > 0 ? likesCount : t('moments.like')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={() => onComment(moment.$id)}>
          <MaterialCommunityIcons name="comment-outline" size={20} color={theme.colors.onSurfaceVariant} />
          <Text variant="bodyMedium" style={{ marginLeft: 6, color: theme.colors.onSurfaceVariant }}>
            {moment.comments_count > 0 ? moment.comments_count : t('moments.comment')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
            style={[styles.actionBtn, { marginLeft: 'auto' }]} 
            onPress={handleAI}
            disabled={loadingAI || !!aiComment}
        >
          <MaterialCommunityIcons name="creation" size={20} color={theme.colors.tertiary} />
          <Text variant="bodyMedium" style={{ marginLeft: 6, color: theme.colors.tertiary, fontWeight: '600' }}>
            {t('moments.aiDiscuss')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Inline comment preview */}
      <InlineCommentPreview comments={latestComments || []} onPressComments={() => onComment(moment.$id)} />
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
  // Media grid
  mediaGridWrap: {
    marginBottom: 12,
    borderRadius: 12,
    overflow: "hidden",
  },
  gridRow: {
    flexDirection: "row",
    gap: 2,
  },
  singleMedia: {
    width: "100%",
    height: 240,
    borderRadius: 12,
  },
  halfMedia: {
    flex: 1,
    height: 160,
  },
  gridImage: {
    width: "100%",
    height: "100%",
  },
  gridVideoContainer: {
    overflow: "hidden",
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  videoPlaceholderInner: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  // Video modal
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
  // Inline comments
  inlineComments: {
    marginTop: 10,
    paddingTop: 8,
  },
  inlineCommentRow: {
    marginBottom: 6,
  },
});
