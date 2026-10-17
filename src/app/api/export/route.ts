import { NextResponse } from "next/server";
import { authenticated } from "@/lib/supabase/server";
import { rpc } from "@/lib/profiles";
import { failure } from "@/lib/http";
export async function GET() {
  try {
    const { db } = await authenticated();
    const data = await rpc(db, "export_data");
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition":
          'attachment; filename="boramatch-meus-dados.json"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
