/// <reference path="./.sst/platform/config.d.ts" />
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export default $config({
  app(input) {
    return {
      name: "birdio",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    const table = new sst.aws.Dynamo("ConnectionsTable", {
      fields: {
        id: "string",
      },
      primaryIndex: { hashKey: "id" },
    });

    const websocketApi = setupWebsocket(table);
    const websocketUrl = pulumi.interpolate`${websocketApi.apiEndpoint}/prod`;

    const api = new sst.aws.ApiGatewayV2("StreamApi").route("GET /stream", {
      handler: "api/getStream.handler",
      link: [table],
      environment: {
        WEBHOOK_URL: websocketUrl,
      },
      permissions: [
        {
          actions: ["execute-api:ManageConnections"],
          resources: [pulumi.interpolate`${websocketApi.executionArn}/*`],
        },
      ],
    });

    const frontend = new sst.aws.Nextjs("Frontend", {
      path: "app",
      environment: {
        STREAM_API: api.url,
      },
    });

    return {
      websocketUrl,
    };
  },
});

function setupWebsocket(table: sst.aws.Dynamo) {
  // Websocket API
  const connectLambda = new sst.aws.Function("Connect", {
    handler: "api/websocket/connect.handler",
    link: [table],
  });

  const disconnectLambda = new sst.aws.Function("Disconnect", {
    handler: "api/websocket/disconnect.handler",
    link: [table],
  });

  const websocketApi = new aws.apigatewayv2.Api("WebsocketApi", {
    protocolType: "WEBSOCKET",
    routeSelectionExpression: "$request.body.action",
  });

  new aws.lambda.Permission("ConnectLambdaPermission", {
    action: "lambda:InvokeFunction",
    function: connectLambda.name,
    principal: "apigateway.amazonaws.com",
    // The ARN of the API Gateway will be dynamically provided when you set up the API Gateway integration
    sourceArn: websocketApi.executionArn.apply((arn) => `${arn}/*/*`),
  });

  new aws.lambda.Permission("DisconnectLambdaPermission", {
    action: "lambda:InvokeFunction",
    function: disconnectLambda.name,
    principal: "apigateway.amazonaws.com",
    // The ARN of the API Gateway will be dynamically provided when you set up the API Gateway integration
    sourceArn: websocketApi.executionArn.apply((arn) => `${arn}/*/*`),
  });

  const connectIntegration = new aws.apigatewayv2.Integration(
    "ConnectIntegration",
    {
      apiId: websocketApi.id,
      integrationType: "AWS_PROXY",
      integrationUri: connectLambda.nodes.function.invokeArn,
      integrationMethod: "POST",
    },
    { dependsOn: connectLambda }
  );

  const disconnectIntegration = new aws.apigatewayv2.Integration(
    "DisonnectIntegration",
    {
      apiId: websocketApi.id,
      integrationType: "AWS_PROXY",
      integrationUri: disconnectLambda.nodes.function.invokeArn,
      integrationMethod: "POST",
    },
    { dependsOn: disconnectLambda }
  );

  const disconnectRoute = new aws.apigatewayv2.Route(
    "DisonnectRoute",
    {
      apiId: websocketApi.id,
      routeKey: "$disconnect",
      target: pulumi.interpolate`integrations/${disconnectIntegration.id}`,
    },
    { dependsOn: disconnectIntegration }
  );

  const connectRoute = new aws.apigatewayv2.Route(
    "ConnectRoute",
    {
      apiId: websocketApi.id,
      routeKey: "$connect",
      target: pulumi.interpolate`integrations/${connectIntegration.id}`,
    },
    { dependsOn: connectIntegration }
  );

  const deployment = new aws.apigatewayv2.Deployment(
    "WebsocketDeployment",
    {
      apiId: websocketApi.id,
    },
    { dependsOn: [connectRoute, disconnectRoute] }
  );

  const stage = new aws.apigatewayv2.Stage("WebsocketStage", {
    apiId: websocketApi.id,
    name: "prod",
    autoDeploy: true,
  });

  return websocketApi;
}
