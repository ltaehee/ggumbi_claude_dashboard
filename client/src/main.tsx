import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import { FilterProvider } from "./contexts/FilterContext";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 5분간 캐시 신선 유지 → 페이지 이동 후 재방문 시 API 재호출 없음
      staleTime: 5 * 60_000,
      // 10분간 캐시 메모리 유지 (언마운트 후에도 보관)
      gcTime: 10 * 60_000,
      // 윈도우 포커스 시 자동 재조회 비활성화 (탭 전환 시 불필요한 재조회 방지)
      refetchOnWindowFocus: false,
      // 재연결 시 자동 재조회 비활성화
      refetchOnReconnect: false,
      // 재시도 1회로 제한 (네트워크 오류 시 빠른 실패)
      retry: 1,
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <FilterProvider>
        <App />
      </FilterProvider>
    </QueryClientProvider>
  </trpc.Provider>
);
