import { getInventoryAnalytics } from "@/lib/inventory-analytics";

export const runtime = "nodejs";

function parseOptionalId(value: string | null): number | null | undefined {
  if (value === null || value === "") return null;
  if (!/^[1-9]\d*$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= 2147483647 ? parsed : undefined;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const search = (params.get("search") ?? "").trim();
  const thresholdText = params.get("threshold");
  const validThreshold = thresholdText === null || /^(0|[1-9]\d*)$/.test(thresholdText);
  const threshold = thresholdText === null ? 10 : Number(thresholdText);
  const warehouseId = parseOptionalId(params.get("warehouseId"));
  const categoryId = parseOptionalId(params.get("categoryId"));

  if (search.length > 100) return Response.json({ error: "Search must be 100 characters or fewer." }, { status: 400 });
  if (!validThreshold || !Number.isSafeInteger(threshold) || threshold < 0 || threshold > 1000000) {
    return Response.json({ error: "Threshold must be a whole number from 0 to 1,000,000." }, { status: 400 });
  }
  if (warehouseId === undefined || categoryId === undefined) {
    return Response.json({ error: "Warehouse and category filters must be positive integer IDs." }, { status: 400 });
  }

  const data = await getInventoryAnalytics({ search, warehouseId, categoryId, threshold });
  if (!data) return Response.json({ error: "Inventory analytics are temporarily unavailable." }, { status: 503 });
  return Response.json(data);
}
