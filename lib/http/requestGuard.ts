// Defensa CSRF para rutas mutantes (R-02): exige JSON y, si hay cabecera Origin, que sea del mismo host.
// Sin Origin (curl, pruebas de servidor) se permite: un navegador siempre lo envia en POST/PATCH entre sitios.
import { NextResponse, type NextRequest } from "next/server";

export function guardMutation(request: NextRequest): NextResponse | null {
  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return NextResponse.json({ error: "Content-Type debe ser application/json" }, { status: 415 });
  }
  const origin = request.headers.get("origin");
  if (origin !== null) {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (originHost === null || originHost !== host) {
      return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
    }
  }
  return null;
}
