"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Position {
  ticker: string;
  side: "yes" | "no";
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
}

interface AccountData {
  balance: number;
  positions: Position[];
  totalUnrealizedPnL: number;
  totalRealizedPnL: number;
  mode: "paper" | "live";
}

interface PositionsCardProps {
  account: AccountData | null;
  loading: boolean;
}

export function PositionsCard({ account, loading }: PositionsCardProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Account & Positions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  if (!account) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Account & Positions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No data available</p>
        </CardContent>
      </Card>
    );
  }

  const totalPnL = account.totalUnrealizedPnL + account.totalRealizedPnL;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg">Account</CardTitle>
          <Badge variant={account.mode === "live" ? "destructive" : "secondary"}>
            {account.mode.toUpperCase()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Balance Section */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Balance:</span>
            <span className="font-medium">${account.balance.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Unrealized P&L:</span>
            <span className={account.totalUnrealizedPnL >= 0 ? "text-green-600" : "text-red-600"}>
              ${account.totalUnrealizedPnL.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Realized P&L:</span>
            <span className={account.totalRealizedPnL >= 0 ? "text-green-600" : "text-red-600"}>
              ${account.totalRealizedPnL.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between text-sm border-t pt-2">
            <span className="font-medium">Total P&L:</span>
            <span className={`font-medium ${totalPnL >= 0 ? "text-green-600" : "text-red-600"}`}>
              ${totalPnL.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Positions Section */}
        {account.positions.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Open Positions</h4>
            <div className="space-y-2">
              {account.positions.map((pos, idx) => (
                <div key={idx} className="text-xs bg-muted p-2 rounded-md">
                  <div className="flex justify-between">
                    <span className="font-mono">{pos.ticker}</span>
                    <Badge variant="outline" className="text-xs">
                      {pos.side.toUpperCase()} x{pos.quantity}
                    </Badge>
                  </div>
                  <div className="flex justify-between mt-1 text-muted-foreground">
                    <span>Avg: {(pos.avgPrice * 100).toFixed(0)}c</span>
                    <span>Now: {(pos.currentPrice * 100).toFixed(0)}c</span>
                    <span className={pos.unrealizedPnL >= 0 ? "text-green-600" : "text-red-600"}>
                      ${pos.unrealizedPnL.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-2">
            No open positions
          </p>
        )}
      </CardContent>
    </Card>
  );
}
