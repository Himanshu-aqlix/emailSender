import { useEffect, useId, useMemo, useRef } from "react";
import {
  ArrowUpDown,
  CalendarDays,
  Check,
  Filter,
  RotateCcw,
} from "lucide-react";
import { countActiveFilterKeys } from "../utils/contactsFilters";

const DATE_PRESETS = [
  { key: "all", label: "All time" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "custom", label: "Custom range" },
];

export default function ContactsFilter({
  open,
  onClose,
  draft,
  onDraftChange,
  onApply,
  onReset,
}) {
  const panelRef = useRef(null);
  const titleId = useId();
  const activeCount = useMemo(() => countActiveFilterKeys(draft), [draft]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const prev = document.body.style.overflow;
    if (window.matchMedia("(max-width: 640px)").matches) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleReset = () => {
    onReset();
  };

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="contacts-filter-backdrop"
        aria-label="Close filters"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="contacts-filter-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="contacts-filter-panel__inner">
          <header className="contacts-filter-modal-header">
            <div className="contacts-filter-modal-header__left">
              <Filter size={18} strokeWidth={2} className="contacts-filter-modal-header__funnel" aria-hidden />
              <h2 id={titleId} className="contacts-filter-modal-title">
                Filters
              </h2>
            </div>
            <span className="contacts-filter-modal-badge">{activeCount} active</span>
          </header>

          <div className="contacts-filter-modal-body">
            <section className="contacts-filter-section">
              <div className="contacts-filter-section__head">
                <ArrowUpDown size={14} strokeWidth={2} aria-hidden className="contacts-filter-section__icon" />
                <span className="contacts-filter-section__title">Sort by</span>
              </div>
              <label className="visually-hidden" htmlFor="contacts-filter-sort">
                Sort contacts
              </label>
              <select
                id="contacts-filter-sort"
                className="contacts-filter-select"
                value={draft.sort}
                onChange={(e) => onDraftChange({ ...draft, sort: e.target.value })}
              >
                <option value="name_asc">Name (A → Z)</option>
                <option value="name_desc">Name (Z → A)</option>
                <option value="newest">Recently added</option>
                <option value="oldest">Oldest first</option>
              </select>
            </section>

            <section className="contacts-filter-section">
              <div className="contacts-filter-section__head">
                <CalendarDays size={14} strokeWidth={2} aria-hidden className="contacts-filter-section__icon" />
                <span className="contacts-filter-section__title">Filter by date</span>
              </div>
              <div className="contacts-filter-date-grid" role="group" aria-label="Date range">
                {DATE_PRESETS.map(({ key, label }) => {
                  const selected = draft.datePreset === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`contacts-filter-date-cell${selected ? " is-selected" : ""}`}
                      onClick={() => onDraftChange({ ...draft, datePreset: key })}
                    >
                      {selected ? (
                        <Check size={14} strokeWidth={2.5} className="contacts-filter-date-cell__check" aria-hidden />
                      ) : null}
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
              {draft.datePreset === "custom" ? (
                <div className="contacts-filter-custom-dates">
                  <label className="contacts-filter-date-field">
                    <span>From</span>
                    <input
                      type="date"
                      value={draft.customDateFrom || ""}
                      onChange={(e) => onDraftChange({ ...draft, customDateFrom: e.target.value })}
                    />
                  </label>
                  <label className="contacts-filter-date-field">
                    <span>To</span>
                    <input
                      type="date"
                      value={draft.customDateTo || ""}
                      onChange={(e) => onDraftChange({ ...draft, customDateTo: e.target.value })}
                    />
                  </label>
                </div>
              ) : null}
            </section>
          </div>

          <footer className="contacts-filter-modal-footer">
            <button type="button" className="contacts-filter-reset-link" onClick={handleReset}>
              <RotateCcw size={14} strokeWidth={2} aria-hidden />
              Reset
            </button>
            <div className="contacts-filter-modal-footer__actions">
              <button type="button" className="contacts-filter-btn-cancel" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="contacts-filter-btn-apply-primary"
                onClick={() => {
                  onApply();
                  onClose();
                }}
              >
                Apply filters
              </button>
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}
