import { formatRelativeTime } from "@/lib/contacts";
import { MediaItem, Moment, MomentComment } from "@/types/moments";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useVideoPlayer, VideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Dimensions, Image, Modal, Pressable, StyleSheet, TouchableOpacity, View } from "react-native";
import { ActivityIndicator, Avatar, Divider, Text, useTheme } from "react-native-paper";

interface MomentCardProps {
  moment: Moment;
  currentUserId: string;
  onLike: (id: string) => void;
  onComment: (id: string) => void;
  onAIRequest: (id: string, content: string, imageUrl?: string) => Promise<MomentComment>;
  onDelete?: (id: string) => void;
  latestComments?: MomentComment[];
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

/* ──────────────────────────── Gallery: Video Page ──────────────────────────── */
function GalleryVideoPage({
  uri,
  isActive,
}: {
  uri: string;
  isActive: boolean;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [error, setError] = useState(false);

  const player = useVideoPlayer(uri, (p: VideoPlayer) => {
    p.loop = false;
  });

  useEffect(() => {
    if (isActive) {
      player.play();
    } else {
      player.pause();
    }
  }, [isActive, player]);

  if (error) {
    return (
      <Pressable
        style={galleryStyles.errorWrap}
        onPress={() => {
          setError(false);
          player.play();
        }}
      >
        <MaterialCommunityIcons
          name="alert-circle-outline"
          size={48}
          color="#fff"
        />
        <Text style={{ color: "#fff", marginTop: 8 }}>
          {t("moments.videoLoadError")}
        </Text>
        <Text
          style={{
            color: theme.colors.onSurfaceVariant,
            marginTop: 4,
            fontSize: 12,
          }}
        >
          {t("moments.tapToRetry")}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={galleryStyles.page}>
      <VideoView
        player={player}
        style={galleryStyles.video}
        fullscreenOptions={{ enable: true }}
        allowsPictureInPicture
      />
    </View>
  );
}

/* ──────────────────────────── Gallery: Image Page ──────────────────────────── */
function GalleryImagePage({ uri }: { uri: string }) {
  return (
    <View style={galleryStyles.page}>
      <ScrollView
        maximumZoomScale={4}
        minimumZoomScale={1}
        contentContainerStyle={galleryStyles.zoomContainer}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        bouncesZoom
      >
        <Image
          source={{ uri }}
          style={galleryStyles.image}
          resizeMode="contain"
        />
      </ScrollView>
    </View>
  );
}

/* ──────────────────────── Media Gallery Modal ──────────────────────── */
function MediaGalleryModal({
  items,
  initialIndex,
  visible,
  onClose,
}: {
  items: MediaItem[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const flatListRef = useRef<FlatList>(null);

  // Reset index when modal opens
  useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
      // Scroll to initial index after a frame
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: initialIndex,
          animated: false,
        });
      }, 50);
    }
  }, [visible, initialIndex]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setCurrentIndex(idx);
  }, []);

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: SCREEN_W,
      offset: SCREEN_W * index,
      index,
    }),
    [],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: MediaItem; index: number }) => {
      if (item.type === "video" && item.url) {
        return (
          <GalleryVideoPage
            uri={item.url}
            isActive={visible && index === currentIndex}
          />
        );
      }
      if (item.type === "image" && item.url) {
        return <GalleryImagePage uri={item.url} />;
      }
      return <View style={galleryStyles.page} />;
    },
    [visible, currentIndex],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" backgroundColor="rgba(0,0,0,0.95)" />
      <View style={galleryStyles.overlay}>
        {/* Close button */}
        <Pressable
          style={galleryStyles.closeBtn}
          onPress={onClose}
          hitSlop={12}
        >
          <MaterialCommunityIcons name="close" size={28} color="#fff" />
        </Pressable>

        {/* Page indicator */}
        {items.length > 1 && (
          <View style={galleryStyles.indicator}>
            <Text style={galleryStyles.indicatorText}>
              {t("moments.mediaOf", {
                current: currentIndex + 1,
                total: items.length,
              })}
            </Text>
          </View>
        )}

        {/* Horizontal paging list */}
        <FlatList
          ref={flatListRef}
          data={items}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(_, i) => String(i)}
          getItemLayout={getItemLayout}
          initialScrollIndex={initialIndex}
          onMomentumScrollEnd={onScroll}
          renderItem={renderItem}
        />

        {/* Dot indicators for multiple items */}
        {items.length > 1 && (
          <View style={galleryStyles.dots}>
            {items.map((_, i) => (
              <View
                key={i}
                style={[
                  galleryStyles.dot,
                  { opacity: i === currentIndex ? 1 : 0.4 },
                ]}
              />
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
}

export default function MomentCard({ moment, currentUserId, onLike, onComment, onAIRequest, onDelete }: MomentCardProps) {
  const theme = useTheme();

  if (item.type === "image" && item.url) {
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => onPressMedia(index)}
        style={[gridStyle, { overflow: "hidden" }]}
      >
        <Image
          source={{ uri: item.url }}
          style={styles.gridImage}
          resizeMode="cover"
        />
      </TouchableOpacity>
    );
  }

  if (item.type === "video") {
    const thumbUri = item.thumbnail_url;
    return (
      <TouchableOpacity
        style={[
          styles.gridVideoContainer,
          gridStyle,
          { borderColor: theme.colors.outline },
        ]}
        onPress={() => onPressMedia(index)}
        activeOpacity={0.8}
      >
        {thumbUri ? (
          <>
            <Image
              source={{ uri: thumbUri }}
              style={[styles.gridImage, gridStyle]}
              resizeMode="cover"
            />
            <View style={styles.playOverlay}>
              <MaterialCommunityIcons
                name="play-circle"
                size={48}
                color="rgba(255,255,255,0.9)"
              />
            </View>
          </>
        ) : (
          <View style={styles.videoPlaceholderInner}>
            <MaterialCommunityIcons
              name="video"
              size={32}
              color={theme.colors.primary}
            />
            <MaterialCommunityIcons
              name="play-circle-outline"
              size={20}
              color={theme.colors.primary}
              style={{ position: "absolute", bottom: 8, right: 8 }}
            />
          </View>
        )}
      </TouchableOpacity>
    );
  }

  return null;
}

/** Render media items in a grid layout */
function MediaGrid({
  items,
  onPressMedia,
}: {
  items: MediaItem[];
  onPressMedia: (index: number) => void;
}) {
  if (items.length === 0) return null;

  if (items.length === 1) {
    return (
      <View style={styles.mediaGridWrap}>
        <MediaGridItem
          item={items[0]}
          index={0}
          onPressMedia={onPressMedia}
          gridStyle={styles.singleMedia}
        />
      </View>
    );
  }

  if (items.length === 2) {
    return (
      <View style={[styles.mediaGridWrap, styles.gridRow]}>
        {items.map((item, i) => (
          <MediaGridItem
            key={i}
            item={item}
            index={i}
            onPressMedia={onPressMedia}
            gridStyle={styles.halfMedia}
          />
        ))}
      </View>
    );
  }

  // 3 or 4 items: 2x2 grid
  return (
    <View style={styles.mediaGridWrap}>
      <View style={styles.gridRow}>
        {items.slice(0, 2).map((item, i) => (
          <MediaGridItem
            key={i}
            item={item}
            index={i}
            onPressMedia={onPressMedia}
            gridStyle={styles.halfMedia}
          />
        ))}
      </View>
      {items.length > 2 && (
        <View style={styles.gridRow}>
          {items.slice(2, 4).map((item, i) => (
            <MediaGridItem
              key={i + 2}
              item={item}
              index={i + 2}
              onPressMedia={onPressMedia}
              gridStyle={
                items.length === 3 && i === 0
                  ? styles.singleMedia
                  : styles.halfMedia
              }
            />
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
    <TouchableOpacity
      onPress={onPressComments}
      activeOpacity={0.7}
      style={styles.inlineComments}
    >
      {comments.map((c) => (
        <View key={c.$id} style={styles.inlineCommentRow}>
          <Text
            variant="labelMedium"
            style={{ fontWeight: "bold", color: theme.colors.primary }}
          >
            {c.author_name}
            {c.reply_to_user_name && (
              <Text
                style={{
                  fontWeight: "normal",
                  color: theme.colors.onSurfaceVariant,
                }}
              >
                {" "}
                ▸ {c.reply_to_user_name}
              </Text>
            )}
          </Text>
          <Text
            variant="bodySmall"
            numberOfLines={2}
            style={{ color: theme.colors.onSurface, marginTop: 1 }}
          >
            {c.content}
          </Text>
        </View>
      ))}
      <Text
        variant="labelSmall"
        style={{ color: theme.colors.primary, marginTop: 4 }}
      >
        {t("moments.viewAllComments")}
      </Text>
    </TouchableOpacity>
  );
}

export default function MomentCard({
  moment,
  currentUserId,
  onLike,
  onComment,
  onAIRequest,
  onDelete,
  latestComments,
}: MomentCardProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [liked, setLiked] = useState(
    moment.likes?.includes(currentUserId) || false,
  );
  const [likesCount, setLikesCount] = useState(moment.likes?.length || 0);
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiComment, setAIComment] = useState<MomentComment | null>(null);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);

  const mediaItems = moment.parsedMediaItems || [];

  const handleLike = () => {
    const newLiked = !liked;
    setLiked(newLiked);
    setLikesCount((prev) => (newLiked ? prev + 1 : prev - 1));
    onLike(moment.$id);
  };

  const handleAI = async () => {
    if (loadingAI || aiComment) return;
    setLoadingAI(true);
    try {
      const imageUrl = moment.media_type === "image" ? moment.media_url : undefined;
      const comment = await onAIRequest(moment.$id, moment.content, imageUrl);
      setAIComment(comment);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingAI(false);
    }
  };

  const handlePressMedia = (index: number) => {
    setGalleryIndex(index);
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
      {galleryIndex !== null && (
        <MediaGalleryModal
          items={mediaItems}
          initialIndex={galleryIndex}
          visible
          onClose={() => setGalleryIndex(null)}
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
          <Text variant="titleMedium" style={{ fontWeight: "bold" }}>
            {moment.author_name}
          </Text>
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {moment.author_role} • {formatRelativeTime(moment.$createdAt)}
          </Text>
        </View>
        {moment.author_id === currentUserId && onDelete && (
          <TouchableOpacity
            style={{ marginLeft: "auto", padding: 4 }}
            onPress={() => {
              Alert.alert("Delete Post", "Are you sure you want to delete this post?", [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: () => onDelete(moment.$id) },
              ]);
            }}
          >
            <MaterialCommunityIcons name="delete-outline" size={22} color={theme.colors.error} />
          </TouchableOpacity>
        )}
      </View>

      {!!moment.content && (
        <Text variant="bodyLarge" style={styles.content}>
          {moment.content}
        </Text>
      )}

      {/* Multi-media grid */}
      <MediaGrid items={mediaItems} onPressMedia={handlePressMedia} />

      {/* AI Response Section */}
      {loadingAI && (
        <View
          style={[
            styles.aiLoading,
            { backgroundColor: theme.colors.surfaceVariant },
          ]}
        >
          <ActivityIndicator size="small" color={theme.colors.tertiary} />
          <Text
            variant="bodySmall"
            style={{ marginLeft: 8, color: theme.colors.tertiary }}
          >
            {t("moments.aiThinking")}
          </Text>
        </View>
      )}

      {aiComment && (
        <View
          style={[
            styles.aiResponse,
            { backgroundColor: theme.colors.tertiaryContainer },
          ]}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 4,
            }}
          >
            <MaterialCommunityIcons
              name="robot"
              size={16}
              color={theme.colors.onTertiaryContainer}
            />
            <Text
              variant="labelSmall"
              style={{
                marginLeft: 4,
                color: theme.colors.onTertiaryContainer,
                fontWeight: "bold",
              }}
            >
              {t("moments.aiInsight")}
            </Text>
          </View>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onTertiaryContainer }}
          >
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
          <Text
            variant="bodyMedium"
            style={{ marginLeft: 6, color: theme.colors.onSurfaceVariant }}
          >
            {likesCount > 0 ? likesCount : t("moments.like")}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => onComment(moment.$id)}
        >
          <MaterialCommunityIcons
            name="comment-outline"
            size={20}
            color={theme.colors.onSurfaceVariant}
          />
          <Text
            variant="bodyMedium"
            style={{ marginLeft: 6, color: theme.colors.onSurfaceVariant }}
          >
            {moment.comments_count > 0
              ? moment.comments_count
              : t("moments.comment")}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, { marginLeft: "auto" }]}
          onPress={handleAI}
          disabled={loadingAI || !!aiComment}
        >
          <MaterialCommunityIcons
            name="creation"
            size={20}
            color={theme.colors.tertiary}
          />
          <Text
            variant="bodyMedium"
            style={{
              marginLeft: 6,
              color: theme.colors.tertiary,
              fontWeight: "600",
            }}
          >
            {t("moments.aiDiscuss")}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Inline comment preview */}
      <InlineCommentPreview
        comments={latestComments || []}
        onPressComments={() => onComment(moment.$id)}
      />
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
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#f0f0f0",
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
  // Inline comments
  inlineComments: {
    marginTop: 10,
    paddingTop: 8,
  },
  inlineCommentRow: {
    marginBottom: 6,
  },
});
