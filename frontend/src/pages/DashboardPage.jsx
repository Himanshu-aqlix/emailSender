import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, Line } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend } from "chart.js";
import { AlertTriangle, CheckCircle2, ChevronRight, Eye, Send, Sparkles, Users } from "lucide-react";
import { getCampaigns } from "../services/campaignService";
import { getContacts } from "../services/contactService";
import { getStats } from "../services/statsService";
import { getBrevoEvents } from "../services/brevoTrackingService";

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

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ totalSent: 0, opened: 0, clicked: 0, failed: 0 });
  const [campaigns, setCampaigns] = useState([]);
  const [contactsCount, setContactsCount] = useState(0);
  const [audienceRows, setAudienceRows] = useState([]);

  useEffect(() => {
    Promise.all([getStats(), getCampaigns({ page: 1, limit: 4 }), getContacts("page=1&limit=500"), getBrevoEvents({ limit: 100, days: 30 })])
      .then(([statsRes, campaignsRes, contactsRes, brevoRes]) => {
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
        const campData = campaignsRes.data || {};
        setCampaigns((campData.items || []).slice(0, 4));
        const contactsData = contactsRes.data || {};
        const items = contactsData.items || contactsData;
        const totalFromPagination = contactsData.pagination?.total;
        setContactsCount(typeof totalFromPagination === "number" ? totalFromPagination : (Array.isArray(items) ? items.length : 0));
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
          setAudienceRows(
            Array.from(map.values())
              .sort((a, b) => b.count - a.count)
              .slice(0, 5)
          );
        } else {
          setAudienceRows([]);
        }
      })
      .catch(() => null);
  }, []);

  const lineData = {
    labels: ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"],
    datasets: [
      {
        label: "Sent",
        data: [9, 8, 11, 5, 6, 11, 5],
        borderColor: "#e11d48",
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBorderWidth: 2,
        pointHoverBackgroundColor: "#fff",
        pointHoverBorderColor: "#e11d48",
      },
      {
        label: "Opened",
        data: [8, 6, 7, 5, 4, 7, 5],
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
        data: [5, 3, 2, 3, 1, 3, 2],
        borderColor: "#0ea5e9",
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
    const peak = Math.max(stats.opened, stats.clicked, 0);
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
  }, [stats.opened, stats.clicked]);

  const openRate = stats.totalSent ? (stats.opened / stats.totalSent) * 100 : 0;
  const ctr = stats.totalSent ? (stats.clicked / stats.totalSent) * 100 : 0;
  const engagementCampaigns = campaigns.length
    ? campaigns
    : [
        { _id: "sample-1", name: "ed" },
        { _id: "sample-2", name: "dwwe" },
        { _id: "sample-3", name: "promo" },
        { _id: "sample-4", name: "newsletter" },
      ];

  const campaignBarData = {
    labels: engagementCampaigns.map((c) => String(c.name || "campaign").toLowerCase()),
    datasets: [
      {
        label: "Opened",
        data: engagementCampaigns.map((c, i) =>
          Number(c.openedCount ?? c.opened ?? c.metrics?.opened ?? Math.max(30 - i * 8, 8))
        ),
        backgroundColor: "#10b981",
        borderRadius: 6,
        maxBarThickness: 18,
      },
      {
        label: "Clicked",
        data: engagementCampaigns.map((c, i) =>
          Number(c.clickedCount ?? c.clicked ?? c.metrics?.clicked ?? [1, 3, 5, 2][i % 4])
        ),
        backgroundColor: "#4f63df",
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

  return (
    <section className="dashboard-page">
      <h2 className="dashboard-title">Dashboard</h2>
      <p className="dashboard-subtitle">Overview of your email marketing performance.</p>
      <div className="kpi-grid">
        <div className="kpi-card">
          <p className="kpi-heading">TOTAL SENT <span className="kpi-icon"><Send size={14} /></span></p>
          <h3>{stats.totalSent}</h3>
          <small>↗ +12% this week.</small>
        </div>
        <div className="kpi-card">
          <p className="kpi-heading">OPENED <span className="kpi-icon green"><Eye size={14} /></span></p>
          <h3>{stats.opened}</h3>
          <small>↗ {openRate.toFixed(0)}% open rate</small>
        </div>
        <div className="kpi-card">
          <p className="kpi-heading">CLICKED <span className="kpi-icon red"><Sparkles size={14} /></span></p>
          <h3>{stats.clicked}</h3>
          <small>↗ {ctr.toFixed(0)}% CTR</small>
        </div>
        <div className="kpi-card">
          <p className="kpi-heading">FAILED <span className="kpi-icon yellow"><AlertTriangle size={14} /></span></p>
          <h3>{stats.failed}</h3>
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
