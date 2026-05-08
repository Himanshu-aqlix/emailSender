export function ButtonLoader({ label = "Loading" }) {
  return (
    <span className="button-loader" aria-label={label}>
      <span />
      <span />
      <span />
    </span>
  );
}

export function PageLoader({ title = "Loading", subtitle = "Preparing your workspace..." }) {
  return (
    <div className="page-loader" role="status" aria-live="polite">
      <div className="page-loader__spinner" aria-hidden />
      <div>
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
    </div>
  );
}

export function CardSkeleton({ count = 4 }) {
  return (
    <div className="card-skeleton-grid" aria-hidden>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="card-skeleton">
          <span className="skeleton-line skeleton-line--short" />
          <span className="skeleton-line skeleton-line--title" />
          <span className="skeleton-line" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6, columns = 5, showAvatar = false }) {
  return (
    <div className="table-skeleton-wrap" role="status" aria-live="polite" aria-label="Loading table data">
      <table className="contacts-table table-skeleton">
        <thead>
          <tr>
            {Array.from({ length: columns }).map((_, index) => (
              <th key={index}>
                <span className="skeleton-line skeleton-line--header" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex}>
              {Array.from({ length: columns }).map((_, colIndex) => (
                <td key={colIndex}>
                  <span className="table-skeleton-cell">
                    {showAvatar && colIndex === 0 ? <span className="skeleton-avatar" /> : null}
                    <span className={`skeleton-line${colIndex % 2 ? " skeleton-line--medium" : ""}`} />
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
