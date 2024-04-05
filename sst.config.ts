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
    const table = new sst.aws.Dynamo("Connections", {
      fields: {
        connectionId: "string",
      },
      primaryIndex: { hashKey: "connectionId" },
    });

    const websocketApi = setupWebsocket(table);

    return {
      websocketUri: websocketApi.apiEndpoint,
    };
  },
});

function setupWebsocket(table: sst.aws.Dynamo) {
  // Websocket API
  const connectLambda = new sst.aws.Function("Connect", {
    handler: "api/connect.handler",
    link: [table],
  });

  const disconnectLambda = new sst.aws.Function("Disconnect", {
    handler: "api/disconnect.handler",
    link: [table],
  });

  const sendMessageLambda = new sst.aws.Function("SendMessage", {
    handler: "api/sendMessage.handler",
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
    function: sendMessageLambda.name,
    principal: "apigateway.amazonaws.com",
    // The ARN of the API Gateway will be dynamically provided when you set up the API Gateway integration
    sourceArn: websocketApi.executionArn.apply((arn) => `${arn}/*/*`),
  });

  new aws.lambda.Permission("SendMessageLambdaPermission", {
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

  const sendMessageIntegration = new aws.apigatewayv2.Integration(
    "SendMessageIntegration",
    {
      apiId: websocketApi.id,
      integrationType: "AWS_PROXY",
      integrationUri: sendMessageLambda.nodes.function.invokeArn,
      integrationMethod: "POST",
    },
    { dependsOn: sendMessageLambda }
  );

  const connectRoute = new aws.apigatewayv2.Route(
    "ConnecttRoute",
    {
      apiId: websocketApi.id,
      routeKey: "$connect",
      target: pulumi.interpolate`integrations/${connectIntegration.id}`,
    },
    { dependsOn: connectIntegration }
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

  const sendMessageRoute = new aws.apigatewayv2.Route(
    "SendMessageRoute",
    {
      apiId: websocketApi.id,
      routeKey: "sendmessage",
      target: pulumi.interpolate`integrations/${sendMessageIntegration.id}`,
      authorizationType: "NONE",
    },
    { dependsOn: sendMessageIntegration }
  );

  const deployment = new aws.apigatewayv2.Deployment(
    "WebsocketDeployment",
    {
      apiId: websocketApi.id,
    },
    { dependsOn: [connectRoute, disconnectRoute, sendMessageRoute] }
  );

  const websocketLogs = new aws.cloudwatch.LogGroup("WebsocketLogs", {
    name: "WebsocketLogs",
  });

  const stage = new aws.apigatewayv2.Stage("WebsocketStage", {
    apiId: websocketApi.id,
    name: "prod",
    autoDeploy: true,
    accessLogSettings: {
      destinationArn: websocketLogs.arn,
      format: JSON.stringify({
        requestId: "$context.requestId",
        ip: "$context.identity.sourceIp",
        requestTime: "$context.requestTime",
        message: "$context.message",
        integrationErrorMessage: "$context.integrationErrorMessage",
        status: "$context.status",
        errorMessage: "$context.error.message",
        responseType: "$context.error.responseType",
      }),
    },
  });

  return websocketApi;
}
