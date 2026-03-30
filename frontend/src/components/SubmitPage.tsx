import React, { useEffect, useState } from 'react'
import { pipe } from 'fp-ts/function'
import * as TE from 'fp-ts/TaskEither'
import { listSubjects, submitWork } from '../api'
import { Subject, Submission } from '../types'

type LoadState<T> =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; data: T }

function isOpen(subject: Subject): boolean {
  if (!subject.deadline) return true
  return new Date(subject.deadline) > new Date()
}

function formatDeadline(deadline: string): string {
  return new Date(deadline).toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

const SubmitPage: React.FC = () => {
  const [subjectsState, setSubjectsState] = useState<LoadState<Subject[]>>({ kind: 'loading' })
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [firstname, setFirstname] = useState('')
  const [lastname, setLastname] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [submitState, setSubmitState] = useState<LoadState<Submission>>({ kind: 'idle' })

  useEffect(() => {
    void pipe(
      listSubjects,
      TE.match(
        (err) => setSubjectsState({ kind: 'error', message: err }),
        (subjects) => {
          setSubjectsState({ kind: 'ok', data: subjects })
          const open = subjects.filter(isOpen)
          if (open.length > 0) setSelectedSubjectId(open[0].id)
        }
      )
    )()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSubjectId) return

    setSubmitState({ kind: 'loading' })
    await pipe(
      submitWork({
        subject_id: selectedSubjectId,
        student_firstname: firstname.trim(),
        student_lastname: lastname.trim(),
        repo_url: repoUrl.trim(),
      }),
      TE.match(
        (err) => setSubmitState({ kind: 'error', message: err }),
        (submission) => setSubmitState({ kind: 'ok', data: submission })
      )
    )()
  }

  const openSubjects =
    subjectsState.kind === 'ok' ? subjectsState.data.filter(isOpen) : []

  const styles: Record<string, React.CSSProperties> = {
    container: {
      maxWidth: '560px',
      margin: '60px auto',
      fontFamily: 'system-ui, sans-serif',
      padding: '0 16px',
    },
    heading: { marginBottom: '8px' },
    subheading: { color: '#555', marginBottom: '32px' },
    label: { display: 'block', marginBottom: '4px', fontWeight: 500 },
    input: {
      width: '100%',
      padding: '8px 10px',
      fontSize: '14px',
      borderRadius: '4px',
      border: '1px solid #ccc',
      boxSizing: 'border-box',
      marginBottom: '16px',
    },
    select: {
      width: '100%',
      padding: '8px 10px',
      fontSize: '14px',
      borderRadius: '4px',
      border: '1px solid #ccc',
      boxSizing: 'border-box',
      marginBottom: '4px',
    },
    deadlineHint: { fontSize: '12px', color: '#888', marginBottom: '16px' },
    button: {
      padding: '10px 24px',
      fontSize: '15px',
      background: '#2563eb',
      color: '#fff',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
    },
    buttonDisabled: {
      padding: '10px 24px',
      fontSize: '15px',
      background: '#93c5fd',
      color: '#fff',
      border: 'none',
      borderRadius: '4px',
      cursor: 'not-allowed',
    },
    error: {
      background: '#fee2e2',
      border: '1px solid #fca5a5',
      borderRadius: '4px',
      padding: '12px',
      color: '#991b1b',
      marginBottom: '16px',
    },
    success: {
      background: '#dcfce7',
      border: '1px solid #86efac',
      borderRadius: '4px',
      padding: '16px',
      color: '#166534',
    },
    code: {
      background: '#d1fae5',
      padding: '2px 6px',
      borderRadius: '3px',
      fontFamily: 'monospace',
      fontSize: '13px',
    },
    info: {
      background: '#f0f9ff',
      border: '1px solid #bae6fd',
      borderRadius: '4px',
      padding: '12px',
      color: '#0c4a6e',
    },
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>Déposer mon travail</h1>
      <p style={styles.subheading}>Soumettez l'URL de votre dépôt git pour votre sujet.</p>

      {subjectsState.kind === 'loading' && <p>Chargement des sujets...</p>}

      {subjectsState.kind === 'error' && (
        <div style={styles.error}>
          Erreur lors du chargement des sujets : {subjectsState.message}
        </div>
      )}

      {subjectsState.kind === 'ok' && openSubjects.length === 0 && (
        <div style={styles.info}>
          Aucun sujet ouvert pour le moment. Revenez plus tard.
        </div>
      )}

      {subjectsState.kind === 'ok' && openSubjects.length > 0 && submitState.kind !== 'ok' && (
        <form onSubmit={(e) => { void handleSubmit(e) }}>
          <label style={styles.label} htmlFor="subject">
            Sujet
          </label>
          <select
            id="subject"
            style={styles.select}
            value={selectedSubjectId}
            onChange={(e) => setSelectedSubjectId(e.target.value)}
            required
          >
            {openSubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          {selectedSubjectId && (() => {
            const s = openSubjects.find((x) => x.id === selectedSubjectId)
            return s?.deadline ? (
              <p style={styles.deadlineHint}>
                Date limite : {formatDeadline(s.deadline)}
              </p>
            ) : (
              <p style={styles.deadlineHint}>Pas de date limite</p>
            )
          })()}

          <label style={styles.label} htmlFor="firstname">
            Prénom
          </label>
          <input
            id="firstname"
            style={styles.input}
            type="text"
            value={firstname}
            onChange={(e) => setFirstname(e.target.value)}
            placeholder="ex. Marie"
            required
          />

          <label style={styles.label} htmlFor="lastname">
            Nom
          </label>
          <input
            id="lastname"
            style={styles.input}
            type="text"
            value={lastname}
            onChange={(e) => setLastname(e.target.value)}
            placeholder="ex. Dupont"
            required
          />

          <label style={styles.label} htmlFor="repoUrl">
            URL du dépôt git
          </label>
          <input
            id="repoUrl"
            style={styles.input}
            type="url"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/user/repo"
            required
          />

          {submitState.kind === 'error' && (
            <div style={styles.error}>
              Erreur lors de la soumission : {submitState.message}
            </div>
          )}

          <button
            type="submit"
            style={submitState.kind === 'loading' ? styles.buttonDisabled : styles.button}
            disabled={submitState.kind === 'loading'}
          >
            {submitState.kind === 'loading' ? 'Envoi en cours...' : 'Soumettre'}
          </button>
        </form>
      )}

      {submitState.kind === 'ok' && (
        <div style={styles.success}>
          <strong>Soumission enregistrée !</strong>
          <p style={{ margin: '8px 0 0' }}>
            Commit pris en compte :{' '}
            <span style={styles.code}>{submitState.data.commit_hash}</span>
          </p>
          <p style={{ margin: '4px 0 0', fontSize: '13px' }}>
            Soumis le{' '}
            {new Date(submitState.data.submitted_at).toLocaleString('fr-FR', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </p>
          <button
            style={{ ...styles.button, marginTop: '16px', background: '#16a34a' }}
            onClick={() => {
              setSubmitState({ kind: 'idle' })
              setFirstname('')
              setLastname('')
              setRepoUrl('')
            }}
          >
            Nouvelle soumission
          </button>
        </div>
      )}
    </div>
  )
}

export default SubmitPage
