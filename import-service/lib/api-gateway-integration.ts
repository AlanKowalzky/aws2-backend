import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface ApiGatewayIntegrationProps {
  importProductsFileLambda: lambda.Function;
  basicAuthorizerArn: string;
}

export class ApiGatewayIntegration extends Construct {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: ApiGatewayIntegrationProps) {
    super(scope, id);

    // Create API Gateway
    this.api = new apigateway.RestApi(this, 'ImportApi', {
      restApiName: 'Import Service',
      description: 'This service handles product imports',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    // Import the basicAuthorizer Lambda function from the Authorization Service
    const basicAuthorizer = lambda.Function.fromFunctionArn(
      this,
      'BasicAuthorizerFunction',
      props.basicAuthorizerArn
    );

    // Create a Lambda authorizer for the API Gateway
    const authorizer = new apigateway.TokenAuthorizer(this, 'BasicAuthorizer', {
      handler: basicAuthorizer,
      identitySource: 'method.request.header.Authorization',
    });

    // Create resources and methods
    const importResource = this.api.root.addResource('import');
    
    // Add GET method with request parameter for fileName with authorizer
    const importGetMethod = importResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(props.importProductsFileLambda, {
        proxy: true,
      }),
      {
        requestParameters: {
          'method.request.querystring.name': true,
        },
        authorizer: authorizer,
        methodResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
        ],
      }
    );
    
    // Add POST method for file upload with authorizer
    const importPostMethod = importResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(props.importProductsFileLambda, {
        proxy: true,
        integrationResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': "'*'",
            },
          },
        ],
      }),
      {
        authorizer: authorizer,
        methodResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
        ],
      }
    );
    
    // Add Lambda permission for POST method
    new lambda.CfnPermission(this, 'ImportPostMethodLambdaPermission', {
      action: 'lambda:InvokeFunction',
      functionName: props.importProductsFileLambda.functionName,
      principal: 'apigateway.amazonaws.com',
      sourceArn: `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:${this.api.restApiId}/*/${importPostMethod.httpMethod}${importResource.path}`,
    });
    
    // Add IAM policy to allow Lambda to generate presigned URLs
    const s3Policy = new iam.PolicyStatement({
      actions: ['s3:PutObject', 's3:GetObject'],
      resources: [`arn:aws:s3:::import-service-bucket-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}/*`],
    });

    props.importProductsFileLambda.addToRolePolicy(s3Policy);

    // Output the API URL
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      description: 'The URL of the API Gateway',
    });
  }
}
