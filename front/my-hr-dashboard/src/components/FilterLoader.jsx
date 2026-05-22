const FilterLoader = ({ text = 'Applying Filters...', className = '' }) => {
  return (
    <div className={`filter-loader-overlay ${className}`} role="status" aria-live="polite">
      <div className="filter-loader">
        <div className="filter-loader-orbit">
          <img className="filter-loader-logo" src="/logo-lumora.jpg" alt="Lumora" />
        </div>
        <span className="filter-loader-text">{text}</span>
        <span className="filter-loader-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>
    </div>
  );
};

export default FilterLoader;
