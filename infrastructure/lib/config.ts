/**
 * Configuration constants for the infrastructure
 */
export const CONFIG = {
  REGION: 'us-east-2',
  PROJECT_NAME: 'intelligent-content-detection',
  
  // S3 Configuration
  S3_BUCKET_NAME: 'intelligent-content-photos',
  S3_LIFECYCLE_DAYS: 90, // Move to Glacier after 90 days
  
  // DynamoDB Configuration
  DYNAMODB_TABLE_NAME: 'photo-metadata',
  
  // Secrets Manager
  SECRETS: {
    OPENAI_API_KEY: 'openai-api-key',
    OPENROUTER_API_KEY: 'openrouter-api-key',
  },
  
  // Lambda Configuration
  LAMBDA: {
    PHOTO_UPLOAD: {
      MEMORY: 256,
      TIMEOUT: 30,
    },
    METADATA_QUERY: {
      MEMORY: 256,
      TIMEOUT: 10,
    },
  },
  
  // CloudWatch
  LOG_RETENTION_DAYS: 7,
};

