import { S3Event } from 'aws-lambda';
import { S3Client, GetObjectCommand, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import csv from 'csv-parser';
import { Readable } from 'stream';

const BUCKET_NAME = process.env.BUCKET_NAME;
const BUCKET_REGION = process.env.BUCKET_REGION || 'us-east-1';

const s3Client = new S3Client({ region: BUCKET_REGION });
const sqsClient = new SQSClient({ region: BUCKET_REGION });

export const handler = async (event: S3Event): Promise<void> => {
  console.log('importFileParser lambda invoked with event:', JSON.stringify(event));

  try {
    // Process each record (S3 object) from the event
    for (const record of event.Records) {
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

      console.log(`Processing file: ${key} from bucket: ${bucket}`);

      // Skip if not in the uploaded folder
      if (!key.startsWith('uploaded/')) {
        console.log(`Skipping file ${key} as it's not in the uploaded folder`);
        continue;
      }

      // Get the object from S3
      const getObjectParams = {
        Bucket: bucket,
        Key: key,
      };

      const { Body } = await s3Client.send(new GetObjectCommand(getObjectParams));

      if (!Body) {
        console.error(`Failed to get object body for ${key}`);
        continue;
      }

      // Parse CSV file
      await new Promise<void>((resolve, reject) => {
        const stream = Body as Readable;
        
        stream
          .pipe(csv())
          .on('data', async (data: Record<string, any>) => {
            console.log('Parsed CSV record:', JSON.stringify(data));
            
            // Send record to SQS queue
            try {
              await sqsClient.send(new SendMessageCommand({
                QueueUrl: process.env.SQS_QUEUE_URL,
                MessageBody: JSON.stringify(data)
              }));
              console.log('Sent record to SQS:', JSON.stringify(data));
            } catch (sqsError) {
              console.error('Error sending message to SQS:', sqsError);
            }
          })
          .on('error', (error: Error) => {
            console.error('Error parsing CSV:', error);
            reject(error);
          })
          .on('end', async () => {
            console.log(`Finished processing ${key}`);
            
            // Optional: Move file from uploaded to parsed folder
            const newKey = key.replace('uploaded/', 'parsed/');
            
            try {
              // Copy to parsed folder
              await s3Client.send(new CopyObjectCommand({
                Bucket: bucket,
                CopySource: `${bucket}/${key}`,
                Key: newKey
              }));
              
              console.log(`Copied ${key} to ${newKey}`);
              
              // Delete from uploaded folder
              await s3Client.send(new DeleteObjectCommand({
                Bucket: bucket,
                Key: key
              }));
              
              console.log(`Deleted ${key}`);
            } catch (moveError) {
              console.error('Error moving file:', moveError);
            }
            
            resolve();
          });
      });
    }
  } catch (error) {
    console.error('Error in importFileParser lambda:', error);
    throw error;
  }
};
