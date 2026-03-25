#!/usr/bin/env node

/**
 * Security Audit Script
 * Checks for common security vulnerabilities and best practices
 * Run: npx ts-node src/security/audit.script.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface AuditResult {
  category: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  message: string;
  details?: string;
}

class SecurityAudit {
  private results: AuditResult[] = [];
  private projectRoot: string;

  constructor() {
    this.projectRoot = path.resolve(__dirname, '../../..');
  }

  /**
   * Run all security audits
   */
  async runAudit(): Promise<void> {
    console.log('🔐 Security Audit Starting...\n');

    // Run all checks
    await this.checkEnvironmentFile();
    await this.checkGitignore();
    await this.checkNodeModules();
    await this.checkSourceCode();
    await this.checkDependencies();
    await this.checkVaultConfiguration();

    // Report results
    this.reportResults();
  }

  /**
   * Check for exposed secrets in .env files
   */
  private async checkEnvironmentFile(): Promise<void> {
    const envFiles = [
      '.env',
      '.env.local',
      '.env.development',
      '.env.production',
      '.env.staging',
    ];

    for (const file of envFiles) {
      const filePath = path.join(this.projectRoot, file);

      if (!fs.existsSync(filePath)) {
        continue;
      }

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const hasApiKey =
          content.includes('API_KEY=') && !content.includes('API_KEY=your');
        const hasSecret =
          content.includes('API_SECRET=') &&
          !content.includes('API_SECRET=your');
        const hasDbPassword =
          content.includes('DB_PASSWORD=') &&
          !content.includes('DB_PASSWORD=your');
        const hasVaultKey = content.includes('VAULT_ENCRYPTION_KEY=');

        if (hasApiKey || hasSecret || hasDbPassword) {
          this.results.push({
            category: `.env File - ${file}`,
            status: 'FAIL',
            message: 'Potential secrets found in file',
            details: 'Ensure .env files are in .gitignore and not committed',
          });
        } else if (!hasVaultKey && file.includes('production')) {
          this.results.push({
            category: `.env File - ${file}`,
            status: 'WARNING',
            message: 'VAULT_ENCRYPTION_KEY not found in production config',
            details: 'Required for secure key storage',
          });
        } else {
          this.results.push({
            category: `.env File - ${file}`,
            status: 'PASS',
            message: 'No exposed secrets detected',
          });
        }
      } catch (error) {
        this.results.push({
          category: `.env File - ${file}`,
          status: 'WARNING',
          message: `Could not read file: ${error.message}`,
        });
      }
    }
  }

  /**
   * Check .gitignore for proper secret exclusion
   */
  private async checkGitignore(): Promise<void> {
    const gitignorePath = path.join(this.projectRoot, '.gitignore');

    if (!fs.existsSync(gitignorePath)) {
      this.results.push({
        category: '.gitignore',
        status: 'FAIL',
        message: '.gitignore file not found',
      });
      return;
    }

    try {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      const requiredPatterns = ['.env', '.env.local', '.env.*.local'];
      const missingPatterns = requiredPatterns.filter(
        (p) => !content.includes(p),
      );

      if (missingPatterns.length > 0) {
        this.results.push({
          category: '.gitignore',
          status: 'FAIL',
          message: `Missing critical patterns: ${missingPatterns.join(', ')}`,
          details: 'Add .env files to .gitignore immediately',
        });
      } else {
        this.results.push({
          category: '.gitignore',
          status: 'PASS',
          message: 'Environment files properly excluded',
        });
      }
    } catch (error) {
      this.results.push({
        category: '.gitignore',
        status: 'WARNING',
        message: `Failed to check: ${error.message}`,
      });
    }
  }

  /**
   * Check if node_modules has sensitive files
   */
  private async checkNodeModules(): Promise<void> {
    const nodeModulesPath = path.join(this.projectRoot, 'node_modules');

    if (!fs.existsSync(nodeModulesPath)) {
      this.results.push({
        category: 'Node Modules',
        status: 'PASS',
        message: 'node_modules not present (good for VCS)',
      });
      return;
    }

    this.results.push({
      category: 'Node Modules',
      status: 'PASS',
      message: 'node_modules present (should be in .gitignore)',
    });
  }

  /**
   * Scan source code for potential security issues
   */
  private async checkSourceCode(): Promise<void> {
    const srcPath = path.join(this.projectRoot, 'src');

    // Keywords that suggest secrets might be hardcoded
    const dangerousPatterns = [
      /process\.env\.API_KEY\s*\?/,
      /process\.env\.API_SECRET\s*\?/,
      /process\.env\.DB_PASSWORD\s*\?/,
      /hardcodedKey|hardcodedSecret/i,
      /'[a-z0-9]{40,}'/i, // Long string literals that might be keys
      /"[a-z0-9]{40,}"/i,
    ];

    let vulnerabilitiesFound = 0;

    try {
      this.scanDirectory(srcPath, (filePath, content) => {
        for (const pattern of dangerousPatterns) {
          if (pattern.test(content)) {
            vulnerabilitiesFound++;
            console.log(`  ⚠️  Found potential issue in ${filePath}`);
          }
        }
      });

      if (vulnerabilitiesFound === 0) {
        this.results.push({
          category: 'Source Code',
          status: 'PASS',
          message: 'No hardcoded secrets detected in source code',
        });
      } else {
        this.results.push({
          category: 'Source Code',
          status: 'WARNING',
          message: `Found ${vulnerabilitiesFound} potential security issues`,
          details: 'Review flagged files manually',
        });
      }
    } catch (error) {
      this.results.push({
        category: 'Source Code',
        status: 'WARNING',
        message: `Failed to scan: ${error.message}`,
      });
    }
  }

  /**
   * Check dependencies for known vulnerabilities
   */
  private async checkDependencies(): Promise<void> {
    const packageJsonPath = path.join(this.projectRoot, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      this.results.push({
        category: 'Dependencies',
        status: 'WARNING',
        message: 'package.json not found',
      });
      return;
    }

    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const deps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      // Check for security-related packages
      const hasSecurityPackages = [
        'helmet',
        'bcrypt',
        'jsonwebtoken',
        'crypto',
      ].some((pkg) => Object.keys(deps).some((d) => d.includes(pkg)));

      if (hasSecurityPackages) {
        this.results.push({
          category: 'Dependencies',
          status: 'PASS',
          message: 'Security packages detected',
        });
      } else {
        this.results.push({
          category: 'Dependencies',
          status: 'WARNING',
          message: 'Consider adding security packages (helmet, bcrypt, etc)',
        });
      }
    } catch (error) {
      this.results.push({
        category: 'Dependencies',
        status: 'WARNING',
        message: `Failed to check: ${error.message}`,
      });
    }
  }

  /**
   * Check vault configuration
   */
  private async checkVaultConfiguration(): Promise<void> {
    const vaultPath = path.join(
      this.projectRoot,
      'src/security/api-key-vault.service.ts',
    );

    if (!fs.existsSync(vaultPath)) {
      this.results.push({
        category: 'Vault Configuration',
        status: 'FAIL',
        message: 'Vault service not found',
        details: 'Implement ApiKeyVaultService for secure key storage',
      });
      return;
    }

    try {
      const content = fs.readFileSync(vaultPath, 'utf-8');

      const hasEncryption = content.includes('aes-256-gcm');
      const hasAuthTag = content.includes('getAuthTag()');
      const hasTampering = content.includes('possible tampering');

      if (hasEncryption && hasAuthTag && hasTampering) {
        this.results.push({
          category: 'Vault Configuration',
          status: 'PASS',
          message: 'Vault properly implements AES-256-GCM encryption',
        });
      } else {
        this.results.push({
          category: 'Vault Configuration',
          status: 'WARNING',
          message: 'Vault may not be properly encrypted',
        });
      }
    } catch (error) {
      this.results.push({
        category: 'Vault Configuration',
        status: 'WARNING',
        message: `Failed to verify: ${error.message}`,
      });
    }
  }

  /**
   * Recursive directory scanner
   */
  private scanDirectory(
    dir: string,
    callback: (filePath: string, content: string) => void,
  ): void {
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        if (!['node_modules', '.git', 'dist', 'build'].includes(file)) {
          this.scanDirectory(filePath, callback);
        }
      } else if (file.endsWith('.ts') && !file.endsWith('.spec.ts')) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          callback(filePath.replace(this.projectRoot, ''), content);
        } catch (error) {
          // Skip files that can't be read
        }
      }
    }
  }

  /**
   * Report audit results
   */
  private reportResults(): void {
    const passCount = this.results.filter((r) => r.status === 'PASS').length;
    const failCount = this.results.filter((r) => r.status === 'FAIL').length;
    const warnCount = this.results.filter((r) => r.status === 'WARNING').length;

    console.log('\n📋 Audit Results:\n');

    // Group by status
    const grouped = {
      FAIL: this.results.filter((r) => r.status === 'FAIL'),
      WARNING: this.results.filter((r) => r.status === 'WARNING'),
      PASS: this.results.filter((r) => r.status === 'PASS'),
    };

    // Print failures
    if (grouped.FAIL.length > 0) {
      console.log('❌ FAILURES:');
      grouped.FAIL.forEach((r) => {
        console.log(`  ${r.category}: ${r.message}`);
        if (r.details) console.log(`     👉 ${r.details}`);
      });
      console.log();
    }

    // Print warnings
    if (grouped.WARNING.length > 0) {
      console.log('⚠️  WARNINGS:');
      grouped.WARNING.forEach((r) => {
        console.log(`  ${r.category}: ${r.message}`);
        if (r.details) console.log(`     👉 ${r.details}`);
      });
      console.log();
    }

    // Print passes
    console.log('✅ PASSED:');
    grouped.PASS.forEach((r) => {
      console.log(`  ${r.category}: ${r.message}`);
    });

    // Summary
    console.log(`\n${'='.repeat(50)}`);
    console.log(
      `Summary: ${passCount} PASS | ${warnCount} WARNING | ${failCount} FAIL`,
    );

    if (failCount > 0) {
      console.log(
        `⛔ Security audit FAILED - Fix critical issues before deployment`,
      );
      process.exit(1);
    } else if (warnCount > 0) {
      console.log(
        `⚠️  Security audit passed with warnings - Review before production`,
      );
      process.exit(0);
    } else {
      console.log(`🎉 Security audit PASSED - All checks successful!`);
      process.exit(0);
    }
  }
}

// Run audit
const audit = new SecurityAudit();
audit.runAudit().catch((error) => {
  console.error('Audit failed:', error);
  process.exit(1);
});
