import { NextResponse } from "next/server";

export function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!supabaseUrl) {
    return NextResponse.redirect(new URL("/?calendar_error=configuration", request.url));
  }

  const appOrigin = new URL(request.url).origin;
  const authorizeUrl = new URL("/auth/v1/authorize", supabaseUrl);
  authorizeUrl.searchParams.set("provider", "google");
  authorizeUrl.searchParams.set("redirect_to", `${appOrigin}/`);
  authorizeUrl.searchParams.set("scopes", "https://www.googleapis.com/auth/calendar.events.readonly");
  authorizeUrl.searchParams.set("prompt", "consent");
  authorizeUrl.searchParams.set("include_granted_scopes", "true");

  return NextResponse.redirect(authorizeUrl);
}
