import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  BellOff,
  Calendar,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Eye,
  Inbox,
  Info,
  MailCheck,
  MousePointerClick,
  Download,
  RefreshCw,
  Send,
  Users,
  X,
} from "lucide-react";
import { Bar, Line } from "react-chartjs-2";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { exportCampaignData, getCampaignDetails, getCampaignRecipientTimeline } from "../services/campaignService";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler);

const ENG_COLORS = {
  delivered: { line: "#2563eb", rgb: "37, 99, 235" },
  opened: { line: "#10b981", rgb: "16, 185, 129" },
  clicked: { line: "#f59e0b", rgb: "245, 158, 11" },
};

/** @param {{ chart?: import("chart.js").Chart }} chartCtx */
function lineAreaGradient(chartCtx, rgb) {
  const chart = chartCtx?.chart;
  const { ctx, chartArea } = chart || {};
  if (!chartArea || !ctx) return `rgba(${rgb}, 0.08)`;
  const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  g.addColorStop(0, `rgba(${rgb}, 0.28)`);
  g.addColorStop(1, `rgba(${rgb}, 0.02)`);
  return g;
}

function formatEngagementAxisLabel(row) {
  if (!row || typeof row !== "object") return "";
  const g = row.granularity || "";

  if (g === "hour" && typeof row.bucket === "string") {
    const parts = row.bucket.split("-");
    if (parts.length !== 4) return row.bucket;
    const utc = Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), Number(parts[3]));
    return new Date(utc).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  if (g === "day" && row.date)
    return new Date(`${String(row.date).slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });

  if (g === "week" && row.dateStart && row.dateEnd) {
    const a = new Date(`${row.dateStart}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const b = new Date(`${row.dateEnd}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `${a}–${b}`;
  }

  return row.bucket || row.date || "—";
}

function tooltipTitleFromTimelineRow(row) {
  if (!row || typeof row !== "object") return "";
  const g = row.granularity || "";
  if (g === "hour" && typeof row.bucket === "string") {
    const parts = row.bucket.split("-");
    if (parts.length !== 4) return row.bucket;
    const utc = Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), Number(parts[3]));
    return new Date(utc).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  if (g === "day" && row.date) {
    return new Date(`${String(row.date).slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  if (g === "week" && row.dateStart && row.dateEnd) {
    const a = new Date(`${row.dateStart}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    const b = new Date(`${row.dateEnd}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    return `${a} – ${b}`;
  }
  return String(row.bucket || row.date || "");
}

function timelineHasCounts(rows) {
  if (!rows?.length) return false;
  return rows.some((r) => Number(r.delivered || 0) + Number(r.opened || 0) + Number(r.clicked || 0) > 0);
}

function subtitleForEngagement(rangeKey, granularity) {
  if (rangeKey === "1d") return "Last 24 hours · hourly";
  if (rangeKey === "30d" || granularity === "week") return "Last 30 days · weekly";
  return "Last 7 days · daily";
}

const toPct = (value, total) => (total ? ((value / total) * 100).toFixed(1) : "0.0");

const EVENT_PANEL_ROWS = [
  { key: "delivered", label: "Delivered" },
  { key: "opened", label: "Opened" },
  { key: "clicked", label: "Clicked" },
  { key: "bounced", label: "Bounced" },
  { key: "complaint", label: "Complaint" },
  { key: "unsubscribed", label: "Unsubscribed" },
  { key: "deferred", label: "Deferred" },
  { key: "error", label: "Error" },
];

const defaultData = {
  campaign: null,
  stats: { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0 },
  eventCounts: {},
  timeline: [],
  timelineMeta: { range: "7d", granularity: "day" },
  recipients: [],
};

const prettyStatus = (status) => {
  const s = String(status || "draft").toLowerCase();
  if (s === "clicked" || s === "click") return "Clicked";
  if (s === "opened" || s === "open") return "Opened";
  if (s === "delivered") return "Delivered";
  if (s === "sent") return "Sent";
  if (s === "bounced") return "Bounced";
  if (s === "complaint") return "Complaint";
  if (s === "unsubscribed") return "Unsubscribed";
  if (s === "deferred") return "Deferred";
  if (s === "error") return "Error";
  if (s === "completed") return "Completed";
  if (s === "sending") return "Sending";
  if (s === "failed") return "Failed";
  return "Draft";
};

const statusPillClass = (status, clicked, opened) => {
  const s = clicked ? "clicked" : opened ? "opened" : String(status || "").toLowerCase();
  if (s === "clicked") return "status-pill campaign-status-clicked";
  if (s === "opened") return "status-pill campaign-status-opened";
  if (s === "sent") return "status-pill campaign-status-sent";
  if (s === "delivered") return "status-pill campaign-status-delivered";
  if (s === "bounced") return "status-pill campaign-status-bounced";
  if (s === "complaint") return "status-pill campaign-status-complaint";
  if (s === "unsubscribed") return "status-pill campaign-status-unsub";
  if (s === "deferred") return "status-pill campaign-status-deferred";
  if (s === "error" || s === "failed") return "status-pill failed";
  return "status-pill draft";
};

const getEventStyle = (type) => {
  const t = String(type || "").toLowerCase();
  if (t === "sent" || t === "request") return { color: "gray", icon: Send, label: "Request" };
  if (t === "delivered") return { color: "blue", icon: Inbox, label: "Delivered" };
  if (t === "opened") return { color: "green", icon: Eye, label: "Opened" };
  if (t === "unique_open" || t === "unique_opened") return { color: "green", icon: Eye, label: "Unique Open" };
  if (t === "clicked") return { color: "orange", icon: MousePointerClick, label: "Clicked" };
  if (t.includes("bounce")) return { color: "red", icon: AlertTriangle, label: "Bounced" };
  if (t === "error") return { color: "red", icon: AlertTriangle, label: "Error" };
  if (t === "complaint") return { color: "red", icon: AlertTriangle, label: "Complaint" };
  if (t === "unsubscribed") return { color: "gray", icon: BellOff, label: "Unsubscribed" };
  return { color: "gray", icon: Clock3, label: t ? t[0].toUpperCase() + t.slice(1) : "Event" };
};

export default function CampaignDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const engagementRangeRef = useRef("7d");
  const engagementFetchGen = useRef(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(defaultData);
  const [selectedEmail, setSelectedEmail] = useState("");
  const [timelineData, setTimelineData] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [engagementRange, setEngagementRange] = useState("7d");
  const [engagementChartBusy, setEngagementChartBusy] = useState(false);

  useEffect(() => {
    engagementRangeRef.current = engagementRange;
  }, [engagementRange]);

  const load = useCallback(async (opts = { silent: false }) => {
    if (!opts.silent) setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      const rangeAtStart = engagementRangeRef.current;
      const res = await getCampaignDetails(id, { range: rangeAtStart });
      if (engagementRangeRef.current !== rangeAtStart) return;
      const payload = res.data || {};
      setData({
        campaign: payload.campaign,
        stats: payload.stats || defaultData.stats,
        eventCounts: payload.eventCounts || {},
        timeline: Array.isArray(payload.timeline) ? payload.timeline : [],
        timelineMeta: payload.timelineMeta || defaultData.timelineMeta,
        recipients: Array.isArray(payload.recipients) ? payload.recipients : payload.contacts || [],
      });
    } catch (e) {
      setError(e?.response?.data?.message || "Unable to load campaign details.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  const pickEngagementRange = useCallback(async (nextRange) => {
    if (!id || nextRange === engagementRangeRef.current) return;
    engagementRangeRef.current = nextRange;
    setEngagementRange(nextRange);
    const gen = (engagementFetchGen.current += 1);
    setEngagementChartBusy(true);
    try {
      const res = await getCampaignDetails(id, { range: nextRange });
      if (gen !== engagementFetchGen.current) return;
      const payload = res.data || {};
      setData((prev) => ({
        ...prev,
        timeline: Array.isArray(payload.timeline) ? payload.timeline : [],
        timelineMeta: payload.timelineMeta || prev.timelineMeta,
      }));
    } catch {
      /* keep prior timeline on error */
    } finally {
      if (gen === engagementFetchGen.current) setEngagementChartBusy(false);
    }
  }, [id]);

  useEffect(() => {
    load({ silent: false });
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => {
      load({ silent: true });
    }, 8000);
    return () => clearInterval(t);
  }, [load]);

  const campaign = data.campaign;
  const stats = data.stats || defaultData.stats;
  const eventCounts = data.eventCounts || {};
  const timeline = data.timeline.length ? data.timeline : [];
  const recipients = data.recipients || [];

  const total = Math.max(stats.sent, 0);
  const openRate = toPct(stats.opened, total);
  const clickRate = toPct(stats.clicked, total);
  const deliveredRate = toPct(stats.delivered, total);
  const bounceRate = toPct(stats.bounced, total);

  const recentRecipients = recipients.slice(0, 12);

  const listItems = useMemo(() => {
    if (!campaign) return [];
    if (Array.isArray(campaign.listIds) && campaign.listIds.length) {
      return campaign.listIds.map((l) => l?.name).filter(Boolean);
    }
    return campaign.listId?.name ? [campaign.listId.name] : [];
  }, [campaign]);

  const engagementLine = useMemo(() => {
    const labels = timeline.map((row) => formatEngagementAxisLabel(row));
    const delivered = timeline.map((r) => Number(r.delivered) || 0);
    const opened = timeline.map((r) => Number(r.opened) || 0);
    const clicked = timeline.map((r) => Number(r.clicked) || 0);
    const mkSet = (metricKey, label) => ({
      label,
      data: { delivered, opened, clicked }[metricKey],
      borderColor: ENG_COLORS[metricKey].line,
      backgroundColor: (ctx) => lineAreaGradient(ctx, ENG_COLORS[metricKey].rgb),
      tension: 0.42,
      fill: true,
      pointRadius: 3,
      pointHoverRadius: 5,
      borderWidth: 2,
    });
    return {
      labels,
      datasets: [mkSet("delivered", "Delivered"), mkSet("opened", "Opened"), mkSet("clicked", "Clicked")],
    };
  }, [timeline]);

  const engagementOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "bottom",
          labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, padding: 16 },
        },
        tooltip: {
          callbacks: {
            title: (items) => {
              const i = items[0]?.dataIndex;
              if (i == null || !timeline[i]) return "";
              return tooltipTitleFromTimelineRow(timeline[i]);
            },
            label: (item) => `${item.dataset.label}: ${item.formattedValue}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 45, minRotation: 0, autoSkip: true } },
        y: { beginAtZero: true, ticks: { precision: 0 } },
      },
    }),
    [timeline]
  );

  const hasEngagementActivity = timelineHasCounts(timeline);
  const engagementSubtitle = subtitleForEngagement(
    data.timelineMeta?.range ?? engagementRange,
    data.timelineMeta?.granularity
  );

  const openClickBar = {
    labels: ["Opened", "Clicked"],
    datasets: [
      {
        label: "Count",
        data: [stats.opened, stats.clicked],
        backgroundColor: ["#10b981", "#f59e0b"],
        borderRadius: 8,
      },
    ],
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, ticks: { stepSize: 1 } },
    },
  };

  const fetchTimeline = useCallback(async (email) => {
    setLoadingTimeline(true);
    try {
      const res = await getCampaignRecipientTimeline(id, email);
      const events = Array.isArray(res?.data?.events) ? res.data.events : [];
      events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      setTimelineData(events);
    } catch {
      setTimelineData([]);
    } finally {
      setLoadingTimeline(false);
    }
  }, [id]);

  const handleRowClick = (email) => {
    setSelectedEmail(email);
    setIsModalOpen(true);
    fetchTimeline(email);
  };

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const res = await exportCampaignData(id);
      const blob = res?.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${String(campaign?.name || "campaign").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase()}-data.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }, [campaign?.name, id]);

  if (loading) return <section className="campaign-detail-page"><div className="panel">Loading campaign details…</div></section>;
  if (error) return <section className="campaign-detail-page"><div className="panel auth-error">{error}</div></section>;
  if (!campaign) return <section className="campaign-detail-page"><div className="panel">Campaign not found.</div></section>;

  return (
    <section className="campaign-detail-page">
      <div className="campaign-detail-head campaign-detail-backrow">
        <button type="button" className="ghost-btn campaigns-view-btn" onClick={() => navigate("/campaigns")}>
          <ArrowLeft size={14} /> Back to campaigns
        </button>
      </div>

      <div className="campaign-detail-head campaign-detail-title-row">
        <div>
          <h2 className="dashboard-title">Campaign Details</h2>
          <p className="campaign-detail-subtitle">
            Performance overview for campaign <strong>&quot;{campaign.name}&quot;</strong>
            {campaign.updatedAt ? ` · sent on ${new Date(campaign.updatedAt).toLocaleDateString()}` : ""}
          </p>
        </div>
        <div className="campaign-title-actions">
          <button
            type="button"
            className="ghost-btn campaign-refresh-btn"
            onClick={handleDownload}
            disabled={downloading}
            title="Download campaign analytics"
          >
            <Download size={16} />
            {downloading ? "Downloading..." : "Download Data"}
          </button>
          <button
            type="button"
            className="ghost-btn campaign-refresh-btn"
            onClick={() => load({ silent: true })}
            disabled={refreshing}
            title="Refresh data"
          >
            <RefreshCw size={16} className={refreshing ? "campaign-refresh-spin" : ""} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <span className={`status-pill ${campaign.status === "completed" ? "success" : campaign.status === "sending" ? "sending" : campaign.status === "failed" ? "failed" : "draft"}`}>
            {prettyStatus(campaign.status)}
          </span>
        </div>
      </div>

      <div className="campaign-kpi-grid">
        <div className="panel campaign-kpi-card campaign-kpi-hover">
          <div>
            <small>Sent</small>
            <strong>{stats.sent}</strong>
            <p>Recipients targeted</p>
          </div>
          <span className="campaign-kpi-icon sent">
            <Send size={14} />
          </span>
        </div>
        <div className="panel campaign-kpi-card campaign-kpi-hover">
          <div>
            <small>Delivered</small>
            <strong>{stats.delivered}</strong>
            <p>{deliveredRate}% reach</p>
          </div>
          <span className="campaign-kpi-icon delivered">
            <CheckCircle2 size={14} />
          </span>
        </div>
        <div className="panel campaign-kpi-card campaign-kpi-hover">
          <div>
            <small>Opened</small>
            <strong>{stats.opened}</strong>
            <p>{openRate}% open rate</p>
          </div>
          <span className="campaign-kpi-icon opened">
            <MailCheck size={14} />
          </span>
        </div>
        <div className="panel campaign-kpi-card campaign-kpi-hover">
          <div>
            <small>Clicked</small>
            <strong>{stats.clicked}</strong>
            <p>{clickRate}% click rate</p>
          </div>
          <span className="campaign-kpi-icon clicked">
            <MousePointerClick size={14} />
          </span>
        </div>
        <div className="panel campaign-kpi-card campaign-kpi-hover campaign-kpi-danger">
          <div>
            <small>Bounced</small>
            <strong>{stats.bounced}</strong>
            <p>{bounceRate}% bounce rate</p>
          </div>
          <span className="campaign-kpi-icon bounced">
            <AlertTriangle size={14} />
          </span>
        </div>
      </div>

      <div className="campaign-detail-layout">
        <div className="panel campaign-detail-card campaign-basic-card">
          <div className="campaign-basic-head">
            <div>
              <small>Campaign</small>
              <h4>Basic information</h4>
            </div>
          </div>
          <div className="campaign-basic-list">
            <div className="campaign-basic-row">
              <span className="campaign-basic-icon">
                <Users size={14} />
              </span>
              <p>
                <span>Campaign Name</span>
                <strong>{campaign.name}</strong>
              </p>
            </div>
            <div className="campaign-basic-row">
              <span className="campaign-basic-icon">
                <CheckCircle2 size={14} />
              </span>
              <p>
                <span>Template</span>
                <strong>{campaign.templateId?.name || "—"}</strong>
              </p>
            </div>
            <div className="campaign-basic-row">
              <span className="campaign-basic-icon">
                <Users size={14} />
              </span>
              <p>
                <span>Lists Used</span>
                <strong>
                  <span className="campaign-list-pills">
                    {listItems.length ? listItems.map((n) => <span key={n} className="list-pill">{n}</span>) : "—"}
                  </span>
                </strong>
              </p>
            </div>
            <div className="campaign-basic-row">
              <span className="campaign-basic-icon">
                <Calendar size={14} />
              </span>
              <p>
                <span>Created</span>
                <strong>{campaign.createdAt ? new Date(campaign.createdAt).toLocaleString() : "—"}</strong>
              </p>
            </div>
            <div className="campaign-basic-row">
              <span className="campaign-basic-icon">
                <Send size={14} />
              </span>
              <p>
                <span>Sent</span>
                <strong>{campaign.status === "completed" ? new Date(campaign.updatedAt).toLocaleString() : "—"}</strong>
              </p>
            </div>
          </div>
        </div>

        <div className="panel analytics-card campaign-engagement-card">
          <div className="campaign-card-head campaign-engagement-card-head">
            <div className="campaign-engagement-head-left">
              <h4>Engagement</h4>
              <small>{engagementSubtitle}</small>
            </div>
            <div className="campaign-engagement-range" role="group" aria-label="Engagement time range">
              {[
                { key: "1d", label: "1D" },
                { key: "7d", label: "7D" },
                { key: "30d", label: "1M" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  className={`campaign-engagement-range-btn${engagementRange === key ? " is-active" : ""}`}
                  onClick={() => pickEngagementRange(key)}
                  aria-pressed={engagementRange === key}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="campaign-engagement-chart-shell">
            {!hasEngagementActivity && !engagementChartBusy ? (
              <div className="campaign-engagement-empty analytics-empty">
                <div className="contacts-empty-icon">
                  <Eye size={22} />
                </div>
                <h3>No activity in selected range</h3>
                <p>Try a longer window or send more traffic to see engagement trends.</p>
              </div>
            ) : (
              hasEngagementActivity ? (
                <div className="campaign-detail-chart-wrap campaign-engagement-chart-wrap">
                  <Line data={engagementLine} options={engagementOptions} />
                </div>
              ) : (
                <div className="campaign-engagement-chart-placeholder" aria-hidden />
              )
            )}
            {engagementChartBusy ? (
              <div className="campaign-engagement-chart-skeleton" aria-busy aria-label="Loading chart">
                <div className="campaign-engagement-skeleton-lines" />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="campaign-events-open-row">
        <div className="panel campaign-events-section">
          <div className="campaign-card-head">
            <div>
              <h4>Events</h4>
              <small>Webhook totals · toggle rows for emphasis (display only)</small>
            </div>
          </div>
          <ul className="campaign-events-list">
            {EVENT_PANEL_ROWS.map((row) => (
              <li
                key={row.key}
                className="campaign-event-row"
              >
                <span className="campaign-event-label">
                  {row.label}
                  <span className="campaign-event-info" title="Count from Brevo webhooks">
                    <Info size={14} strokeWidth={2} />
                  </span>
                </span>
                <span className="campaign-event-count">{eventCounts[row.key] ?? 0}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel analytics-card campaign-open-click-card">
          <div className="campaign-card-head">
            <h4>Open vs Click</h4>
            <small>Conversion funnel</small>
          </div>
          <div className="campaign-detail-chart-wrap">
            <Bar data={openClickBar} options={barOptions} />
          </div>
          <div className="campaign-rate-row">
            <div>
              <small>Open Rate</small>
              <strong>{openRate}%</strong>
            </div>
            <div>
              <small>Click Rate</small>
              <strong>{clickRate}%</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="campaign-recipients-row">
        <div className="panel logs-panel campaign-recipient-card">
          <div className="campaign-card-head">
            <h4>Recipients</h4>
            <small>Latest delivery activity</small>
          </div>
          {!recentRecipients.length ? (
            <div className="analytics-empty">
              <div className="contacts-empty-icon">
                <Eye size={22} />
              </div>
              <h3>No recipients yet</h3>
              <p>Send this campaign to populate recipient-level delivery and engagement logs.</p>
            </div>
          ) : (
            <table className="contacts-table">
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>List</th>
                  <th>Status</th>
                  <th>Last activity</th>
                </tr>
              </thead>
              <tbody>
                {recentRecipients.map((c) => (
                  <tr
                    key={c._id}
                    className="campaign-recipient-row"
                    onClick={() => handleRowClick(c.email)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleRowClick(c.email);
                      }
                    }}
                  >
                    <td>{c.email}</td>
                    <td>{Array.isArray(campaign.listIds) && campaign.listIds.length ? campaign.listIds[0]?.name || "—" : campaign.listId?.name || "—"}</td>
                    <td>
                      <span className={statusPillClass(c.status, c.clicked, c.opened)}>
                        {prettyStatus(c.clicked ? "clicked" : c.opened ? "opened" : c.status)}
                      </span>
                    </td>
                    <td>
                      <span className="campaign-last-activity-inline">
                        {c.lastEventTime ? new Date(c.lastEventTime).toLocaleString() : "—"}
                        <ExternalLink size={13} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {isModalOpen ? (
        <div className="campaign-timeline-modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="campaign-timeline-modal" onClick={(e) => e.stopPropagation()}>
            <div className="campaign-timeline-head">
              <div>
                <h3>Email Activity</h3>
                <p>{selectedEmail || "Recipient timeline"}</p>
              </div>
              <div className="campaign-timeline-head-actions">
                <span className="campaign-timeline-count-badge">{timelineData.length} events</span>
                <button
                  type="button"
                  className="campaign-timeline-icon-close"
                  onClick={() => setIsModalOpen(false)}
                  aria-label="Close timeline"
                >
                  <X size={17} />
                </button>
              </div>
            </div>

            {loadingTimeline ? (
              <div className="campaign-timeline-loading">
                <RefreshCw size={18} className="campaign-refresh-spin" />
                <span>Loading timeline...</span>
              </div>
            ) : !timelineData.length ? (
              <div className="campaign-timeline-empty">No activity yet</div>
            ) : (
              <div className="campaign-timeline-list">
                {timelineData.map((event, idx) => {
                  const style = getEventStyle(event.type);
                  const EventIcon = style.icon;
                  const prev = timelineData[idx - 1];
                  const prevTs = prev?.timestamp ? new Date(prev.timestamp).getTime() : 0;
                  const curTs = event.timestamp ? new Date(event.timestamp).getTime() : 0;
                  const deltaSec = prevTs && curTs && curTs > prevTs ? Math.floor((curTs - prevTs) / 1000) : 0;
                  return (
                    <div key={`${event.type}-${event.timestamp}-${idx}`} className="timeline-item">
                      <div className={`icon timeline-color-${style.color}`}>
                        <EventIcon size={16} />
                      </div>
                      <div className="timeline-item-body">
                        <div className="event-row-top">
                          <div className="event-name">{style.label}</div>
                          {deltaSec > 0 ? <span className="timeline-delta-badge">+{deltaSec}s</span> : null}
                        </div>
                        <div className="time">
                          <Clock3 size={12} />
                          {event.timestamp ? new Date(event.timestamp).toLocaleString() : "—"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="campaign-timeline-footer">
              <button type="button" className="ghost-btn campaign-timeline-close" onClick={() => setIsModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
