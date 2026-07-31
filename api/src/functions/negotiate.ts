import { app, input, HttpRequest, InvocationContext, HttpResponseInit } from '@azure/functions';

const signalRConnectionInfo = input.generic({
    type: 'signalRConnectionInfo',
    name: 'connectionInfo',
    hubName: 'gameengine',
    connectionStringSetting: 'AzureSignalRConnectionString',
});

export async function negotiate(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    return {
        jsonBody: context.extraInputs.get(signalRConnectionInfo),
    };
}

app.http('negotiate', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    route: 'negotiate',
    extraInputs: [signalRConnectionInfo],
    handler: negotiate,
});
