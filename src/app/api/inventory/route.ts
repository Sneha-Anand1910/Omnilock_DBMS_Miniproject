import { NextRequest, NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { sql } from "@/lib/neon-http";

export const runtime = "nodejs";

function positiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ success: false, message: "Request origin is not allowed" }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ success: false, message: "Enter valid restock details" }, { status: 400 });
  }
  const { productId, warehouseId, quantity } = body as Record<string, unknown>;
  if (!positiveInt(productId) || !positiveInt(warehouseId) || !positiveInt(quantity)) {
    return NextResponse.json({ success: false, message: "Select a product and warehouse, then enter a positive whole quantity" }, { status: 400 });
  }

  try {
    // One statement is atomic. The existing unique constraint chooses create or
    // row-locked additive update; reserved_quantity is never changed on conflict.
    const rows = await sql`
      INSERT INTO public.inventory AS current_stock
        (product_id, warehouse_id, stock_quantity, reserved_quantity)
      VALUES (${productId}, ${warehouseId}, ${quantity}, 0)
      ON CONFLICT (product_id, warehouse_id) DO UPDATE
        SET stock_quantity = current_stock.stock_quantity + EXCLUDED.stock_quantity
        WHERE current_stock.stock_quantity <= 2147483647 - EXCLUDED.stock_quantity
      RETURNING inventory_id, product_id, warehouse_id, stock_quantity,
        reserved_quantity, stock_quantity - reserved_quantity AS available
    `;
    if (!rows.length) {
      return NextResponse.json({ success: false, message: "Restock would exceed the maximum supported stock quantity" }, { status: 409 });
    }
    const response = NextResponse.json({ success: true, added: quantity, record: rows[0] });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "23503") {
      return NextResponse.json({ success: false, message: "Product or warehouse no longer exists. Refresh the page and select again." }, { status: 404 });
    }
    if (code === "22003" || code === "23514") {
      return NextResponse.json({ success: false, message: "Restock exceeds an inventory limit. Refresh stock and try a smaller quantity." }, { status: 409 });
    }
    console.error("OmniLock inventory: restock unavailable.");
    return NextResponse.json({ success: false, message: "Restock could not be confirmed. Refresh inventory before retrying." }, { status: 503 });
  }
}
