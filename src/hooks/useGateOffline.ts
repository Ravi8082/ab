import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AdminApiError,
  staffOfflinePack,
  staffScan,
  staffSyncOffline,
  type CheckInResult,
  type OfflinePack,
  type OfflineSyncItem,
} from '@/lib/adminApi';
import {
  applyOfflineEntry,
  applyOnlineEntry,
  loadCachedPack,
  loadQueue,
  packAgeDays,
  queueOfflineScan,
  queuedToInput,
  saveCachedPack,
  saveQueue,
  scanFromPack,
  type CachedGatePack,
  type QueuedGateScan,
} from '@/lib/offlineGate';

export interface SyncNotice {
  at: string;
  synced: number;
  rejected: number;
  retry: number;
  rejectedItems: OfflineSyncItem[];
}

const PACK_REFRESH_MS = 5 * 60_000;
const QUEUE_RETRY_MS = 30_000;

export function useGateOffline(staffId: number | undefined, active: boolean) {
  const [cached, setCached] = useState<CachedGatePack | null>(null);
  const [queue, setQueue] = useState<QueuedGateScan[]>([]);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [packLoading, setPackLoading] = useState(false);
  const [packError, setPackError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<SyncNotice | null>(null);

  const cachedRef = useRef<CachedGatePack | null>(null);
  const queueRef = useRef<QueuedGateScan[]>([]);
  const syncingRef = useRef(false);

  cachedRef.current = cached;
  queueRef.current = queue;

  useEffect(() => {
    if (!staffId) {
      setCached(null);
      setQueue([]);
      setSyncNotice(null);
      return;
    }
    const stored = loadCachedPack(staffId);
    setCached(stored);
    setQueue(loadQueue(staffId));
  }, [staffId]);

  const refreshPack = useCallback(async () => {
    if (!staffId || !navigator.onLine) return;
    setPackLoading(true);
    try {
      const pack = await staffOfflinePack();
      const saved = saveCachedPack(staffId, pack);
      if (saved) {
        setCached(saved);
        setPackError('');
      } else {
        setPackError('Could not save the offline pass list on this device. Storage may be full.');
      }
    } catch (err) {
      setPackError(err instanceof Error ? err.message : 'Could not refresh the offline pass list.');
    } finally {
      setPackLoading(false);
    }
  }, [staffId]);

  const syncNow = useCallback(async () => {
    if (!staffId || syncingRef.current || !navigator.onLine) return;
    if (queueRef.current.length === 0) return;

    syncingRef.current = true;
    setSyncing(true);
    try {
      let iterations = 0;
      while (queueRef.current.length > 0 && iterations < 4) {
        iterations += 1;
        const batch = queueRef.current.slice(0, 100);
        let response;
        try {
          response = await staffSyncOffline(batch.map(queuedToInput));
        } catch {
          break;
        }
        const settled = new Set(
          response.results.filter((item) => item.status !== 'retry').map((item) => item.clientId),
        );
        const remaining = queueRef.current.filter((item) => !settled.has(item.clientId));
        queueRef.current = remaining;
        saveQueue(staffId, remaining);
        setQueue(remaining);

        setSyncNotice({
          at: new Date().toISOString(),
          synced: response.synced,
          rejected: response.rejected,
          retry: response.retry,
          rejectedItems: response.results.filter((item) => item.status === 'rejected'),
        });

        if (response.retry > 0 && settled.size === 0) break;
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [staffId]);

  const refreshRef = useRef(refreshPack);
  refreshRef.current = refreshPack;
  const syncRef = useRef(syncNow);
  syncRef.current = syncNow;

  useEffect(() => {
    if (!staffId || !active) return;
    if (navigator.onLine) {
      void refreshRef.current();
      void syncRef.current();
    }

    const handleOnline = () => {
      setOnline(true);
      void refreshRef.current();
      void syncRef.current();
    };
    const handleOffline = () => setOnline(false);
    const handleVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void refreshRef.current();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisible);

    const packTimer = window.setInterval(() => {
      if (navigator.onLine) void refreshRef.current();
    }, PACK_REFRESH_MS);
    const queueTimer = window.setInterval(() => {
      if (navigator.onLine && queueRef.current.length > 0) {
        void syncRef.current();
      }
    }, QUEUE_RETRY_MS);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisible);
      window.clearInterval(packTimer);
      window.clearInterval(queueTimer);
    };
  }, [staffId, active]);

  const rememberPack = useCallback(
    (pack: OfflinePack) => {
      if (!staffId) return;
      const saved = saveCachedPack(staffId, pack);
      if (saved) {
        cachedRef.current = saved;
        setCached(saved);
      }
    },
    [staffId],
  );

  const scan = useCallback(
    async (code: string, gate?: string, positions?: number[]): Promise<CheckInResult> => {
      const now = new Date();

      if (navigator.onLine) {
        try {
          const result = await staffScan(code, gate, positions);
          const current = cachedRef.current;
          if (current) rememberPack(applyOnlineEntry(current.pack, result));
          if (queueRef.current.length > 0) void syncRef.current();
          return result;
        } catch (err) {
          // status === undefined means the request never reached the server — fall back to cache.
          if (!(err instanceof AdminApiError) || err.status !== undefined) throw err;
          setOnline(false);
        }
      }

      if (positions?.length) {
        throw new AdminApiError(
          'Admitting selected names needs a live connection. Reconnect and admit them again.',
          503,
        );
      }

      const current = cachedRef.current;
      if (!staffId || !current) {
        throw new AdminApiError(
          'This device has no saved gate list yet. Connect once and let the offline list save before scanning.',
          503,
        );
      }
      if (packAgeDays(current.pack, now) > 1) {
        throw new AdminApiError(
          'The offline gate list on this device is out of date. Connect to the internet and refresh it before scanning.',
          503,
        );
      }

      const { result, booking } = scanFromPack(current.pack, code, gate ?? '', now);
      rememberPack(applyOfflineEntry(current.pack, booking, result, now));
      const { queue: nextQueue } = queueOfflineScan(staffId, code.trim(), result.gate ?? null, now);
      queueRef.current = nextQueue;
      setQueue(nextQueue);
      return result;
    },
    [staffId, rememberPack],
  );

  return {
    online,
    cached,
    queue,
    pending: queue.length,
    packLoading,
    packError,
    syncing,
    syncNotice,
    refreshPack,
    syncNow,
    scan,
    dismissSyncNotice: () => setSyncNotice(null),
  };
}
