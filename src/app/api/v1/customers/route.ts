import { apiRoute } from "@/server/api/handler";
import * as r from "@/server/api/v1/resources";

export const GET = apiRoute({ route: "GET /v1/customers", scope: "customers:read" }, r.listCustomers);
export const POST = apiRoute({ route: "POST /v1/customers", scope: "customers:write" }, r.createCustomer);
