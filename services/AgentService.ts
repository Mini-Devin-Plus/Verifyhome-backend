import { Agent, Property } from '../types/database';

// Mock agent data
const mockAgents: Agent[] = [
  {
    id: 'agent-1',
    name: 'David Wilson',
    email: 'david@premiumrealty.com',
    phone: '+234-901-234-5678',
    role: 'Agent',
    verificationStatus: 'Verified',
    officeAddress: '15 Victoria Island, Lagos',
    cacNumber: 'RC-123456',
    trustLevel: 'Gold',
    yearsActive: 8,
    totalProperties: 45,
    averageRating: 4.8,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
  },
  {
    id: 'agent-2',
    name: 'Grace Okafor',
    email: 'grace@trusthomes.ng',
    phone: '+234-902-345-6789',
    role: 'Agent',
    verificationStatus: 'Verified',
    officeAddress: '22 Ikoyi Road, Lagos',
    cacNumber: 'RC-789012',
    trustLevel: 'Silver',
    yearsActive: 5,
    totalProperties: 28,
    averageRating: 4.5,
    createdAt: new Date('2024-01-05'),
    updatedAt: new Date('2024-01-05')
  },
  {
    id: 'agent-3',
    name: 'Ahmed Hassan',
    email: 'ahmed@quickhomes.com',
    phone: '+234-903-456-7890',
    role: 'Agent',
    verificationStatus: 'Verified',
    officeAddress: '8 Garki District, Abuja',
    cacNumber: 'RC-345678',
    trustLevel: 'Bronze',
    yearsActive: 2,
    totalProperties: 12,
    averageRating: 4.2,
    createdAt: new Date('2024-01-10'),
    updatedAt: new Date('2024-01-10')
  },
  {
    id: '4',
    name: 'Jane Seller',
    email: 'jane@seller.com',
    phone: '+234-804-567-8901',
    role: 'Seller',
    verificationStatus: 'Verified',
    officeAddress: 'Private Seller - Lagos',
    cacNumber: 'N/A',
    trustLevel: 'Silver',
    yearsActive: 3,
    totalProperties: 8,
    averageRating: 4.3,
    createdAt: new Date('2024-01-12'),
    updatedAt: new Date('2024-01-12')
  }
];

// Mock properties for agents
const mockAgentProperties: Property[] = [
  {
    id: 'prop-1',
    title: '3 Bedroom Apartment',
    type: 'rent',
    price: 2500000,
    location: 'Victoria Island, Lagos',
    size: '120 sqm',
    bedrooms: 3,
    bathrooms: 2,
    verifiedStatus: 'Verified',
    agentId: 'agent-1',
    description: 'Luxury apartment with ocean view',
    images: ['image1.jpg', 'image2.jpg'],
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15')
  },
  {
    id: 'prop-2',
    title: '4 Bedroom House',
    type: 'sale',
    price: 85000000,
    location: 'Ikoyi, Lagos',
    size: '200 sqm',
    bedrooms: 4,
    bathrooms: 3,
    verifiedStatus: 'Verified',
    agentId: 'agent-2',
    description: 'Modern family home',
    images: ['image3.jpg', 'image4.jpg'],
    createdAt: new Date('2024-01-20'),
    updatedAt: new Date('2024-01-20')
  }
];

export class AgentService {
  // Returns all agents
  static async getAgents(): Promise<Agent[]> {
    return Promise.resolve(mockAgents);
  }

  // Returns agent by ID
  static async getAgentById(id: string): Promise<Agent | null> {
    const agent = mockAgents.find(a => a.id === id);
    return Promise.resolve(agent || null);
  }

  // Returns agents filtered by trust level
  static async getAgentsByTrustLevel(level: 'Bronze' | 'Silver' | 'Gold'): Promise<Agent[]> {
    const agents = mockAgents.filter(a => a.trustLevel === level);
    return Promise.resolve(agents);
  }

  // Returns all properties belonging to the agent
  static async getAgentProperties(agentId: string): Promise<Property[]> {
    const properties = mockAgentProperties.filter(p => p.agentId === agentId);
    return Promise.resolve(properties);
  }
}