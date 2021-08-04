import { AzureFunction, Context, HttpRequest } from "@azure/functions";

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest, connectionInfo: any): Promise<void> {    
  // docs: https://docs.microsoft.com/en-us/azure/azure-functions/functions-bindings-signalr-service-output?tabs=javascript
  context.res.json(connectionInfo);
};

export default httpTrigger;