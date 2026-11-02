import { listPreparation, mutatePreparation } from "@/lib/preparation";
export const runtime = "nodejs";
export function GET(request: Request) { return listPreparation(request, "shipments"); }
export function POST(request: Request) { return mutatePreparation(request, "shipments"); }
