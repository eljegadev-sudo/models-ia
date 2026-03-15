import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateProfileSuggestion } from "@/lib/ai";

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user || (session.user as { role: string }).role !== "CREATOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await generateProfileSuggestion();
    return NextResponse.json(profile);
  } catch (error) {
    console.error("AI suggestion error:", error);
    return NextResponse.json(
      { error: "Failed to generate suggestion" },
      { status: 500 }
    );
  }
}
