import { listPreparation, mutatePreparation } from "@/lib/preparation";
export const runtime = "nodejs";
export function GET(request: Request) { return listPreparation(request, "fulfillment"); }
export function POST(request: Request) { return mutatePreparation(request, "fulfillment"); }
