import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import { Construct } from 'constructs';
import { CONFIG } from '../config';
import { StorageStack } from './storage-stack';
import { SecretsStack } from './secrets-stack';

export class ApiStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly photoUploadFunction: lambda.Function;
  public readonly contentDetectionFunction: lambda.Function;
  public readonly metadataQueryFunction: lambda.Function;

  constructor(
    scope: Construct,
    id: string,
    storageStack: StorageStack,
    secretsStack: SecretsStack,
    props?: cdk.StackProps
  ) {
    super(scope, id, {
      ...props,
      env: {
        region: CONFIG.REGION,
      },
    });

    // API Gateway
    this.api = new apigateway.RestApi(this, 'ContentDetectionApi', {
      restApiName: `${CONFIG.PROJECT_NAME}-api`,
      description: 'API for Intelligent Content Detection',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS, // Will be restricted to Amplify domain later
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
      deployOptions: {
        stageName: 'prod',
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
      },
    });

    const backendRoot = path.join(__dirname, '../../../backend');

    const createBundledCode = (lambdaDir: string): lambda.Code =>
      lambda.Code.fromAsset(backendRoot, {
        bundling: {
          image: lambda.Runtime.PYTHON_3_11.bundlingImage,
          environment: {
            PIP_DISABLE_PIP_VERSION_CHECK: '1',
          },
          command: [
            'bash',
            '-c',
            [
              `cd lambda/${lambdaDir}`,
              'pip install -r requirements.txt -t /asset-output',
              'cp -au . /asset-output',
              'cp -au ../../shared /asset-output/shared || true',
            ].join(' && '),
          ],
        },
      });

    // Lambda Log Groups with 7-day retention
    const logRetention = logs.RetentionDays.ONE_WEEK;

    // Photo Upload Lambda
    this.photoUploadFunction = new lambda.Function(this, 'PhotoUploadFunction', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'handler.handler',
      code: createBundledCode('photo-upload'),
      memorySize: CONFIG.LAMBDA.PHOTO_UPLOAD.MEMORY,
      timeout: cdk.Duration.seconds(CONFIG.LAMBDA.PHOTO_UPLOAD.TIMEOUT),
      logRetention,
      environment: {
        S3_BUCKET_NAME: storageStack.photosBucket.bucketName,
        DYNAMODB_TABLE_NAME: storageStack.metadataTable.tableName,
        REGION: CONFIG.REGION,
      },
    });

    // Content Detection Lambda
    this.contentDetectionFunction = new lambda.Function(this, 'ContentDetectionFunction', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'handler.handler',
      code: createBundledCode('content-detection'),
      memorySize: CONFIG.LAMBDA.CONTENT_DETECTION.MEMORY,
      timeout: cdk.Duration.seconds(CONFIG.LAMBDA.CONTENT_DETECTION.TIMEOUT),
      logRetention,
      environment: {
        S3_BUCKET_NAME: storageStack.photosBucket.bucketName,
        DYNAMODB_TABLE_NAME: storageStack.metadataTable.tableName,
        OPENAI_SECRET_NAME: CONFIG.SECRETS.OPENAI_API_KEY,
        OPENROUTER_SECRET_NAME: CONFIG.SECRETS.OPENROUTER_API_KEY,
        REGION: CONFIG.REGION,
      },
    });

    // Metadata Query Lambda
    this.metadataQueryFunction = new lambda.Function(this, 'MetadataQueryFunction', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'handler.handler',
      code: createBundledCode('metadata-query'),
      memorySize: CONFIG.LAMBDA.METADATA_QUERY.MEMORY,
      timeout: cdk.Duration.seconds(CONFIG.LAMBDA.METADATA_QUERY.TIMEOUT),
      logRetention,
      environment: {
        DYNAMODB_TABLE_NAME: storageStack.metadataTable.tableName,
        REGION: CONFIG.REGION,
      },
    });

    // IAM Permissions for Photo Upload Lambda
    storageStack.photosBucket.grantReadWrite(this.photoUploadFunction);
    storageStack.metadataTable.grantWriteData(this.photoUploadFunction);
    this.photoUploadFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:PutObject', 's3:GetObject'],
        resources: [storageStack.photosBucket.arnForObjects('*')],
      })
    );

    // IAM Permissions for Content Detection Lambda
    storageStack.photosBucket.grantRead(this.contentDetectionFunction);
    storageStack.metadataTable.grantWriteData(this.contentDetectionFunction);
    this.contentDetectionFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          secretsStack.openaiSecret.secretArn,
          secretsStack.openrouterSecret.secretArn,
        ],
      })
    );
    this.contentDetectionFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['*'],
      })
    );

    // IAM Permissions for Metadata Query Lambda
    storageStack.metadataTable.grantReadData(this.metadataQueryFunction);

    // API Gateway Routes
    const photos = this.api.root.addResource('photos');

    // POST /photos/upload
    const uploadIntegration = new apigateway.LambdaIntegration(this.photoUploadFunction);
    photos.addResource('upload').addMethod('POST', uploadIntegration);

    // POST /photos/{photoId}/detect
    const photoId = photos.addResource('{photoId}');
    const detectIntegration = new apigateway.LambdaIntegration(this.contentDetectionFunction);
    photoId.addResource('detect').addMethod('POST', detectIntegration);

    // GET /photos/{photoId}/metadata
    const metadataIntegration = new apigateway.LambdaIntegration(this.metadataQueryFunction);
    photoId.addResource('metadata').addMethod('GET', metadataIntegration);

    // Outputs
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: this.api.url,
      exportName: `${this.stackName}-ApiEndpoint`,
    });

    new cdk.CfnOutput(this, 'ApiId', {
      value: this.api.restApiId,
      exportName: `${this.stackName}-ApiId`,
    });
  }
}

