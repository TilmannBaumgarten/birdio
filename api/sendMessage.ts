import { Resource } from "sst";

export async function handler(event: any) {
  const table = Resource.Connections;
  var res = {
    statusCode: 200,
    body: "ok",
  };
  return res;
}
