import { getPreparation, mutatePreparation } from "@/lib/preparation";
import { dispatchAction } from "@/lib/dispatch";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) { return getPreparation((await params).id, "shipments"); }
export async function PATCH(request: Request, { params }: Context) { return mutatePreparation(request, "shipments", (await params).id); }
// Delivery transitions are separate from Stage A's PATCH for pending metadata.
export async function PUT(request: Request, { params }: Context) { return dispatchAction(request, (await params).id, "transition"); }
