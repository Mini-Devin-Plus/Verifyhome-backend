import { FeatureFlagService } from './FeatureFlagService';
import { EventLogger } from './EventLogger';

export class KillSwitchTestService {
  private static testResults: Record<string, boolean> = {};

  static async testAllKillSwitches(): Promise<{
    success: boolean;
    results: Record<string, boolean>;
    errors: string[];
  }> {
    const results: Record<string, boolean> = {};
    const errors: string[] = [];

    try {
      // Test global emergency kill switch
      results.globalEmergency = await this.testGlobalEmergencyKillSwitch();
      
      // Test calls kill switch
      results.callsKillSwitch = await this.testCallsKillSwitch();
      
      // Test chat kill switch
      results.chatKillSwitch = await this.testChatKillSwitch();
      
      // Test deal creation kill switch
      results.dealCreationKillSwitch = await this.testDealCreationKillSwitch();

      this.testResults = results;
      
      const allPassed = Object.values(results).every(result => result === true);
      
      await EventLogger.logEvent(
        'kill_switch_test_completed',
        'system',
        allPassed ? 'info' : 'warning',
        { 
          allPassed,
          results,
          errorCount: errors.length
        }
      );

      return {
        success: allPassed,
        results,
        errors
      };
    } catch (error) {
      errors.push(`Kill switch test failed: ${error}`);
      return {
        success: false,
        results,
        errors
      };
    }
  }

  private static async testGlobalEmergencyKillSwitch(): Promise<boolean> {
    try {
      // Test activating global emergency
      FeatureFlagService.emergencyShutdown('SUPER_ADMIN');
      
      // Verify all features are disabled
      const chatCheck = FeatureFlagService.validateFeatureAccess('chat');
      const callsCheck = FeatureFlagService.validateFeatureAccess('calls');
      const dealsCheck = FeatureFlagService.validateFeatureAccess('deal_creation');
      
      const emergencyWorking = !chatCheck.allowed && !callsCheck.allowed && !dealsCheck.allowed;
      
      // Deactivate for cleanup
      FeatureFlagService.deactivateKillSwitch('globalEmergency', 'SUPER_ADMIN');
      
      return emergencyWorking;
    } catch (error) {
      console.error('Global emergency kill switch test failed:', error);
      return false;
    }
  }

  private static async testCallsKillSwitch(): Promise<boolean> {
    try {
      // Test activating calls kill switch
      FeatureFlagService.activateKillSwitch('calls', 'SUPER_ADMIN');
      
      // Verify calls are disabled
      const callsCheck = FeatureFlagService.validateFeatureAccess('calls');
      const callsDisabled = !callsCheck.allowed;
      
      // Verify other features still work
      const chatCheck = FeatureFlagService.validateFeatureAccess('chat');
      const otherFeaturesWork = chatCheck.allowed;
      
      // Deactivate for cleanup
      FeatureFlagService.deactivateKillSwitch('calls', 'SUPER_ADMIN');
      
      return callsDisabled && otherFeaturesWork;
    } catch (error) {
      console.error('Calls kill switch test failed:', error);
      return false;
    }
  }

  private static async testChatKillSwitch(): Promise<boolean> {
    try {
      // Test activating chat kill switch
      FeatureFlagService.activateKillSwitch('chat', 'SUPER_ADMIN');
      
      // Verify chat is disabled
      const chatCheck = FeatureFlagService.validateFeatureAccess('chat');
      const chatDisabled = !chatCheck.allowed;
      
      // Verify other features still work
      const callsCheck = FeatureFlagService.validateFeatureAccess('calls');
      const otherFeaturesWork = callsCheck.allowed;
      
      // Deactivate for cleanup
      FeatureFlagService.deactivateKillSwitch('chat', 'SUPER_ADMIN');
      
      return chatDisabled && otherFeaturesWork;
    } catch (error) {
      console.error('Chat kill switch test failed:', error);
      return false;
    }
  }

  private static async testDealCreationKillSwitch(): Promise<boolean> {
    try {
      // Test activating deal creation kill switch
      FeatureFlagService.activateKillSwitch('dealCreation', 'SUPER_ADMIN');
      
      // Verify deal creation is disabled
      const dealsCheck = FeatureFlagService.validateFeatureAccess('deal_creation');
      const dealsDisabled = !dealsCheck.allowed;
      
      // Verify other features still work
      const chatCheck = FeatureFlagService.validateFeatureAccess('chat');
      const otherFeaturesWork = chatCheck.allowed;
      
      // Deactivate for cleanup
      FeatureFlagService.deactivateKillSwitch('dealCreation', 'SUPER_ADMIN');
      
      return dealsDisabled && otherFeaturesWork;
    } catch (error) {
      console.error('Deal creation kill switch test failed:', error);
      return false;
    }
  }

  static getLastTestResults(): Record<string, boolean> {
    return { ...this.testResults };
  }

  static async testFeatureToggle(feature: string): Promise<boolean> {
    try {
      // Get current state
      const currentFlags = FeatureFlagService.getAllFeatureStates();
      const initialState = currentFlags[feature];
      
      // Toggle feature off
      FeatureFlagService.setFeatureEnabled(feature, false, 'SUPER_ADMIN');
      const disabledCheck = FeatureFlagService.validateFeatureAccess(feature);
      
      // Toggle feature back on
      FeatureFlagService.setFeatureEnabled(feature, true, 'SUPER_ADMIN');
      const enabledCheck = FeatureFlagService.validateFeatureAccess(feature);
      
      // Restore original state
      FeatureFlagService.setFeatureEnabled(feature, initialState, 'SUPER_ADMIN');
      
      return !disabledCheck.allowed && enabledCheck.allowed;
    } catch (error) {
      console.error(`Feature toggle test failed for ${feature}:`, error);
      return false;
    }
  }

  static async validateMVPFeatureDefaults(): Promise<{
    success: boolean;
    incorrectDefaults: string[];
  }> {
    const flags = FeatureFlagService.getFlags();
    const incorrectDefaults: string[] = [];

    // Check that optional features are OFF by default
    const optionalFeatures = [
      'screenSharing',
      'callRecording', 
      'presentationMode',
      'enhancedModeration',
      'schedulingReminders',
      'emailOTPFallback',
      'paystackFallback'
    ];

    optionalFeatures.forEach(feature => {
      if (flags[feature as keyof typeof flags]) {
        incorrectDefaults.push(feature);
      }
    });

    // Check that core features are ON by default
    const coreFeatures = [
      'escrowDeals',
      'standardDeals',
      'chat',
      'audioCalls',
      'videoCalls',
      'callScheduling'
    ];

    coreFeatures.forEach(feature => {
      if (!flags[feature as keyof typeof flags]) {
        incorrectDefaults.push(feature);
      }
    });

    // Check that kill switches are OFF by default
    Object.entries(flags.killSwitches).forEach(([killSwitch, active]) => {
      if (active) {
        incorrectDefaults.push(`killSwitch_${killSwitch}`);
      }
    });

    await EventLogger.logEvent(
      'mvp_defaults_validated',
      'system',
      incorrectDefaults.length > 0 ? 'error' : 'info',
      { 
        incorrectDefaults,
        totalChecked: optionalFeatures.length + coreFeatures.length + Object.keys(flags.killSwitches).length
      }
    );

    return {
      success: incorrectDefaults.length === 0,
      incorrectDefaults
    };
  }
}