import { listRecords, saveRecord } from "@/lib/directory-crud";
export const runtime = "nodejs";
export function GET(request: Request) { return listRecords(request, "customers"); }
export function POST(request: Request) { return saveRecord(request, "customers"); }
