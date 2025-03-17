import { S3Event } from 'aws-lambda';
import { S3Client, GetObjectCommand, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { handler } from '../../src/functions/importFileParser';
import { Readable } from 'stream';

// Mock the AWS SDK
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/client-sqs');

describe('importFileParser lambda', () => {
  // Mock S3 event
  const mockS3Event: S3Event = {
    Records: [
      {
        eventVersion: '2.1',
        eventSource: 'aws:s3',
        awsRegion: 'us-east-1',
        eventTime: '2023-01-01T00:00:00.000Z',
        eventName: 'ObjectCreated:Put',
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
    
    // Setup S3Client mock
    const s3ClientSendMock = jest.fn();
    s3ClientSendMock.mockImplementation((command) => {
      if (command instanceof GetObjectCommand) {
        return Promise.resolve(mockGetObjectResponse);
      } else if (command instanceof CopyObjectCommand || command instanceof DeleteObjectCommand) {
        return Promise.resolve({});
      }
    });
    
    (S3Client as jest.Mock).mockImplementation(() => ({
      send: s3ClientSendMock
    }));
    
    // Setup SQSClient mock
    const sqsClientSendMock = jest.fn().mockResolvedValue({});
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
    
    // Verify the correct parameters for SQS SendMessageCommand
    mockCsvData.forEach((data, index) => {
      const sendMessageCall = sqsClientInstance.send.mock.calls.find(
        call => call[0] instanceof SendMessageCommand && 
        JSON.parse(call[0].input.MessageBody).id === data.id
      );
      
      expect(sendMessageCall).toBeTruthy();
      expect(sendMessageCall[0].input.QueueUrl).toBe(process.env.SQS_QUEUE_URL);
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
