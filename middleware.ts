import { NextRequest, NextResponse } from "next/server";

// Auth bypassed — using mock data for UI validation
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Redirect root /login directly to dashboard
  if (pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
