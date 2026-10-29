import { NextResponse } from "next/server";
import { sql } from "@/lib/neon-http";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const orderId = Number(id);

    // Validate the order ID
    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid order ID",
        },
        { status: 400 }
      );
    }

    // Call PostgreSQL cancellation function
    const result = await sql`
      SELECT cancel_order(${orderId}) AS message
    `;

    return NextResponse.json({
      success: true,
      orderId,
      message: result[0].message,
    });

  } catch (error) {
    console.error("Order cancellation error:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          process.env.NODE_ENV === "development" &&
          error instanceof Error
            ? error.message
            : "Order cancellation failed",
      },
      { status: 400 }
    );
  }
}