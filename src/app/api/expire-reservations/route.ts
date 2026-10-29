import { NextResponse } from "next/server";
import { sql } from "@/lib/neon-http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const secret = process.env.EXPIRY_API_SECRET;

    if (!secret) {
      return NextResponse.json(
        {
          success: false,
          message: "Expiry API is not configured",
        },
        { status: 503 }
      );
    }

    const authorization = request.headers.get("authorization");

    if (authorization !== `Bearer ${secret}`) {
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const result = await sql`
      SELECT expire_reservations() AS expired_count
    `;

    return NextResponse.json({
      success: true,
      message: "Expired reservations processed successfully",
      expiredCount: result[0].expired_count,
    });

  } catch (error) {
    console.error("Reservation expiry error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to process expired reservations",
      },
      { status: 500 }
    );
  }
}