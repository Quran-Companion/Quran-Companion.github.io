import { useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import { clearFirebaseConfig, firebaseConfigSource, parseFirebaseConfig, saveFirebaseConfig } from '../lib/firebase';
import Icon from './Icon';

const STEPS = {
  ar: [
    <>افتح <a className="link" href="https://console.firebase.google.com" target="_blank" rel="noreferrer">console.firebase.google.com</a> وأنشئ مشروعًا جديدًا (مجاني).</>,
    <>من <b>Build ← Authentication ← Sign-in method</b> فعّل <b>Google</b> (ويمكنك تفعيل Email/Password أيضًا).</>,
    <>من <b>Build ← Firestore Database</b> أنشئ قاعدة بيانات، ثم من تبويب <b>Rules</b> الصق محتوى الملف <code>firestore.rules</code> واضغط Publish.</>,
    <>من <b>Project settings ← Your apps</b> أضف تطبيق ويب (&lt;/&gt;) ثم انسخ كود <code>firebaseConfig</code> والصقه في الخانة بالأسفل.</>,
    <>من <b>Authentication ← Settings ← Authorized domains</b> تأكد من وجود <code>localhost</code> وأضف دومين موقعك عند نشره.</>,
  ],
  en: [
    <>Open <a className="link" href="https://console.firebase.google.com" target="_blank" rel="noreferrer">console.firebase.google.com</a> and create a project (free).</>,
    <>In <b>Build → Authentication → Sign-in method</b>, enable <b>Google</b> (Email/Password too if you like).</>,
    <>In <b>Build → Firestore Database</b>, create a database; in its <b>Rules</b> tab paste <code>firestore.rules</code> and Publish.</>,
    <>In <b>Project settings → Your apps</b>, add a Web app (&lt;/&gt;), copy the <code>firebaseConfig</code> snippet and paste it below.</>,
    <>In <b>Authentication → Settings → Authorized domains</b>, make sure <code>localhost</code> is listed, and add your site's domain when you publish it.</>,
  ],
};

/** Lets the owner connect a Firebase project without rebuilding: the config is stored in this browser. */
export default function FirebaseSetup({ reason }) {
  const { lang } = useSettings();
  const ar = lang === 'ar';
  const [text, setText] = useState('');
  const [error, setError] = useState(null);

  const save = () => {
    const cfg = parseFirebaseConfig(text);
    if (!cfg) {
      setError(ar ? 'لم أجد apiKey و authDomain و projectId و appId في النص. انسخ كود firebaseConfig كاملًا.' : "Couldn't find apiKey, authDomain, projectId and appId. Paste the whole firebaseConfig snippet.");
      return;
    }
    saveFirebaseConfig(cfg);
    window.location.reload();
  };

  return (
    <div className="card setup-card">
      <h2 className="card-title"><Icon name="cloud" /> {ar ? 'تفعيل تسجيل الدخول بجوجل' : 'Enable Google sign-in'}</h2>
      {reason === 'invalid-config' && (
        <p className="error-text small">{ar ? 'إعدادات Firebase المحفوظة غير صالحة. الصق الإعدادات من جديد.' : 'The saved Firebase settings are invalid. Paste them again.'}</p>
      )}
      <p className="muted small">
        {ar
          ? 'تسجيل الدخول يحتاج مشروع Firebase مجاني خاص بك (مرة واحدة فقط، حوالي ٥ دقائق):'
          : 'Sign-in needs your own free Firebase project (one-time, about 5 minutes):'}
      </p>
      <ol className="setup-steps">
        {STEPS[ar ? 'ar' : 'en'].map((s, i) => <li key={i}>{s}</li>)}
      </ol>
      <label className="field">
        <span>firebaseConfig</span>
        <textarea
          dir="ltr"
          rows={7}
          value={text}
          onChange={(e) => { setText(e.target.value); setError(null); }}
          placeholder={'const firebaseConfig = {\n  apiKey: "...",\n  authDomain: "...",\n  projectId: "...",\n  appId: "..."\n};'}
        />
      </label>
      {error && <p className="error-text small" role="alert">{error}</p>}
      <button className="btn btn-primary btn-block" onClick={save} disabled={!text.trim()}>
        {ar ? 'حفظ وتفعيل' : 'Save & enable'}
      </button>
      {firebaseConfigSource === 'local' && (
        <button className="link small setup-reset" onClick={() => { clearFirebaseConfig(); window.location.reload(); }}>
          {ar ? 'حذف إعدادات Firebase المحفوظة' : 'Remove saved Firebase settings'}
        </button>
      )}
    </div>
  );
}
