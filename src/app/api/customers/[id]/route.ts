import { deleteRecord, getRecord, saveRecord } from "@/lib/directory-crud";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) { return getRecord((await params).id, "customers"); }
export async function PUT(request: Request, { params }: Context) { return saveRecord(request, "customers", (await params).id); }
export async function DELETE(_request: Request, { params }: Context) { return deleteRecord((await params).id, "customers"); }
