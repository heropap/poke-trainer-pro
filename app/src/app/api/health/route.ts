export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    status: "ok",
    version: "v0",
    timestamp: new Date().toISOString(),
  });
}
