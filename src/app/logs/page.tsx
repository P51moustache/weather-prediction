"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface LogEntry {
  id: string;
  level: string;
  source: string;
  message: string;
  metadata: string | null;
  timestamp: string;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<{ level: string; source: string }>({
    level: "",
    source: "",
  });
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const fetchLogs = async () => {
    try {
      const params = new URLSearchParams();
      if (filter.level) params.set("level", filter.level);
      if (filter.source) params.set("source", filter.source);
      params.set("limit", "100");

      const res = await fetch(`/api/logs?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs);
      }
    } catch (error) {
      console.error("Failed to fetch logs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filter]);

  const formatTimestamp = (ts: string) => {
    return new Date(ts).toLocaleString();
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case "error":
        return <Badge variant="destructive">ERROR</Badge>;
      case "warn":
        return <Badge variant="secondary">WARN</Badge>;
      case "info":
        return <Badge>INFO</Badge>;
      default:
        return <Badge variant="outline">{level.toUpperCase()}</Badge>;
    }
  };

  const parseMetadata = (metadata: string | null) => {
    if (!metadata) return null;
    try {
      return JSON.parse(metadata);
    } catch {
      return metadata;
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">System Logs</h1>
            <p className="text-muted-foreground">Trade logs and diagnostics</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchLogs}>
              Refresh
            </Button>
            <Link href="/">
              <Button variant="outline">Back to Dashboard</Button>
            </Link>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div>
                <label className="text-sm font-medium">Level</label>
                <select
                  className="ml-2 px-3 py-1 border rounded-md"
                  value={filter.level}
                  onChange={(e) => setFilter({ ...filter, level: e.target.value })}
                >
                  <option value="">All</option>
                  <option value="error">Error</option>
                  <option value="warn">Warning</option>
                  <option value="info">Info</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Source</label>
                <select
                  className="ml-2 px-3 py-1 border rounded-md"
                  value={filter.source}
                  onChange={(e) => setFilter({ ...filter, source: e.target.value })}
                >
                  <option value="">All</option>
                  <option value="sync">Sync</option>
                  <option value="execution">Execution</option>
                  <option value="kalshi">Kalshi</option>
                  <option value="nws">NWS</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Logs Table */}
        <Card>
          <CardHeader>
            <CardTitle>Log Entries ({logs.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Loading logs...</p>
            ) : logs.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No logs found. Run a sync to generate logs.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Timestamp</TableHead>
                    <TableHead className="w-[80px]">Level</TableHead>
                    <TableHead className="w-[100px]">Source</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead className="w-[80px]">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <React.Fragment key={log.id}>
                      <TableRow>
                        <TableCell className="font-mono text-xs">
                          {formatTimestamp(log.timestamp)}
                        </TableCell>
                        <TableCell>{getLevelBadge(log.level)}</TableCell>
                        <TableCell className="text-sm">{log.source}</TableCell>
                        <TableCell className="text-sm max-w-md truncate">
                          {log.message}
                        </TableCell>
                        <TableCell>
                          {log.metadata && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setExpandedLog(expandedLog === log.id ? null : log.id)
                              }
                            >
                              {expandedLog === log.id ? "Hide" : "View"}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                      {expandedLog === log.id && log.metadata && (
                        <TableRow>
                          <TableCell colSpan={5}>
                            <pre className="bg-muted p-4 rounded-md text-xs overflow-auto max-h-64">
                              {JSON.stringify(parseMetadata(log.metadata), null, 2)}
                            </pre>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
