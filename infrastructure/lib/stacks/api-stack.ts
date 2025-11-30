import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
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
  public readonly orchestratorFunction: lambda.Function;
  public readonly agent1Function: lambda.Function;
  public readonly agent2Function: lambda.Function;
  public readonly agent3Function: lambda.Function;
  public readonly singleAgentFunction: lambda.Function;
  public readonly analyzeTriggerFunction: lambda.Function;
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
                ? 'grep -v "opencv-python\\|opencv-python-headless\\|numpy" requirements.txt > /tmp/requirements_filtered.txt && pip install -r /tmp/requirements_filtered.txt -t /asset-output --no-cache-dir || pip install -r requirements.txt -t /asset-output --ignore-installed opencv-python opencv-python-headless numpy --no-cache-dir'
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

    const stack = cdk.Stack.of(this);

    // WebSocket manager Lambda
    const websocketHandler = new lambda.Function(this, 'WebsocketHandler', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'handler.handler',
      code: createBundledCode('websocket-manager'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      logRetention,
      environment: {
        WEBSOCKET_TABLE_NAME: storageStack.websocketTable.tableName,
        CONNECTION_INDEX_NAME: 'connection-index',
        REGION: CONFIG.REGION,
      },
    });
    storageStack.websocketTable.grantReadWriteData(websocketHandler);

    const websocketApi = new apigwv2.WebSocketApi(this, 'StatusWebSocketApi', {
      apiName: `${CONFIG.PROJECT_NAME}-ws`,
      routeSelectionExpression: '$request.body.action',
      connectRouteOptions: {
        integration: new apigwv2Integrations.WebSocketLambdaIntegration(
          'ConnectIntegration',
          websocketHandler
        ),
      },
      disconnectRouteOptions: {
        integration: new apigwv2Integrations.WebSocketLambdaIntegration(
          'DisconnectIntegration',
          websocketHandler
        ),
      },
      defaultRouteOptions: {
        integration: new apigwv2Integrations.WebSocketLambdaIntegration(
          'DefaultIntegration',
          websocketHandler
        ),
      },
    });

    new apigwv2.WebSocketRoute(this, 'SubscribeRoute', {
      webSocketApi: websocketApi,
      routeKey: 'subscribe',
      integration: new apigwv2Integrations.WebSocketLambdaIntegration(
        'SubscribeIntegration',
        websocketHandler
      ),
    });

    const websocketStage = new apigwv2.WebSocketStage(this, 'StatusWebSocketStage', {
      webSocketApi: websocketApi,
      stageName: 'prod',
      autoDeploy: true,
    });

    const websocketManagementEndpoint = `https://${websocketApi.apiId}.execute-api.${stack.region}.amazonaws.com/${websocketStage.stageName}`;
    const websocketWssEndpoint = `wss://${websocketApi.apiId}.execute-api.${stack.region}.amazonaws.com/${websocketStage.stageName}`;

    // Create shared IAM role for all Lambda functions to reduce role count
    const sharedLambdaRole = new iam.Role(this, 'SharedLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      description: 'Shared IAM role for all Lambda functions in the API stack',
    });

    // Grant permissions to shared role
    storageStack.photosBucket.grantReadWrite(sharedLambdaRole);
    storageStack.metadataTable.grantReadWriteData(sharedLambdaRole);

    // Secrets Manager access
    secretsStack.openaiSecret.grantRead(sharedLambdaRole);
    secretsStack.openrouterSecret.grantRead(sharedLambdaRole);

    // SSM Parameter Store access (for state machine ARN)
    sharedLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ssm:GetParameter', 'ssm:GetParameters'],
        resources: [
          `arn:aws:ssm:${CONFIG.REGION}:*:parameter/${CONFIG.PROJECT_NAME}/state-machine-arn`,
        ],
      })
    );

    // Step Functions access (for analyze trigger)
    sharedLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['states:StartExecution'],
        resources: [
          `arn:aws:states:${CONFIG.REGION}:*:stateMachine:${CONFIG.PROJECT_NAME}-multi-agent-workflow`,
        ],
      })
    );

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

    // Content Detection Lambda
    this.contentDetectionFunction = new lambda.Function(this, 'ContentDetectionFunction', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'handler.handler',
      code: createBundledCode('content-detection'),
      memorySize: CONFIG.LAMBDA.CONTENT_DETECTION.MEMORY,
      timeout: cdk.Duration.seconds(CONFIG.LAMBDA.CONTENT_DETECTION.TIMEOUT),
      role: sharedLambdaRole,
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
      role: sharedLambdaRole,
      logRetention,
      environment: {
        DYNAMODB_TABLE_NAME: storageStack.metadataTable.tableName,
        REGION: CONFIG.REGION,
        S3_BUCKET_NAME: storageStack.photosBucket.bucketName,
      },
    });

    // All permissions are granted to sharedLambdaRole above
    // Individual functions use the shared role

    // Orchestrator Lambda
    this.orchestratorFunction = new lambda.Function(this, 'OrchestratorFunction', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'handler.handler',
      code: createBundledCode('orchestrator'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      role: sharedLambdaRole,
      logRetention,
      environment: {
        DYNAMODB_TABLE_NAME: storageStack.metadataTable.tableName,
        REGION: CONFIG.REGION,
        WEBSOCKET_TABLE_NAME: storageStack.websocketTable.tableName,
        WEBSOCKET_CONNECTION_INDEX: 'connection-index',
        WEBSOCKET_API_ENDPOINT: websocketManagementEndpoint,
      },
    });
    storageStack.websocketTable.grantReadWriteData(this.orchestratorFunction);
    this.orchestratorFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['execute-api:ManageConnections'],
        resources: [
          `arn:aws:execute-api:${stack.region}:${stack.account}:${websocketApi.apiId}/${websocketStage.stageName}/POST/@connections/*`,
        ],
      })
    );

    // Agent 1 Lambda (Wireframe)
    this.agent1Function = new lambda.Function(this, 'Agent1Function', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'handler.handler',
      code: createBundledCode('agent-wireframe', true), // Exclude large deps, use layer
      layers: [cvLayer],
      memorySize: 1024,
      timeout: cdk.Duration.seconds(120),
      role: sharedLambdaRole,
      logRetention,
      environment: {
        S3_BUCKET_NAME: storageStack.photosBucket.bucketName,
        DYNAMODB_TABLE_NAME: storageStack.metadataTable.tableName,
        OPENAI_SECRET_NAME: CONFIG.SECRETS.OPENAI_API_KEY,
        OPENROUTER_SECRET_NAME: CONFIG.SECRETS.OPENROUTER_API_KEY,
        REGION: CONFIG.REGION,
      },
    });

    // Agent 2 Lambda (Color Enhancement)
    this.agent2Function = new lambda.Function(this, 'Agent2Function', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'handler.handler',
      code: createBundledCode('agent-color', true), // Exclude large deps, use layer
      layers: [cvLayer],
      memorySize: 1024,
      timeout: cdk.Duration.seconds(120),
      role: sharedLambdaRole,
      logRetention,
      environment: {
        S3_BUCKET_NAME: storageStack.photosBucket.bucketName,
        DYNAMODB_TABLE_NAME: storageStack.metadataTable.tableName,
        OPENAI_SECRET_NAME: CONFIG.SECRETS.OPENAI_API_KEY,
        OPENROUTER_SECRET_NAME: CONFIG.SECRETS.OPENROUTER_API_KEY,
        REGION: CONFIG.REGION,
      },
    });

    // Agent 3 Lambda (Overlay Generation)
    this.agent3Function = new lambda.Function(this, 'Agent3Function', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'handler.handler',
      code: createBundledCode('agent-overlay'),
      memorySize: 1024,
      timeout: cdk.Duration.seconds(120),
      role: sharedLambdaRole,
      logRetention,
      environment: {
        S3_BUCKET_NAME: storageStack.photosBucket.bucketName,
        DYNAMODB_TABLE_NAME: storageStack.metadataTable.tableName,
        REGION: CONFIG.REGION,
      },
    });

    // Single Agent Lambda (YOLO + GPT)
    this.singleAgentFunction = new lambda.Function(this, 'SingleAgentFunction', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'handler.handler',
      code: createBundledCode('agent-single', true),
      layers: [cvLayer],
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
    });

    // Analyze Trigger Lambda (starts Step Functions execution)
    this.analyzeTriggerFunction = new lambda.Function(this, 'AnalyzeTriggerFunction', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'handler.handler',
      code: createBundledCode('analyze-trigger'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      role: sharedLambdaRole,
      logRetention,
      environment: {
        DYNAMODB_TABLE_NAME: storageStack.metadataTable.tableName,
        REGION: CONFIG.REGION,
        STATE_MACHINE_ARN_PARAM: `/${CONFIG.PROJECT_NAME}/state-machine-arn`,
      },
    });

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
    const detectIntegration = new apigateway.LambdaIntegration(this.contentDetectionFunction);
    photoId.addResource('detect').addMethod('POST', detectIntegration);

    // GET /photos/{photoId}/metadata
    const metadataIntegration = new apigateway.LambdaIntegration(this.metadataQueryFunction);
    photoId.addResource('metadata').addMethod('GET', metadataIntegration);

    // GET /photos/{photoId}/single-agent
    const singleAgentIntegration = new apigateway.LambdaIntegration(this.singleAgentResultsFunction);
    photoId.addResource('single-agent').addMethod('GET', singleAgentIntegration);

    // POST /photos/{photoId}/analyze - Triggers multi-agent analysis via Step Functions
    const analyzeResource = photoId.addResource('analyze');
    const analyzeIntegration = new apigateway.LambdaIntegration(this.analyzeTriggerFunction);
    analyzeResource.addMethod('POST', analyzeIntegration);

    // Outputs
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: this.api.url,
      exportName: `${this.stackName}-ApiEndpoint`,
    });

    new cdk.CfnOutput(this, 'ApiId', {
      value: this.api.restApiId,
      exportName: `${this.stackName}-ApiId`,
    });

    new cdk.CfnOutput(this, 'WebSocketEndpoint', {
      value: websocketWssEndpoint,
      exportName: `${this.stackName}-WebSocketEndpoint`,
    });
  }
}

