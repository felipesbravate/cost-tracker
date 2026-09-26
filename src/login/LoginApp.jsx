'use client';
// The sign-in steps (Ongatu 335:7580 email, 335:7542 password, 335:7606 code for an account, 342:7702 create account,
// 342:7885 code for a new account). Plain forms: they work before this script loads (the boxes post as `c`, joined by
// /auth/verify); the script drives the eight code boxes (digits only, typing moves on, paste fills them all).
import { useRef, useState } from 'react';
import { ActionLink, Avatar, Button, Input, Logo } from '../ui/index.js';
import '../ui/okara.css';

const CODE_LENGTH = 8;

function Shell({ children }) {
  return (
    <main className="login-page">
      <div className="login-content">
        <header className="login-header">
          <Logo variant="vertical" height={127} />
          <p className="login-tagline">Take charge of your money</p>
        </header>
        <section className="login-card">{children}</section>
      </div>
    </main>
  );
}

const Label = ({ htmlFor, children }) => <label className="login-label" htmlFor={htmlFor}>{children}</label>;
const Message = ({ text, ok }) => (text ? <p className={'login-msg' + (ok ? ' is-ok' : '')} id="login-msg" role={ok ? 'status' : 'alert'}>{text}</p> : null);

function Greeting({ name, email }) {
  return (
    <div className="login-user">
      <Avatar name={name} />
      <div className="login-user-text"><p className="login-hello">Hello, {name}!</p><p className="login-email">{email}</p></div>
    </div>
  );
}

function CodeBoxes() {
  const [digits, setDigits] = useState(() => Array(CODE_LENGTH).fill(''));
  const refs = useRef([]);
  const put = (from, text) => {
    const only = String(text).replace(/\D/g, '');
    if (!only) return;
    const next = digits.slice();
    let i = from;
    for (const d of only) { if (i >= CODE_LENGTH) break; next[i++] = d; }
    setDigits(next);
    refs.current[Math.min(i, CODE_LENGTH - 1)]?.focus();
  };
  const onKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) { e.preventDefault(); const next = digits.slice(); next[i - 1] = ''; setDigits(next); refs.current[i - 1]?.focus(); }
    else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); refs.current[i - 1]?.focus(); }
    else if (e.key === 'ArrowRight' && i < CODE_LENGTH - 1) { e.preventDefault(); refs.current[i + 1]?.focus(); }
    else if (e.key.length === 1 && !/\d/.test(e.key) && !e.metaKey && !e.ctrlKey) e.preventDefault();
  };
  return (
    <div className="login-code" role="group" aria-labelledby="code-label">
      <input type="hidden" name="code" value={digits.join('')} />
      {digits.map((d, i) => (
        <span key={i} className="ds-input login-code-box">
          <input ref={(el) => { refs.current[i] = el; }} id={i === 0 ? 'code-0' : undefined} name="c" value={d} inputMode="numeric" pattern="[0-9]*" maxLength={i === 0 ? CODE_LENGTH : 1}
            autoComplete={i === 0 ? 'one-time-code' : 'off'} autoFocus={i === 0} aria-label={`Digit ${i + 1} of ${CODE_LENGTH}`}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={(e) => { e.preventDefault(); put(i, e.clipboardData.getData('text')); }}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '');
              if (v.length > 1) return put(i, v); // autofill of the whole code into one box
              const next = digits.slice(); next[i] = v; setDigits(next);
              if (v && i < CODE_LENGTH - 1) refs.current[i + 1]?.focus();
            }} />
        </span>
      ))}
    </div>
  );
}

export default function LoginApp({ step, email, kind, name, message, sent }) {
  if (step === 'password') {
    return (
      <Shell>
        <div className="login-head"><h1 className="login-title">Sign in</h1><Greeting name={name} email={email} /></div>
        <div className="login-body">
          <form method="post" action="/auth/password" id="pw-form" className="login-form">
            <div className="login-field">
              <Label htmlFor="password">ENTER YOUR PASSWORD</Label>
              <Input id="password" name="password" type="password" required autoComplete="current-password" placeholder="Password" autoFocus maxLength={200} />
              <Message text={message} />
              <ActionLink id="forgot-password" type="submit" form="forgot-form">Forgot the password?</ActionLink>
            </div>
          </form>
          <form method="post" action="/auth/login" id="forgot-form"><input type="hidden" name="email" value={email} /><input type="hidden" name="send_code" value="1" /></form>
          <div className="login-cta">
            <a className="btn-pill ghost" href="/login" id="login-back">Back</a>
            <Button type="submit" form="pw-form" id="pw-submit">Continue</Button>
          </div>
        </div>
      </Shell>
    );
  }
  if (step === 'new') {
    return (
      <Shell>
        <div className="login-head">
          <h1 className="login-title">Create account</h1>
        </div>
        <div className="login-body">
          <form method="post" action="/auth/signup" id="signup-form" className="login-form login-form--tight">
            <div className="login-field">
              <Label htmlFor="full-name">FULL NAME</Label>
              <Input id="full-name" name="name" required autoComplete="name" placeholder="Your name" autoFocus maxLength={80} />
            </div>
            <div className="login-field">
              <Label htmlFor="signup-email">ENTER YOUR EMAIL</Label>
              <Input id="signup-email" name="email" type="email" required autoComplete="email" defaultValue={email} maxLength={254} />
              <Message text={message} />
            </div>
          </form>
          <div className="login-cta">
            <a className="btn-pill ghost" href="/login" id="login-back">Back</a>
            <Button type="submit" form="signup-form" id="signup-submit">Continue</Button>
          </div>
        </div>
      </Shell>
    );
  }
  if (step === 'code') {
    const isNew = kind === 'new';
    return (
      <Shell>
        <div className="login-head">
          <h1 className="login-title">Sign in</h1>
          {isNew
            ? <p className="login-sub">We sent your sign-in code to <strong>{email}</strong>. It can take a minute to arrive. It&apos;s worth checking your spam too.</p>
            : <Greeting name={name} email={email} />}
        </div>
        <form method="post" action="/auth/verify" id="code-form" className="login-form">
          <div className="login-field">
            <Label htmlFor="code-0"><span id="code-label">ENTER YOUR 8-DIGIT ONE-TIME CODE</span></Label>
            <CodeBoxes />
            <Message text={message || (sent ? 'We sent you a new code.' : null)} ok={!message && sent} />
            <ActionLink id="resend-code" type="submit" form="resend-form">Re-send code</ActionLink>
          </div>
          <Button type="submit" id="code-submit" className="login-wide">Sign in</Button>
        </form>
        <form method="post" action="/auth/login" id="resend-form"><input type="hidden" name="email" value={email} /><input type="hidden" name="send_code" value="1" /><input type="hidden" name="from" value={isNew ? 'new' : ''} /></form>
      </Shell>
    );
  }
  return (
    <Shell>
      <div className="login-head"><h1 className="login-title">Sign in or create an account</h1></div>
      <form method="post" action="/auth/login" id="email-form" className="login-form">
        <div className="login-field">
          <Label htmlFor="login-email">ENTER YOUR EMAIL</Label>
          <Input id="login-email" name="email" type="email" required autoComplete="email" placeholder="email@example.com" autoFocus maxLength={254} />
          <Message text={message} />
        </div>
        <Button type="submit" id="email-submit" className="login-wide">Continue</Button>
      </form>
    </Shell>
  );
}
