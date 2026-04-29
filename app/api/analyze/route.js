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
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const REQUIRED_KEYS = ["currentHeadline", "newHeadline", "cta", "trust"];
const DEMO_MODE = process.env.DEMO_MODE === "true";

function validatePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }

  return REQUIRED_KEYS.every((key) => {
    const value = payload[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

function demoPayload() {
  return {
    currentHeadline: "Boost your conversion rate with clearer value messaging",
    newHeadline: "Turn more visitors into customers with headlines that highlight outcomes",
    cta: "Get your tailored headline suggestions",
    trust: "Trusted by growth teams shipping experiments every week",
  };
}

function serverErrorResponse(message, status = 502) {
  return Response.json(
    {
      error: "MODEL_RESPONSE_ERROR",
      message,
    },
    { status },
  );
}

export async function POST(req) {
  try {
    const body = await req.json();

    if (DEMO_MODE) {
      return Response.json(demoPayload(), { status: 200 });
    }

    const input = [
      {
        role: "system",
        content:
          "You are a conversion copywriter assistant. Return strictly valid JSON matching the schema.",
      },
      {
        role: "user",
        content:
          typeof body?.prompt === "string"
            ? body.prompt
            : "Analyze this landing-page copy and propose structured improvements.",
      },
    ];

    const data = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input,
      text: {
        format: {
          type: "json_schema",
          name: "headline_analysis",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: REQUIRED_KEYS,
            properties: {
              currentHeadline: { type: "string" },
              newHeadline: { type: "string" },
              cta: { type: "string" },
              trust: { type: "string" },
            },
          },
        },
      },
    });

    // Defensive checks around SDK/server errors.
    if (data?.error) {
      return serverErrorResponse(
        "The analysis service is temporarily unavailable. Please try again.",
        502,
      );
    }

    const choiceContent = data?.choices?.[0]?.message?.content;
    if (Array.isArray(data?.choices) && data.choices.length === 0) {
      return serverErrorResponse(
        "The analysis service returned an empty response. Please retry.",
        502,
      );
    }

    const textOutput =
      typeof data?.output_text === "string" && data.output_text.trim().length > 0
        ? data.output_text
        : typeof choiceContent === "string"
          ? choiceContent
          : null;

    if (!textOutput) {
      return serverErrorResponse(
        "We could not generate a valid analysis response. Please retry.",
        502,
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(textOutput);
    } catch {
      return serverErrorResponse(
        "We received an invalid response format. Please retry.",
        502,
      );
    }

    if (!validatePayload(parsed)) {
      return serverErrorResponse(
        "Generated analysis was incomplete. Please retry in a moment.",
        502,
      );
    }

    return Response.json(parsed, { status: 200 });
  } catch (error) {
    return Response.json(
      {
        error: "ANALYZE_REQUEST_FAILED",
        message: "Unable to process the request right now. Please try again.",
      },
      { status: 500 },
    );
  }
}
