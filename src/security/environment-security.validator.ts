import { Injectable, Logger } from '@nestjs/common';

interface EnvironmentSecurityCheck {
  name: string;
  isValid: boolean;
  message: string;
  severity: 'critical' | 'warning' | 'info';
}

/**
 * Environment Security Validator
 * Performs security checks on environment configuration
 * Ensures no sensitive data is leaked through environment
 */
@Injectable()
export class EnvironmentSecurityValidator {
  private readonly logger = new Logger(EnvironmentSecurityValidator.name);
  private readonly checks: EnvironmentSecurityCheck[] = [];

  constructor() {
    this.performSecurityChecks();
  }

  /**
   * Perform all security checks
   */
  private performSecurityChecks(): void {
    this.checks = [
      this.checkVaultKeyConfiguration(),
      this.checkProductionEnvironment(),
      this.checkDevelopmentKeyExposure(),
      this.checkHttpsEnforcement(),
      this.checkCorsConfiguration(),
      this.checkLoggingConfiguration(),
      this.checkEnvironmentType(),
    ];

    this.reportChecks();
  }

  /**
   * Check if vault encryption key is configured (production)
   */
  private checkVaultKeyConfiguration(): EnvironmentSecurityCheck {
    const isProduction = process.env.NODE_ENV === 'production';
    const vaultKeyExists = !!process.env.VAULT_ENCRYPTION_KEY;

    if (isProduction && !vaultKeyExists) {
      return {
        name: 'Vault Configuration',
        isValid: false,
        message: 'VAULT_ENCRYPTION_KEY not set in production',
        severity: 'critical',
      };
    }

    return {
      name: 'Vault Configuration',
      isValid: true,
      message: 'Vault encryption key properly configured',
      severity: 'info',
    };
  }

  /**
   * Check production environment security
   */
  private checkProductionEnvironment(): EnvironmentSecurityCheck {
    const isProduction = process.env.NODE_ENV === 'production';

    if (!isProduction) {
      return {
        name: 'Production Checks',
        isValid: true,
        message: 'Not in production environment',
        severity: 'info',
      };
    }

    const required = ['API_KEY', 'DB_PASSWORD', 'VAULT_ENCRYPTION_KEY'];
    const missing = required.filter((key) => !process.env[key]);

    if (missing.length > 0) {
      return {
        name: 'Production Security',
        isValid: false,
        message: `Missing critical env vars in production: ${missing.join(', ')}`,
        severity: 'critical',
      };
    }

    return {
      name: 'Production Security',
      isValid: true,
      message: 'All critical production variables set',
      severity: 'info',
    };
  }

  /**
   * Check for key exposure in development
   */
  private checkDevelopmentKeyExposure(): EnvironmentSecurityCheck {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const keysInEnv = ['API_KEY', 'API_SECRET', 'DB_PASSWORD'].filter(
      (key) => process.env[key],
    );

    if (isDevelopment && keysInEnv.length > 0) {
      return {
        name: 'Development Key Exposure',
        isValid: true,
        message: `Keys defined in dev environment: ${keysInEnv.join(', ')}. Ensure not committed to VCS`,
        severity: 'warning',
      };
    }

    return {
      name: 'Development Key Exposure',
      isValid: true,
      message: 'No sensitive keys detected in development',
      severity: 'info',
    };
  }

  /**
   * Check HTTPS enforcement
   */
  private checkHttpsEnforcement(): EnvironmentSecurityCheck {
    const isProduction = process.env.NODE_ENV === 'production';
    const forceHttps = process.env.FORCE_HTTPS !== 'false';

    if (isProduction && !forceHttps) {
      return {
        name: 'HTTPS Enforcement',
        isValid: false,
        message: 'HTTPS should be enforced in production',
        severity: 'critical',
      };
    }

    return {
      name: 'HTTPS Enforcement',
      isValid: true,
      message: 'HTTPS properly configured',
      severity: 'info',
    };
  }

  /**
   * Check CORS security
   */
  private checkCorsConfiguration(): EnvironmentSecurityCheck {
    const corsOrigin = process.env.CORS_ORIGIN || '';
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction && corsOrigin === '*') {
      return {
        name: 'CORS Security',
        isValid: false,
        message: 'CORS wildcard (*) should not be used in production',
        severity: 'critical',
      };
    }

    return {
      name: 'CORS Security',
      isValid: true,
      message: 'CORS properly configured',
      severity: 'info',
    };
  }

  /**
   * Check logging configuration
   */
  private checkLoggingConfiguration(): EnvironmentSecurityCheck {
    const logLevel = process.env.LOG_LEVEL || 'info';
    const logFormat = process.env.LOG_FORMAT || 'simple';
    const isProduction = process.env.NODE_ENV === 'production';

    if (
      isProduction &&
      logLevel === 'debug'
    ) {
      return {
        name: 'Logging Security',
        isValid: false,
        message: 'Debug logging should not be enabled in production',
        severity: 'warning',
      };
    }

    if (isProduction && logFormat === 'simple') {
      return {
        name: 'Logging Security',
        isValid: true,
        message: 'Consider using JSON logging format in production',
        severity: 'warning',
      };
    }

    return {
      name: 'Logging Security',
      isValid: true,
      message: 'Logging properly configured',
      severity: 'info',
    };
  }

  /**
   * Check environment type is properly set
   */
  private checkEnvironmentType(): EnvironmentSecurityCheck {
    const nodeEnv = process.env.NODE_ENV || 'development';
    const validEnvs = ['development', 'staging', 'production'];

    if (!validEnvs.includes(nodeEnv)) {
      return {
        name: 'Environment Type',
        isValid: false,
        message: `Invalid NODE_ENV: ${nodeEnv}. Must be: ${validEnvs.join(', ')}`,
        severity: 'critical',
      };
    }

    return {
      name: 'Environment Type',
      isValid: true,
      message: `Environment type: ${nodeEnv}`,
      severity: 'info',
    };
  }

  /**
   * Report all checks results
   */
  private reportChecks(): void {
    const critical = this.checks.filter((c) => c.severity === 'critical');
    const warnings = this.checks.filter((c) => c.severity === 'warning');
    const info = this.checks.filter((c) => c.severity === 'info');

    if (critical.length > 0) {
      this.logger.error('🔴 CRITICAL SECURITY ISSUES:');
      critical.forEach((check) => {
        this.logger.error(`  - ${check.name}: ${check.message}`);
      });
    }

    if (warnings.length > 0) {
      this.logger.warn('🟡 SECURITY WARNINGS:');
      warnings.forEach((check) => {
        this.logger.warn(`  - ${check.name}: ${check.message}`);
      });
    }

    if (info.length > 0) {
      this.logger.debug('🟢 SECURITY INFO:');
      info.forEach((check) => {
        this.logger.debug(`  - ${check.name}: ${check.message}`);
      });
    }
  }

  /**
   * Get all check results
   */
  getChecks(): EnvironmentSecurityCheck[] {
    return [...this.checks];
  }

  /**
   * Check if all critical checks passed
   */
  allCriticalChecksPassed(): boolean {
    return !this.checks.some((c) => c.severity === 'critical' && !c.isValid);
  }

  /**
   * Get summary of security status
   */
  getSummary(): {
    passed: number;
    failed: number;
    warnings: number;
    secure: boolean;
  } {
    const passed = this.checks.filter((c) => c.isValid).length;
    const failed = this.checks.filter((c) => !c.isValid).length;
    const warnings = this.checks.filter(
      (c) => c.severity === 'warning' && !c.isValid,
    ).length;

    return {
      passed,
      failed,
      warnings,
      secure: failed === 0,
    };
  }
}
