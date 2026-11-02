import { getPreparation, mutatePreparation } from "@/lib/preparation";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) { return getPreparation((await params).id, "shipments"); }
export async function PATCH(request: Request, { params }: Context) { return mutatePreparation(request, "shipments", (await params).id); }
