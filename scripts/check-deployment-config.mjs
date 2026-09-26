import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const requiredTemplates = [
  '.env.example',
  '.env.staging.example',
  '.env.production.example',
];

const sensitiveName = /(PASSWORD|SECRET|TOKEN|PRIVATE[_-]?KEY|API[_-]?KEY|CREDENTIAL)/i;
const placeholder = /^(?:your[_-]|<|change[_-]?me$|changeme$|placeholder$|generate-with-|your[_-]?infura)/i;

export function findDeploymentConfigIssues(trackedFiles, templates) {
  const issues = [];
  const trackedEnvFiles = trackedFiles.filter((file) => {
    const name = basename(file);
    return /^\.env(?:\.|$)/.test(name) && !name.endsWith('.example');
  });

  if (trackedEnvFiles.length) {
    issues.push(`Tracked environment files are not allowed: ${trackedEnvFiles.join(', ')}`);
  }

  for (const templatePath of requiredTemplates) {
    if (!(templatePath in templates)) {
      issues.push(`Missing versioned deployment template: ${templatePath}`);
    }
  }

  for (const [templatePath, content] of Object.entries(templates)) {
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || !sensitiveName.test(match[1])) continue;
      const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
      if (value && !/^(?:true|false)$/i.test(value) && !placeholder.test(value)) {
        issues.push(`Sensitive value must be a placeholder in ${templatePath}: ${match[1]}`);
      }
    }
  }

  return issues;
}

function run() {
  const trackedFiles = execFileSync(
    'git',
    ['ls-files', '-z', '--', '.env', '.env.*', '**/.env', '**/.env.*'],
    { encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean);
  const templates = Object.fromEntries(
    trackedFiles
      .filter((file) => requiredTemplates.includes(file))
      .map((file) => [file, readFileSync(file, 'utf8')]),
  );
  const issues = findDeploymentConfigIssues(trackedFiles, templates);

  if (issues.length) {
    console.error('Deployment configuration check failed:');
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
    return;
  }

  console.log('Deployment configuration is versioned without tracked secrets.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) run();
