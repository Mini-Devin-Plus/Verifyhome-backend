import { ChatRoom, ChatParticipant, ChatMessage, ChatAuditLog, ChatRoomWithParticipants, MessageWithSender } from '../types/chat';
import { User } from '../types/database';

// Mock Appwrite client (would be real Appwrite SDK)
class MockAppwriteClient {
  async createDocument(collection: string, data: any): Promise<any> {
    console.log(`[APPWRITE] Creating ${collection}:`, data);
    return { ...data, id: `${collection}_${Date.now()}` };
  }

  async listDocuments(collection: string, queries?: any[]): Promise<any> {
    console.log(`[APPWRITE] Listing ${collection} with queries:`, queries);
    return { documents: [] };
  }

  async updateDocument(collection: string, id: string, data: any): Promise<any> {
    console.log(`[APPWRITE] Updating ${collection} ${id}:`, data);
    return { id, ...data };
  }

  async subscribe(channels: string[], callback: (response: any) => void): Promise<any> {
    console.log(`[APPWRITE] Subscribing to channels:`, channels);
    return { unsubscribe: () => console.log('Unsubscribed') };
  }
}

export class ChatService {
  private static appwrite = new MockAppwriteClient();
  private static rateLimitStore = new Map<string, { count: number; resetTime: number }>();

  // Create direct chat (1-to-1)
  static async createDirectChat(
    userId1: string,
    userId2: string,
    propertyId?: string,
    dealId?: string
  ): Promise<ChatRoom> {
    // Check if direct chat already exists
    const existingChat = await this.findExistingDirectChat(userId1, userId2, propertyId);
    if (existingChat) {
      return existingChat;
    }

    const chatRoom: Omit<ChatRoom, 'id'> = {
      type: 'direct',
      createdByUserId: userId1,
      isPropertyLinked: !!propertyId,
      propertyId,
      dealId, // Read-only reference
      createdAt: new Date(),
      lastMessageAt: new Date(),
      metadata: {
        participants: [userId1, userId2]
      }
    };

    const createdRoom = await this.appwrite.createDocument('chatRooms', chatRoom);

    // Add participants
    await this.addParticipant(createdRoom.id, userId1, await this.getUserRole(userId1), true);
    await this.addParticipant(createdRoom.id, userId2, await this.getUserRole(userId2), false);

    // Log creation
    await this.logAction(createdRoom.id, userId1, 'create_room', { type: 'direct' });

    return createdRoom;
  }

  // Create group chat
  static async createGroupChat(
    creatorUserId: string,
    name: string,
    participantUserIds: string[],
    propertyId?: string,
    dealId?: string
  ): Promise<ChatRoom> {
    const chatRoom: Omit<ChatRoom, 'id'> = {
      type: 'group',
      createdByUserId: creatorUserId,
      isPropertyLinked: !!propertyId,
      propertyId,
      dealId, // Read-only reference
      createdAt: new Date(),
      lastMessageAt: new Date(),
      metadata: {
        name,
        participants: [creatorUserId, ...participantUserIds]
      }
    };

    const createdRoom = await this.appwrite.createDocument('chatRooms', chatRoom);

    // Add creator as admin
    await this.addParticipant(createdRoom.id, creatorUserId, await this.getUserRole(creatorUserId), true);

    // Add other participants
    for (const userId of participantUserIds) {
      await this.addParticipant(createdRoom.id, userId, await this.getUserRole(userId), false);
    }

    // Log creation
    await this.logAction(createdRoom.id, creatorUserId, 'create_room', { 
      type: 'group', 
      name,
      participantCount: participantUserIds.length + 1
    });

    return createdRoom;
  }

  // Send message with rate limiting
  static async sendMessage(
    chatRoomId: string,
    senderUserId: string,
    messageBody: string,
    messageType: 'text' | 'system' = 'text'
  ): Promise<ChatMessage> {
    // Check rate limiting
    if (!this.checkRateLimit(senderUserId)) {
      throw new Error('Rate limit exceeded. Please wait before sending another message.');
    }

    // Verify user is participant
    const isParticipant = await this.isUserParticipant(chatRoomId, senderUserId);
    if (!isParticipant) {
      throw new Error('User is not a participant in this chat');
    }

    const message: Omit<ChatMessage, 'id'> = {
      chatRoomId,
      senderUserId,
      messageType,
      body: messageBody.trim(),
      createdAt: new Date(),
      metadata: {}
    };

    const createdMessage = await this.appwrite.createDocument('chatMessages', message);

    // Update room last message time
    await this.appwrite.updateDocument('chatRooms', chatRoomId, {
      lastMessageAt: new Date()
    });

    // Log action
    await this.logAction(chatRoomId, senderUserId, 'message_sent', {
      messageType,
      messageLength: messageBody.length
    });

    return createdMessage;
  }

  // Add participant to chat
  static async addParticipant(
    chatRoomId: string,
    userId: string,
    userRole: string,
    isAdmin: boolean = false
  ): Promise<ChatParticipant> {
    const participant: Omit<ChatParticipant, 'id'> = {
      chatRoomId,
      userId,
      roleAtJoin: userRole as any,
      joinedAt: new Date(),
      isAdmin
    };

    const createdParticipant = await this.appwrite.createDocument('chatParticipants', participant);

    // Log action
    await this.logAction(chatRoomId, userId, 'join', { role: userRole, isAdmin });

    return createdParticipant;
  }

  // Remove participant from chat
  static async removeParticipant(
    chatRoomId: string,
    userId: string,
    removedByUserId: string
  ): Promise<void> {
    // Verify remover has permission (admin or self)
    const canRemove = await this.canUserRemoveParticipant(chatRoomId, removedByUserId, userId);
    if (!canRemove) {
      throw new Error('Insufficient permissions to remove participant');
    }

    // Soft delete - mark as left
    await this.appwrite.updateDocument('chatParticipants', `${chatRoomId}_${userId}`, {
      leftAt: new Date()
    });

    // Log action
    await this.logAction(chatRoomId, removedByUserId, 'remove_user', { 
      removedUserId: userId 
    });
  }

  // Leave chat
  static async leaveChat(chatRoomId: string, userId: string): Promise<void> {
    await this.appwrite.updateDocument('chatParticipants', `${chatRoomId}_${userId}`, {
      leftAt: new Date()
    });

    // Log action
    await this.logAction(chatRoomId, userId, 'leave', {});
  }

  // Fetch user's chats
  static async fetchUserChats(userId: string): Promise<ChatRoomWithParticipants[]> {
    // Mock implementation - would query Appwrite
    const userChats = await this.appwrite.listDocuments('chatRooms', [
      `participants.userId=${userId}`,
      `participants.leftAt=null`
    ]);

    return userChats.documents;
  }

  // Fetch messages for chat room
  static async fetchMessages(
    chatRoomId: string,
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<MessageWithSender[]> {
    // Verify user is participant
    const isParticipant = await this.isUserParticipant(chatRoomId, userId);
    if (!isParticipant) {
      throw new Error('User is not a participant in this chat');
    }

    // Mock implementation - would query Appwrite
    const messages = await this.appwrite.listDocuments('chatMessages', [
      `chatRoomId=${chatRoomId}`,
      `deletedAt=null`,
      `limit=${limit}`,
      `offset=${offset}`,
      'orderBy=createdAt:desc'
    ]);

    return messages.documents;
  }

  // Subscribe to real-time updates
  static subscribeToChat(
    chatRoomId: string,
    userId: string,
    onMessage: (message: ChatMessage) => void,
    onParticipantUpdate: (participant: ChatParticipant) => void
  ): () => void {
    const channels = [
      `databases.chatMessages.documents.${chatRoomId}`,
      `databases.chatParticipants.documents.${chatRoomId}`
    ];

    const subscription = this.appwrite.subscribe(channels, (response) => {
      if (response.events.includes('databases.chatMessages.documents.create')) {
        onMessage(response.payload);
      }
      if (response.events.includes('databases.chatParticipants.documents.update')) {
        onParticipantUpdate(response.payload);
      }
    });

    return () => subscription.unsubscribe();
  }

  // Private helper methods
  private static async findExistingDirectChat(
    userId1: string,
    userId2: string,
    propertyId?: string
  ): Promise<ChatRoom | null> {
    // Mock implementation - would query Appwrite for existing direct chat
    return null;
  }

  private static async isUserParticipant(chatRoomId: string, userId: string): Promise<boolean> {
    // Mock implementation - would check participant status
    return true;
  }

  private static async canUserRemoveParticipant(
    chatRoomId: string,
    removerId: string,
    targetUserId: string
  ): Promise<boolean> {
    // Mock implementation - would check admin status or self-removal
    return removerId === targetUserId; // Can always remove self
  }

  private static async getUserRole(userId: string): Promise<string> {
    // Mock implementation - would fetch user role
    return 'buyer';
  }

  private static checkRateLimit(userId: string): boolean {
    const key = userId;
    const now = Date.now();
    const limit = this.rateLimitStore.get(key);

    if (!limit || now > limit.resetTime) {
      this.rateLimitStore.set(key, { count: 1, resetTime: now + 60000 }); // 1 minute window
      return true;
    }

    if (limit.count >= 30) { // 30 messages per minute
      return false;
    }

    limit.count++;
    return true;
  }

  private static async logAction(
    chatRoomId: string,
    actorUserId: string,
    actionType: ChatAuditLog['actionType'],
    metadata: Record<string, any>
  ): Promise<void> {
    const auditLog: Omit<ChatAuditLog, 'id'> = {
      chatRoomId,
      actorUserId,
      actionType,
      timestamp: new Date(),
      metadata
    };

    await this.appwrite.createDocument('chatAuditLogs', auditLog);
    console.log(`[CHAT AUDIT] ${actionType} by ${actorUserId} in ${chatRoomId}`);
  }
}