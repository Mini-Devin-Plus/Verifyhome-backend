import { EventLogger } from './EventLogger';
import { EarlyWarningService } from './EarlyWarningService';
import { FeatureFlagService } from './FeatureFlagService';

export class ObservabilityService {
  private static initialized = false;
  private static warningCheckInterval: NodeJS.Timeout | null = null;

  static initialize(): void {
    if (this.initialized) return;

    try {
      // Check if observability is enabled via feature flags
      const featureCheck = FeatureFlagService.validateFeatureAccess('observability');
      if (!featureCheck.allowed) {
        console.log('[OBSERVABILITY] Disabled via feature flag');
        EventLogger.setEnabled(false);
        return;
      }

      // Enable event logging
      EventLogger.setEnabled(true);

      // Log system startup
      EventLogger.logEvent(
        'system_startup',
        'system',
        'info',
        { 
          timestamp: new Date().toISOString(),
          environment: FeatureFlagService.getEnvironment()
        }
      );

      // Start periodic warning checks (every 5 minutes)
      this.warningCheckInterval = setInterval(() => {
        this.performWarningCheck();
      }, 5 * 60 * 1000);

      // Perform initial warning check
      this.performWarningCheck();

      // Setup memory cleanup (every hour)
      setInterval(() => {
        EventLogger.clearOldEvents(30); // Keep 30 days
      }, 60 * 60 * 1000);

      this.initialized = true;
      console.log('[OBSERVABILITY] System initialized successfully');
    } catch (error) {
      console.error('[OBSERVABILITY] Failed to initialize:', error);
      // Fail-safe: disable on error
      EventLogger.setEnabled(false);
    }
  }

  static shutdown(): void {
    if (!this.initialized) return;

    try {
      // Clear intervals
      if (this.warningCheckInterval) {
        clearInterval(this.warningCheckInterval);
        this.warningCheckInterval = null;
      }

      // Log system shutdown
      EventLogger.logEvent(
        'system_shutdown',
        'system',
        'info',
        { timestamp: new Date().toISOString() }
      );

      this.initialized = false;
      console.log('[OBSERVABILITY] System shutdown complete');
    } catch (error) {
      console.error('[OBSERVABILITY] Error during shutdown:', error);
    }
  }

  private static performWarningCheck(): void {
    try {
      const warnings = EarlyWarningService.checkAllThresholds();
      
      if (warnings.length > 0) {
        console.warn(`[OBSERVABILITY] ${warnings.length} active warnings detected`);
        
        // Log critical warnings
        const criticalWarnings = warnings.filter(w => w.threshold.severity === 'critical');
        if (criticalWarnings.length > 0) {
          EventLogger.logEvent(
            'critical_warnings_active',
            'system',
            'critical',
            { 
              warningCount: criticalWarnings.length,
              warnings: criticalWarnings.map(w => w.threshold.name)
            }
          );
        }
      }
    } catch (error) {
      console.error('[OBSERVABILITY] Warning check failed:', error);
    }
  }

  static getSystemStatus(): {
    initialized: boolean;
    eventLoggingEnabled: boolean;
    memoryUsage: { eventCount: number; memoryEstimate: string };
    lastWarningCheck: Date;
  } {
    return {
      initialized: this.initialized,
      eventLoggingEnabled: EventLogger['enabled'] || false,
      memoryUsage: EventLogger.getMemoryUsage(),
      lastWarningCheck: new Date() // Would track actual last check time
    };
  }

  // Manual trigger for testing
  static triggerWarningCheck(): void {
    this.performWarningCheck();
  }

  // Feature flag integration
  static setEnabled(enabled: boolean): void {
    EventLogger.setEnabled(enabled);
    
    if (enabled && !this.initialized) {
      this.initialize();
    } else if (!enabled && this.initialized) {
      this.shutdown();
    }
  }
}