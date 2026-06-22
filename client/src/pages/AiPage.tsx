import { useState, useRef, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { fmtAmt } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Streamdown } from "streamdown";
import { Bot, Send, Sparkles, User, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { DateRangeFilter, getDefaultFilter, type DateFilter } from "@/components/DateRangeFilter";

const QUICK_PROMPTS = [
  "이번 주 매출 성과를 요약하고 주요 이슈를 분석해줘",
  "전주 대비 매출이 감소한 채널과 품목을 찾아줘",
  "이번 달 목표 달성을 위한 전략을 제안해줘",
  "재고 소진 위험 품목과 대응 방안을 알려줘",
  "YoY 성장률이 높은 품목 TOP5를 분석해줘",
];

interface Message {
  role: "user" | "assistant";
  content: string;
  loading?: boolean;
}

export default function AiPage() {
  const [filter, setFilter] = useState<DateFilter>(getDefaultFilter);
  const dept = "국내사업팀";
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const deptParam = dept;

  const kpiQuery = trpc.kpi.getSummary.useQuery({
    startDate: filter.startDate,
    endDate: filter.endDate,
    dept: deptParam,
  });

  const analyzeMutation = trpc.ai.analyze.useMutation({
    onSuccess: (data) => {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: typeof data.content === "string" ? data.content : String(data.content ?? "") };
        return updated;
      });
      setIsLoading(false);
    },
    onError: (err) => {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: `분석 중 오류가 발생했습니다: ${err.message}`,
        };
        return updated;
      });
      setIsLoading(false);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (text?: string) => {
    const query = text ?? input.trim();
    if (!query || isLoading) return;

    setInput("");
    setIsLoading(true);

    setMessages((prev) => [
      ...prev,
      { role: "user", content: query },
      { role: "assistant", content: "", loading: true },
    ]);

    analyzeMutation.mutate({
      query,
      startDate: filter.startDate,
      endDate: filter.endDate,
      dept: deptParam,
      kpiContext: kpiQuery.data
        ? JSON.stringify({
            currSales: kpiQuery.data.currSales,
            currQty: kpiQuery.data.currQty,
            yoyPct: kpiQuery.data.yoyPct,
            momPct: kpiQuery.data.momPct,
            ytdSales: kpiQuery.data.ytdSales,
            ytdGrowthPct: kpiQuery.data.ytdGrowthPct,
          })
        : undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <AppLayout
      title="AI 분석 비서"
      subtitle="주피미 · LLM 기반 매출 인사이트 분석"
      actions={
        <div className="flex items-center gap-2">
          <DateRangeFilter value={filter} onChange={setFilter} />
        </div>
      }
    >
      <div className="flex flex-col h-[calc(100vh-130px)] max-w-4xl">
        {/* Context bar */}
        <div className="rounded-xl border border-border bg-muted/30 p-3 mb-4 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium text-foreground">분석 컨텍스트</span>
          </div>
          <Badge variant="outline" className="text-xs">{filter.label}</Badge>
          <Badge variant="outline" className="text-xs">{dept}</Badge>
          {kpiQuery.data && (() => {
            const kd = kpiQuery.data as any;
            return (
              <>
                <span className="text-xs text-muted-foreground">
                  매출: <strong className="text-foreground">{fmtAmt(kd.currSales)}</strong>
                </span>
                <span className="text-xs text-muted-foreground">
                  YoY: <strong className={(kd.yoyPct ?? 0) >= 0 ? "text-emerald-500" : "text-red-500"}>
                    {(kd.yoyPct ?? 0) >= 0 ? "+" : ""}{((kd.yoyPct ?? 0) as number).toFixed(1)}%
                  </strong>
                </span>
              </>
            );
          })()}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <Bot className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">AI 매출 분석 비서</h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                매출 데이터를 기반으로 인사이트를 제공합니다. 아래 빠른 질문을 선택하거나 직접 입력하세요.
              </p>
              <div className="grid grid-cols-1 gap-2 w-full max-w-lg">
                {QUICK_PROMPTS.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(p)}
                    className="text-left px-4 py-2.5 rounded-lg border border-border bg-card hover:bg-muted/50 text-sm text-foreground transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "flex gap-3 animate-fade-in",
                msg.role === "user" ? "flex-row-reverse" : "flex-row"
              )}
            >
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {msg.role === "user" ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </div>
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-3 text-sm",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-card border border-border rounded-tl-sm"
                )}
              >
                {msg.loading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>분석 중...</span>
                  </div>
                ) : msg.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <Streamdown>{msg.content}</Streamdown>
                  </div>
                ) : (
                  <p>{msg.content}</p>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className="border border-border rounded-xl bg-card p-3">
          {messages.length > 0 && (
            <div className="flex gap-1.5 mb-2 flex-wrap">
              {QUICK_PROMPTS.slice(0, 3).map((p, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(p)}
                  disabled={isLoading}
                  className="text-xs px-2.5 py-1 rounded-full border border-border bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {p.slice(0, 20)}...
                </button>
              ))}
              <button
                onClick={() => setMessages([])}
                className="text-xs px-2.5 py-1 rounded-full border border-border bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                <RefreshCw className="h-3 w-3" /> 초기화
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="매출 분석 질문을 입력하세요... (Enter로 전송, Shift+Enter 줄바꿈)"
              className="flex-1 min-h-[60px] max-h-32 resize-none text-sm border-0 bg-transparent focus-visible:ring-0 p-0"
              disabled={isLoading}
            />
            <Button
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading}
              size="icon"
              className="h-10 w-10 shrink-0 self-end"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
