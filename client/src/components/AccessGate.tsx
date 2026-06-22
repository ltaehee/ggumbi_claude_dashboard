import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Lock, Eye, EyeOff, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SESSION_KEY = "ggumbi_access_granted";

interface AccessGateProps {
  children: React.ReactNode;
}

export default function AccessGate({ children }: AccessGateProps) {
  const [granted, setGranted] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  const verifyMutation = trpc.gate.verify.useMutation({
    onSuccess: () => {
      try {
        sessionStorage.setItem(SESSION_KEY, "true");
      } catch {}
      setGranted(true);
      setError("");
    },
    onError: (err) => {
      setError(err.message || "비밀번호가 올바르지 않습니다.");
      setShake(true);
      setPassword("");
      setTimeout(() => setShake(false), 600);
    },
  });

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!password.trim()) {
        setError("비밀번호를 입력해주세요.");
        return;
      }
      setError("");
      verifyMutation.mutate({ password });
    },
    [password, verifyMutation]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSubmit();
  };

  if (granted) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0f1e]">
      {/* Background grid pattern */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "linear-gradient(rgba(99,102,241,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.3) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Glow effect */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-indigo-600/10 blur-[120px] pointer-events-none" />

      <div
        className={`relative z-10 w-full max-w-md mx-4 transition-all duration-150 ${shake ? "animate-[shake_0.5s_ease-in-out]" : ""}`}
        style={
          shake
            ? {
                animation: "shake 0.5s ease-in-out",
              }
            : {}
        }
      >
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 mb-4">
            <TrendingUp className="w-8 h-8 text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">꿈비 국내사업팀 대시보드</h1>
          <p className="text-sm text-slate-400 mt-1">접근 권한이 필요합니다</p>
        </div>

        {/* Card */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center gap-2 mb-6">
            <Lock className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-medium text-slate-300">비밀번호 입력</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                onKeyDown={handleKeyDown}
                placeholder="••••"
                autoFocus
                className={`
                  bg-slate-800/60 border-slate-600/50 text-white placeholder:text-slate-500
                  focus:border-indigo-500 focus:ring-indigo-500/20 pr-10 h-12 text-lg tracking-widest
                  ${error ? "border-red-500/60 focus:border-red-500" : ""}
                  transition-colors duration-200
                `}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                tabIndex={-1}
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {error && (
              <p className="text-sm text-red-400 flex items-center gap-1.5 animate-in slide-in-from-top-1 duration-200">
                <span className="inline-block w-1 h-1 rounded-full bg-red-400" />
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={verifyMutation.isPending}
              className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all duration-150 active:scale-[0.98]"
            >
              {verifyMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  확인 중...
                </span>
              ) : (
                "로그인"
              )}
            </Button>
          </form>

          <p className="text-xs text-slate-500 text-center mt-6">
            비밀번호를 분실하셨나요?{" "}
            <span className="text-slate-400">관리자에게 문의하세요</span>
          </p>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          © 2026 Ggumbi Co., Ltd. All rights reserved.
        </p>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-8px); }
          30% { transform: translateX(8px); }
          45% { transform: translateX(-6px); }
          60% { transform: translateX(6px); }
          75% { transform: translateX(-4px); }
          90% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  );
}
