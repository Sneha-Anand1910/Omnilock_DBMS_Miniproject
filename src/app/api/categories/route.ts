import { listRecords, saveRecord } from "@/lib/directory-crud";
export const runtime = "nodejs";
export function GET(request: Request) { return listRecords(request, "categories"); }
export function POST(request: Request) { return saveRecord(request, "categories"); }
