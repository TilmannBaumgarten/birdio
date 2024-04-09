import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";

export async function handler(event: any) {
  const tableName = Resource.ConnectionsTable.name;

  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client);

  const scanCommand = new ScanCommand({
    TableName: tableName,
    ScanFilter: {
      connectionId: {
        AttributeValueList: [event.requestContext.connectionId],
        ComparisonOperator: "EQ",
      },
    },
  });

  const id = (await docClient.send(scanCommand)).Items![0].id;

  const command = new DeleteCommand({
    TableName: tableName,
    Key: {
      id,
    },
  });

  await docClient.send(command);

  return {
    statusCode: 200,
  };
}
