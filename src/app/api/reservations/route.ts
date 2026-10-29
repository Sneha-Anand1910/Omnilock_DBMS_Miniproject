import { NextResponse } from "next/server";
import { sql } from "@/lib/neon-http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      customerId,
      productId,
      warehouseId,
      quantity,
      channel,
    } = body;

    // Validate input
    if (
      !Number.isInteger(customerId) ||
      !Number.isInteger(productId) ||
      !Number.isInteger(warehouseId) ||
      !Number.isInteger(quantity) ||
      customerId <= 0 ||
      productId <= 0 ||
      warehouseId <= 0 ||
      quantity <= 0 ||
      !["WEBSITE", "MOBILE", "STORE"].includes(channel)
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid reservation details",
        },
        { status: 400 }
      );
    }

    // Execute PostgreSQL reservation function
    const result = await sql`
      SELECT reserve_inventory(
        ${customerId},
        ${productId},
        ${warehouseId},
        ${quantity},
        ${channel}
      ) AS order_id
    `;

    return NextResponse.json(
      {
        success: true,
        message: "Inventory reserved successfully",
        orderId: result[0].order_id,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Reservation API error:", error);

    // Temporary development-only error handling
    const message =
      error instanceof Error ? error.message : "Reservation failed";

    return NextResponse.json(
      {
        success: false,
        message: process.env.NODE_ENV === "development"
          ? message
          : "Reservation could not be completed",
      },
      { status: 400 }
    );
  }
}