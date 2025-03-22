import { APIGatewayTokenAuthorizerEvent, APIGatewayAuthorizerResult } from 'aws-lambda';
import { config } from 'dotenv';
import * as path from 'path';

// Load environment variables from .env file in the main directory
config({ path: path.resolve(__dirname, '../../.env') });

// Log loaded environment variables for debugging (excluding sensitive values)
console.log('Environment variables loaded:', Object.keys(process.env).filter(key => !key.includes('AWS') && !key.includes('NODE')));

export const handler = async (event: APIGatewayTokenAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
  console.log('Authorization event:', JSON.stringify(event));

  // If no authorization token is provided, return 401 Unauthorized
  if (!event.authorizationToken) {
    console.log('No authorization token provided');
    return generatePolicy('undefined', 'Deny', event.methodArn);
  }

  try {
    // Extract token from the Authorization header
    // Format: "Authorization: Basic base64credentials"
    const token = event.authorizationToken.split(' ')[1];
    
    if (!token) {
      console.log('Invalid authorization token format');
      return generatePolicy('undefined', 'Deny', event.methodArn);
    }

    // Decode the Base64 token
    const credentials = Buffer.from(token, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    console.log(`Attempting to authorize user: ${username}`);

    // Check if the credentials match any of the environment variables
    const expectedPassword = process.env[username];

    if (expectedPassword && expectedPassword === password) {
      console.log('Authorization successful');
      return generatePolicy(username, 'Allow', event.methodArn);
    } else {
      console.log('Authorization failed: Invalid credentials');
      return generatePolicy(username, 'Deny', event.methodArn);
    }
  } catch (error) {
    console.error('Error during authorization:', error);
    return generatePolicy('undefined', 'Deny', event.methodArn);
  }
};

// Helper function to generate IAM policy
const generatePolicy = (
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string
): APIGatewayAuthorizerResult => {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource,
        },
      ],
    },
  };
};
