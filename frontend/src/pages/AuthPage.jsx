import { useState, useEffect } from "react";
import { login, register } from "../services/authService";
import { BRAND_LOGO_SRC } from "../brand";

export default function AuthPage() {
  const [mode, setMode] = useState("signin");
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = mode === "signup" ? "Create account · Sendrofy" : "Sign in · Sendrofy";
  }, [mode]);

  const submit = async () => {
    setError("");
    if (!form.email || !form.password) {
      setError("Email and password are required.");
      return;
    }

    try {
      setLoading(true);
      const isRegister = mode === "signup";
      const { data } = await (isRegister ? register(form) : login(form));
      localStorage.setItem("token", data.token);
      if (data.user) localStorage.setItem("user", JSON.stringify(data.user));
      location.href = "/dashboard";
    } catch (err) {
      if (err?.code === "ERR_NETWORK") {
        setError("Cannot connect to backend at http://localhost:5000. Start backend server first.");
      } else {
        setError(err?.response?.data?.message || "Authentication failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-split">
      <section className="auth-left">
        <div className="brand auth-brand">
          <img src={BRAND_LOGO_SRC} alt="Sendrofy" className="brand-logo" />
        </div>
        <div className="auth-left-copy">
          <h2>Send smarter campaigns.</h2>
          <p>Personalize at scale, track every open and click, iterate fast.</p>
        </div>
        <small className="auth-foot">© Sendrofy</small>
      </section>

      <section className="auth-right">
        <div className="auth-form-wrap">
          <h1>Welcome</h1>
          <p>Sign in or create an account to continue.</p>

          <div className="auth-tabs">
            <button className={mode === "signin" ? "active" : ""} onClick={() => setMode("signin")}>Sign in</button>
            <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Sign up</button>
          </div>

          <label>Email</label>
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <label>Password</label>
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          {error ? <p className="auth-error">{error}</p> : null}
          <button className="auth-submit" onClick={submit} disabled={loading}>
            {loading ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </div>
      </section>
    </div>
  );
}
