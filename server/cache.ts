/**
 * 서버 사이드 인메모리 TTL 캐시
 * - 동일 파라미터 쿼리 결과를 TTL 동안 캐싱하여 DB 부하 감소
 * - 엑셀 업로드 시 invalidateAll()로 전체 캐시 무효화
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class TtlCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private defaultTtlMs: number;

  constructor(defaultTtlMs = 5 * 60 * 1000) {
    this.defaultTtlMs = defaultTtlMs;
    // 1분마다 만료된 항목 정리
    setInterval(() => this.evictExpired(), 60_000).unref();
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  /** 특정 prefix로 시작하는 캐시 항목 무효화 */
  invalidatePrefix(prefix: string): void {
    for (const key of Array.from(this.store.keys())) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  /** 전체 캐시 무효화 (엑셀 업로드 시 호출) */
  invalidateAll(): void {
    this.store.clear();
    console.log("[Cache] All cache invalidated");
  }

  /** 캐시 통계 */
  stats() {
    return { size: this.store.size };
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of Array.from(this.store.entries())) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }
}

// 싱글톤 캐시 인스턴스 (5분 TTL)
export const queryCache = new TtlCache(5 * 60 * 1000);

/**
 * 캐시 래퍼: 캐시 히트 시 즉시 반환, 미스 시 fn() 실행 후 캐싱
 */
export async function withCache<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs?: number
): Promise<T> {
  const cached = queryCache.get<T>(key);
  if (cached !== undefined) return cached;
  const result = await fn();
  queryCache.set(key, result, ttlMs);
  return result;
}
