import { useState, useEffect, useCallback } from 'react';
import { Transaction } from '../types';
import { api } from '../services/api';
import { useApp } from '../context/AppContext';

export interface UsePaymentHistoryResult {
  transactions: Transaction[];
  isLoading: boolean;
  error: string | null;
  isQuotaLimited: boolean;
  refetch: (force?: boolean) => Promise<void>;
  lastFetchedAt: Date | null;
}

/**
 * Custom hook to manage payment history retrieval from Google Apps Script Web App
 * with robust error handling for URL fetch limits, loading state, and offline cache fallback.
 */
export function usePaymentHistory(autoFetch: boolean = true): UsePaymentHistoryResult {
  const { transactions: contextTransactions, currentUser, syncTransactionsSnapshot } = useApp();
  const [transactions, setTransactions] = useState<Transaction[]>(contextTransactions);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isQuotaLimited, setIsQuotaLimited] = useState<boolean>(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);

  // Synchronize with context transactions whenever they update (e.g. newly generated receipt or delete)
  useEffect(() => {
    setTransactions(contextTransactions);
  }, [contextTransactions]);

  const fetchHistory = useCallback(async (force: boolean = false) => {
    if (!currentUser) return;

    if (force || contextTransactions.length === 0) {
      setIsLoading(true);
    }
    setError(null);
    setIsQuotaLimited(false);

    try {
      const result = await api.fetchMergedTransactions(currentUser.email, 0, force);
      setTransactions(result.transactions);
      syncTransactionsSnapshot(result.transactions);
      setIsQuotaLimited(result.isQuotaLimited);
      setError(result.error);
      setLastFetchedAt(new Date());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      const local = api.getStoredTransactions();
      setTransactions(local);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, contextTransactions.length, syncTransactionsSnapshot]);

  useEffect(() => {
    if (autoFetch) {
      fetchHistory(false);
    }
  }, [autoFetch, fetchHistory]);

  return {
    transactions,
    isLoading,
    error,
    isQuotaLimited,
    refetch: fetchHistory,
    lastFetchedAt
  };
}
