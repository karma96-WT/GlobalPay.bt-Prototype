'use client';
import { useEffect, useState } from 'react';
import JSZip from 'jszip';
import { Modal, Badge, useToast, useRun, Toast } from '@/components/ui';
import { api, fmtSize } from '@/lib/api';

const url = (appId: string, doc: string, download = false) =>
  `/api/files/${encodeURIComponent(appId)}/${encodeURIComponent(doc)}${download ? '?download=1' : ''}`;

/** Preview window for a stored PDF or image. */
export function Preview({
  appId,
  doc,
  name,
  onClose,
}: {
  appId: string;
  doc: string;
  name: string;
  onClose: () => void;
}) {
  const [src, setSrc] = useState('');
  const [type, setType] = useState('');
  useEffect(() => {
    let u = '';
    fetch(url(appId, doc))
      .then((r) => r.blob())
      .then((b) => {
        u = URL.createObjectURL(b);
        setType(b.type);
        setSrc(u);
      });
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [appId, doc]);
  return (
    <Modal onClose={onClose}>
      <div className="line" style={{ border: 0 }}>
        <h3 style={{ margin: 0 }}>{name}</h3>
        <button className="alt" onClick={onClose}>
          Close
        </button>
      </div>
      {!src ? (
        <p>Loading…</p>
      ) : /pdf/.test(type) ? (
        <iframe src={src} title={name} style={{ width: '100%', height: '70vh', border: 0 }} />
      ) : (
        <img src={src} alt={name} style={{ maxWidth: '100%', borderRadius: 12 }} />
      )}
    </Modal>
  );
}

/** One document: preview and download for anyone allowed, change for the merchant until the application is forwarded. */
export function DocRow({
  appId,
  doc,
  editable = false,
  children,
}: {
  appId: string;
  doc: any;
  editable?: boolean;
  children?: any;
}) {
  const [open, setOpen] = useState(false);
  const [msg, toast] = useToast();
  const run = useRun(toast);
  const change = (f?: File) => {
    if (!f) return;
    if (!/(pdf|jpe?g|png)$/i.test(f.name)) return toast('Only PDF, JPG or PNG files');
    if (f.size > 4 * 1024 * 1024) return toast('File is over 4 MB');
    const fd = new FormData();
    fd.set('name', doc.n);
    fd.set('file', f);
    run(() => api(`apps/${appId}/doc`, 'POST', fd), 'Document replaced');
  };
  return (
    <div className="line" style={{ alignItems: 'flex-start' }}>
      <div>
        <b>{doc.n}</b> <Badge s={doc.state} />
        <br />
        <small>
          {doc.demo ? 'Demo record, no file stored' : `${doc.name} · ${fmtSize(doc.size)}`}
        </small>
        {doc.note && (
          <>
            <br />
            <small>Note: {doc.note}</small>
          </>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {!doc.demo && (
          <button className="alt" onClick={() => setOpen(true)}>
            Preview
          </button>
        )}
        {!doc.demo && (
          <a className="btn alt" href={url(appId, doc.n, true)}>
            Download
          </a>
        )}
        {editable && (
          <label
            className="btn alt"
            style={{ margin: 0, cursor: 'pointer', color: 'var(--ink)', fontSize: 16 }}
          >
            Change
            <input
              type="file"
              hidden
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => {
                change(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
        )}
        {children}
      </div>
      {open && <Preview appId={appId} doc={doc.n} name={doc.name} onClose={() => setOpen(false)} />}
      <Toast m={msg} />
    </div>
  );
}

/** Download every stored document of one application as a single zip file. */
export async function downloadAllZip(app: any) {
  const zip = new JSZip();
  for (const d of app.docs.filter((x: any) => !x.demo)) {
    const blob = await (await fetch(url(app.id, d.n))).blob();
    zip.file(`${d.n.replace(/[\\/:*?"<>|]/g, '-')} - ${d.name}`, blob);
  }
  const out = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(out);
  a.download = `${app.prov}-${app.id}-documents.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
