import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";

export async function handler(event: any) {
  const tableName = Resource.ConnectionsTable.name;

  if (!event.queryStringParameters.id) {
    return {
      statusCode: 400,
    };
  }

  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client);

  const command = new PutCommand({
    TableName: tableName,
    Item: {
      connectionId: event.requestContext.connectionId,
      id: event.queryStringParameters.id,
    },
  });

  const response = await docClient.send(command);

  return {
    statusCode: 200,
  };
}
