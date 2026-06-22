import React, { createContext, useContext, useState, useCallback } from "react";
import { getDefaultFilter, type DateFilter } from "@/components/DateRangeFilter";

export interface GlobalFilters {
  dept: string;
  channels: string[];
  itemLarges: string[];
  itemMids: string[];
  itemSmalls: string[];
  itemNames: string[];
  dateFilter: DateFilter;
}

const DEFAULT_FILTERS: GlobalFilters = {
  dept: "국내사업팀",
  channels: [],
  itemLarges: [],
  itemMids: [],
  itemSmalls: [],
  itemNames: [],
  dateFilter: getDefaultFilter(),
};

interface FilterContextValue {
  filters: GlobalFilters;
  setDept: (dept: string) => void;
  setChannels: (v: string[]) => void;
  setItemLarges: (v: string[]) => void;
  setItemMids: (v: string[]) => void;
  setItemSmalls: (v: string[]) => void;
  setItemNames: (v: string[]) => void;
  setDateFilter: (v: DateFilter) => void;
  resetFilters: () => void;
  hasActiveFilters: boolean;
}

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<GlobalFilters>(DEFAULT_FILTERS);

  const setDept = useCallback((dept: string) => {
    setFilters((f) => ({ ...f, dept, channels: [], itemLarges: [], itemMids: [], itemSmalls: [], itemNames: [] }));
  }, []);

  // undefined/null/빈 문자열이 배열에 포함되지 않도록 정제
  const clean = (arr: string[]) => arr.filter((v) => v != null && v !== "" && v !== "undefined");

  const setChannels = useCallback((channels: string[]) => {
    setFilters((f) => ({ ...f, channels: clean(channels) }));
  }, []);

  const setItemLarges = useCallback((itemLarges: string[]) => {
    setFilters((f) => ({ ...f, itemLarges: clean(itemLarges), itemMids: [], itemSmalls: [], itemNames: [] }));
  }, []);

  const setItemMids = useCallback((itemMids: string[]) => {
    setFilters((f) => ({ ...f, itemMids: clean(itemMids), itemSmalls: [], itemNames: [] }));
  }, []);

  const setItemSmalls = useCallback((itemSmalls: string[]) => {
    setFilters((f) => ({ ...f, itemSmalls: clean(itemSmalls), itemNames: [] }));
  }, []);

  const setItemNames = useCallback((itemNames: string[]) => {
    setFilters((f) => ({ ...f, itemNames: clean(itemNames) }));
  }, []);

  const setDateFilter = useCallback((dateFilter: DateFilter) => {
    setFilters((f) => ({ ...f, dateFilter }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters((f) => ({ ...DEFAULT_FILTERS, dept: f.dept, dateFilter: f.dateFilter }));
  }, []);

  const hasActiveFilters =
    filters.channels.length > 0 ||
    filters.itemLarges.length > 0 ||
    filters.itemMids.length > 0 ||
    filters.itemSmalls.length > 0 ||
    filters.itemNames.length > 0;

  return (
    <FilterContext.Provider
      value={{
        filters,
        setDept,
        setChannels,
        setItemLarges,
        setItemMids,
        setItemSmalls,
        setItemNames,
        setDateFilter,
        resetFilters,
        hasActiveFilters,
      }}
    >
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilters must be used within FilterProvider");
  return ctx;
}
