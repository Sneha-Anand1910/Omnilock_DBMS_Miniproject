"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import DashboardHoloSphere from "@/components/3d/dashboard-holo-sphere";
import { Icon } from "@/components/omnilock/icons";
import styles from "./login.module.css";
import { passwordError } from "@/lib/password-policy";

type User = { id: number; name: string; email: string; phone: string | null; role: "STAFF" | "ADMIN" };
type Mode = "login" | "register";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [phone, setPhone] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async response => response.ok ? response.json() : null)
      .then(result => { if (active && result?.success) setUser(result.user); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setMessage("");
    if (mode === "register") {
      if (!name.trim()) { setMessage("Enter your full name."); return; }
      const ruleError = passwordError(password);
      if (ruleError) { setMessage(ruleError); return; }
      if (password !== confirm) { setMessage("Passwords do not match."); return; }
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/auth/${mode === "login" ? "login" : "register"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "login" ? { email, password } : { name, email, password, confirmPassword: confirm, phone }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        setMessage(typeof result?.message === "string" ? result.message : "Unable to continue. Please retry.");
        return;
      }
      setPassword("");
      setConfirm("");
      setUser(result.user);
    } catch {
      setMessage("Unable to connect. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.visual} aria-label="Welcome to OmniLock">
        <div className={styles.visualInner}>
          <div className={styles.orbit}>
            <DashboardHoloSphere login />
          </div>
          <h1>Welcome to OmniLock</h1>
          <p className={styles.subtitle}>An Intelligent Inventory &amp; Order Management System</p>
        </div>
      </section>

      <section className={styles.formSide}>
        <div className={styles.formCard}>
          <div className={styles.brand}><span className={styles.brandMark}><Icon name="lock" /></span><span>Omni<span>Lock</span></span></div>
          {user ? (
            <div className={styles.complete} role="status">
              <span className={styles.successMark} aria-hidden="true">✓</span>
              <p className={styles.kicker}>YOU&apos;RE SIGNED IN</p>
              <h2>Welcome, {user.name.split(" ")[0]}</h2>
              <p className={styles.description}>Your OmniLock workspace is ready.</p>
              <Link className={styles.continueButton} href="/">Continue to Dashboard <span aria-hidden="true">→</span></Link>
            </div>
          ) : (
            <>
              <p className={styles.kicker}>SECURE WORKSPACE ACCESS</p>
              <h2>{mode === "login" ? "Sign in to OmniLock" : "Create your account"}</h2>
              <p className={styles.description}>{mode === "login" ? "Manage inventory, orders, and fulfillment in one place." : "Set up your account to enter the OmniLock workspace."}</p>
              <div className={styles.tabs} role="tablist" aria-label="Account access">
                <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? styles.activeTab : ""} onClick={() => { setMode("login"); setMessage(""); }}>Login</button>
                <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? styles.activeTab : ""} onClick={() => { setMode("register"); setMessage(""); }}>Create Account</button>
              </div>
              <form className={styles.form} onSubmit={submit}>
                {mode === "register" && <label>Full Name<input required maxLength={100} autoComplete="name" value={name} onChange={event => setName(event.target.value)} placeholder="Your full name" /></label>}
                <label>Email<input required type="email" maxLength={254} autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></label>
                <label>Password
                  <span className={styles.passwordField}>
                    <input required type={visible ? "text" : "password"} minLength={mode === "register" ? 7 : undefined} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === "login" ? "Enter your password" : "At least 7 characters"} />
                    <button type="button" className={styles.visibility} onClick={() => setVisible(value => !value)} aria-label={visible ? "Hide password" : "Show password"}>{visible ? "Hide" : "Show"}</button>
                  </span>
                  {mode === "register" && <span className={styles.passwordHint}>7+ characters, with lowercase, uppercase, and a number.</span>}
                </label>
                {mode === "register" && <>
                  <label>Confirm Password<input required type={visible ? "text" : "password"} minLength={7} maxLength={128} autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} placeholder="Re-enter your password" /></label>
                  <label><span className={styles.labelLine}>Phone Number <span className={styles.optional}>(optional)</span></span><input type="tel" maxLength={20} autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="Your phone number" /></label>
                </>}
                {message && <p className={styles.error} role="alert">{message}</p>}
                <button className={styles.submit} type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account"}</button>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
