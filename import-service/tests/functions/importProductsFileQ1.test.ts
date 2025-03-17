import { APIGatewayProxyEvent } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
// import { handler } from '../../../src/functions/importProductsFile.ts';
import { handler } from '../../src/functions/importProductsFile';


// Mock the AWS SDK modules
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');

describe('importProductsFile handler', () => {
  const mockSignedUrl = 'https://mock-signed-url.com';
  
  beforeEach(() => {
    // process.env.BUCKET_NAME = 'XXXXXXXXXXX';
    process.env.BUCKET_NAME = 'buckettask5aws';
    process.env.BUCKET_REGION = 'us-east-1';
    (getSignedUrl as jest.Mock).mockResolvedValue(mockSignedUrl);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return signed URL when fileName is provided', async () => {
    // Arrange
    const event: APIGatewayProxyEvent = {
      queryStringParameters: {
        name: 'test-file.csv'
      },
      body: null,
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'GET',
      isBase64Encoded: false,
      path: '/import',
      pathParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {
        accountId: '',
        apiId: '',
        authorizer: {},
        protocol: 'HTTP/1.1',
        httpMethod: 'GET',
        identity: {
          accessKey: null,
          accountId: null,
          apiKey: null,
          apiKeyId: null,
          caller: null,
          clientCert: null,
          cognitoAuthenticationProvider: null,
          cognitoAuthenticationType: null,
          cognitoIdentityId: null,
          cognitoIdentityPoolId: null,
          principalOrgId: null,
          sourceIp: '',
          user: null,
          userAgent: null,
          userArn: null,
        },
        path: '/import',
        stage: 'dev',
        requestId: '',
        requestTimeEpoch: 0,
        resourceId: '',
        resourcePath: ''
      },
      resource: ''
    };

    // Act
    const result = await handler(event);

    // Assert
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe(mockSignedUrl);
    expect(result.headers).toEqual({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    });
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.any(S3Client),
      expect.any(PutObjectCommand),
      { expiresIn: 3600 }
    );
  });

  it('should return 400 when fileName is not provided', async () => {
    // Arrange
    const event: APIGatewayProxyEvent = {
      queryStringParameters: null,
      body: null,
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'GET',
      isBase64Encoded: false,
      path: '/import',
      pathParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {
        accountId: '',
        apiId: '',
        authorizer: {},
        protocol: 'HTTP/1.1',
        httpMethod: 'GET',
        identity: {
          accessKey: null,
          accountId: null,
          apiKey: null,
          apiKeyId: null,
          caller: null,
          clientCert: null,
          cognitoAuthenticationProvider: null,
          cognitoAuthenticationType: null,
          cognitoIdentityId: null,
          cognitoIdentityPoolId: null,
          principalOrgId: null,
          sourceIp: '',
          user: null,
          userAgent: null,
          userArn: null,
        },
        path: '/import',
        stage: 'dev',
        requestId: '',
        requestTimeEpoch: 0,
        resourceId: '',
        resourcePath: ''
      },
      resource: ''
    };

    // Act
    const result = await handler(event);

    // Assert
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      message: 'File name is required'
    });
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it('should use correct S3 parameters when generating signed URL', async () => {
    // Arrange
    const fileName = 'test-file.csv';
    const event: APIGatewayProxyEvent = {
      queryStringParameters: {
        name: fileName
      },
      body: null,
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'GET',
      isBase64Encoded: false,
      path: '/import',
      pathParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {
        accountId: '',
        apiId: '',
        authorizer: {},
        protocol: 'HTTP/1.1',
        httpMethod: 'GET',
        identity: {
          accessKey: null,
          accountId: null,
          apiKey: null,
          apiKeyId: null,
          caller: null,
          clientCert: null,
          cognitoAuthenticationProvider: null,
          cognitoAuthenticationType: null,
          cognitoIdentityId: null,
          cognitoIdentityPoolId: null,
          principalOrgId: null,
          sourceIp: '',
          user: null,
          userAgent: null,
          userArn: null,
        },
        path: '/import',
        stage: 'dev',
        requestId: '',
        requestTimeEpoch: 0,
        resourceId: '',
        resourcePath: ''
      },
      resource: ''
    };

    // Act
    await handler(event);

    // Assert
    const mockPutObjectCommand = jest.mocked(PutObjectCommand);
    const putObjectCommandCalls = mockPutObjectCommand.mock.calls[0][0];
    expect(putObjectCommandCalls).toEqual({
      Bucket: 'buckettask5aws',
      // process.env.BUCKET_NAME = 'buckettask5aws';
      Key: `uploaded/${fileName}`,
      ContentType: 'text/csv'
    });
  });
});
