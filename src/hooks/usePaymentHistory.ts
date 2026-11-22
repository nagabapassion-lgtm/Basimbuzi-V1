import { useState, useEffect, useCallback } from 'react';
import { Transaction } from '../types';
import { api } from '../services/api';
import { useApp } from '../context/AppContext';

export interface UsePaymentHistoryResult {
  transactions: Transaction[];
  isLoading: boolean;
  error: string | null;
  isQuotaLimited: boolean;
  refetch: () => Promise<void>;
  lastFetchedAt: Date | null;
}

/**
 * Custom hook to manage payment history retrieval from Google Apps Script Web App
 * with robust error handling for URL fetch limits, loading state, and offline cache fallback.
 */
export function usePaymentHistory(autoFetch: boolean = true): UsePaymentHistoryResult {
  const { transactions: contextTransactions, currentUser, isLiveBackend } = useApp();
  const [transactions, setTransactions] = useState<Transaction[]>(contextTransactions);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isQuotaLimited, setIsQuotaLimited] = useState<boolean>(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);

  // Synchronize with context transactions whenever they update (e.g. newly generated receipt)
  useEffect(() => {
    setTransactions(contextTransactions);
  }, [contextTransactions]);

  const fetchHistory = useCallback(async () => {
    if (!currentUser) return;

    setIsLoading(true);
    setError(null);
    setIsQuotaLimited(false);

    try {
      if (isLiveBackend) {
        const gasUrl = api.getGasUrl();
        const url = `${gasUrl}${gasUrl.includes('?') ? '&' : '?'}action=getTransactions&operatorEmail=${encodeURIComponent(currentUser.email)}&limit=0`;
        
        const res = await fetch(url, { redirect: 'follow' });
        
        // Check for HTTP 429 Too Many Requests or URL fetch limits
        if (res.status === 429) {
          setIsQuotaLimited(true);
          throw new Error('Google Apps Script URL Fetch rate limit reached (HTTP 429). The system is serving cached local transactions.');
        }

        if (!res.ok) {
          throw new Error(`Google Apps Script returned HTTP ${res.status}: ${res.statusText}`);
        }

        const rawText = await res.text();
        
        // Detect Google HTML error/quota pages
        if (rawText.trim().startsWith('<') || rawText.includes('Service invoked too many times') || rawText.includes('Quota exceeded')) {
          setIsQuotaLimited(true);
          throw new Error('Google Apps Script daily execution or URL fetch quota limit was reached. Using cached records.');
        }

        const data = JSON.parse(rawText);
        if (data.success && Array.isArray(data.data)) {
          const sanitized = data.data.map((tx: any) => {
            const cleanEmail = String(tx.email || '').trim().toLowerCase();
            if (
              !cleanEmail || 
              cleanEmail.includes('no-reply') || 
              cleanEmail.includes('whatsapp.direct') || 
              cleanEmail.includes('noreply')
            ) {
              return {
                ...tx,
                email: '',
                emailStatus: 'NOT_PROVIDED'
              };
            }
            return tx;
          });
          setTransactions(sanitized);
          setLastFetchedAt(new Date());
        } else {
          throw new Error(data.error || 'Failed to retrieve transactions from backend.');
        }
      } else {
        // Local offline fallback
        const local = api.getStoredTransactions();
        setTransactions(local);
        setLastFetchedAt(new Date());
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      // Fallback to local stored transactions so UI never crashes or displays a blank screen
      setTransactions(api.getStoredTransactions());
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, isLiveBackend]);

  useEffect(() => {
    if (autoFetch) {
      fetchHistory();
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
