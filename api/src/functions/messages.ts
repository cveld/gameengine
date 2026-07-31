import { app, output, HttpRequest, InvocationContext, HttpResponseInit } from '@azure/functions';

const signalRMessages = output.generic({
    type: 'signalR',
    name: 'signalRMessages',
    hubName: 'gameengine',
});

export async function messages(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const body: any = await request.json();
    context.extraOutputs.set(signalRMessages, {
        target: body.type,
        arguments: [body],
    });
    return {};
}

app.http('messages', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'messages',
    extraOutputs: [signalRMessages],
    handler: messages,
});
