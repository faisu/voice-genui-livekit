import { RoomAgentDispatch, RoomConfiguration } from "livekit-server-sdk";
import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import {
  TOKEN_TTL,
  checkRateLimit,
  getClientIp,
  isOriginAllowed,
  sanitizeParticipantLabel,
} from "@/lib/tokenSecurity";

const AGENT_NAME = process.env.LIVEKIT_AGENT_NAME ?? "voice-genui-agent";

export async function POST(request: Request) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

  if (!apiKey || !apiSecret || !livekitUrl) {
    return NextResponse.json(
      { error: "LiveKit environment variables are not configured" },
      { status: 500 },
    );
  }

  if (!isOriginAllowed(request)) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  }

  let body: {
    roomName?: string;
    participantName?: string;
  } = {};

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ip = getClientIp(request);
  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many session requests. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rate.retryAfterSec),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  const roomName = sanitizeParticipantLabel(
    body.roomName,
    `voice-genui-${crypto.randomUUID().slice(0, 8)}`,
    96,
  );
  const participantName = sanitizeParticipantLabel(
    body.participantName,
    `user-${Date.now()}`,
    64,
  );

  const token = new AccessToken(apiKey, apiSecret, {
    identity: participantName,
    ttl: TOKEN_TTL,
  });

  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  // Dispatch the voice agent into this room when the user connects.
  token.roomConfig = new RoomConfiguration({
    name: roomName,
    agents: [
      new RoomAgentDispatch({
        agentName: AGENT_NAME,
      }),
    ],
  });

  return NextResponse.json(
    {
      token: await token.toJwt(),
      roomName,
      participantName,
      url: livekitUrl,
      agentName: AGENT_NAME,
    },
    {
      headers: {
        "X-RateLimit-Remaining": String(rate.remaining),
        "Cache-Control": "no-store",
      },
    },
  );
}
