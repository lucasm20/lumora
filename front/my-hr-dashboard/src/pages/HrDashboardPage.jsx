import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { getEmployees } from '../services/api';
import '../App.css';

const HrDashboardPage = () => {
  const { firebaseUser, userProfile, logout } = useAuth();
  const { t } = useLanguage();
  const [employees, setEmployees] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    async function loadEmployees() {
      try {
        const token = await firebaseUser.getIdToken();
        const data = await getEmployees(token);

        if (isMounted) {
          setEmployees(data.employees);
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadEmployees();

    return () => {
      isMounted = false;
    };
  }, [firebaseUser]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="hr-shell">
      <header className="hr-topbar">
        <div>
          <span className="hr-eyebrow">{t('hrPlatform', 'HR Platform')}</span>
          <h1>{t('employeeAccess', 'Employee Access')}</h1>
          <p>{userProfile.companyName}</p>
        </div>
        <button className="ghost-button" type="button" onClick={handleLogout}>
          {t('logout', 'Log out')}
        </button>
      </header>

      <main className="hr-content">
        <section className="hr-stat">
          <span className="hr-stat-label">{t('registeredEmployees', 'Registered employees')}</span>
          <strong>{employees.length}</strong>
        </section>

        <section className="employee-table-card">
          <div className="employee-table-header">
            <h2>{t('employees', 'Employees')}</h2>
            <span>{loading ? t('loading', 'Loading...') : t('recordCount', `${employees.length} records`, { count: employees.length })}</span>
          </div>

          {error && <div className="form-alert error">{error}</div>}

          <div className="employee-table">
            <div className="employee-row employee-heading">
              <span>{t('username', 'Username')}</span>
              <span>{t('company', 'Company')}</span>
              <span>{t('role', 'Role')}</span>
            </div>

            {!loading && employees.length === 0 && (
              <div className="empty-state">{t('noRegisteredEmployees', 'No employees registered for this company.')}</div>
            )}

            {employees.map((employee) => (
              <div className="employee-row" key={employee.id}>
                <span>{employee.username}</span>
                <span>{employee.companyName}</span>
                <span>{employee.role}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

export default HrDashboardPage;
