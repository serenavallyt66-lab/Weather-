import { NextResponse } from "next/server";

const APPROVED_CUSTOM_DOMAINS = ["shop.example.com"];

function isValidShopifyProductUrl(input) {
  try {
    const parsed = new URL(input);
    const hostname = parsed.hostname.toLowerCase();
    const hasShopifyHostname = hostname.endsWith(".myshopify.com");
    const hasApprovedCustomDomain = APPROVED_CUSTOM_DOMAINS.includes(hostname);
    const isProductPath = /^\/products\//.test(parsed.pathname);

    return (hasShopifyHostname || hasApprovedCustomDomain) && isProductPath;
  } catch {
    return false;
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const url = typeof body?.url === "string" ? body.url : "";

  if (!isValidShopifyProductUrl(url)) {
    return NextResponse.json(
      { error: "Invalid Shopify product URL" },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, url });
}
