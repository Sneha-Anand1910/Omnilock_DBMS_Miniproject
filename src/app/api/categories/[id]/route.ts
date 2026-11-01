import { deleteRecord, getRecord, saveRecord } from "@/lib/directory-crud";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) { return getRecord((await params).id, "categories"); }
export async function PUT(request: Request, { params }: Context) { return saveRecord(request, "categories", (await params).id); }
export async function DELETE(_request: Request, { params }: Context) { return deleteRecord((await params).id, "categories"); }
