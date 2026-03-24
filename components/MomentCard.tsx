import { formatRelativeTime } from "@/lib/contacts";
import { Moment, MomentComment } from "@/types/moments";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { ActivityIndicator, Avatar, Divider, Text, useTheme } from "react-native-paper";

interface MomentCardProps {
  moment: Moment;
  currentUserId: string;
  onLike: (id: string) => void;
  onAIRequest: (id: string, content: string) => Promise<MomentComment>;
}

export default function MomentCard({ moment, currentUserId, onLike, onAIRequest }: MomentCardProps) {
  const theme = useTheme();
  const [liked, setLiked] = useState(moment.likes?.includes(currentUserId) || false);
  const [likesCount, setLikesCount] = useState(moment.likes?.length || 0);
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiComment, setAIComment] = useState<MomentComment | null>(null);

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

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
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

        <TouchableOpacity style={styles.actionBtn}>
          <MaterialCommunityIcons name="comment-outline" size={20} color={theme.colors.onSurfaceVariant} />
          <Text variant="bodyMedium" style={{ marginLeft: 6, color: theme.colors.onSurfaceVariant }}>
            Comment
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
            style={[styles.actionBtn, { marginLeft: 'auto' }]} 
            onPress={handleAI}
            disabled={loadingAI || !!aiComment}
        >
          <MaterialCommunityIcons name="sparkles" size={20} color={theme.colors.tertiary} />
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
});
