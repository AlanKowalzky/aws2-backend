import { APIGatewayProxyEvent } from 'aws-lambda';
import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { handler } from '../../src/functions/importProductsFile';

// Mock the AWS SDK
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');

describe('importProductsFile lambda', () => {
  const mockSignedUrl = 'https://mock-signed-url.com';
  
  beforeEach(() => {
    // Reset mocks before each test
    jest.resetAllMocks();
    
    // Mock the getSignedUrl function
    (getSignedUrl as jest.Mock).mockResolvedValue(mockSignedUrl);
    
    // Set environment variables
    process.env.BUCKET_NAME = 'test-bucket';
    process.env.BUCKET_REGION = 'us-east-1';
  });
  
  it('should return 400 if fileName is not provided', async () => {
    // Create mock event without fileName
    const event = {
      queryStringParameters: {}
    } as unknown as APIGatewayProxyEvent;
    
    const result = await handler(event);
    
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toHaveProperty('message', 'File name is required');
  });
  
  it('should return signed URL when fileName is provided', async () => {
    // Create mock event with fileName
    const event = {
      queryStringParameters: {
        name: 'test-file.csv'
      }
    } as unknown as APIGatewayProxyEvent;
    
    const result = await handler(event);
    
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe(mockSignedUrl);
    expect(getSignedUrl).toHaveBeenCalledTimes(1);
  });
  
  it('should handle errors and return 500 status code', async () => {
    // Create mock event with fileName
    const event = {
      queryStringParameters: {
        name: 'test-file.csv'
      }
    } as unknown as APIGatewayProxyEvent;
    
    // Mock getSignedUrl to throw an error
    (getSignedUrl as jest.Mock).mockRejectedValue(new Error('Test error'));
    
    const result = await handler(event);
    
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toHaveProperty('message', 'Internal server error');
  });
});
