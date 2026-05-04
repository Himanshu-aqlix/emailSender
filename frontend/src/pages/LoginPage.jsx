import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BRAND_LOGO_SRC } from "../brand";
import { BarChart3, FileSpreadsheet, Mail, Send } from "lucide-react";

export default function LoginPage() {
  const navigate = useNavigate();
  useEffect(() => {
    document.title = "Sendrofy";
  }, []);
  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="brand">
          <img src={BRAND_LOGO_SRC} alt="Sendrofy" className="brand-logo" />
        </div>
        <div className="landing-nav-actions">
          <button className="btn-link" onClick={() => navigate("/auth")}>
            Sign in
          </button>
          <button className="btn-primary" onClick={() => navigate("/auth")}>
            Get started
          </button>
        </div>
      </nav>

      <section className="hero">
        <span className="hero-chip">Bulk email marketing, simplified</span>
        <h1>
          Ship campaigns your
          <br />
          <span className="hero-accent">audience opens</span>
        </h1>
        <p>
          Upload contacts from Excel, craft personalized templates, send at scale, and watch opens and clicks roll in
          from one beautifully simple dashboard.
        </p>
        <div className="hero-actions">
          <button className="btn-primary" onClick={() => navigate("/auth")}>
            Start free
          </button>
          <button className="btn-secondary">Explore features</button>
        </div>
      </section>

      <section className="feature-grid">
        <article className="feature">
          <div className="feature-icon"><FileSpreadsheet size={16} /></div>
          <h4>Excel Upload</h4>
          <p>Import contact lists with custom fields in seconds.</p>
        </article>
        <article className="feature">
          <div className="feature-icon"><Mail size={16} /></div>
          <h4>Template Builder</h4>
          <p>Craft reusable HTML templates with variable placeholders.</p>
        </article>
        <article className="feature">
          <div className="feature-icon"><Send size={16} /></div>
          <h4>Bulk Sending</h4>
          <p>Queue and send personalized campaigns at reliable scale.</p>
        </article>
        <article className="feature">
          <div className="feature-icon"><BarChart3 size={16} /></div>
          <h4>Live Analytics</h4>
          <p>Track sent, opened, clicked, and failed emails in one place.</p>
        </article>
      </section>
    </div>
  );
}
