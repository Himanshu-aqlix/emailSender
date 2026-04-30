import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, Line } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend } from "chart.js";
import { AlertTriangle, CheckCircle2, ChevronRight, Eye, RefreshCw, Send, Sparkles, Users } from "lucide-react";
import { getCampaigns } from "../services/campaignService";
import { getContacts } from "../services/contactService";
import { getDashboardStats } from "../services/statsService";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend);

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

  const fetchDashboard = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const [statsRes, campaignsRes, contactsRes] = await Promise.all([
        getDashboardStats(),
        getCampaigns({ page: 1, limit: 4 }),
        getContacts("page=1&limit=500"),
      ]);
      setStats({ ...DEFAULT_DASHBOARD, ...(statsRes?.data || {}) });
      const campData = campaignsRes?.data || {};
      setCampaigns((campData.items || []).slice(0, 4));

      const contactsData = contactsRes?.data || {};
      const items = contactsData.items || contactsData;
      const totalFromPagination = contactsData.pagination?.total;
      setContactsCount(typeof totalFromPagination === "number" ? totalFromPagination : Array.isArray(items) ? items.length : 0);

      if (Array.isArray(items)) {
        const map = new Map();
        items.forEach((contact) => {
          const refs = Array.isArray(contact?.lists) ? contact.lists : [];
          refs.forEach((ref) => {
            const id = String(ref?._id || ref || "");
            if (!id) return;
            const name = ref?.name || `List ${id.slice(-4)}`;
            const prev = map.get(id) || { id, name, count: 0 };
            prev.count += 1;
            map.set(id, prev);
          });
        });
        setAudienceRows(Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 5));
      } else {
        setAudienceRows([]);
      }
    } catch {
      // keep previous data
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard(false);
  }, [fetchDashboard]);

  useEffect(() => {
    const id = setInterval(() => fetchDashboard(true), 10000);
    return () => clearInterval(id);
  }, [fetchDashboard]);

  const weeklyStats = Array.isArray(stats.weeklyStats) ? stats.weeklyStats : [];
  const chartWeekly = weeklyStats.length
    ? weeklyStats
    : Array.from({ length: 7 }).map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return { date: d.toISOString().slice(0, 10), sent: 0, opened: 0, clicked: 0 };
      });
  const lineData = {
    labels: chartWeekly.map((d) => new Date(`${d.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short" })),
    datasets: [
      {
        label: "Sent",
        data: chartWeekly.map((d) => d.sent || 0),
        borderColor: "#2563eb",
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBorderWidth: 2,
        pointHoverBackgroundColor: "#fff",
        pointHoverBorderColor: "#e11d48",
      },
      {
        label: "Opened",
        data: chartWeekly.map((d) => d.opened || 0),
        borderColor: "#16a34a",
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBorderWidth: 2,
        pointHoverBackgroundColor: "#fff",
        pointHoverBorderColor: "#16a34a",
      },
      {
        label: "Clicked",
        data: chartWeekly.map((d) => d.clicked || 0),
        borderColor: "#f59e0b",
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBorderWidth: 2,
        pointHoverBackgroundColor: "#fff",
        pointHoverBorderColor: "#0ea5e9",
      },
    ],
  };

  const lineChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
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
          grid: { color: "rgba(226, 232, 240, 0.85)" },
          ticks: { font: { size: 11 }, color: "#64748b" },
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(226, 232, 240, 0.85)" },
          ticks: { font: { size: 11 }, color: "#64748b" },
        },
      },
    }),
    []
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
        <small>Auto-refresh every 10 seconds</small>
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
        <div className="panel large">
          <h4>Engagement — last 7 days</h4>
          <div className="chart-box">
            <Line data={lineData} options={lineChartOptions} />
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
                    <strong>{row.name}</strong>
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
