import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { CONFIG } from '../config';

export class SecretsStack extends cdk.Stack {
  public readonly openaiSecret: secretsmanager.Secret;
  public readonly openrouterSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, {
      ...props,
      env: {
        region: CONFIG.REGION,
      },
    });

    // OpenAI API Key Secret
    this.openaiSecret = new secretsmanager.Secret(this, 'OpenAISecret', {
      secretName: CONFIG.SECRETS.OPENAI_API_KEY,
      description: 'OpenAI API Key for Vision API',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // OpenRouter API Key Secret
    this.openrouterSecret = new secretsmanager.Secret(this, 'OpenRouterSecret', {
      secretName: CONFIG.SECRETS.OPENROUTER_API_KEY,
      description: 'OpenRouter API Key for fallback inference',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Outputs
    new cdk.CfnOutput(this, 'OpenAISecretArn', {
      value: this.openaiSecret.secretArn,
      exportName: `${this.stackName}-OpenAISecretArn`,
    });

    new cdk.CfnOutput(this, 'OpenRouterSecretArn', {
      value: this.openrouterSecret.secretArn,
      exportName: `${this.stackName}-OpenRouterSecretArn`,
    });
  }
}

