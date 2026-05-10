import { useEffect, useState } from 'react';
import { getCompanies } from '../services/api';

export function useCompanies() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    setLoading(true);

    getCompanies()
      .then((data) => {
        if (!isMounted) {
          return;
        }

        setCompanies(data.companies);
        setError('');
      })
      .catch((requestError) => {
        if (isMounted) {
          setError(requestError.message);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return { companies, loading, error };
}
