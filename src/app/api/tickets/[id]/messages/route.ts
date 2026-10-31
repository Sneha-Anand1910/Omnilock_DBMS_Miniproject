import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { mongoClientPromise } from "@/lib/mongodb";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid ticket ID" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { sender, text } = body;
    const validatedSender = sender as TicketMessage["sender"];

    if (!["CUSTOMER", "SUPPORT"].includes(sender)) {
      return NextResponse.json(
        { error: "Invalid sender" },
        { status: 400 }
      );
    }

    if (
      typeof text !== "string" ||
      text.trim().length === 0 ||
      text.length > 2000
    ) {
      return NextResponse.json(
        { error: "Message must contain 1–2000 characters" },
        { status: 400 }
      );
    }

    const client = await mongoClientPromise;
    type TicketMessage = {
    sender: "CUSTOMER" | "SUPPORT";
    text: string;
    createdAt: Date;
    };

    type TicketDocument = {
    messages: TicketMessage[];
    updatedAt: Date;
    };

    const collection = client
    .db("omnilock_support")
    .collection<TicketDocument>("tickets");

    const now = new Date();

    const result = await collection.updateOne(
      {
        _id: new ObjectId(id),
        "messages.99": { $exists: false },
      },
      {
        $push: {
          messages: {
            sender: validatedSender,
            text: text.trim(),
            createdAt: now,
          },
        },
        $set: { updatedAt: now },
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: "Ticket not found or message limit reached" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Message added successfully",
    });
  } catch (error) {
    console.error("Ticket message error:", error);
    return NextResponse.json(
      { error: "Unable to add message" },
      { status: 500 }
    );
  }
}