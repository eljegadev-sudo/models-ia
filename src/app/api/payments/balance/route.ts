import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getBalance, addFunds, getTransactionHistory } from "@/lib/payments";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [balance, transactions] = await Promise.all([
      getBalance(session.user.id),
      getTransactionHistory(session.user.id),
    ]);

    return NextResponse.json({
      balance,
      transactions: transactions.map((t) => ({
        ...t,
        amount: Number(t.amount),
      })),
    });
  } catch (error) {
    console.error("Balance error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { amount } = await request.json();
    if (!amount || amount <= 0 || amount > 10000) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const user = await addFunds(session.user.id, amount);
    return NextResponse.json({ balance: Number(user.balance) });
  } catch (error) {
    console.error("Add funds error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
