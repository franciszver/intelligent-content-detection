import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
import { CONFIG } from '../config';
import { ApiStack } from './api-stack';

export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, apiStack: ApiStack, props?: cdk.StackProps) {
    super(scope, id, {
      ...props,
      env: {
        region: CONFIG.REGION,
      },
    });

    // CloudWatch Dashboard
    const dashboard = new cloudwatch.Dashboard(this, 'ContentDetectionDashboard', {
      dashboardName: `${CONFIG.PROJECT_NAME}-dashboard`,
    });

    // Lambda Metrics
    const photoUploadMetrics = new cloudwatch.Metric({
      namespace: 'AWS/Lambda',
      metricName: 'Duration',
      dimensionsMap: {
        FunctionName: apiStack.photoUploadFunction.functionName,
      },
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    });

    const contentDetectionMetrics = new cloudwatch.Metric({
      namespace: 'AWS/Lambda',
      metricName: 'Duration',
      dimensionsMap: {
        FunctionName: apiStack.contentDetectionFunction.functionName,
      },
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    });

    const lambdaInvocations = new cloudwatch.Metric({
      namespace: 'AWS/Lambda',
      metricName: 'Invocations',
      dimensionsMap: {
        FunctionName: apiStack.contentDetectionFunction.functionName,
      },
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const lambdaErrors = new cloudwatch.Metric({
      namespace: 'AWS/Lambda',
      metricName: 'Errors',
      dimensionsMap: {
        FunctionName: apiStack.contentDetectionFunction.functionName,
      },
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    // API Gateway Metrics
    const api4xxErrors = new cloudwatch.Metric({
      namespace: 'AWS/ApiGateway',
      metricName: '4XXError',
      dimensionsMap: {
        ApiName: apiStack.api.restApiName,
      },
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const api5xxErrors = new cloudwatch.Metric({
      namespace: 'AWS/ApiGateway',
      metricName: '5XXError',
      dimensionsMap: {
        ApiName: apiStack.api.restApiName,
      },
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    // Add widgets to dashboard
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Duration (ms)',
        left: [photoUploadMetrics, contentDetectionMetrics],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Invocations',
        left: [lambdaInvocations],
        width: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Errors',
        left: [lambdaErrors],
        width: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'API Gateway Errors',
        left: [api4xxErrors, api5xxErrors],
        width: 12,
      })
    );

    // CloudWatch Alarm for high error rate
    const errorAlarm = new cloudwatch.Alarm(this, 'HighErrorRateAlarm', {
      metric: lambdaErrors,
      threshold: 10,
      evaluationPeriods: 2,
      alarmDescription: 'Alert when Lambda errors exceed threshold',
    });

    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${dashboard.dashboardName}`,
      description: 'CloudWatch Dashboard URL',
    });
  }
}

