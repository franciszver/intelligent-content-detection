import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as path from 'path';
import { Construct } from 'constructs';
import { CONFIG } from '../config';
import { StorageStack } from './storage-stack';
import { SecretsStack } from './secrets-stack';

// Docker wrapper path for custom builds (not currently used since SingleAgentFunction uses pre-built ECR image)
// const dockerWrapperPath = path.resolve(
//   __dirname, '..', '..', '..', 'scripts',
//   process.platform === 'win32' ? 'docker-wrapper.cmd' : 'docker-wrapper.sh',
// );
// Note: CDK_DOCKER is NOT set globally to avoid interfering with layer bundling

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
        loggingLevel: apigateway.MethodLoggingLevel.OFF, // Disable logging to avoid extra IAM roles
        dataTraceEnabled: false,
      },
      cloudWatchRole: false, // Prevent API Gateway from creating its own CloudWatch role
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
      environment: {
        DYNAMODB_TABLE_NAME: storageStack.metadataTable.tableName,
        REGION: CONFIG.REGION,
        S3_BUCKET_NAME: storageStack.photosBucket.bucketName,
      },
    });

    // Single Agent Lambda (YOLO + GPT) - packaged as a Docker image to avoid Lambda zip size limits
    // Using pre-built image from ECR to ensure Docker V2 manifest format Lambda requires
    // To rebuild: cd backend && DOCKER_BUILDKIT=0 docker build --platform linux/amd64 -f lambda/agent-single/Dockerfile -t {ACCOUNT_ID}.dkr.ecr.us-east-2.amazonaws.com/intelligent-content-detection-single-agent:v2 . && docker push ...
    const singleAgentRepo = ecr.Repository.fromRepositoryName(
      this,
      'SingleAgentRepo',
      'intelligent-content-detection-single-agent',
    );
    this.singleAgentFunction = new lambda.DockerImageFunction(this, 'SingleAgentFunction', {
      code: lambda.DockerImageCode.fromEcr(singleAgentRepo, {
        tagOrDigest: 'v20251130-200630',
      }),
      memorySize: 1536,
      timeout: cdk.Duration.seconds(180),
      role: sharedLambdaRole,
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
    });

    // Grant SingleAgentFunction permission to invoke itself (for async processing)
    // Using addToRolePolicy with a pattern to avoid circular dependency
    this.singleAgentFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['lambda:InvokeFunction'],
        resources: [
          `arn:aws:lambda:${this.region}:${this.account}:function:*SingleAgentFunction*`,
        ],
      })
    );

    this.singleAgentResultsFunction = new lambda.Function(this, 'SingleAgentResultsFunction', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'handler.handler',
      code: createBundledCode('single-agent-results'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(15),
      role: sharedLambdaRole,
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






