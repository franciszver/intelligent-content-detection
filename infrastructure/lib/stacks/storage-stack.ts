import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { CONFIG } from '../config';

export class StorageStack extends cdk.Stack {
  public readonly photosBucket: s3.Bucket;
  public readonly metadataTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, {
      ...props,
      env: {
        region: CONFIG.REGION,
      },
    });

    // S3 Bucket for photo storage
    this.photosBucket = new s3.Bucket(this, 'PhotosBucket', {
      bucketName: `${CONFIG.S3_BUCKET_NAME}-${this.account}-${this.region}`,
      versioned: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [
        {
          allowedOrigins: ['*'], // Will be restricted to Amplify domain later
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.HEAD,
          ],
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag', 'x-amz-server-side-encryption', 'x-amz-request-id'],
          maxAge: 3000,
        },
      ],
      lifecycleRules: [
        {
          id: 'MoveToGlacier',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(CONFIG.S3_LIFECYCLE_DAYS),
            },
          ],
        },
      ],
    });

    // DynamoDB Table for metadata
    this.metadataTable = new dynamodb.Table(this, 'MetadataTable', {
      tableName: CONFIG.DYNAMODB_TABLE_NAME,
      partitionKey: {
        name: 'photo_id',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // On-demand for cost efficiency
      pointInTimeRecovery: false, // Disabled for cost savings
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: 'expires_at', // Optional cleanup
    });

    // Global Secondary Index for time-based queries
    this.metadataTable.addGlobalSecondaryIndex({
      indexName: 'timestamp-index',
      partitionKey: {
        name: 'user_id',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // Outputs
    new cdk.CfnOutput(this, 'PhotosBucketName', {
      value: this.photosBucket.bucketName,
      exportName: `${this.stackName}-PhotosBucketName`,
    });

    new cdk.CfnOutput(this, 'MetadataTableName', {
      value: this.metadataTable.tableName,
      exportName: `${this.stackName}-MetadataTableName`,
    });

  }
}

