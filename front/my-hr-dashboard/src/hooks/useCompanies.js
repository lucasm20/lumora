import { useCallback, useEffect, useRef, useState } from 'react';
import { getCompanies } from '../services/api';

export function useCompanies() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const isMountedRef = useRef(false);
  const requestIdRef = useRef(0);

  const loadCompanies = useCallback((options = {}) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);

    return getCompanies(options)
      .then((data) => {
        if (!isMountedRef.current || requestId !== requestIdRef.current) {
          return;
        }

        setCompanies(data.companies);
        setError('');
      })
      .catch((requestError) => {
        if (!isMountedRef.current || requestId !== requestIdRef.current) {
          return;
        }

        setError(requestError.message);
      })
      .finally(() => {
        if (!isMountedRef.current || requestId !== requestIdRef.current) {
          return;
        }

        setLoading(false);
      });
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    loadCompanies();

    return () => {
      isMountedRef.current = false;
    };
  }, [loadCompanies]);

  return {
    companies,
    loading,
    error,
    refreshCompanies: () => loadCompanies({ forceRefresh: true }),
  };
}
