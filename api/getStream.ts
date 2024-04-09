import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";

import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";

import { Resource } from "sst";

const apiGatewayManagementApi = new ApiGatewayManagementApiClient({
  endpoint: process.env.WEBHOOK_URL?.replace("wss", "https"),
  region: "eu-central-1",
});

const dynamoDBClient = new DynamoDBClient({
  region: "eu-central-1",
});

export async function handler(event: any) {
  const connectionId = (
    await dynamoDBClient.send(
      new GetItemCommand({
        TableName: Resource.ConnectionsTable.name,
        Key: {
          id: { S: "sattelhof-raspberrypi" },
        },
      })
    )
  ).Item!.connectionId.S;

  if (!connectionId) {
    return {
      statusCode: 400,
    };
  }

  await apiGatewayManagementApi.send(
    new PostToConnectionCommand({
      Data: "hello from lambda!",
      ConnectionId: connectionId,
    })
  );

  return {
    statusCode: 200,
  };
}
