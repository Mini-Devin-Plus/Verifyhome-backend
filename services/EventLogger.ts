export interface EventLog {
  id: string;
  type: string;
  category: 'auth' | 'deal' | 'chat' | 'call' | 'payment' | 'admin' | 'fraud' | 'system';
  severity: 'info' | 'warning' | 'error' | 'critical';
  timestamp: Date;
  metadata: Record<string, any>; // PII-free metadata only
  userId?: string; // Hashed/masked identifier
  sessionId?: string;
}

export class EventLogger {
  private static events: EventLog[] = [];
  private static readonly MAX_EVENTS = 10000;
  private static enabled = true;

  static setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  static async logEvent(
    type: string,
    category: EventLog['category'],
    severity: EventLog['severity'],
    metadata: Record<string, any> = {},
    userId?: string,
    sessionId?: string
  ): Promise<void> {
    if (!this.enabled) return;

    try {
      const event: EventLog = {
        id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        category,
        severity,
        timestamp: new Date(),
        metadata: this.sanitizeMetadata(metadata),
        userId: userId ? this.maskUserId(userId) : undefined,
        sessionId
      };

      this.events.push(event);

      // Maintain memory safety
      if (this.events.length > this.MAX_EVENTS) {
        this.events.splice(0, this.events.length - this.MAX_EVENTS);
      }

      // Console log for immediate visibility (production would use proper logging)
      if (severity === 'error' || severity === 'critical') {
        console.error('[EVENT LOG]', {
          type: event.type,
          category: event.category,
          severity: event.severity,
          timestamp: event.timestamp.toISOString()
        });
      }
    } catch (error) {
      // Fail-safe: logging failure must never break app
      console.warn('[EVENT LOGGER] Failed to log event:', error);
    }
  }

  static getEvents(
    limit: number = 100,
    category?: EventLog['category'],
    severity?: EventLog['severity'],
    startDate?: Date,
    endDate?: Date
  ): EventLog[] {
    let filtered = [...this.events];

    if (category) {
      filtered = filtered.filter(event => event.category === category);
    }

    if (severity) {
      filtered = filtered.filter(event => event.severity === severity);
    }

    if (startDate) {
      filtered = filtered.filter(event => event.timestamp >= startDate);
    }

    if (endDate) {
      filtered = filtered.filter(event => event.timestamp <= endDate);
    }

    return filtered
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  static getEventCounts(
    timeframe: 'hour' | 'day' | 'week' = 'day'
  ): Record<string, number> {
    const now = new Date();
    const cutoff = new Date();
    
    switch (timeframe) {
      case 'hour':
        cutoff.setHours(now.getHours() - 1);
        break;
      case 'day':
        cutoff.setDate(now.getDate() - 1);
        break;
      case 'week':
        cutoff.setDate(now.getDate() - 7);
        break;
    }

    const recentEvents = this.events.filter(event => event.timestamp >= cutoff);
    const counts: Record<string, number> = {};

    recentEvents.forEach(event => {
      const key = `${event.category}_${event.type}`;
      counts[key] = (counts[key] || 0) + 1;
    });

    return counts;
  }

  private static sanitizeMetadata(metadata: Record<string, any>): Record<string, any> {
    const sanitized = { ...metadata };
    
    // Remove PII fields
    const piiFields = ['phone', 'email', 'otp', 'password', 'token', 'paymentRef', 'accountNumber'];
    piiFields.forEach(field => {
      if (field in sanitized) {
        delete sanitized[field];
      }
    });

    // Mask sensitive fields
    if (sanitized.amount) {
      sanitized.amount = '[AMOUNT]';
    }

    return sanitized;
  }

  private static maskUserId(userId: string): string {
    if (userId.length <= 8) return userId;
    return `${userId.substring(0, 4)}***${userId.substring(userId.length - 4)}`;
  }

  // Memory management
  static clearOldEvents(daysToKeep: number = 30): void {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);
    
    this.events = this.events.filter(event => event.timestamp >= cutoff);
  }

  static getMemoryUsage(): { eventCount: number; memoryEstimate: string } {
    const eventCount = this.events.length;
    const memoryEstimate = `~${Math.round(eventCount * 0.5)}KB`; // Rough estimate
    
    return { eventCount, memoryEstimate };
  }
}