import { useEffect, useMemo, useState } from "react";
import { Bar, Line } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend } from "chart.js";
import { AlertTriangle, Eye, Send, Sparkles, Users } from "lucide-react";
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
  const [stats, setStats] = useState({ totalSent: 0, opened: 0, clicked: 0, failed: 0 });
  const [campaigns, setCampaigns] = useState([]);
  const [contactsCount, setContactsCount] = useState(0);

  useEffect(() => {
    Promise.all([getStats(), getCampaigns({ page: 1, limit: 2 }), getContacts(), getBrevoEvents({ limit: 100, days: 30 })])
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
        setCampaigns((campData.items || []).slice(0, 2));
        const contactsData = contactsRes.data || {};
        const items = contactsData.items || contactsData;
        const totalFromPagination = contactsData.pagination?.total;
        setContactsCount(typeof totalFromPagination === "number" ? totalFromPagination : (Array.isArray(items) ? items.length : 0));
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
        <div className="panel">
          <h4>Campaign engagement</h4>
          <div className="chart-box">
            <Bar
              data={{
                labels: [campaigns[0]?.name || "Product Launch Teaser"],
                datasets: [
                  { label: "Opened", data: [stats.opened], backgroundColor: "#16a34a", borderRadius: 6 },
                  { label: "Clicked", data: [stats.clicked], backgroundColor: "#dc2626", borderRadius: 6 },
                ],
              }}
              options={barChartOptions}
            />
          </div>
        </div>
      </div>

      <div className="dashboard-grid bottom">
        <div className="panel">
          <h4>Recent campaigns</h4>
          <div className="recent-list">
            {campaigns.length ? campaigns.map((c) => (
              <div key={c._id} className="recent-item">
                <div>
                  <strong>{c.name}</strong>
                  <small>{new Date(c.createdAt).toLocaleDateString()}</small>
                </div>
                <span className={`status-pill ${c.status === "completed" ? "done" : "draft"}`}>{c.status}</span>
              </div>
            )) : (
              <div className="recent-item">
                <div><strong>No campaigns yet</strong><small>Create your first campaign</small></div>
                <span className="status-pill draft">draft</span>
              </div>
            )}
          </div>
        </div>
        <div className="panel">
          <h4>Audience</h4>
          <div className="audience-box">
            <span className="audience-icon"><Users size={18} /></span>
            <div>
              <h3>{contactsCount}</h3>
              <p>Total contacts across all lists</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
