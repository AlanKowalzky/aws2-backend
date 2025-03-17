import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const BUCKET_NAME = process.env.BUCKET_NAME;
const BUCKET_REGION = process.env.BUCKET_REGION || 'us-east-1';

const s3Client = new S3Client({ region: BUCKET_REGION });

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('importProductsFile lambda invoked with event:', JSON.stringify(event));

  try {
    // Get fileName from query parameters
    const fileName = event.queryStringParameters?.name;

    if (!fileName) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Credentials': true,
        },
        body: JSON.stringify({ message: 'File name is required' }),
      };
    }

    // Create command for S3 PutObject
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `uploaded/${fileName}`,
      ContentType: 'text/csv',
    });

    // Generate signed URL
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    console.log('Generated signed URL:', signedUrl);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
      },
      body: signedUrl,
    };
  } catch (error) {
    console.error('Error in importProductsFile lambda:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
      },
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};
