import { NextResponse } from "next/server";
import { expireHolds } from "@/lib/expire-holds";

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

    const expiredCount = await expireHolds();

    return NextResponse.json({
      success: true,
      message: "Expired reservations processed successfully",
      expiredCount,
    });

  } catch {
    console.error("Reservation expiry request failed.");

    return NextResponse.json(
      {
        success: false,
        message: "Failed to process expired reservations",
      },
      { status: 500 }
    );
  }
}
