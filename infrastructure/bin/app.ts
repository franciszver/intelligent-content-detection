#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { StorageStack } from '../lib/stacks/storage-stack';
import { SecretsStack } from '../lib/stacks/secrets-stack';
import { ApiStack } from '../lib/stacks/api-stack';
import { MonitoringStack } from '../lib/stacks/monitoring-stack';
import { CONFIG } from '../lib/config';

const app = new cdk.App();

// Storage Stack (S3, DynamoDB)
const storageStack = new StorageStack(app, 'StorageStack', {
  stackName: 'intelligent-content-detection-storage',
});

// Secrets Stack (API Keys)
const secretsStack = new SecretsStack(app, 'SecretsStack', {
  stackName: 'intelligent-content-detection-secrets',
});

// API Stack (API Gateway, Lambda)
const apiStack = new ApiStack(app, 'ApiStack', storageStack, secretsStack, {
  stackName: 'intelligent-content-detection-api',
});

// Monitoring Stack (CloudWatch)
const monitoringStack = new MonitoringStack(app, 'MonitoringStack', apiStack, {
  stackName: 'intelligent-content-detection-monitoring',
});

// Add dependencies
apiStack.addDependency(storageStack);
apiStack.addDependency(secretsStack);
monitoringStack.addDependency(apiStack);

