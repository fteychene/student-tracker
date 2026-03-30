import React, { useCallback, useEffect, useState } from 'react'
import { pipe } from 'fp-ts/function'
import * as TE from 'fp-ts/TaskEither'
import {
  adminListSubjects,
  adminCreateSubject,
  adminDeleteSubject,
  adminSetDeadline,
  adminListSubmissions,
} from '../api'
import { Creds, SubjectWithCount, Submission } from '../types'

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

// Inject @keyframes once into the document head
const SPIN_STYLE_ID = 'admin-spin-keyframes'
if (typeof document !== 'undefined' && !document.getElementById(SPIN_STYLE_ID)) {
  const style = document.createElement('style')
  style.id = SPIN_STYLE_ID
  style.textContent = '@keyframes admin-spin { to { transform: rotate(360deg) } }'
  document.head.appendChild(style)
}

const Spinner: React.FC = () => (
  <span
    style={{
      display: 'inline-block',
      width: '12px',
      height: '12px',
      border: '2px solid currentColor',
      borderTopColor: 'transparent',
      borderRadius: '50%',
      animation: 'admin-spin 0.6s linear infinite',
      verticalAlign: 'middle',
    }}
  />
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LoadState<T> =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; data: T }

type SubmissionsMap = Record<string, LoadState<Submission[]>>
type DeadlineEditMap = Record<string, string>  // subjectId -> draft value
type ExpandedSet = Set<string>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDatetime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

// Convert ISO string to local datetime-local input value (yyyy-MM-ddTHH:mm)
function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Convert datetime-local value to ISO 8601
function datetimeLocalToIso(local: string): string {
  return new Date(local).toISOString()
}

function isUnauthorizedError(msg: string): boolean {
  return msg.includes('401')
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const S: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: '900px',
    margin: '40px auto',
    fontFamily: 'system-ui, sans-serif',
    padding: '0 16px',
  },
  heading: { marginBottom: '4px' },
  subheading: { color: '#555', marginBottom: '32px' },
  card: {
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    marginBottom: '16px',
    overflow: 'hidden',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: '#f8fafc',
    gap: '12px',
    flexWrap: 'wrap' as const,
  },
  cardTitle: { fontWeight: 600, fontSize: '16px', margin: 0 },
  cardMeta: { fontSize: '13px', color: '#64748b', marginTop: '2px' },
  cardBody: { padding: '12px 16px', borderTop: '1px solid #e2e8f0' },
  btn: {
    padding: '6px 12px',
    fontSize: '13px',
    borderRadius: '4px',
    border: '1px solid #cbd5e1',
    background: '#fff',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  btnPrimary: {
    padding: '6px 12px',
    fontSize: '13px',
    borderRadius: '4px',
    border: 'none',
    background: '#2563eb',
    color: '#fff',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  btnDanger: {
    padding: '6px 12px',
    fontSize: '13px',
    borderRadius: '4px',
    border: 'none',
    background: '#dc2626',
    color: '#fff',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  btnSuccess: {
    padding: '6px 12px',
    fontSize: '13px',
    borderRadius: '4px',
    border: 'none',
    background: '#16a34a',
    color: '#fff',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  actions: { display: 'flex', gap: '8px', flexWrap: 'wrap' as const },
  error: {
    background: '#fee2e2',
    border: '1px solid #fca5a5',
    borderRadius: '4px',
    padding: '10px 14px',
    color: '#991b1b',
    marginBottom: '16px',
    fontSize: '14px',
  },
  info: {
    background: '#f0f9ff',
    border: '1px solid #bae6fd',
    borderRadius: '4px',
    padding: '10px 14px',
    color: '#0c4a6e',
    fontSize: '14px',
  },
  label: { display: 'block', marginBottom: '4px', fontWeight: 500, fontSize: '14px' },
  input: {
    width: '100%',
    padding: '7px 10px',
    fontSize: '14px',
    borderRadius: '4px',
    border: '1px solid #cbd5e1',
    boxSizing: 'border-box' as const,
    marginBottom: '12px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '13px',
  },
  th: {
    textAlign: 'left' as const,
    padding: '6px 10px',
    background: '#f1f5f9',
    borderBottom: '1px solid #e2e8f0',
    fontWeight: 600,
  },
  td: {
    padding: '7px 10px',
    borderBottom: '1px solid #f1f5f9',
    verticalAlign: 'top' as const,
  },
  deadlineRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    marginTop: '8px',
    flexWrap: 'wrap' as const,
  },
  sectionTitle: {
    fontWeight: 600,
    fontSize: '15px',
    marginBottom: '12px',
    marginTop: '0',
  },
  newSubjectForm: {
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '24px',
  },
  loginContainer: {
    maxWidth: '360px',
    margin: '80px auto',
    fontFamily: 'system-ui, sans-serif',
    padding: '0 16px',
  },
  loginCard: {
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '24px',
  },
}

// ---------------------------------------------------------------------------
// Login form
// ---------------------------------------------------------------------------

interface LoginFormProps {
  onLogin: (creds: Creds) => void
}

const LoginForm: React.FC<LoginFormProps> = ({ onLogin }) => {
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onLogin({ user: user.trim(), password })
  }

  return (
    <div style={S.loginContainer}>
      <h1 style={S.heading}>Administration</h1>
      <p style={{ color: '#555', marginBottom: '24px' }}>
        Connectez-vous pour accéder au panneau d'administration.
      </p>
      <div style={S.loginCard}>
        <form onSubmit={handleSubmit}>
          <label style={S.label} htmlFor="user">Identifiant</label>
          <input
            id="user"
            style={S.input}
            type="text"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            autoComplete="username"
            required
          />
          <label style={S.label} htmlFor="password">Mot de passe</label>
          <input
            id="password"
            style={S.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <button type="submit" style={{ ...S.btnPrimary, width: '100%', padding: '10px' }}>
            Se connecter
          </button>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Submissions panel (inline)
// ---------------------------------------------------------------------------

interface SubmissionsPanelProps {
  state: LoadState<Submission[]>
}

const SubmissionsPanel: React.FC<SubmissionsPanelProps> = ({ state }) => {
  if (state.kind === 'idle' || state.kind === 'loading') {
    return <p style={{ fontSize: '13px', color: '#64748b' }}>Chargement des rendus...</p>
  }
  if (state.kind === 'error') {
    return <p style={{ ...S.error, marginBottom: 0 }}>Erreur : {state.message}</p>
  }
  if (state.data.length === 0) {
    return <p style={{ ...S.info, marginBottom: 0 }}>Aucun rendu pour ce sujet.</p>
  }
  return (
    <table style={S.table}>
      <thead>
        <tr>
          <th style={S.th}>Prénom</th>
          <th style={S.th}>Nom</th>
          <th style={S.th}>Dépôt</th>
          <th style={S.th}>Commit</th>
          <th style={S.th}>Soumis le</th>
        </tr>
      </thead>
      <tbody>
        {state.data.map((sub) => (
          <tr key={sub.id}>
            <td style={S.td}>{sub.student_firstname}</td>
            <td style={S.td}>{sub.student_lastname}</td>
            <td style={S.td}>
              <a href={sub.repo_url} target="_blank" rel="noreferrer" style={{ fontSize: '12px' }}>
                {sub.repo_url}
              </a>
            </td>
            <td style={{ ...S.td, fontFamily: 'monospace', fontSize: '12px' }}>
              {sub.commit_hash.slice(0, 10)}
            </td>
            <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
              {formatDatetime(sub.submitted_at)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------------------
// Subject card
// ---------------------------------------------------------------------------

interface SubjectCardProps {
  subject: SubjectWithCount
  submissionsState: LoadState<Submission[]>
  expanded: boolean
  downloading: boolean
  deadlineDraft: string | undefined
  onToggleExpand: (id: string) => void
  onDeadlineDraftChange: (id: string, value: string) => void
  onSetDeadline: (id: string) => void
  onDownload: (id: string) => void
  onDelete: (id: string) => void
}

const SubjectCard: React.FC<SubjectCardProps> = ({
  subject,
  submissionsState,
  expanded,
  downloading,
  deadlineDraft,
  onToggleExpand,
  onDeadlineDraftChange,
  onSetDeadline,
  onDownload,
  onDelete,
}) => {
  const showDeadlinePicker = deadlineDraft !== undefined

  return (
    <div style={S.card}>
      <div style={S.cardHeader}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={S.cardTitle}>{subject.title}</p>
          {subject.description && (
            <p style={{ ...S.cardMeta, marginTop: '4px' }}>{subject.description}</p>
          )}
          <p style={S.cardMeta}>
            Clôture : {formatDatetime(subject.deadline)} &nbsp;·&nbsp;{' '}
            {subject.submission_count} rendu{subject.submission_count !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={S.actions}>
          <button style={S.btn} onClick={() => onToggleExpand(subject.id)}>
            {expanded ? 'Masquer rendus' : 'Voir rendus'}
          </button>
          <button
            style={S.btn}
            onClick={() =>
              onDeadlineDraftChange(
                subject.id,
                showDeadlinePicker
                  ? ''  // toggle off — handled in parent
                  : subject.deadline
                  ? isoToDatetimeLocal(subject.deadline)
                  : ''
              )
            }
          >
            Définir clôture
          </button>
          <button
            style={S.btn}
            disabled={downloading}
            onClick={() => onDownload(subject.id)}
          >
            {downloading ? <><Spinner /> Téléchargement…</> : 'Télécharger'}
          </button>
          <button style={S.btnDanger} onClick={() => onDelete(subject.id)}>
            Supprimer
          </button>
        </div>
      </div>

      {showDeadlinePicker && (
        <div style={{ ...S.cardBody, borderTop: '1px solid #e2e8f0' }}>
          <p style={{ margin: '0 0 8px', fontWeight: 500, fontSize: '14px' }}>
            Définir la date de clôture
          </p>
          <div style={S.deadlineRow}>
            <input
              type="datetime-local"
              style={{ ...S.input, marginBottom: 0, width: 'auto' }}
              value={deadlineDraft}
              onChange={(e) => onDeadlineDraftChange(subject.id, e.target.value)}
            />
            <button
              style={S.btnSuccess}
              onClick={() => onSetDeadline(subject.id)}
              disabled={!deadlineDraft}
            >
              Enregistrer
            </button>
            <button
              style={S.btn}
              onClick={() => onDeadlineDraftChange(subject.id, '\x00')}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {expanded && (
        <div style={S.cardBody}>
          <SubmissionsPanel state={submissionsState} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// New subject form
// ---------------------------------------------------------------------------

interface NewSubjectFormProps {
  creds: Creds
  onCreated: () => void
}

const NewSubjectForm: React.FC<NewSubjectFormProps> = ({ creds, onCreated }) => {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [open, setOpen] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setState('loading')
    await pipe(
      adminCreateSubject(creds, {
        title: title.trim(),
        description: description.trim() || null,
      }),
      TE.match(
        (err) => {
          setState('error')
          setErrorMsg(err)
        },
        () => {
          setState('idle')
          setTitle('')
          setDescription('')
          setOpen(false)
          onCreated()
        }
      )
    )()
  }

  if (!open) {
    return (
      <button style={{ ...S.btnPrimary, marginBottom: '24px' }} onClick={() => setOpen(true)}>
        + Nouveau sujet
      </button>
    )
  }

  return (
    <div style={S.newSubjectForm}>
      <p style={S.sectionTitle}>Nouveau sujet</p>
      {state === 'error' && <div style={S.error}>{errorMsg}</div>}
      <form onSubmit={(e) => { void handleSubmit(e) }}>
        <label style={S.label} htmlFor="new-title">Titre</label>
        <input
          id="new-title"
          style={S.input}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="ex. TP Kubernetes"
          required
        />
        <label style={S.label} htmlFor="new-desc">Description (optionnelle)</label>
        <input
          id="new-desc"
          style={S.input}
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brève description du sujet"
        />
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="submit" style={S.btnPrimary} disabled={state === 'loading'}>
            {state === 'loading' ? 'Création...' : 'Créer'}
          </button>
          <button type="button" style={S.btn} onClick={() => setOpen(false)}>
            Annuler
          </button>
        </div>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Admin page
// ---------------------------------------------------------------------------

const AdminPage: React.FC = () => {
  const [creds, setCreds] = useState<Creds | null>(null)
  const [subjectsState, setSubjectsState] = useState<LoadState<SubjectWithCount[]>>({
    kind: 'idle',
  })
  const [submissionsMap, setSubmissionsMap] = useState<SubmissionsMap>({})
  const [expandedIds, setExpandedIds] = useState<ExpandedSet>(new Set())
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set())
  const [deadlineEdits, setDeadlineEdits] = useState<DeadlineEditMap>({})
  const [globalError, setGlobalError] = useState<string | null>(null)

  const loadSubjects = useCallback(
    async (c: Creds) => {
      setSubjectsState({ kind: 'loading' })
      setGlobalError(null)
      await pipe(
        adminListSubjects(c),
        TE.match(
          (err) => {
            if (isUnauthorizedError(err)) {
              setGlobalError('Identifiants incorrects.')
              setCreds(null)
            } else {
              setSubjectsState({ kind: 'error', message: err })
            }
          },
          (subjects) => setSubjectsState({ kind: 'ok', data: subjects })
        )
      )()
    },
    []
  )

  useEffect(() => {
    if (creds) void loadSubjects(creds)
  }, [creds, loadSubjects])

  const handleLogin = (c: Creds) => {
    setCreds(c)
  }

  const handleToggleExpand = async (id: string) => {
    const next = new Set(expandedIds)
    if (next.has(id)) {
      next.delete(id)
      setExpandedIds(next)
    } else {
      next.add(id)
      setExpandedIds(next)
      if (!submissionsMap[id] || submissionsMap[id].kind === 'idle') {
        setSubmissionsMap((m) => ({ ...m, [id]: { kind: 'loading' } }))
        await pipe(
          adminListSubmissions(creds!, id),
          TE.match(
            (err) =>
              setSubmissionsMap((m) => ({ ...m, [id]: { kind: 'error', message: err } })),
            (data) =>
              setSubmissionsMap((m) => ({ ...m, [id]: { kind: 'ok', data } }))
          )
        )()
      }
    }
  }

  const handleDeadlineDraftChange = (id: string, value: string) => {
    if (value === '\x00') {
      // cancel signal
      setDeadlineEdits((m) => {
        const { [id]: _removed, ...rest } = m
        return rest
      })
    } else {
      setDeadlineEdits((m) => ({ ...m, [id]: value }))
    }
  }

  const handleSetDeadline = async (id: string) => {
    const draft = deadlineEdits[id]
    if (!draft || !creds) return
    await pipe(
      adminSetDeadline(creds, id, datetimeLocalToIso(draft)),
      TE.match(
        (err) => setGlobalError(`Erreur lors de la mise à jour : ${err}`),
        () => {
          setDeadlineEdits((m) => {
            const { [id]: _removed, ...rest } = m
            return rest
          })
          void loadSubjects(creds)
        }
      )
    )()
  }

  const handleDownload = async (id: string) => {
    if (!creds || downloadingIds.has(id)) return
    setDownloadingIds((s) => new Set(s).add(id))
    try {
      const res = await fetch(`/admin/subjects/${id}/download`, {
        headers: { Authorization: 'Basic ' + btoa(`${creds.user}:${creds.password}`) },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const disposition = res.headers.get('content-disposition') ?? ''
      const match = disposition.match(/filename="?([^"]+)"?/)
      a.download = match ? match[1] : `submissions-${id}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setGlobalError(`Erreur lors du téléchargement : ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setDownloadingIds((s) => { const next = new Set(s); next.delete(id); return next })
    }
  }

  const handleDelete = async (id: string) => {
    if (!creds) return
    const subject =
      subjectsState.kind === 'ok'
        ? subjectsState.data.find((s) => s.id === id)
        : undefined
    const label = subject ? `"${subject.title}"` : 'ce sujet'
    if (!window.confirm(`Supprimer ${label} ? Cette action est irréversible.`)) return

    await pipe(
      adminDeleteSubject(creds, id),
      TE.match(
        (err) => setGlobalError(`Erreur lors de la suppression : ${err}`),
        () => void loadSubjects(creds)
      )
    )()
  }

  if (!creds) {
    return (
      <>
        {globalError && (
          <div
            style={{
              maxWidth: '360px',
              margin: '24px auto 0',
              padding: '0 16px',
            }}
          >
            <div style={S.error}>{globalError}</div>
          </div>
        )}
        <LoginForm onLogin={handleLogin} />
      </>
    )
  }

  return (
    <div style={S.page}>
      <h1 style={S.heading}>Administration</h1>
      <p style={S.subheading}>Gestion des sujets et des rendus étudiants.</p>

      {globalError && <div style={S.error}>{globalError}</div>}

      {subjectsState.kind === 'loading' && <p>Chargement...</p>}
      {subjectsState.kind === 'error' && (
        <div style={S.error}>Erreur : {subjectsState.message}</div>
      )}

      {(subjectsState.kind === 'ok' || subjectsState.kind === 'idle') && (
        <>
          <NewSubjectForm creds={creds} onCreated={() => void loadSubjects(creds)} />

          {subjectsState.kind === 'ok' && subjectsState.data.length === 0 && (
            <div style={S.info}>Aucun sujet créé pour le moment.</div>
          )}

          {subjectsState.kind === 'ok' &&
            subjectsState.data.map((subject) => (
              <SubjectCard
                key={subject.id}
                subject={subject}
                submissionsState={submissionsMap[subject.id] ?? { kind: 'idle' }}
                expanded={expandedIds.has(subject.id)}
                downloading={downloadingIds.has(subject.id)}
                deadlineDraft={deadlineEdits[subject.id]}
                onToggleExpand={(id) => { void handleToggleExpand(id) }}
                onDeadlineDraftChange={handleDeadlineDraftChange}
                onSetDeadline={(id) => { void handleSetDeadline(id) }}
                onDownload={(id) => { void handleDownload(id) }}
                onDelete={(id) => { void handleDelete(id) }}
              />
            ))}
        </>
      )}
    </div>
  )
}

export default AdminPage
