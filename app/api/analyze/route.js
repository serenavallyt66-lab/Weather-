import { NextResponse } from "next/server";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const url = typeof body?.url === "string" ? body.url : "";

  if (!url) {
    return NextResponse.json(
      { error: "Please provide a product URL." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    currentHeadline: "Generic product headline with weak value proposition",
    newHeadline: "Get faster results with a headline focused on customer outcomes",
    cta: "Start Optimizing Your Product Page",
    trust: "Add social proof, guarantee messaging, and clearer shipping/returns info",
  });
}
