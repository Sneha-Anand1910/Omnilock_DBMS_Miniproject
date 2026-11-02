import { getPreparation, mutatePreparation } from "@/lib/preparation";
import { dispatchAction } from "@/lib/dispatch";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) { return getPreparation((await params).id, "fulfillment"); }
export async function PATCH(request: Request, { params }: Context) { return mutatePreparation(request, "fulfillment", (await params).id); }
// POST on an existing fulfillment dispatches it; collection POST still creates it.
export async function POST(request: Request, { params }: Context) { return dispatchAction(request, (await params).id, "dispatch"); }
