import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Eye,
  MailCheck,
  MousePointerClick,
  Send,
  Users,
} from "lucide-react";
import { Bar, Line } from "react-chartjs-2";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { getCampaignDetails } from "../services/campaignService";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend);

const asDateKey = (d) => new Date(d).toISOString().slice(0, 10);
const toPct = (value, total) => (total ? ((value / total) * 100).toFixed(1) : "0.0");
const prettyStatus = (status) => {
  const s = String(status || "draft").toLowerCase();
  if (s === "completed") return "Completed";
  if (s === "sending") return "Sending";
  if (s === "failed") return "Failed";
  return "Draft";
};

export default function CampaignDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState({ campaign: null, stats: { sent: 0, opened: 0, clicked: 0, failed: 0 }, contacts: [] });

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    getCampaignDetails(id)
      .then((res) => {
        if (!active) return;
        setData(res.data || { campaign: null, stats: { sent: 0, opened: 0, clicked: 0, failed: 0 }, contacts: [] });
      })
      .catch((e) => {
        if (!active) return;
        setError(e?.response?.data?.message || "Unable to load campaign details.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  const campaign = data.campaign;
  const stats = data.stats || { sent: 0, opened: 0, clicked: 0, failed: 0 };
  const contacts = Array.isArray(data.contacts) ? data.contacts : [];
  const total = Math.max(stats.sent + stats.failed, 0);
  const openRate = toPct(stats.opened, total);
  const clickRate = toPct(stats.clicked, total);
  const deliveredRate = toPct(stats.sent, total);
  const recentContacts = contacts.slice(0, 8);

  const listNames = useMemo(() => {
    if (!campaign) return "—";
    if (Array.isArray(campaign.listIds) && campaign.listIds.length) {
      return campaign.listIds.map((l) => l?.name).filter(Boolean).join(", ");
    }
    return campaign.listId?.name || "—";
  }, [campaign]);
  const listItems = useMemo(() => {
    if (!campaign) return [];
    if (Array.isArray(campaign.listIds) && campaign.listIds.length) {
      return campaign.listIds.map((l) => l?.name).filter(Boolean);
    }
    return campaign.listId?.name ? [campaign.listId.name] : [];
  }, [campaign]);

  const sevenDayData = useMemo(() => {
    const labels = [];
    const sentMap = {};
    const openMap = {};
    const clickMap = {};
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = asDateKey(d);
      labels.push(key);
      sentMap[key] = 0;
      openMap[key] = 0;
      clickMap[key] = 0;
    }
    contacts.forEach((c) => {
      const sentKey = c.sentAt ? asDateKey(c.sentAt) : null;
      if (sentKey && sentMap[sentKey] != null) sentMap[sentKey] += 1;
      const openKey = c.openedAt ? asDateKey(c.openedAt) : null;
      if (openKey && openMap[openKey] != null) openMap[openKey] += 1;
      const clickKey = c.clickedAt ? asDateKey(c.clickedAt) : null;
      if (clickKey && clickMap[clickKey] != null) clickMap[clickKey] += 1;
    });
    return {
      labels,
      sent: labels.map((k) => sentMap[k]),
      opened: labels.map((k) => openMap[k]),
      clicked: labels.map((k) => clickMap[k]),
    };
  }, [contacts]);

  const engagementLine = {
    labels: sevenDayData.labels.map((d) => new Date(d).toLocaleDateString()),
    datasets: [
      { label: "Sent", data: sevenDayData.sent, borderColor: "#4f46e5", backgroundColor: "#4f46e5", tension: 0.35 },
      { label: "Opened", data: sevenDayData.opened, borderColor: "#10b981", backgroundColor: "#10b981", tension: 0.35 },
      { label: "Clicked", data: sevenDayData.clicked, borderColor: "#f59e0b", backgroundColor: "#f59e0b", tension: 0.35 },
    ],
  };

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

  const engagementOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom", labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } },
    },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, ticks: { stepSize: 1 } },
    },
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

  if (loading) return <section className="campaign-detail-page"><div className="panel">Loading campaign details…</div></section>;
  if (error) return <section className="campaign-detail-page"><div className="panel auth-error">{error}</div></section>;
  if (!campaign) return <section className="campaign-detail-page"><div className="panel">Campaign not found.</div></section>;

  return (
    <section className="campaign-detail-page">
      <div className="campaign-detail-head campaign-detail-backrow">
        <button className="ghost-btn campaigns-view-btn" onClick={() => navigate("/campaigns")}>
          <ArrowLeft size={14} /> Back to campaigns
        </button>
      </div>

      <div className="campaign-detail-head campaign-detail-title-row">
        <div>
          <h2 className="dashboard-title">Campaign Details</h2>
          <p className="campaign-detail-subtitle">
            Performance overview for campaign <strong>"{campaign.name}"</strong>
            {campaign.updatedAt ? ` · sent on ${new Date(campaign.updatedAt).toLocaleDateString()}` : ""}
          </p>
        </div>
        <span className={`status-pill ${campaign.status === "completed" ? "success" : campaign.status === "sending" ? "sending" : campaign.status === "failed" ? "failed" : "draft"}`}>
          {prettyStatus(campaign.status)}
        </span>
      </div>

      <div className="campaign-kpi-grid">
        <div className="panel campaign-kpi-card">
          <div>
            <small>Total Sent</small>
            <strong>{stats.sent}</strong>
            <p>{deliveredRate}% delivered</p>
          </div>
          <span className="campaign-kpi-icon sent"><Send size={14} /></span>
        </div>
        <div className="panel campaign-kpi-card">
          <div>
            <small>Opened</small>
            <strong>{stats.opened}</strong>
            <p>{openRate}% open rate</p>
          </div>
          <span className="campaign-kpi-icon opened"><MailCheck size={14} /></span>
        </div>
        <div className="panel campaign-kpi-card">
          <div>
            <small>Clicked</small>
            <strong>{stats.clicked}</strong>
            <p>{clickRate}% click rate</p>
          </div>
          <span className="campaign-kpi-icon clicked"><MousePointerClick size={14} /></span>
        </div>
        <div className="panel campaign-kpi-card">
          <div>
            <small>Failed</small>
            <strong>{stats.failed}</strong>
            <p>{stats.failed ? "Delivery issues" : "No bounces"}</p>
          </div>
          <span className="campaign-kpi-icon failed"><AlertTriangle size={14} /></span>
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
              <span className="campaign-basic-icon"><Users size={14} /></span>
              <p><span>Campaign Name</span><strong>{campaign.name}</strong></p>
            </div>
            <div className="campaign-basic-row">
              <span className="campaign-basic-icon"><CheckCircle2 size={14} /></span>
              <p><span>Template</span><strong>{campaign.templateId?.name || "—"}</strong></p>
            </div>
            <div className="campaign-basic-row">
              <span className="campaign-basic-icon"><Users size={14} /></span>
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
              <span className="campaign-basic-icon"><Calendar size={14} /></span>
              <p><span>Created</span><strong>{campaign.createdAt ? new Date(campaign.createdAt).toLocaleString() : "—"}</strong></p>
            </div>
            <div className="campaign-basic-row">
              <span className="campaign-basic-icon"><Send size={14} /></span>
              <p><span>Sent</span><strong>{campaign.status === "completed" ? new Date(campaign.updatedAt).toLocaleString() : "—"}</strong></p>
            </div>
          </div>
        </div>

        <div className="panel analytics-card campaign-engagement-card">
          <div className="campaign-card-head">
            <h4>Engagement</h4>
            <small>Last 7 days · daily activity</small>
          </div>
          <div className="campaign-detail-chart-wrap">
            <Line data={engagementLine} options={engagementOptions} />
          </div>
        </div>
      </div>

      <div className="campaign-detail-layout">
        <div className="panel analytics-card campaign-open-click-card">
          <div className="campaign-card-head">
            <h4>Open vs Click</h4>
            <small>Conversion funnel</small>
          </div>
          <div className="campaign-detail-chart-wrap">
            <Bar data={openClickBar} options={barOptions} />
          </div>
          <div className="campaign-rate-row">
            <div><small>Open Rate</small><strong>{openRate}%</strong></div>
            <div><small>Click Rate</small><strong>{clickRate}%</strong></div>
          </div>
        </div>

        <div className="panel logs-panel campaign-recipient-card">
          <div className="campaign-card-head">
            <h4>Recipients</h4>
            <small>Latest delivery activity</small>
          </div>
        {!contacts.length ? (
          <div className="analytics-empty">
            <div className="contacts-empty-icon"><Eye size={22} /></div>
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
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {recentContacts.map((c) => (
                <tr key={c._id}>
                  <td>{c.email}</td>
                  <td>{Array.isArray(campaign.listIds) && campaign.listIds.length ? campaign.listIds[0]?.name || "—" : campaign.listId?.name || "—"}</td>
                  <td>
                    <span className={`status-pill ${c.status === "sent" || c.status === "delivered" ? "success" : c.status === "failed" || c.status === "bounced" ? "failed" : "draft"}`}>
                      {prettyStatus(c.opened ? "completed" : c.status)}
                    </span>
                  </td>
                  <td>{c.sentAt ? new Date(c.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        </div>
      </div>
    </section>
  );
}
