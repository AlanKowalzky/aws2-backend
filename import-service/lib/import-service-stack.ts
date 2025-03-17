import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as path from 'path';

export class ImportServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    // Get reference to the SQS queue from Product Service
    const catalogItemsQueue = sqs.Queue.fromQueueArn(
      this,
      'CatalogItemsQueue',
      `arn:aws:sqs:${this.region}:${this.account}:catalogItemsQueue`
    );

    // Create S3 bucket for file import
    const importBucket = new s3.Bucket(this, 'ImportBucket', {
      bucketName: `import-service-bucket-${this.account}-${this.region}`,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
          ],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
        },
      ],
    });

    // Define Lambda functions
    const importProductsFileLambda = new lambda.Function(this, 'ImportProductsFileFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'importProductsFile.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../dist/functions')),
      environment: {
        BUCKET_NAME: importBucket.bucketName,
        BUCKET_REGION: this.region,
      },
    });

    const importFileParserLambda = new lambda.Function(this, 'ImportFileParserFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'importFileParser.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../dist/functions')),
      environment: {
        BUCKET_NAME: importBucket.bucketName,
        BUCKET_REGION: this.region,
        SQS_QUEUE_URL: catalogItemsQueue.queueUrl,
      },
    });

    // Grant permissions to Lambda functions
    importBucket.grantReadWrite(importProductsFileLambda);
    importBucket.grantReadWrite(importFileParserLambda);
    
    // Grant permission to send messages to SQS queue
    catalogItemsQueue.grantSendMessages(importFileParserLambda);

    // Add S3 event notification to trigger importFileParser Lambda
    importBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(importFileParserLambda),
      { prefix: 'uploaded/' }
    );

    // Create API Gateway
    const api = new apigateway.RestApi(this, 'ImportApi', {
      restApiName: 'Import Service',
      description: 'This service handles product imports',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    // Create resources and methods
    const importResource = api.root.addResource('import');
    
    // Add request parameter for fileName
    const importMethod = importResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(importProductsFileLambda),
      {
        requestParameters: {
          'method.request.querystring.name': true,
        },
      }
    );

    // Add IAM policy to allow Lambda to generate presigned URLs
    const s3Policy = new iam.PolicyStatement({
      actions: ['s3:PutObject', 's3:GetObject'],
      resources: [`${importBucket.bucketArn}/*`],
    });

    importProductsFileLambda.addToRolePolicy(s3Policy);

    // Output the API URL
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'The URL of the API Gateway',
    });
  }
}
