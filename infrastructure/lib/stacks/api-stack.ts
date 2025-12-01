import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { Construct } from 'constructs';
import { CONFIG } from '../config';
import { StorageStack } from './storage-stack';
import { SecretsStack } from './secrets-stack';

const dockerWrapperPath = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'scripts',
  process.platform === 'win32' ? 'docker-wrapper.cmd' : 'docker-wrapper.sh',
);

const withDockerWrapper = <T>(callback: () => T): T => {
  const previousDocker = process.env.CDK_DOCKER;
  const previousPlatform = process.env.DOCKER_DEFAULT_PLATFORM;

  process.env.CDK_DOCKER = dockerWrapperPath;
  process.env.DOCKER_DEFAULT_PLATFORM = 'linux/amd64';

  try {
    return callback();
  } finally {
    if (previousDocker === undefined) {
      delete process.env.CDK_DOCKER;
    } else {
      process.env.CDK_DOCKER = previousDocker;
    }

    if (previousPlatform === undefined) {
      delete process.env.DOCKER_DEFAULT_PLATFORM;
    } else {
      process.env.DOCKER_DEFAULT_PLATFORM = previousPlatform;
    }
  }
};

export class ApiStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly photoUploadFunction: lambda.Function;
  public readonly metadataQueryFunction: lambda.Function;
  public readonly singleAgentFunction: lambda.Function;
  public readonly singleAgentResultsFunction: lambda.Function;

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

    // Create Lambda Layer for large dependencies (opencv-python-headless, numpy)
    // Using headless version to reduce size (no GUI dependencies)
    // This reduces the deployment package size for Agent1 and Agent2
    const cvLayer = new lambda.LayerVersion(this, 'CvDependenciesLayer', {
      code: lambda.Code.fromAsset(backendRoot, {
        bundling: {
          image: lambda.Runtime.PYTHON_3_11.bundlingImage,
          environment: {
            PIP_DISABLE_PIP_VERSION_CHECK: '1',
          },
          command: [
            'bash',
            '-c',
            [
              'mkdir -p /asset-output/python/lib/python3.11/site-packages',
              'pip install opencv-python-headless==4.8.1.78 numpy==1.24.3 -t /asset-output/python/lib/python3.11/site-packages --no-cache-dir',
            ].join(' && '),
          ],
        },
      }),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_11],
      description: 'Lambda layer containing opencv-python-headless and numpy for CV operations',
    });

    // ONNX Runtime layer for Single Agent Lambda
    const onnxLayer = new lambda.LayerVersion(this, 'OnnxRuntimeLayer', {
      code: lambda.Code.fromAsset(backendRoot, {
        bundling: {
          image: lambda.Runtime.PYTHON_3_11.bundlingImage,
          environment: {
            PIP_DISABLE_PIP_VERSION_CHECK: '1',
          },
          command: [
            'bash',
            '-c',
            [
              'mkdir -p /asset-output/python/lib/python3.11/site-packages',
              'pip install --no-deps onnxruntime==1.16.3 -t /asset-output/python/lib/python3.11/site-packages --no-cache-dir',
              'pip install packaging==25.0 protobuf==6.33.1 sympy==1.14.0 coloredlogs==15.0.1 humanfriendly==10.0 flatbuffers==25.9.23 -t /asset-output/python/lib/python3.11/site-packages --no-cache-dir',
            ].join(' && '),
          ],
        },
      }),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_11],
      description: 'Lambda layer providing onnxruntime and supporting libs for Single Agent inference',
    });

    const createBundledCode = (lambdaDir: string, excludeLargeDeps: boolean = false): lambda.Code =>
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
              excludeLargeDeps
                ? 'grep -v "opencv-python\\|opencv-python-headless\\|numpy\\|onnxruntime" requirements.txt > /tmp/requirements_filtered.txt && pip install -r /tmp/requirements_filtered.txt -t /asset-output --no-cache-dir || pip install -r requirements.txt -t /asset-output --ignore-installed opencv-python opencv-python-headless numpy onnxruntime --no-cache-dir'
                : 'pip install -r requirements.txt -t /asset-output --no-cache-dir',
              'find /asset-output -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true',
              'find /asset-output -type f -name "*.pyc" -delete 2>/dev/null || true',
              'find /asset-output -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true',
              'find /asset-output -type d -name "test" -exec rm -rf {} + 2>/dev/null || true',
              'find /asset-output -type f -name "*.py[co]" -delete 2>/dev/null || true',
              'cp -r . /asset-output/',
              'mkdir -p /asset-output/shared',
              'cp -r ../../shared/* /asset-output/shared/',
            ].join(' && '),
          ],
        },
      });

    // Lambda Log Groups with 7-day retention
    const logRetention = logs.RetentionDays.ONE_WEEK;

    // Re-use existing IAM role to stay within IAM quotas
    // Default to the reusable role we created: intelligent-content-detection-lambda-role
    const existingLambdaRoleArn =
      process.env.EXISTING_LAMBDA_ROLE_ARN ||
      this.node.tryGetContext('existingLambdaRoleArn') ||
      `arn:aws:iam::${this.account}:role/intelligent-content-detection-lambda-role`;

    const sharedLambdaRole: iam.IRole = iam.Role.fromRoleArn(
      this,
      'SharedLambdaRole',
      existingLambdaRoleArn
    );

    // Grant permissions to shared role
    storageStack.photosBucket.grantReadWrite(sharedLambdaRole);
    storageStack.metadataTable.grantReadWriteData(sharedLambdaRole);

    // Secrets Manager access
    secretsStack.openaiSecret.grantRead(sharedLambdaRole);
    secretsStack.openrouterSecret.grantRead(sharedLambdaRole);

    // Photo Upload Lambda
    this.photoUploadFunction = new lambda.Function(this, 'PhotoUploadFunction', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'handler.handler',
      code: createBundledCode('photo-upload'),
      memorySize: CONFIG.LAMBDA.PHOTO_UPLOAD.MEMORY,
      timeout: cdk.Duration.seconds(CONFIG.LAMBDA.PHOTO_UPLOAD.TIMEOUT),
      role: sharedLambdaRole,
      logRetention,
      environment: {
        S3_BUCKET_NAME: storageStack.photosBucket.bucketName,
        DYNAMODB_TABLE_NAME: storageStack.metadataTable.tableName,
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
      role: sharedLambdaRole,
      logRetention,
      environment: {
        DYNAMODB_TABLE_NAME: storageStack.metadataTable.tableName,
        REGION: CONFIG.REGION,
        S3_BUCKET_NAME: storageStack.photosBucket.bucketName,
      },
    });

    // Single Agent Lambda (YOLO + GPT) - packaged as a Docker image to avoid Lambda zip size limits
    // Build context is backend/ so Dockerfile can access both lambda/agent-single and shared/
    this.singleAgentFunction = withDockerWrapper(
      () =>
        new lambda.DockerImageFunction(this, 'SingleAgentFunction', {
          code: lambda.DockerImageCode.fromImageAsset(backendRoot, {
            file: 'lambda/agent-single/Dockerfile',
            platform: Platform.LINUX_AMD64, // Lambda requires linux/amd64 architecture
          }),
          memorySize: 1536,
          timeout: cdk.Duration.seconds(180),
          role: sharedLambdaRole,
          logRetention,
          environment: {
            S3_BUCKET_NAME: storageStack.photosBucket.bucketName,
            DYNAMODB_TABLE_NAME: storageStack.metadataTable.tableName,
            OPENAI_SECRET_NAME: CONFIG.SECRETS.OPENAI_API_KEY,
            OPENROUTER_SECRET_NAME: CONFIG.SECRETS.OPENROUTER_API_KEY,
            REGION: CONFIG.REGION,
            MODEL_BUCKET_NAME: storageStack.photosBucket.bucketName,
            YOLO_MODEL_KEY: 'models/yolov8s-roof.onnx',
            YOLO_CLASS_NAMES: JSON.stringify([
              'missing_shingles',
              'cracks',
              'hail_impact',
              'granule_loss',
              'discoloration',
            ]),
            SINGLE_AGENT_MODEL_VERSION: 'single-agent-v1',
            SINGLE_AGENT_OVERLAY_PREFIX: 'single-agent/overlays',
            SINGLE_AGENT_REPORT_PREFIX: 'single-agent/reports',
          },
        }),
    );

    this.singleAgentResultsFunction = new lambda.Function(this, 'SingleAgentResultsFunction', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'handler.handler',
      code: createBundledCode('single-agent-results'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(15),
      role: sharedLambdaRole,
      logRetention,
      environment: {
        DYNAMODB_TABLE_NAME: storageStack.metadataTable.tableName,
        S3_BUCKET_NAME: storageStack.photosBucket.bucketName,
        REGION: CONFIG.REGION,
      },
    });

    // API Gateway Routes
    const photos = this.api.root.addResource('photos');

    // POST /photos/upload
    const uploadIntegration = new apigateway.LambdaIntegration(this.photoUploadFunction);
    photos.addResource('upload').addMethod('POST', uploadIntegration);

    // POST /photos/{photoId}/detect
    const photoId = photos.addResource('{photoId}');
    const detectIntegration = new apigateway.LambdaIntegration(this.singleAgentFunction);
    photoId.addResource('detect').addMethod('POST', detectIntegration);

    // GET /photos/{photoId}/metadata
    const metadataIntegration = new apigateway.LambdaIntegration(this.metadataQueryFunction);
    photoId.addResource('metadata').addMethod('GET', metadataIntegration);

    // GET /photos/{photoId}/single-agent
    const singleAgentIntegration = new apigateway.LambdaIntegration(this.singleAgentResultsFunction);
    photoId.addResource('single-agent').addMethod('GET', singleAgentIntegration);

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

