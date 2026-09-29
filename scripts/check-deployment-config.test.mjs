import test from 'node:test';
import assert from 'node:assert/strict';
import { findDeploymentConfigIssues } from './check-deployment-config.mjs';

const templates = {
  '.env.example': 'DB_PASSWORD=your_password_here\nAPI_KEY=your_api_key_here',
  '.env.staging.example': 'DB_PASSWORD=your_staging_password_here',
  '.env.production.example': 'API_SECRET=your_production_api_secret_here',
};

test('accepts tracked example templates with placeholders and no runtime env files', () => {
  assert.deepEqual(
    findDeploymentConfigIssues(Object.keys(templates), templates),
    [],
  );
});

test('rejects tracked production environment files', () => {
  const issues = findDeploymentConfigIssues(
    [...Object.keys(templates), '.env.production'],
    templates,
  );
  assert.ok(issues.some((issue) => issue.includes('.env.production')));
});

test('rejects populated secret assignments in a tracked example', () => {
  const unsafeTemplates = {
    ...templates,
    '.env.production.example': 'API_SECRET=populated-value',
  };
  const issues = findDeploymentConfigIssues(Object.keys(unsafeTemplates), unsafeTemplates);
  assert.ok(issues.some((issue) => issue.includes('API_SECRET')));
});

test('rejects a missing environment template', () => {
  const { '.env.production.example': _omitted, ...incompleteTemplates } = templates;
  const issues = findDeploymentConfigIssues(
    Object.keys(incompleteTemplates),
    incompleteTemplates,
  );
  assert.ok(issues.some((issue) => issue.includes('.env.production.example')));
});
