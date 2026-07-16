import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Lock, Eye, EyeOff, TrendingUp, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const USER_KEY = "ggumbi_user";

export interface StoredUser {
  id: string;
  role: string;
  approved: boolean;
}

export function getStoredUser(): StoredUser | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch {
    return null;
  }
}

export function logout() {
  try {
    sessionStorage.removeItem(USER_KEY);
  } catch {}
  window.location.reload();
}

interface AccessGateProps {
  children: React.ReactNode;
}

export default function AccessGate({ children }: AccessGateProps) {
  const [user, setUser] = useState<StoredUser | null>(() => getStoredUser());
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false); // 승인 대기 안내

  const loginMut = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      if (!data.approved) {
        setPending(true);
        setError("");
        return;
      }
      const u: StoredUser = { id: data.id, role: data.role, approved: true };
      try {
        sessionStorage.setItem(USER_KEY, JSON.stringify(u));
      } catch {}
      setUser(u);
    },
    onError: (e) => {
      setError(e.message || "로그인에 실패했습니다.");
      setPending(false);
    },
  });

  const signupMut = trpc.auth.signup.useMutation({
    onSuccess: () => {
      toast.success("가입 완료! 관리자 승인 후 이용할 수 있습니다.");
      setMode("login");
      setPassword("");
      setError("");
    },
    onError: (e) => setError(e.message || "회원가입에 실패했습니다."),
  });

  const isPendingReq = loginMut.isPending || signupMut.isPending;

  const submit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      setError("");
      setPending(false);
      if (!id.trim() || !password.trim()) {
        setError("아이디와 비밀번호를 입력하세요.");
        return;
      }
      if (mode === "login") loginMut.mutate({ id: id.trim(), password });
      else signupMut.mutate({ id: id.trim(), password });
    },
    [id, password, mode, loginMut, signupMut]
  );

  if (user?.approved) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0f1e]">
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "linear-gradient(rgba(99,102,241,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.3) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-indigo-600/10 blur-[120px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 mb-4">
            <TrendingUp className="w-8 h-8 text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">꿈비 전략사업본부 대시보드</h1>
          <p className="text-sm text-slate-400 mt-1">
            {mode === "login" ? "로그인이 필요합니다" : "회원가입 (관리자 승인 후 이용)"}
          </p>
        </div>

        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8 shadow-2xl">
          {/* 탭: 로그인 / 회원가입 */}
          <div className="flex rounded-lg border border-slate-700/50 overflow-hidden mb-6">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError("");
                  setPending(false);
                }}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  mode === m ? "bg-indigo-600 text-white" : "bg-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                {m === "login" ? "로그인" : "회원가입"}
              </button>
            ))}
          </div>

          {pending ? (
            <div className="text-center py-4">
              <Lock className="w-8 h-8 text-amber-400 mx-auto mb-3" />
              <p className="text-sm text-amber-300 font-medium">관리자 승인 대기 중입니다.</p>
              <p className="text-xs text-slate-400 mt-2">승인 후 로그인하면 이용할 수 있습니다. 관리자에게 문의하세요.</p>
              <Button variant="ghost" className="mt-4 text-slate-400 hover:text-white" onClick={() => setPending(false)}>
                돌아가기
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  value={id}
                  onChange={(e) => {
                    setId(e.target.value);
                    setError("");
                  }}
                  placeholder="아이디"
                  autoFocus
                  className="bg-slate-800/60 border-slate-600/50 text-white placeholder:text-slate-500 focus:border-indigo-500 pl-9 h-11"
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  placeholder="비밀번호"
                  className="bg-slate-800/60 border-slate-600/50 text-white placeholder:text-slate-500 focus:border-indigo-500 pl-9 pr-10 h-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {error && (
                <p className="text-sm text-red-400 flex items-center gap-1.5">
                  <span className="inline-block w-1 h-1 rounded-full bg-red-400" />
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={isPendingReq}
                className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
              >
                {isPendingReq ? "처리 중..." : mode === "login" ? "로그인" : "회원가입"}
              </Button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">© 2026 Ggumbi Co., Ltd. All rights reserved.</p>
      </div>
    </div>
  );
}
