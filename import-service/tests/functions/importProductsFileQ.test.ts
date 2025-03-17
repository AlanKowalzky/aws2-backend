import { APIGatewayProxyEvent } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { handler } from './importProductsFile';

// Mock the AWS SDK modules
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');

describe('importProductsFile handler', () => {
  const mockSignedUrl = 'https://mock-signed-url.com';
  
  // Setup environment variables
  beforeEach(() => {
    process.env.BUCKET_NAME = 'XXXXXXXXXXX';
    process.env.BUCKET_REGION = 'us-east-1';
    (getSignedUrl as jest.Mock).mockResolvedValue(mockSignedUrl);
  });

  // Clear mocks after each test
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return signed URL when fileName is provided', async () => {
    // Arrange
    const event = {
      queryStringParameters: {
        name: 'test-file.csv'
      }
    } as APIGatewayProxyEvent;

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
    const event = {
      queryStringParameters: null
    } as APIGatewayProxyEvent;

    // Act
    const result = await handler(event);

    // Assert
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      message: 'File name is required'
    });
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it('should return 500 when an error occurs', async () => {
    // Arrange
    const event = {
      queryStringParameters: {
        name: 'test-file.csv'
      }
    } as APIGatewayProxyEvent;

    const mockError = new Error('Test error');
    (getSignedUrl as jest.Mock).mockRejectedValue(mockError);

    // Act
    const result = await handler(event);

    // Assert
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Internal server error'
    });
  });

  it('should use correct S3 parameters when generating signed URL', async () => {
    // Arrange
    const fileName = 'test-file.csv';
    const event = {
      queryStringParameters: {
        name: fileName
      }
    } as APIGatewayProxyEvent;

    // Act
    await handler(event);

    // Assert
    const putObjectCommand = (PutObjectCommand as jest.Mock).mock.calls[0][0];
    expect(putObjectCommand).toEqual({
      Bucket: 'XXXXXXXXXXX',
      Key: `uploaded/${fileName}`,
      ContentType: 'text/csv'
    });
  });
});
