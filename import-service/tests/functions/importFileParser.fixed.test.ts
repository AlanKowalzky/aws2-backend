import { S3Event } from 'aws-lambda';
import { S3Client, GetObjectCommand, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { handler } from '../../src/functions/importFileParser';
import { Readable } from 'stream';
import '@jest/globals';

// Mock the AWS SDK
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/client-sqs');

describe('importFileParser lambda (fixed version)', () => {
  // Mock S3 event with complete structure
  const mockS3Event: S3Event = {
    Records: [
      {
        eventVersion: '2.1',
        eventSource: 'aws:s3',
        awsRegion: 'us-east-1',
        eventTime: '2023-01-01T00:00:00.000Z',
        eventName: 'ObjectCreated:Put',
        userIdentity: {
          principalId: 'test-principal'
        },
        requestParameters: {
          sourceIPAddress: '127.0.0.1'
        },
        responseElements: {
          'x-amz-request-id': 'test-request-id',
          'x-amz-id-2': 'test-id-2'
        },
        s3: {
          s3SchemaVersion: '1.0',
          configurationId: 'test-config-id',
          bucket: {
            name: 'test-bucket',
            ownerIdentity: { principalId: 'test-principal' },
            arn: 'arn:aws:s3:::test-bucket'
          },
          object: {
            key: 'uploaded/test-file.csv',
            size: 1024,
            eTag: 'test-etag',
            sequencer: 'test-sequencer'
          }
        }
      }
    ]
  };

  // Mock CSV data
  const mockCsvData = [
    { id: '1', name: 'Product 1', price: '10.99' },
    { id: '2', name: 'Product 2', price: '20.99' }
  ];

  // Mock stream for CSV parsing
  const mockReadable = new Readable({
    read() {
      // Push mock CSV data
      mockCsvData.forEach(data => {
        this.push(JSON.stringify(data) + '\n');
      });
      this.push(null); // End of stream
    }
  });

  // Mock implementations
  let s3ClientSendMock: jest.Mock;
  let sqsClientSendMock: jest.Mock;

  beforeEach(() => {
    // Reset mocks before each test
    jest.resetAllMocks();
    
    // Set environment variables
    process.env.BUCKET_NAME = 'test-bucket';
    process.env.BUCKET_REGION = 'us-east-1';
    process.env.SQS_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789012/test-queue';
    
    // Mock S3 GetObjectCommand response
    const mockGetObjectResponse = {
      Body: mockReadable
    };
    
    // Setup S3Client mock with proper return values
    s3ClientSendMock = jest.fn();
    s3ClientSendMock.mockImplementation((command) => {
      if (command instanceof GetObjectCommand) {
        return Promise.resolve(mockGetObjectResponse);
      } else if (command instanceof CopyObjectCommand || command instanceof DeleteObjectCommand) {
        return Promise.resolve({});
      }
      return Promise.resolve({}); // Default return value
    });
    
    (S3Client as jest.Mock).mockImplementation(() => ({
      send: s3ClientSendMock
    }));
    
    // Setup SQSClient mock with proper return value
    sqsClientSendMock = jest.fn();
    sqsClientSendMock.mockImplementation(() => {
      return Promise.resolve({});
    });
    
    (SQSClient as jest.Mock).mockImplementation(() => ({
      send: sqsClientSendMock
    }));
  });

  it('should process CSV file and send records to SQS', async () => {
    // Call the handler
    await handler(mockS3Event);
    
    // Get the mocked instances
    const s3ClientInstance = (S3Client as jest.Mock).mock.instances[0];
    const sqsClientInstance = (SQSClient as jest.Mock).mock.instances[0];
    
    // Verify S3 operations
    expect(s3ClientInstance.send).toHaveBeenCalledWith(expect.any(GetObjectCommand));
    expect(s3ClientInstance.send).toHaveBeenCalledWith(expect.any(CopyObjectCommand));
    expect(s3ClientInstance.send).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
    
    // Verify SQS operations - should be called for each CSV record
    expect(sqsClientInstance.send).toHaveBeenCalledTimes(mockCsvData.length);
    
    // Verify the correct parameters for SQS SendMessageCommand with proper MessageBody check
    const sendMessageCalls = sqsClientSendMock.mock.calls.filter(
      (call) => call[0] instanceof SendMessageCommand
    );
    
    expect(sendMessageCalls.length).toBe(mockCsvData.length);
    
    mockCsvData.forEach((data) => {
      const matchingCall = sendMessageCalls.find(
        (call) => {
          const command = call[0];
          if (command instanceof SendMessageCommand && command.input && command.input.MessageBody) {
            const messageBody = JSON.parse(command.input.MessageBody);
            return messageBody.id === data.id;
          }
          return false;
        }
      );
      
      expect(matchingCall).toBeTruthy();
      const command = matchingCall[0];
      expect(command.input.QueueUrl).toBe(process.env.SQS_QUEUE_URL);
    });
  });

  it('should skip files not in the uploaded folder', async () => {
    // Create event with file not in uploaded folder
    const nonUploadedEvent: S3Event = {
      Records: [
        {
          ...mockS3Event.Records[0],
          s3: {
            ...mockS3Event.Records[0].s3,
            object: {
              ...mockS3Event.Records[0].s3.object,
              key: 'other-folder/test-file.csv'
            }
          }
        }
      ]
    };
    
    await handler(nonUploadedEvent);
    
    // Get the mocked S3 instance
    const s3ClientInstance = (S3Client as jest.Mock).mock.instances[0];
    
    // Verify S3 operations were not called
    expect(s3ClientInstance.send).not.toHaveBeenCalledWith(expect.any(GetObjectCommand));
  });

  it('should handle errors during processing', async () => {
    // Setup S3Client to throw an error
    (S3Client as jest.Mock).mockImplementation(() => ({
      send: jest.fn().mockRejectedValue(new Error('Test error'))
    }));
    
    // Expect the handler to throw an error
    await expect(handler(mockS3Event)).rejects.toThrow('Test error');
  });
});
