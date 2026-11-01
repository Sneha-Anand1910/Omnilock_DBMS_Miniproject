import { getCatalog, saveCatalog, deleteCatalog } from "@/lib/catalog-crud";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) { return getCatalog((await params).id, "products"); }
export async function PUT(request: Request, { params }: Context) { return saveCatalog(request, "products", (await params).id); }
export async function DELETE(_request: Request, { params }: Context) { return deleteCatalog((await params).id, "products"); }
