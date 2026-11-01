import { listCatalog, saveCatalog } from "@/lib/catalog-crud";
export const runtime = "nodejs";
export function GET(request: Request) { return listCatalog(request, "products"); }
export function POST(request: Request) { return saveCatalog(request, "products"); }
