import { NextResponse } from "next/server";
import { ticketCollection } from "../ticket-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const tickets = await ticketCollection();

    const results = await tickets
      .aggregate([
        {
          $match: {
            status: {
              $in: ["OPEN", "IN_PROGRESS", "RESOLVED"],
            },
          },
        },
        {
          $facet: {
            total: [
              { $count: "count" },
            ],

            byStatus: [
              {
                $group: {
                  _id: "$status",
                  count: { $sum: 1 },
                },
              },
              { $sort: { _id: 1 } },
            ],

            byIssueType: [
              {
                $group: {
                  _id: "$issueType",
                  count: { $sum: 1 },
                },
              },
              { $sort: { count: -1, _id: 1 } },
            ],
          },
        },
      ])
      .toArray();

    const data = results[0] ?? {
      total: [],
      byStatus: [],
      byIssueType: [],
    };

    const getCount = (status: string) =>
      data.byStatus.find(
        (item: { _id: string; count: number }) => item._id === status
      )?.count ?? 0;

    return NextResponse.json({
      success: true,
      totalTickets: data.total[0]?.count ?? 0,
      statusCounts: {
        OPEN: getCount("OPEN"),
        IN_PROGRESS: getCount("IN_PROGRESS"),
        RESOLVED: getCount("RESOLVED"),
      },
      issueTypeCounts: data.byIssueType.map(
        (item: { _id: string; count: number }) => ({
          issueType: item._id,
          count: item.count,
        })
      ),
      mostCommonIssue: data.byIssueType[0]?._id ?? null,
    });
  } catch (error) {
    console.error("OmniLock tickets: analytics unavailable.", error instanceof Error ? error.name : "unknown error");

    return NextResponse.json(
      { success: false, error: "Ticket analytics unavailable. Check MongoDB connectivity and retry." },
      { status: 503 }
    );
  }
}
