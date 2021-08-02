import { AzureFunction, Context, HttpRequest } from "@azure/functions";

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<any> {
  return {
    // docs: https://docs.microsoft.com/en-us/azure/azure-functions/functions-bindings-signalr-service-output?tabs=javascript
    //"userId": req.query.userid,
    "target": req.body.type,
    "arguments": [ req.body ]
  };
};

export default httpTrigger;