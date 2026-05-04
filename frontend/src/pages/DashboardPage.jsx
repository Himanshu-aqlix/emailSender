import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, Line } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, Filler } from "chart.js";
import { AlertTriangle, CheckCircle2, ChevronRight, Eye, RefreshCw, Send, Sparkles, Users } from "lucide-react";
import { getDashboardSummary } from "../services/statsService";
import { formatCreatedDateTime } from "../utils/formatDateTime";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, Filler);

const tooltipBase = {
  enabled: true,
  mode: "index",
  intersect: false,
  backgroundColor: "rgba(15, 23, 42, 0.94)",
  titleColor: "#f8fafc",
  bodyColor: "#e2e8f0",
  borderColor: "rgba(148, 163, 184, 0.35)",
  borderWidth: 1,
  padding: 12,
  cornerRadius: 10,
  displayColors: true,
  boxPadding: 6,
  titleFont: { size: 13, weight: "600" },
  bodyFont: { size: 13 },
  caretPadding: 10,
};

const DEFAULT_DASHBOARD = {
  totalSent: 0,
  totalDelivered: 0,
  totalOpened: 0,
  totalClicked: 0,
  totalBounced: 0,
  openRate: 0,
  clickRate: 0,
  weeklyStats: [],
  campaignStats: [],
};

function useCountUp(value, durationMs = 500) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const target = Number(value || 0);
    const start = Number(display || 0);
    if (target === start) return;
    const delta = target - start;
    const steps = 18;
    const stepMs = Math.max(20, Math.floor(durationMs / steps));
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      const next = start + (delta * i) / steps;
      if (i >= steps) {
        setDisplay(target);
        clearInterval(id);
      } else {
        setDisplay(Math.round(next));
      }
    }, stepMs);
    return () => clearInterval(id);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return display;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(DEFAULT_DASHBOARD);
  const [campaigns, setCampaigns] = useState([]);
  const [contactsCount, setContactsCount] = useState(0);
  const [audienceRows, setAudienceRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [engagementRange, setEngagementRange] = useState(7);
  const inFlightRef = useRef(false);

  const fetchDashboard = useCallback(async (silent = false) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const { data } = await getDashboardSummary({ range: engagementRange });
      setStats({ ...DEFAULT_DASHBOARD, ...(data || {}) });
      setCampaigns(Array.isArray(data?.campaigns) ? data.campaigns : []);
      setContactsCount(Number(data?.contactsCount || 0));
      setAudienceRows(Array.isArray(data?.audienceRows) ? data.audienceRows : []);
    } catch {
      // keep previous data
    } finally {
      inFlightRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [engagementRange]);

  useEffect(() => {
    fetchDashboard(false);
  }, [fetchDashboard]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      fetchDashboard(true);
    }, 30000);
    return () => clearInterval(id);
  }, [fetchDashboard]);

  const chartWeekly = Array.isArray(stats.weeklyStats) ? stats.weeklyStats : [];
  /** Stacked area charts do not render fills with a single x-category; use a stacked bar instead. */
  const engagementSinglePointView = chartWeekly.length === 1;

  const engagementPeriodTotals = useMemo(() => {
    let sent = 0;
    let opened = 0;
    let clicked = 0;
    chartWeekly.forEach((row) => {
      sent += Number(row.sent || 0);
      opened += Number(row.opened || 0);
      clicked += Number(row.clicked || 0);
    });
    const openPct = sent > 0 ? Number(((opened / sent) * 100).toFixed(1)) : 0;
    const clickPct = sent > 0 ? Number(((clicked / sent) * 100).toFixed(1)) : 0;
    return { sent, opened, clicked, openPct, clickPct };
  }, [chartWeekly]);

  const engagementEmpty = !loading && engagementPeriodTotals.sent + engagementPeriodTotals.opened + engagementPeriodTotals.clicked === 0;

  const engagementLabels = useMemo(
    () =>
      chartWeekly.map((d) => {
        const day = new Date(`${d.date}T12:00:00Z`);
        if (engagementRange === 1) {
          return day.toLocaleDateString(undefined, { month: "short", day: "numeric" });
        }
        if (engagementRange <= 7) {
          return day.toLocaleDateString(undefined, { weekday: "short" });
        }
        if (engagementRange <= 30) {
          return day.toLocaleDateString(undefined, { month: "short", day: "numeric" });
        }
        return day.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      }),
    [chartWeekly, engagementRange]
  );

  const engagementChartData = useMemo(
    () => ({
      labels: engagementLabels,
      datasets: [
        {
          label: "Sent",
          data: chartWeekly.map((d) => d.sent || 0),
          borderColor: "#93c5fd",
          backgroundColor: "rgba(147, 197, 253, 0.42)",
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 0,
          stack: "eng",
        },
        {
          label: "Opened",
          data: chartWeekly.map((d) => d.opened || 0),
          borderColor: "#34d399",
          backgroundColor: "rgba(52, 211, 153, 0.4)",
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 0,
          stack: "eng",
        },
        {
          label: "Clicked",
          data: chartWeekly.map((d) => d.clicked || 0),
          borderColor: "#f59e0b",
          backgroundColor: "rgba(245, 158, 11, 0.38)",
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 0,
          stack: "eng",
        },
      ],
    }),
    [chartWeekly, engagementLabels]
  );

  const engagementChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          align: "start",
          labels: {
            usePointStyle: true,
            pointStyle: "rect",
            boxWidth: 10,
            boxHeight: 10,
            padding: 16,
            color: "#475569",
            font: { size: 12, weight: "500" },
          },
        },
        tooltip: {
          ...tooltipBase,
          callbacks: {
            title: (items) => {
              const i = items[0]?.dataIndex;
              const raw = chartWeekly[i]?.date;
              if (!raw) return "";
              return new Date(`${raw}T12:00:00Z`).toLocaleDateString(undefined, {
                weekday: "long",
                year: "numeric",
                month: "short",
                day: "numeric",
              });
            },
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}`,
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          border: { display: false },
          ticks: {
            font: { size: 11 },
            color: "#64748b",
            maxRotation: engagementRange > 30 ? 45 : 0,
            autoSkip: true,
            maxTicksLimit: engagementRange > 30 ? 10 : 14,
          },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: { display: false },
          border: { display: false },
          ticks: {
            font: { size: 11 },
            color: "#94a3b8",
            maxTicksLimit: 5,
            padding: 4,
          },
        },
      },
    }),
    [chartWeekly, engagementRange]
  );

  const engagementSingleDayBarData = useMemo(
    () => ({
      labels: engagementLabels,
      datasets: [
        {
          label: "Sent",
          data: chartWeekly.map((d) => d.sent || 0),
          backgroundColor: "rgba(147, 197, 253, 0.85)",
          borderWidth: 0,
          stack: "eng",
        },
        {
          label: "Opened",
          data: chartWeekly.map((d) => d.opened || 0),
          backgroundColor: "rgba(52, 211, 153, 0.85)",
          borderWidth: 0,
          stack: "eng",
        },
        {
          label: "Clicked",
          data: chartWeekly.map((d) => d.clicked || 0),
          backgroundColor: "rgba(245, 158, 11, 0.85)",
          borderWidth: 0,
          borderRadius: 8,
          stack: "eng",
        },
      ],
    }),
    [chartWeekly, engagementLabels]
  );

  const engagementSingleDayBarOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      datasets: {
        bar: {
          categoryPercentage: 0.55,
          barPercentage: 1,
          maxBarThickness: 160,
        },
      },
      plugins: {
        legend: engagementChartOptions.plugins.legend,
        tooltip: {
          ...tooltipBase,
          callbacks: {
            title: (items) => {
              const i = items[0]?.dataIndex;
              const raw = chartWeekly[i]?.date;
              if (!raw) return "";
              return new Date(`${raw}T12:00:00Z`).toLocaleDateString(undefined, {
                weekday: "long",
                year: "numeric",
                month: "short",
                day: "numeric",
              });
            },
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}`,
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          border: { display: false },
          ticks: { font: { size: 11 }, color: "#64748b" },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: { display: false },
          border: { display: false },
          ticks: { font: { size: 11 }, color: "#94a3b8", maxTicksLimit: 6, padding: 4 },
        },
      },
    }),
    [chartWeekly, engagementChartOptions]
  );

  const barChartOptions = useMemo(() => {
    const peak = Math.max(...(stats.campaignStats || []).map((x) => Math.max(x.opened || 0, x.clicked || 0)), 0);
    const yMax = peak === 0 ? 5 : Math.ceil(peak * 1.15);
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: true,
          position: "top",
          align: "center",
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            padding: 14,
            font: { size: 12 },
            color: "#475569",
          },
        },
        tooltip: {
          ...tooltipBase,
          callbacks: {
            title: (items) => items[0]?.label ?? "",
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 }, color: "#64748b", maxRotation: 45, minRotation: 0 },
        },
        y: {
          beginAtZero: true,
          max: yMax,
          ticks: {
            font: { size: 11 },
            color: "#64748b",
          },
          grid: { color: "rgba(226, 232, 240, 0.85)" },
        },
      },
    };
  }, [stats.campaignStats]);

  const openRate = Number(stats.openRate || 0);
  const ctr = Number(stats.clickRate || 0);
  const engagementCampaigns = (stats.campaignStats || []).length
    ? stats.campaignStats
    : campaigns.map((c) => ({ campaignName: c.name, opened: 0, clicked: 0 }));

  const campaignBarData = {
    labels: engagementCampaigns.map((c) => String(c.campaignName || c.name || "campaign")),
    datasets: [
      {
        label: "Opened",
        data: engagementCampaigns.map((c) => Number(c.opened ?? 0)),
        backgroundColor: "#10b981",
        borderRadius: 6,
        maxBarThickness: 18,
      },
      {
        label: "Clicked",
        data: engagementCampaigns.map((c) => Number(c.clicked ?? 0)),
        backgroundColor: "#f59e0b",
        borderRadius: 6,
        maxBarThickness: 18,
      },
    ],
  };

  const campaignBarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom",
        align: "start",
        labels: {
          usePointStyle: true,
          pointStyle: "circle",
          boxWidth: 8,
          boxHeight: 8,
          padding: 18,
          color: "#0f172a",
          font: { size: 12, weight: 600 },
        },
      },
      tooltip: {
        ...tooltipBase,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: "#475569", font: { size: 12 } },
      },
      y: {
        beginAtZero: true,
        ticks: { color: "#64748b", stepSize: 8, font: { size: 12 } },
        grid: { color: "rgba(148, 163, 184, 0.32)", borderDash: [4, 4] },
      },
    },
  };

  const sentDisplay = useCountUp(stats.totalSent || 0);
  const openedDisplay = useCountUp(stats.totalOpened || 0);
  const clickedDisplay = useCountUp(stats.totalClicked || 0);
  const bouncedDisplay = useCountUp(stats.totalBounced || 0);

  return (
    <section className="dashboard-page">
      <h2 className="dashboard-title">Dashboard</h2>
      <p className="dashboard-subtitle">Overview of your email marketing performance.</p>
      <div className="dashboard-live-row">
        <small>Auto-refresh every 30 seconds (active tab only)</small>
        <button type="button" className="ghost-btn dashboard-refresh-btn" disabled={refreshing} onClick={() => fetchDashboard(true)}>
          <RefreshCw size={14} className={refreshing ? "campaign-refresh-spin" : ""} />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>
      <div className="kpi-grid">
        <div className={`kpi-card ${loading ? "kpi-skeleton" : ""}`}>
          <p className="kpi-heading">TOTAL SENT <span className="kpi-icon sent"><Send size={14} /></span></p>
          <h3>{loading ? "..." : sentDisplay}</h3>
          <small>↗ +12% this week.</small>
        </div>
        <div className={`kpi-card ${loading ? "kpi-skeleton" : ""}`}>
          <p className="kpi-heading">OPENED <span className="kpi-icon green"><Eye size={14} /></span></p>
          <h3>{loading ? "..." : openedDisplay}</h3>
          <small>↗ {openRate.toFixed(0)}% open rate</small>
        </div>
        <div className={`kpi-card ${loading ? "kpi-skeleton" : ""}`}>
          <p className="kpi-heading">CLICKED <span className="kpi-icon orange"><Sparkles size={14} /></span></p>
          <h3>{loading ? "..." : clickedDisplay}</h3>
          <small>↗ {ctr.toFixed(0)}% CTR</small>
        </div>
        <div className={`kpi-card ${loading ? "kpi-skeleton" : ""}`}>
          <p className="kpi-heading">FAILED <span className="kpi-icon red"><AlertTriangle size={14} /></span></p>
          <h3>{loading ? "..." : bouncedDisplay}</h3>
          <small className="muted">Needs attention</small>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="panel large engagement-panel">
          <div className="engagement-panel-head">
            <h4>
              {engagementRange === 1 ? "Engagement — last day" : `Engagement — last ${engagementRange} days`}
            </h4>
            <div className="engagement-range-toggle" role="group" aria-label="Engagement time range">
              {[
                { value: 1, label: "1D" },
                { value: 7, label: "7D" },
                { value: 30, label: "30D" },
                { value: 90, label: "90D" },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={`engagement-range-btn${engagementRange === value ? " engagement-range-btn-active" : ""}`}
                  onClick={() => setEngagementRange(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="engagement-summary-strip">
            <span>
              <small>Total sent</small>
              <strong>{loading ? "—" : engagementPeriodTotals.sent}</strong>
            </span>
            <span className="engagement-summary-divider" aria-hidden />
            <span>
              <small>Open rate</small>
              <strong>{loading ? "—" : `${engagementPeriodTotals.openPct.toFixed(1)}%`}</strong>
            </span>
            <span className="engagement-summary-divider" aria-hidden />
            <span>
              <small>Click rate</small>
              <strong>{loading ? "—" : `${engagementPeriodTotals.clickPct.toFixed(1)}%`}</strong>
            </span>
          </div>
          <div className={`chart-box engagement-chart${engagementEmpty || loading ? " engagement-chart-empty" : ""}`}>
            {loading ? <div className="engagement-chart-skeleton" aria-hidden /> : null}
            {!loading && engagementEmpty ? <p className="engagement-empty-message">No engagement data yet</p> : null}
            {!loading && !engagementEmpty ? (
              engagementSinglePointView ? (
                <Bar data={engagementSingleDayBarData} options={engagementSingleDayBarOptions} />
              ) : (
                <Line data={engagementChartData} options={engagementChartOptions} />
              )
            ) : null}
          </div>
        </div>
        <div className="panel campaign-engagement-panel">
          <h4>Campaign engagement</h4>
          <p className="campaign-engagement-sub">Opens vs clicks per campaign</p>
          <div className="chart-box campaign-engagement-chart">
            <Bar
              data={campaignBarData}
              options={campaignBarOptions}
            />
          </div>
        </div>
      </div>

      <div className="dashboard-grid bottom">
        <div className="panel recent-campaigns-card">
          <div className="recent-campaigns-head">
            <div>
              <h4>Recent campaigns</h4>
              <p>Latest sends and their performance</p>
            </div>
            <button type="button" className="recent-view-all" onClick={() => navigate("/campaigns")}>
              View all <ChevronRight size={14} />
            </button>
          </div>
          <table className="recent-campaigns-table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Sent</th>
                <th>Recipients</th>
                <th>Open Rate</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length ? campaigns.map((c) => {
                const recipientCount = c.recipientCount ?? c.sentCount ?? c.totalSent ?? c.audienceSize ?? "—";
                const openRateValue = c.openRate ?? c.openRatePct ?? c.metrics?.openRate ?? null;
                const openRateText = openRateValue == null ? "—" : `${Number(openRateValue).toFixed(1)}%`;
                return (
                  <tr key={c._id}>
                    <td>
                      <div className="recent-campaign-name">
                        <span className="recent-campaign-icon"><Send size={14} /></span>
                        <div>
                          <strong>{c.name}</strong>
                          <small>Bulk email</small>
                        </div>
                      </div>
                    </td>
                    <td>{new Date(c.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</td>
                    <td>{recipientCount}</td>
                    <td>{openRateText}</td>
                    <td>
                      <span className={`status-pill recent-status ${c.status === "completed" ? "success" : c.status === "draft" ? "draft" : c.status === "sending" ? "sending" : "failed"}`}>
                        {c.status === "completed" ? <CheckCircle2 size={13} /> : null}
                        {c.status === "completed" ? "Completed" : c.status}
                      </span>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={5} className="recent-campaigns-empty">No campaigns yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="panel audience-panel">
          <div className="audience-head">
            <div>
              <small>Audience</small>
              <h3>{contactsCount}</h3>
              <p>Total contacts across all lists</p>
            </div>
            <span className="audience-icon"><Users size={18} /></span>
          </div>
          <div className="audience-list">
            {audienceRows.length ? audienceRows.map((row) => {
              const pct = contactsCount > 0 ? Math.max((row.count / contactsCount) * 100, 4) : 0;
              return (
                <div key={row.id} className="audience-row">
                  <div className="audience-row-top">
                    <div className="audience-row-name">
                      <strong>{row.name}</strong>
                      {row.createdAt ? (
                        <small className="audience-row-created">Created {formatCreatedDateTime(row.createdAt)}</small>
                      ) : null}
                    </div>
                    <span>{row.count}</span>
                  </div>
                  <div className="audience-bar">
                    <span style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            }) : (
              <p className="audience-empty">No list data yet.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
