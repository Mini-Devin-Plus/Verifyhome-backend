export class AdminRoleGuard {
  private static roleHierarchy = {
    'ADMIN': 1,
    'SENIOR_ADMIN': 2,
    'SUPER_ADMIN': 3
  };

  static isAdmin(userRole: string): boolean {
    return userRole in this.roleHierarchy;
  }

  static hasMinimumRole(userRole: string, requiredRole: string): boolean {
    const userLevel = this.roleHierarchy[userRole as keyof typeof this.roleHierarchy] || 0;
    const requiredLevel = this.roleHierarchy[requiredRole as keyof typeof this.roleHierarchy] || 999;
    return userLevel >= requiredLevel;
  }

  static canAccessFeature(userRole: string, feature: string): boolean {
    const permissions = {
      'user_management': 'ADMIN',
      'deal_management': 'ADMIN', 
      'call_chat_management': 'ADMIN',
      'payment_monitor': 'SENIOR_ADMIN',
      'security_fraud': 'SENIOR_ADMIN',
      'feature_control': 'SUPER_ADMIN',
      'emergency_shutdown': 'SUPER_ADMIN'
    };

    const requiredRole = permissions[feature as keyof typeof permissions];
    return requiredRole ? this.hasMinimumRole(userRole, requiredRole) : false;
  }

  static getAccessibleFeatures(userRole: string): string[] {
    const allFeatures = [
      'user_management',
      'deal_management', 
      'call_chat_management',
      'payment_monitor',
      'security_fraud',
      'feature_control'
    ];

    return allFeatures.filter(feature => this.canAccessFeature(userRole, feature));
  }
}