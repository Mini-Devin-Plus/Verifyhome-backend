import { ChatMessage, ChatParticipant } from '../types/chat';

export interface RealtimeSubscription {
  unsubscribe: () => void;
}

export interface ChatRealtimeCallbacks {
  onNewMessage?: (message: ChatMessage) => void;
  onParticipantJoin?: (participant: ChatParticipant) => void;
  onParticipantLeave?: (participant: ChatParticipant) => void;
  onRoomUpdate?: (roomData: any) => void;
  onError?: (error: Error) => void;
}

export class ChatRealtimeService {
  private static subscriptions = new Map<string, RealtimeSubscription>();

  // Subscribe to chat room updates
  static subscribeToChatRoom(
    chatRoomId: string,
    userId: string,
    callbacks: ChatRealtimeCallbacks
  ): string {
    const subscriptionId = `${chatRoomId}_${userId}_${Date.now()}`;

    // Define Appwrite channels for this chat room
    const channels = [
      `databases.default.collections.chatMessages.documents`,
      `databases.default.collections.chatParticipants.documents`,
      `databases.default.collections.chatRooms.documents`
    ];

    // Mock Appwrite realtime subscription
    const mockSubscription = this.createMockSubscription(
      channels,
      chatRoomId,
      callbacks
    );

    this.subscriptions.set(subscriptionId, mockSubscription);

    console.log(`[REALTIME] Subscribed to chat ${chatRoomId} for user ${userId}`);
    
    return subscriptionId;
  }

  // Subscribe to user's chat list updates
  static subscribeToUserChats(
    userId: string,
    onChatUpdate: (chatData: any) => void
  ): string {
    const subscriptionId = `user_chats_${userId}_${Date.now()}`;

    // Define channels for user's chats
    const channels = [
      `databases.default.collections.chatRooms.documents`,
      `databases.default.collections.chatParticipants.documents`
    ];

    const mockSubscription = this.createMockUserChatsSubscription(
      channels,
      userId,
      onChatUpdate
    );

    this.subscriptions.set(subscriptionId, mockSubscription);

    console.log(`[REALTIME] Subscribed to user chats for ${userId}`);
    
    return subscriptionId;
  }

  // Unsubscribe from realtime updates
  static unsubscribe(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      subscription.unsubscribe();
      this.subscriptions.delete(subscriptionId);
      console.log(`[REALTIME] Unsubscribed ${subscriptionId}`);
    }
  }

  // Unsubscribe all for cleanup
  static unsubscribeAll(): void {
    this.subscriptions.forEach((subscription, id) => {
      subscription.unsubscribe();
    });
    this.subscriptions.clear();
    console.log(`[REALTIME] Unsubscribed all subscriptions`);
  }

  // Mock subscription for chat room (would be real Appwrite in production)
  private static createMockSubscription(
    channels: string[],
    chatRoomId: string,
    callbacks: ChatRealtimeCallbacks
  ): RealtimeSubscription {
    // Mock implementation - would use real Appwrite client
    const mockInterval = setInterval(() => {
      // Simulate occasional updates for testing
      if (Math.random() > 0.95 && callbacks.onNewMessage) {
        const mockMessage: ChatMessage = {
          id: `msg_${Date.now()}`,
          chatRoomId,
          senderUserId: 'mock_user',
          messageType: 'text',
          body: 'Mock realtime message',
          createdAt: new Date()
        };
        callbacks.onNewMessage(mockMessage);
      }
    }, 5000);

    return {
      unsubscribe: () => {
        clearInterval(mockInterval);
        console.log(`[REALTIME] Mock subscription unsubscribed for ${chatRoomId}`);
      }
    };
  }

  // Mock subscription for user chats
  private static createMockUserChatsSubscription(
    channels: string[],
    userId: string,
    onChatUpdate: (chatData: any) => void
  ): RealtimeSubscription {
    // Mock implementation
    const mockInterval = setInterval(() => {
      // Simulate chat list updates
      if (Math.random() > 0.98) {
        onChatUpdate({
          type: 'chat_list_update',
          userId,
          timestamp: new Date()
        });
      }
    }, 10000);

    return {
      unsubscribe: () => {
        clearInterval(mockInterval);
        console.log(`[REALTIME] Mock user chats subscription unsubscribed for ${userId}`);
      }
    };
  }

  // Get active subscription count (for debugging)
  static getActiveSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  // Check if subscription exists
  static hasSubscription(subscriptionId: string): boolean {
    return this.subscriptions.has(subscriptionId);
  }
}