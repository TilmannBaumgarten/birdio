import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";

export async function handler(event: any) {
  const tableName = Resource.Connections.name;

  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client);

  const command = new PutCommand({
    TableName: tableName,
    Item: {
      connectionId: event.requestContext.connectionId,
    },
  });

  const response = await docClient.send(command);

  return {
    statusCode: 200,
  };
}
