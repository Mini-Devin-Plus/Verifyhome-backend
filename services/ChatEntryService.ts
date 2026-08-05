import { ChatService } from './ChatService';
import { ChatRoom } from '../types/chat';

export interface ChatEntryResult {
  success: boolean;
  chatRoomId?: string;
  error?: string;
  isNewChat?: boolean;
}

export class ChatEntryService {
  
  // Create or open property chat
  static async openPropertyChat(
    currentUserId: string,
    propertyId: string,
    propertyOwnerId: string,
    propertyOwnerRole: 'agent' | 'seller' | 'landlord'
  ): Promise<ChatEntryResult> {
    try {
      // Check if direct chat already exists for this property
      const existingChat = await this.findPropertyChat(currentUserId, propertyOwnerId, propertyId);
      
      if (existingChat) {
        return {
          success: true,
          chatRoomId: existingChat.id,
          isNewChat: false
        };
      }

      // Create new direct chat linked to property
      const chatRoom = await ChatService.createDirectChat(
        currentUserId,
        propertyOwnerId,
        propertyId
      );

      // Send system message about property context
      await ChatService.sendMessage(
        chatRoom.id,
        'system',
        `Chat started for property ${propertyId}`,
        'system'
      );

      return {
        success: true,
        chatRoomId: chatRoom.id,
        isNewChat: true
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to open property chat'
      };
    }
  }

  // Create or open deal chat (read-only deal reference)
  static async openDealChat(
    currentUserId: string,
    dealId: string,
    dealType: 'escrow' | 'standard',
    buyerId: string,
    sellerId: string,
    propertyId?: string
  ): Promise<ChatEntryResult> {
    try {
      // Check if deal chat already exists
      const existingChat = await this.findDealChat(dealId);
      
      if (existingChat) {
        return {
          success: true,
          chatRoomId: existingChat.id,
          isNewChat: false
        };
      }

      // Determine other participant
      const otherUserId = currentUserId === buyerId ? sellerId : buyerId;
      const currentUserRole = currentUserId === buyerId ? 'buyer' : 'seller';
      const otherUserRole = currentUserId === buyerId ? 'seller' : 'buyer';

      // Create direct chat with deal reference
      const chatRoom = await ChatService.createDirectChat(
        currentUserId,
        otherUserId,
        propertyId,
        dealId // Read-only reference
      );

      // Send system message about deal context
      await ChatService.sendMessage(
        chatRoom.id,
        'system',
        `Deal chat created for ${dealType} deal ${dealId}. This chat is for communication only - deal actions must be performed in the deal interface.`,
        'system'
      );

      return {
        success: true,
        chatRoomId: chatRoom.id,
        isNewChat: true
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to open deal chat'
      };
    }
  }

  // Create group chat for property (multiple interested parties)
  static async createPropertyGroupChat(
    creatorUserId: string,
    propertyId: string,
    participantUserIds: string[],
    groupName?: string
  ): Promise<ChatEntryResult> {
    try {
      const chatName = groupName || `Property ${propertyId} Discussion`;

      const chatRoom = await ChatService.createGroupChat(
        creatorUserId,
        chatName,
        participantUserIds,
        propertyId
      );

      // Send system message about property group context
      await ChatService.sendMessage(
        chatRoom.id,
        'system',
        `Property group chat created for ${propertyId}`,
        'system'
      );

      return {
        success: true,
        chatRoomId: chatRoom.id,
        isNewChat: true
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create property group chat'
      };
    }
  }

  // Get chat entry button configuration for property
  static getPropertyChatButtonConfig(
    currentUserId: string,
    propertyOwnerId: string,
    currentUserRole: string,
    propertyOwnerRole: string
  ): {
    showButton: boolean;
    buttonText: string;
    buttonType: 'direct' | 'group';
  } {
    // Don't show chat button if user is the property owner
    if (currentUserId === propertyOwnerId) {
      return {
        showButton: false,
        buttonText: '',
        buttonType: 'direct'
      };
    }

    // Configure button based on roles
    let buttonText = 'Chat with ';
    switch (propertyOwnerRole) {
      case 'agent':
        buttonText += 'Agent';
        break;
      case 'seller':
        buttonText += 'Seller';
        break;
      case 'landlord':
        buttonText += 'Landlord';
        break;
      default:
        buttonText += 'Owner';
    }

    return {
      showButton: true,
      buttonText,
      buttonType: 'direct'
    };
  }

  // Get chat entry button configuration for deal
  static getDealChatButtonConfig(
    currentUserId: string,
    buyerId: string,
    sellerId: string,
    dealState: string
  ): {
    showButton: boolean;
    buttonText: string;
    warningText?: string;
  } {
    // Only show for deal participants
    const isParticipant = currentUserId === buyerId || currentUserId === sellerId;
    
    if (!isParticipant) {
      return {
        showButton: false,
        buttonText: ''
      };
    }

    return {
      showButton: true,
      buttonText: 'Open Deal Chat',
      warningText: 'This chat is for communication only. Deal actions must be performed in the deal interface.'
    };
  }

  // Private helper methods
  private static async findPropertyChat(
    userId1: string,
    userId2: string,
    propertyId: string
  ): Promise<ChatRoom | null> {
    // Mock implementation - would query Appwrite for existing property chat
    // Query: type=direct AND participants=[userId1,userId2] AND propertyId=propertyId
    return null;
  }

  private static async findDealChat(dealId: string): Promise<ChatRoom | null> {
    // Mock implementation - would query Appwrite for existing deal chat
    // Query: dealId=dealId
    return null;
  }

  // Validate chat permissions
  static canUserAccessChat(
    userId: string,
    chatRoom: ChatRoom,
    userRole: string
  ): boolean {
    // Basic permission check - user must be participant
    // In real implementation, would check ChatParticipant table
    return true; // Mock - always allow for now
  }

  // Check if deal chat should be read-only
  static isDealChatReadOnly(dealState: string): boolean {
    // Deal chats are never read-only for messaging
    // But they cannot perform deal state changes
    return false;
  }
}