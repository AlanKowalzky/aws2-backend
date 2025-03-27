import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';

export class AuthorizationServiceStack extends cdk.Stack {
  public readonly basicAuthorizerLambda: lambda.Function;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create the basicAuthorizer Lambda function
    this.basicAuthorizerLambda = new lambda.Function(this, 'BasicAuthorizerFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'basicAuthorizer.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../dist/src/functions')),
    });

    // Export the Lambda ARN for cross-stack references
    new cdk.CfnOutput(this, 'BasicAuthorizerLambdaArn', {
      value: this.basicAuthorizerLambda.functionArn,
      exportName: 'BasicAuthorizerLambdaArn',
    });
  }
}
