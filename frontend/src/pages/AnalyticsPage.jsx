import { useEffect, useState } from "react";
import { Doughnut } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { MailOpen } from "lucide-react";
import { getLogs } from "../services/logService";
import { getStats } from "../services/statsService";
import { getBrevoEvents } from "../services/brevoTrackingService";
import { CardSkeleton, TableSkeleton } from "../components/Loaders";

ChartJS.register(ArcElement, Tooltip, Legend);

const ANALYTICS_LOG_PAGE_LIMITS = [10, 25, 50, 100];
const EMPTY_LOG_PAGINATION = {
  page: 1,
  totalPages: 1,
  total: 0,
  hasNextPage: false,
  hasPrevPage: false,
};

export default function AnalyticsPage() {
  const [logs, setLogs] = useState([]);
  const [logPage, setLogPage] = useState(1);
  const [logLimit, setLogLimit] = useState(10);
  const [logPagination, setLogPagination] = useState(EMPTY_LOG_PAGINATION);
  const [stats, setStats] = useState({ totalSent: 0, opened: 0, clicked: 0, failed: 0 });
  const [chartsLoading, setChartsLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(true);

  useEffect(() => {
    setChartsLoading(true);
    Promise.all([getStats(), getBrevoEvents({ limit: 100, days: 30 })])
      .then(([statsRes, brevoRes]) => {
        const brevo = brevoRes?.data;
        const events = brevo?.events || brevo?.events?.items || brevo?.items || brevo?.data || [];
        const list = Array.isArray(events) ? events : [];
        const delivered = list.filter((e) => String(e.event || "").toLowerCase() === "delivered").length;
        const opened = list.filter((e) => String(e.event || "").toLowerCase() === "opened").length;
        const clicked = list.filter((e) => String(e.event || "").toLowerCase() === "click").length;
        const bounced = list.filter((e) => String(e.event || "").toLowerCase() === "bounced").length;
        const fallbackStats = statsRes.data || { totalSent: 0, opened: 0, clicked: 0, failed: 0 };
        setStats({
          totalSent: delivered || fallbackStats.totalSent,
          opened: opened || fallbackStats.opened,
          clicked: clicked || fallbackStats.clicked,
          failed: bounced || fallbackStats.failed,
        });
      })
      .catch(() => {
        setStats({ totalSent: 0, opened: 0, clicked: 0, failed: 0 });
      })
      .finally(() => setChartsLoading(false));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("page", String(logPage));
    params.set("limit", String(logLimit));

    setLogsLoading(true);
    getLogs(params.toString())
      .then((res) => {
        const data = res.data || {};
        setLogs(Array.isArray(data.items) ? data.items : []);
        setLogPagination(data.pagination || EMPTY_LOG_PAGINATION);
      })
      .catch(() => {
        setLogs([]);
        setLogPagination(EMPTY_LOG_PAGINATION);
      })
      .finally(() => setLogsLoading(false));
  }, [logPage, logLimit]);

  const openRate = stats.totalSent ? (stats.opened / stats.totalSent) * 100 : 0;
  const clickRate = stats.totalSent ? (stats.clicked / stats.totalSent) * 100 : 0;
  const failRate = stats.totalSent ? (stats.failed / stats.totalSent) * 100 : 0;
  const logStart = logPagination.total ? (logPagination.page - 1) * logLimit + 1 : 0;
  const logEnd = logPagination.total ? (logPagination.page - 1) * logLimit + logs.length : 0;

  const engagementData = {
    labels: ["Clicked", "Not Opened", "Opened"],
    datasets: [
      {
        data: [stats.clicked, Math.max(stats.totalSent - stats.opened, 0), stats.opened],
        backgroundColor: ["#dc2626", "#e2e8f0", "#16a34a"],
        borderWidth: 0,
      },
    ],
  };

  const ratesData = {
    labels: ["Click rate", "Fail rate", "Open rate", "Remaining"],
    datasets: [
      {
        data: [clickRate, failRate, openRate, Math.max(100 - (clickRate + failRate + openRate), 0)],
        backgroundColor: ["#dc2626", "#ef4444", "#16a34a", "#e5e7eb"],
        borderWidth: 0,
      },
    ],
  };

  return (
    <section className="analytics-page">
      <div className="contacts-head">
        <div>
          <h2 className="dashboard-title">Analytics</h2>
          <p className="dashboard-subtitle">Track campaign engagement, performance rates, and recent delivery activity.</p>
        </div>
      </div>

      {chartsLoading ? (
        <CardSkeleton count={2} />
      ) : (
      <div className="analytics-grid">
        <div className="panel analytics-card">
          <h4>Engagement breakdown</h4>
          <div className="analytics-chart">
            <Doughnut data={engagementData} options={{ cutout: "58%", plugins: { legend: { position: "bottom" } } }} />
          </div>
        </div>
        <div className="panel analytics-card">
          <h4>Performance rates</h4>
          <div className="analytics-chart gauge">
            <Doughnut
              data={ratesData}
              options={{
                rotation: -90,
                circumference: 180,
                cutout: "62%",
                plugins: { legend: { position: "bottom", labels: { filter: (item) => item.text !== "Remaining" } } },
              }}
            />
          </div>
        </div>
      </div>
      )}

      <div className="panel logs-panel">
        <div className="logs-panel-head">
          <h4>Recent email logs</h4>
          <span>
            Showing {logStart ? `${logStart}-${logEnd}` : "0"} of {logPagination.total}
          </span>
        </div>
        {logsLoading ? (
          <TableSkeleton rows={6} columns={6} />
        ) : !logs.length ? (
          <div className="analytics-empty">
            <div className="contacts-empty-icon"><MailOpen size={24} /></div>
            <h3>No email logs yet</h3>
            <p>Send your first campaign to start tracking opens and clicks.</p>
          </div>
        ) : (
          <table className="contacts-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Campaign</th>
                <th>Status</th>
                <th>Opened</th>
                <th>Clicked</th>
                <th>Sent at</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l._id}>
                  <td>{l.email}</td>
                  <td>{l.campaignId?.name || "—"}</td>
                  <td><span className={`status-pill ${l.status === "sent" ? "success" : "draft"}`}>{l.status}</span></td>
                  <td><span className={l.opened ? "status-good" : "list-pill"}>{l.opened ? "Yes" : "No"}</span></td>
                  <td>{l.clicked ? "Yes" : "No"}</td>
                  <td>{l.sentAt ? new Date(l.sentAt).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!logsLoading && logPagination.total ? (
          <div className="contacts-pagination campaign-recipients-pagination analytics-logs-pagination">
            <div className="campaign-recipients-pagination-start">
              <label className="campaign-recipients-per-page">
                <span className="campaign-recipients-per-page-label">Rows per page</span>
                <select
                  value={logLimit}
                  onChange={(e) => {
                    setLogLimit(Number(e.target.value));
                    setLogPage(1);
                  }}
                  aria-label="Email logs per page"
                >
                  {ANALYTICS_LOG_PAGE_LIMITS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="campaign-recipients-page-meta" aria-live="polite">
              Page {logPagination.page} of {logPagination.totalPages}
            </p>
            <div className="campaign-recipients-pagination-end">
              <button
                type="button"
                className="campaign-recipients-page-btn"
                disabled={!logPagination.hasPrevPage}
                onClick={() => setLogPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="campaign-recipients-page-btn"
                disabled={!logPagination.hasNextPage}
                onClick={() => setLogPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
