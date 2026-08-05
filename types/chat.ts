// Chat System Data Models (Appwrite)

export interface ChatRoom {
  id: string;
  type: 'direct' | 'group';
  createdByUserId: string;
  isPropertyLinked: boolean;
  propertyId?: string;
  dealId?: string; // Read-only reference
  createdAt: Date;
  lastMessageAt: Date;
  metadata?: Record<string, any>;
}

export interface ChatParticipant {
  id: string;
  chatRoomId: string;
  userId: string;
  roleAtJoin: 'buyer' | 'tenant' | 'seller' | 'agent' | 'landlord' | 'admin';
  joinedAt: Date;
  isAdmin: boolean; // Group admin only
  mutedUntil?: Date;
  leftAt?: Date;
}

export interface ChatMessage {
  id: string;
  chatRoomId: string;
  senderUserId: string;
  messageType: 'text' | 'system';
  body: string;
  createdAt: Date;
  editedAt?: Date;
  deletedAt?: Date;
  metadata?: Record<string, any>;
}

export interface ChatAuditLog {
  id: string;
  chatRoomId: string;
  actorUserId: string;
  actionType: 'join' | 'leave' | 'add_user' | 'remove_user' | 'message_sent' | 'create_room';
  timestamp: Date;
  metadata?: Record<string, any>;
}

// Chat-related types
export interface ChatRoomWithParticipants extends ChatRoom {
  participants: ChatParticipant[];
  lastMessage?: ChatMessage;
}

export interface MessageWithSender extends ChatMessage {
  senderRole: string;
  senderName: string;
}