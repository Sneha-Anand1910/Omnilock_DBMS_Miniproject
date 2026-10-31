import { NextResponse } from "next/server";
import { mongoClientPromise } from "@/lib/mongodb";

export async function GET() {
  try {
    const client = await mongoClientPromise;
    const db = client.db("omnilock_support");

    await db.command({ ping: 1 });

    return NextResponse.json({
      success: true,
      message: "MongoDB Atlas connected successfully!",
      database: db.databaseName,
    });
  } catch (error) {
    console.error("MongoDB connection failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "MongoDB connection failed",
      },
      { status: 500 }
    );
  }
}