import * as cdk from 'aws-cdk-lib';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as stepfunctionsTasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { CONFIG } from '../config';
import { StorageStack } from './storage-stack';
import { SecretsStack } from './secrets-stack';

export class OrchestrationStack extends cdk.Stack {
  public readonly stateMachine: stepfunctions.StateMachine;

  constructor(
    scope: Construct,
    id: string,
    storageStack: StorageStack,
    secretsStack: SecretsStack,
    orchestratorFunction: lambda.Function,
    agent1Function: lambda.Function,
    agent2Function: lambda.Function,
    agent3Function: lambda.Function,
    props?: cdk.StackProps
  ) {
    super(scope, id, {
      ...props,
      env: {
        region: CONFIG.REGION,
      },
    });

    // Step 1: Orchestrator task
    const orchestratorTask = new stepfunctionsTasks.LambdaInvoke(this, 'OrchestratorTask', {
      lambdaFunction: orchestratorFunction,
      payloadResponseOnly: true,
    });

    const agent1Task = new stepfunctionsTasks.LambdaInvoke(this, 'Agent1Task', {
      lambdaFunction: agent1Function,
      payloadResponseOnly: true,
    });
    const agent1Status = new stepfunctionsTasks.LambdaInvoke(this, 'Agent1Status', {
      lambdaFunction: orchestratorFunction,
      payloadResponseOnly: true,
      resultPath: stepfunctions.JsonPath.DISCARD,
      payload: stepfunctions.TaskInput.fromObject({
        'photo_id.$': '$.photo_id',
        status_update: {
          event: 'agent',
          stage: 'agent1',
          status: 'completed',
          'timestamp.$': '$$.State.EnteredTime',
          'results.$': '$.agent1_results',
        },
      }),
    });
    const agent1SuccessChain = stepfunctions.Chain.start(agent1Task).next(agent1Status);

    const agent1FailureNotify = new stepfunctionsTasks.LambdaInvoke(this, 'Agent1Failure', {
      lambdaFunction: orchestratorFunction,
      payloadResponseOnly: true,
      resultPath: stepfunctions.JsonPath.DISCARD,
      payload: stepfunctions.TaskInput.fromObject({
        'photo_id.$': '$.photo_id',
        status_update: {
          event: 'agent',
          stage: 'agent1',
          status: 'failed',
          'error.$': '$.error',
          'timestamp.$': '$$.State.EnteredTime',
        },
      }),
    });
    agent1Task.addCatch(
      agent1FailureNotify.next(new stepfunctions.Fail(this, 'Agent1Failed')),
      {
        resultPath: '$.error',
      }
    );

    const agent2Task = new stepfunctionsTasks.LambdaInvoke(this, 'Agent2Task', {
      lambdaFunction: agent2Function,
      payloadResponseOnly: true,
    });
    const agent2Status = new stepfunctionsTasks.LambdaInvoke(this, 'Agent2Status', {
      lambdaFunction: orchestratorFunction,
      payloadResponseOnly: true,
      resultPath: stepfunctions.JsonPath.DISCARD,
      payload: stepfunctions.TaskInput.fromObject({
        'photo_id.$': '$.photo_id',
        status_update: {
          event: 'agent',
          stage: 'agent2',
          status: 'completed',
          'timestamp.$': '$$.State.EnteredTime',
          'results.$': '$.agent2_results',
        },
      }),
    });
    const agent2SuccessChain = stepfunctions.Chain.start(agent2Task).next(agent2Status);

    const agent2FailureNotify = new stepfunctionsTasks.LambdaInvoke(this, 'Agent2Failure', {
      lambdaFunction: orchestratorFunction,
      payloadResponseOnly: true,
      resultPath: stepfunctions.JsonPath.DISCARD,
      payload: stepfunctions.TaskInput.fromObject({
        'photo_id.$': '$.photo_id',
        status_update: {
          event: 'agent',
          stage: 'agent2',
          status: 'failed',
          'error.$': '$.error',
          'timestamp.$': '$$.State.EnteredTime',
        },
      }),
    });
    agent2Task.addCatch(
      agent2FailureNotify.next(new stepfunctions.Fail(this, 'Agent2Failed')),
      {
        resultPath: '$.error',
      }
    );

    // Step 4: Run Agent 1 and Agent 2 in parallel
    const parallelAgents = new stepfunctions.Parallel(this, 'ParallelAgents', {
      comment: 'Run Agent 1 and Agent 2 in parallel',
      resultPath: '$.parallelResults',
      resultSelector: {
        'agent1_results.$': '$[0].agent1_results',
        'agent2_results.$': '$[1].agent2_results',
      },
    });

    parallelAgents.branch(agent1SuccessChain);
    parallelAgents.branch(agent2SuccessChain);

    // Step 5: Agent 3 task (Overlay Generation)
    const agent3Task = new stepfunctionsTasks.LambdaInvoke(this, 'Agent3Task', {
      lambdaFunction: agent3Function,
      payloadResponseOnly: true,
    });
    const agent3Status = new stepfunctionsTasks.LambdaInvoke(this, 'Agent3Status', {
      lambdaFunction: orchestratorFunction,
      payloadResponseOnly: true,
      resultPath: stepfunctions.JsonPath.DISCARD,
      payload: stepfunctions.TaskInput.fromObject({
        'photo_id.$': '$.photo_id',
        status_update: {
          event: 'workflow',
          stage: 'agent3',
          status: 'completed',
          'timestamp.$': '$$.State.EnteredTime',
          'results.$': '$.agent3_results',
        },
      }),
    });
    const agent3FailureNotify = new stepfunctionsTasks.LambdaInvoke(this, 'Agent3Failure', {
      lambdaFunction: orchestratorFunction,
      payloadResponseOnly: true,
      resultPath: stepfunctions.JsonPath.DISCARD,
      payload: stepfunctions.TaskInput.fromObject({
        'photo_id.$': '$.photo_id',
        status_update: {
          event: 'workflow',
          stage: 'agent3',
          status: 'failed',
          'error.$': '$.error',
          'timestamp.$': '$$.State.EnteredTime',
        },
      }),
    });
    agent3Task.addCatch(
      agent3FailureNotify.next(new stepfunctions.Fail(this, 'Agent3Failed')),
      {
        resultPath: '$.error',
      }
    );

    // Define the state machine definition
    const definition = orchestratorTask
      .next(parallelAgents)
      .next(agent3Task)
      .next(agent3Status);

    // Create the state machine
    this.stateMachine = new stepfunctions.StateMachine(this, 'MultiAgentStateMachine', {
      stateMachineName: `${CONFIG.PROJECT_NAME}-multi-agent-workflow`,
      definitionBody: stepfunctions.DefinitionBody.fromChainable(definition),
      timeout: cdk.Duration.minutes(10),
      comment: 'Multi-agent workflow for roof damage detection',
    });

    // Grant Step Functions permission to invoke Lambda functions
    orchestratorFunction.grantInvoke(this.stateMachine.role);
    agent1Function.grantInvoke(this.stateMachine.role);
    agent2Function.grantInvoke(this.stateMachine.role);
    agent3Function.grantInvoke(this.stateMachine.role);

    // Note: Step Functions start execution permission is granted in ApiStack
    // to avoid circular dependency
    
    // Store state machine ARN in SSM Parameter Store (avoids circular dependency)
    // Note: SSM read permissions are granted in ApiStack to avoid circular dependency
    new ssm.StringParameter(this, 'StateMachineArnParam', {
      parameterName: `/${CONFIG.PROJECT_NAME}/state-machine-arn`,
      stringValue: this.stateMachine.stateMachineArn,
      description: 'ARN of the multi-agent Step Functions state machine',
    });

    // Outputs
    new cdk.CfnOutput(this, 'StateMachineArn', {
      value: this.stateMachine.stateMachineArn,
      exportName: `${this.stackName}-StateMachineArn`,
    });

    new cdk.CfnOutput(this, 'StateMachineName', {
      value: this.stateMachine.stateMachineName,
      exportName: `${this.stackName}-StateMachineName`,
    });
  }
}

