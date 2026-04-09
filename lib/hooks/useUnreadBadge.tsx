import { getUnreadCount } from "@/lib/messaging";
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

interface UnreadBadgeContextValue {
  chatUnread: number;
  momentUnread: number;
  totalUnread: number;
  incrementMomentUnread: () => void;
  resetMomentUnread: () => void;
  refreshChatUnread: (userId: string) => Promise<void>;
}

const UnreadBadgeContext = createContext<UnreadBadgeContextValue>({
  chatUnread: 0,
  momentUnread: 0,
  totalUnread: 0,
  incrementMomentUnread: () => {},
  resetMomentUnread: () => {},
  refreshChatUnread: async () => {},
});

export function UnreadBadgeProvider({ children }: { children: React.ReactNode }) {
  const [chatUnread, setChatUnread] = useState(0);
  const [momentUnread, setMomentUnread] = useState(0);
  const refreshing = useRef(false);

  const incrementMomentUnread = useCallback(() => {
    setMomentUnread((prev) => prev + 1);
  }, []);

  const resetMomentUnread = useCallback(() => {
    setMomentUnread(0);
  }, []);

  const refreshChatUnread = useCallback(async (userId: string) => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const count = await getUnreadCount(userId);
      setChatUnread(count);
    } catch {
      // ignore
    } finally {
      refreshing.current = false;
    }
  }, []);

  const totalUnread = chatUnread + momentUnread;

  const value = useMemo(
    () => ({ chatUnread, momentUnread, totalUnread, incrementMomentUnread, resetMomentUnread, refreshChatUnread }),
    [chatUnread, momentUnread, totalUnread, incrementMomentUnread, resetMomentUnread, refreshChatUnread]
  );

  return (
    <UnreadBadgeContext.Provider value={value}>
      {children}
    </UnreadBadgeContext.Provider>
  );
}

export function useUnreadBadge() {
  return useContext(UnreadBadgeContext);
}
