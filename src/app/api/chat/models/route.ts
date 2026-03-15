import { NextResponse } from "next/server";
import { getChatModelList } from "@/lib/venice";

export async function GET() {
  return NextResponse.json(getChatModelList());
}
