import { NextResponse } from "next/server";
import { sql } from "@/lib/neon-http";

export const runtime = "nodejs";

export async function GET() {
  try {
    const rows = await sql`
      SELECT current_database() AS database_name
    `;

    return NextResponse.json({
      success: true,
      message: "Connected to Neon PostgreSQL successfully!",
      database: rows[0].database_name,
    });
  } catch (error) {
    console.error("Neon connection error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Database connection failed",
      },
      { status: 500 }
    );
  }
}