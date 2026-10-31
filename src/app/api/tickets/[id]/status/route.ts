import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { mongoClientPromise } from "@/lib/mongodb";

type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED";

const allowedTransitions: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ["IN_PROGRESS"],
  IN_PROGRESS: ["RESOLVED"],
  RESOLVED: [],
};

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    // Validate ticket ID
    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid ticket ID" },
        { status: 400 }
      );
    }

    // Read and validate request
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Request body must be an object" },
        { status: 400 }
      );
    }

    const { currentStatus, newStatus } = body as Record<string, unknown>;

    const validStatuses: TicketStatus[] = [
      "OPEN",
      "IN_PROGRESS",
      "RESOLVED",
    ];

    if (
      typeof currentStatus !== "string" ||
      typeof newStatus !== "string" ||
      !validStatuses.includes(currentStatus as TicketStatus) ||
      !validStatuses.includes(newStatus as TicketStatus)
    ) {
      return NextResponse.json(
        { error: "Invalid ticket status" },
        { status: 400 }
      );
    }

    if (
      !allowedTransitions[currentStatus as TicketStatus].includes(
        newStatus as TicketStatus
      )
    ) {
      return NextResponse.json(
        {
          error: `Transition ${currentStatus} → ${newStatus} is not allowed`,
        },
        { status: 400 }
      );
    }

    const client = await mongoClientPromise;
    const tickets = client.db("omnilock_support").collection("tickets");

    // Atomic conditional update
    const result = await tickets.updateOne(
      {
        _id: new ObjectId(id),
        status: currentStatus,
      },
      {
        $set: {
          status: newStatus,
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      const existingTicket = await tickets.findOne(
        { _id: new ObjectId(id) },
        { projection: { status: 1 } }
      );

      if (!existingTicket) {
        return NextResponse.json(
          { error: "Ticket not found" },
          { status: 404 }
        );
      }

      return NextResponse.json(
        {
          error: "Status conflict: ticket has already been updated",
          actualStatus: existingTicket.status,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Ticket status updated successfully",
      previousStatus: currentStatus,
      newStatus,
    });
  } catch (error) {
    console.error("Ticket status update error:", error);

    return NextResponse.json(
      { error: "Unable to update ticket status" },
      { status: 500 }
    );
  }
}